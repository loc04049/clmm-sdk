import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { ClmmClientConfig, ClmmKeys, ComputeBudgetConfig, CreateConcentratedPool, DecreaseLiquidity, IncreasePositionFromLiquidity, OpenPositionFromBase, PoolInfoConcentratedItem, TxTipConfig } from "./type";
import { ClmmPositionLayout, PoolInfoLayout, PositionInfoLayout } from "./layout";
import { CLMM_PROGRAM_ID } from "./constants/programIds";
import Decimal from "decimal.js";
import { SqrtPriceMath } from "./utils/math";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getPdaMintExAccount } from "./utils/pda";
import { ClmmInstrument } from "./instrument";
import { WSOLMint } from "./constants";
import { getOrCreateATAWithExtension } from "./utils/util";
import { MAX_SQRT_PRICE_X64, MIN_SQRT_PRICE_X64 } from "./utils/constants";
import BN from "bn.js";

export class ClmmClient {
  connection: Connection;

  constructor(config: ClmmClientConfig) {
    this.connection = new Connection(config.rpc, {
      commitment: 'confirmed',
      httpHeaders: {
        development: 'coin98',
      },
    });
  }


  public async getPositionInfo(poolId: string) {
    const poolPubkey = new PublicKey(poolId);
    const accountInfo = await this.connection.getAccountInfo(poolPubkey);
    if (!accountInfo) {
      throw new Error('Pool not found on-chain');
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

    console.log({
      vaultA: poolData.vaultA.toString(),
      vaultB: poolData.vaultB.toString(),
      tickSpacing: poolData.tickSpacing.toString(),
      liquidity: poolData.liquidity.toString(),
      sqrtPriceX64: poolData.sqrtPriceX64.toString(),
      tickCurrent: poolData.tickCurrent.toString(),
      feeGrowthGlobalX64A: poolData.feeGrowthGlobalX64A.toString(),
      feeGrowthGlobalX64B: poolData.feeGrowthGlobalX64B.toString(),
      protocolFeesTokenA: poolData.protocolFeesTokenA.toString(),
      protocolFeesTokenB: poolData.protocolFeesTokenB.toString(),
      swapInAmountTokenA: poolData.swapInAmountTokenA.toString(),
      swapOutAmountTokenB: poolData.swapOutAmountTokenB.toString(),
      swapInAmountTokenB: poolData.swapInAmountTokenB.toString(),
      swapOutAmountTokenA: poolData.swapOutAmountTokenA.toString(),
      status: poolData.status.toString(),
      mintDecimalsA: poolData.mintDecimalsA.toString(),
      mintDecimalsB: poolData.mintDecimalsB.toString(),
      mintA: poolData.mintA.toString(),
      mintB: poolData.mintB.toString(),
    });

    return poolData;
  }

  public async createPool(
    props: CreateConcentratedPool,
  ) {
    const {
      owner,
      mint1,
      mint2,
      ammConfig,
      initialPrice,
      computeBudgetConfig,
      forerunCreate,
      getObserveState,
      txTipConfig,
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
      fetchAccounts.push(getPdaMintExAccount(CLMM_PROGRAM_ID, new PublicKey(mintA.address)).publicKey);
    if (mintB.programId === TOKEN_2022_PROGRAM_ID.toBase58())
      fetchAccounts.push(getPdaMintExAccount(CLMM_PROGRAM_ID, new PublicKey(mintB.address)).publicKey);
    const extMintRes = await this.connection.getMultipleAccountsInfo(fetchAccounts);

    extMintRes.forEach((r, idx) => {
      if (r) extendMintAccount.push(fetchAccounts[idx]);
    });

    const insInfo = await ClmmInstrument.createPoolInstructions({
      connection: this.connection,
      programId: CLMM_PROGRAM_ID,
      owner,
      mintA,
      mintB,
      ammConfigId: ammConfig.id,
      initialPriceX64,
      forerunCreate: !getObserveState && forerunCreate,
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
    computeBudgetConfig,
    txTipConfig,
  }: OpenPositionFromBase) {

    // this.scope.checkOwner();
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

    // txBuilder.addCustomComputeBudget(computeBudgetConfig);
    // txBuilder.addTipInstruction(txTipConfig);

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
      computeBudgetConfig,
      txTipConfig,
    } = props;

    const instructions: TransactionInstruction[] = [];

    // let ownerTokenAccountA: PublicKey | undefined = undefined;
    // let ownerTokenAccountB: PublicKey | undefined = undefined;

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
    // txBuilder.addCustomComputeBudget(computeBudgetConfig);
    // txBuilder.addTipInstruction(txTipConfig);
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
      associatedOnly = true,
      checkCreateATAOwner = false,
      computeBudgetConfig,
      txTipConfig,
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

    // const rewardAccounts: PublicKey[] = [];
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
        rewardAccounts: [],
      },
      liquidity,
      amountMinA,
      amountMinB,
      nft2022,
    });


    // txBuilder.addInstruction({
    //   instructions: decreaseInsInfo.instructions,
    //   instructionTypes: [InstructionType.ClmmDecreasePosition],
    // });

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

    // txBuilder.addCustomComputeBudget(computeBudgetConfig);
    // txBuilder.addTipInstruction(txTipConfig);

    return {
      instructions,
      address: extInfo
    }
  }

  public async closePosition({
    poolInfo,
    poolKeys,
    ownerPosition,
    computeBudgetConfig,
    txTipConfig,
    payer,
  }: {
    poolInfo: PoolInfoConcentratedItem;
    poolKeys: ClmmKeys;
    ownerPosition: ClmmPositionLayout;
    computeBudgetConfig?: ComputeBudgetConfig;
    txTipConfig?: TxTipConfig;
    feePayer?: PublicKey;
    payer: PublicKey;
  }) {
    const ins = ClmmInstrument.closePositionInstructions({
      poolInfo,
      poolKeys,
      ownerInfo: { wallet: payer },
      ownerPosition,
      nft2022: (await this.connection.getAccountInfo(ownerPosition.nftMint))?.owner.equals(TOKEN_2022_PROGRAM_ID),
    });
    // txBuilder.addCustomComputeBudget(computeBudgetConfig);
    // txBuilder.addTipInstruction(txTipConfig);
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
    // ownerInfo,
    remainingAccounts,
    computeBudgetConfig,
    txTipConfig,
    payer,
  }: {
    poolInfo: PoolInfoConcentratedItem;
    poolKeys: ClmmKeys;
    inputMint: string | PublicKey;
    amountIn: BN;
    amountOutMin: BN;
    priceLimit?: Decimal;
    observationId: PublicKey;
    // ownerInfo: {
    //   useSOLBalance?: boolean;
    //   feePayer?: PublicKey;
    // };
    remainingAccounts: PublicKey[];
    computeBudgetConfig?: ComputeBudgetConfig;
    txTipConfig?: TxTipConfig;
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

    // txBuilder.addCustomComputeBudget(computeBudgetConfig);
    // txBuilder.addTipInstruction(txTipConfig);
  }

}



