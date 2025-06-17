import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { ClmmClientConfig, ClmmKeys, CreateConcentratedPool, DecreaseLiquidity, IncreasePositionFromLiquidity, OpenPositionFromBase, PoolInfoConcentratedItem } from "./type";
import { AmmConfigLayout, ClmmPositionLayout, PoolInfoLayout, PositionInfoLayout } from "./layout";
import Decimal from "decimal.js";
import { SqrtPriceMath } from "./utils/math";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getPdaAmmConfigId, getPdaMintExAccount } from "./utils/pda";
import { ClmmInstrument } from "./instrument";
import { getOrCreateATAWithExtension } from "./utils/util";
import { MAX_SQRT_PRICE_X64, MIN_SQRT_PRICE_X64 } from "./utils/constants";
import BN from "bn.js";

export class ClmmClient {
  connection: Connection;
  clmmProgramId: PublicKey;

  constructor(config: ClmmClientConfig) {
    this.connection = new Connection(config.rpc, {
      commitment: 'confirmed',
      httpHeaders: {
        development: 'coin98',
      },
    });
    this.clmmProgramId = config.clmmProgramId
  }

  public async getAmmConfigInfo(ammConfigId: string) {
    const configPubkey = new PublicKey(ammConfigId);
    const accountInfo = await this.connection.getAccountInfo(configPubkey);
    if (!accountInfo) {
      throw new Error('Config not found on-chain');
    }
    const configInfo = AmmConfigLayout.decode(accountInfo.data);
    return configInfo
  }


  public async getPositionInfo(personalPosition: string) {
    const personalPositionPubKey = new PublicKey(personalPosition);
    const accountInfo = await this.connection.getAccountInfo(personalPositionPubKey);
    if (!accountInfo) {
      throw new Error('Personal Position not found on-chain');
    }
    const positionInfo = PositionInfoLayout.decode(accountInfo.data);
    return positionInfo
  }


  public async getClmmPoolInfo(poolId: string) {
    const poolPubkey = new PublicKey(poolId);
    const accountInfo = await this.connection.getAccountInfo(poolPubkey);
    if (!accountInfo) {
      throw new Error('Pool not found on-chain');
    }

    const poolData = PoolInfoLayout.decode(accountInfo.data);
    return poolData;
  }

  public async createPool(
    props: CreateConcentratedPool,
  ) {
    const {
      owner,
      mint1,
      mint2,
      ammConfigId,
      initialPrice,
    } = props;
    const [mintA, mintB, initPrice] = new BN(new PublicKey(mint1.address).toBuffer()).gt(
      new BN(new PublicKey(mint2.address).toBuffer()),
    )
      ? [mint2, mint1, new Decimal(1).div(initialPrice)]
      : [mint1, mint2, initialPrice];

    const initialPriceX64 = SqrtPriceMath.priceToSqrtPriceX64(initPrice, mintA.decimals, mintB.decimals);

    const extendMintAccount: PublicKey[] = [];
    const fetchAccounts: PublicKey[] = [];
    if (mintA.programId === TOKEN_2022_PROGRAM_ID.toBase58())
      fetchAccounts.push(getPdaMintExAccount(this.clmmProgramId, new PublicKey(mintA.address)).publicKey);
    if (mintB.programId === TOKEN_2022_PROGRAM_ID.toBase58())
      fetchAccounts.push(getPdaMintExAccount(this.clmmProgramId, new PublicKey(mintB.address)).publicKey);
    const extMintRes = await this.connection.getMultipleAccountsInfo(fetchAccounts);

    extMintRes.forEach((r, idx) => {
      if (r) extendMintAccount.push(fetchAccounts[idx]);
    });

    const insInfo = await ClmmInstrument.createPoolInstructions({
      connection: this.connection,
      programId: this.clmmProgramId,
      owner,
      mintA,
      mintB,
      ammConfigId,
      initialPriceX64,
      extendMintAccount,
    });
    return insInfo

  }

  public async openPositionFromBase({
    payer,
    poolInfo,
    poolKeys,
    tickLower,
    tickUpper,
    base,
    baseAmount,
    otherAmountMax,
    nft2022,
    withMetadata = "create",
    getEphemeralSigners,
  }: OpenPositionFromBase) {

    const instructions: TransactionInstruction[] = [];

    const ownerTokenAccountA = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      instruction: instructions,
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
    })

    const ownerTokenAccountB = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      instruction: instructions,
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
    })

    const insInfo = await ClmmInstrument.openPositionFromBaseInstructions({
      poolInfo,
      poolKeys,
      ownerInfo: {
        feePayer: payer,
        wallet: payer,
        tokenAccountA: ownerTokenAccountA!,
        tokenAccountB: ownerTokenAccountB!,
      },
      tickLower,
      tickUpper,
      base,
      baseAmount,
      otherAmountMax,
      withMetadata,
      getEphemeralSigners,
      nft2022,
    });


    instructions.push(...insInfo.instructions);

    return { ...insInfo, instructions }
  }

  public async increasePositionFromLiquidity(
    props: IncreasePositionFromLiquidity,
  ) {
    const {
      payer,
      poolInfo,
      poolKeys,
      ownerPosition,
      amountMaxA,
      amountMaxB,
      liquidity,
    } = props;

    const instructions: TransactionInstruction[] = [];

    // const mintAUseSOLBalance = ownerInfo.useSOLBalance && poolInfo.mintA.address === WSOLMint.toString();
    // const mintBUseSOLBalance = ownerInfo.useSOLBalance && poolInfo.mintB.address === WSOLMint.toString();

    const ownerTokenAccountA = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      instruction: instructions,
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
    })

    const ownerTokenAccountB = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      instruction: instructions,
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
    })

    const ins = ClmmInstrument.increasePositionFromLiquidityInstructions({
      poolInfo,
      poolKeys,
      ownerPosition,
      ownerInfo: {
        wallet: payer,
        tokenAccountA: ownerTokenAccountA!,
        tokenAccountB: ownerTokenAccountB!,
      },
      liquidity,
      amountMaxA,
      amountMaxB,
      nft2022: (await this.connection.getAccountInfo(ownerPosition.nftMint))?.owner.equals(TOKEN_2022_PROGRAM_ID),
    });
    instructions.push(...ins.instructions);

    return { ...ins, instructions }
  }

  public async decreaseLiquidity(
    props: DecreaseLiquidity,
  ) {
    const {
      payer,
      poolInfo,
      poolKeys,
      ownerPosition,
      amountMinA,
      amountMinB,
      liquidity,
      isClosePosition
    } = props;


    // const mintAUseSOLBalance = ownerInfo.useSOLBalance && poolInfo.mintA.address === WSOLMint.toString();
    // const mintBUseSOLBalance = ownerInfo.useSOLBalance && poolInfo.mintB.address === WSOLMint.toString();

    const instructions: TransactionInstruction[] = [];

    const ownerTokenAccountA = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      instruction: instructions,
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
    })

    const ownerTokenAccountB = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      instruction: instructions,
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
    })

    const rewardAccounts: PublicKey[] = [];
    // for (const itemReward of poolInfo.rewardDefaultInfos) {
    //   const rewardUseSOLBalance = ownerInfo.useSOLBalance && itemReward.mint.address === WSOLMint.toString();

    //   let ownerRewardAccount: PublicKey | undefined;

    //   if (itemReward.mint.address === poolInfo.mintA.address) ownerRewardAccount = ownerTokenAccountA;
    //   else if (itemReward.mint.address === poolInfo.mintB.address) ownerRewardAccount = ownerTokenAccountB;
    //   else {
    //     const { account: _ownerRewardAccount, instructionParams: ownerRewardAccountInstructions } =
    //       await this.scope.account.getOrCreateTokenAccount({
    //         tokenProgram: new PublicKey(itemReward.mint.programId),
    //         mint: new PublicKey(itemReward.mint.address),
    //         notUseTokenAccount: rewardUseSOLBalance,
    //         owner: this.scope.ownerPubKey,
    //         createInfo: {
    //           payer: this.scope.ownerPubKey,
    //           amount: 0,
    //         },
    //         skipCloseAccount: !rewardUseSOLBalance,
    //         associatedOnly: rewardUseSOLBalance ? false : associatedOnly,
    //         checkCreateATAOwner,
    //       });
    //     ownerRewardAccount = _ownerRewardAccount;
    //     ownerRewardAccountInstructions && txBuilder.addInstruction(ownerRewardAccountInstructions);
    //   }

    //   rewardAccounts.push(ownerRewardAccount!);
    // }

    const nft2022 = (await this.connection.getAccountInfo(ownerPosition.nftMint))?.owner.equals(
      TOKEN_2022_PROGRAM_ID,
    );
    const decreaseInsInfo = await ClmmInstrument.decreaseLiquidityInstructions({
      poolInfo,
      poolKeys,
      ownerPosition,
      ownerInfo: {
        wallet: payer,
        tokenAccountA: ownerTokenAccountA!,
        tokenAccountB: ownerTokenAccountB!,
        rewardAccounts,
      },
      liquidity,
      amountMinA,
      amountMinB,
      nft2022,
    });


    instructions.push(...decreaseInsInfo.instructions);

    let extInfo = { ...decreaseInsInfo.address };
    if (isClosePosition) {
      const closeInsInfo = await ClmmInstrument.closePositionInstructions({
        poolInfo,
        poolKeys,
        ownerInfo: { wallet: payer },
        ownerPosition,
        nft2022,
      });

      instructions.push(...closeInsInfo.instructions);
      extInfo = { ...extInfo, ...closeInsInfo.address };

    }
    return {
      instructions,
      address: extInfo
    }
  }

  public async closePosition({
    poolInfo,
    poolKeys,
    ownerPosition,
    payer,
  }: {
    poolInfo: PoolInfoConcentratedItem;
    poolKeys: ClmmKeys;
    ownerPosition: ClmmPositionLayout;
    payer: PublicKey;
  }) {
    const ins = ClmmInstrument.closePositionInstructions({
      poolInfo,
      poolKeys,
      ownerInfo: { wallet: payer },
      ownerPosition,
      nft2022: (await this.connection.getAccountInfo(ownerPosition.nftMint))?.owner.equals(TOKEN_2022_PROGRAM_ID),
    });
    return ins
  }

  public async swap({
    poolInfo,
    poolKeys,
    inputMint,
    amountIn,
    amountOutMin,
    priceLimit,
    observationId,
    remainingAccounts,
    payer,
  }: {
    poolInfo: PoolInfoConcentratedItem;
    poolKeys: ClmmKeys;
    inputMint: string | PublicKey;
    amountIn: BN;
    amountOutMin: BN;
    priceLimit?: Decimal;
    observationId: PublicKey;
    remainingAccounts: PublicKey[];
    payer: PublicKey;
  }) {

    const instructions: TransactionInstruction[] = [];
    const baseIn = inputMint.toString() === poolInfo.mintA.address;
    // const mintAUseSOLBalance = ownerInfo.useSOLBalance && poolInfo.mintA.address === WSOLMint.toBase58();
    // const mintBUseSOLBalance = ownerInfo.useSOLBalance && poolInfo.mintB.address === WSOLMint.toBase58();

    let sqrtPriceLimitX64: BN;
    if (!priceLimit || priceLimit.equals(new Decimal(0))) {
      sqrtPriceLimitX64 = baseIn ? MIN_SQRT_PRICE_X64.add(new BN(1)) : MAX_SQRT_PRICE_X64.sub(new BN(1));
    } else {
      sqrtPriceLimitX64 = SqrtPriceMath.priceToSqrtPriceX64(
        priceLimit,
        poolInfo.mintA.decimals,
        poolInfo.mintB.decimals,
      );
    }

    const ownerTokenAccountA = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      instruction: instructions,
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
    })

    const ownerTokenAccountB = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      instruction: instructions,
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
    })

    const swapInsInfo = ClmmInstrument.makeSwapBaseInInstructions({
      poolInfo,
      poolKeys,
      observationId,
      ownerInfo: {
        wallet: payer,
        tokenAccountA: ownerTokenAccountA!,
        tokenAccountB: ownerTokenAccountB!,
      },
      inputMint: new PublicKey(inputMint),
      amountIn,
      amountOutMin,
      sqrtPriceLimitX64,
      remainingAccounts,
    })

    return swapInsInfo
  }

  public async createAmmConfig({
    payer,
    index,
    tickSpacing,
    feeRate,
    fundOwner
  }: {
    payer: PublicKey;
    index: number;
    tickSpacing: number;
    feeRate: {
      protocolFeeRate: number;
      tradeFeeRate: number;
      fundFeeRate: number;
    }
    fundOwner: PublicKey;
  }) {

    const ammConfigId = getPdaAmmConfigId(this.clmmProgramId, index)

    const insInfo = ClmmInstrument.createAmmConfigInstruction({
      ammConfigId: ammConfigId.publicKey,
      payer,
      programId: this.clmmProgramId,
      index,
      tickSpacing,
      feeRate,
      fundOwner
    })
    return insInfo
  }

}



