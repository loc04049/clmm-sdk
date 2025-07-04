import { publicKey } from '@raydium-io/raydium-sdk-v2';
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { AmmV3PoolInfo, ClmmClientConfig, ClmmKeys, CreateConcentratedPool, DecreaseLiquidity, GetAprPoolTickParameters, GetAprPositionParameters, IncreasePositionFromLiquidity, OpenPositionFromBase, PoolInfoConcentratedItem, QuoteParams } from "./type";
import { AmmConfigLayout, ClmmPoolLayout, ClmmPositionLayout, PoolInfoLayout, PositionInfoLayout, TickArrayLayout } from "./layout";
import Decimal from "decimal.js";
import { SqrtPriceMath } from "./utils/math";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getPdaAmmConfigId, getPdaMintExAccount, getPdaTickArrayAddress } from "./utils/pda";
import { ClmmInstrument } from "./instrument";
import { getOrCreateATAWithExtension, getTickArrayCache } from "./utils/util";
import { MAX_SQRT_PRICE_X64, MIN_SQRT_PRICE_X64, U64_IGNORE_RANGE } from "./utils/constants";
import BN from "bn.js";
import { IDL } from "./idl/amm_v3";
import { BorshAccountsCoder, Idl } from '@project-serum/anchor';
import { PoolUtilsV1 } from "./utils/poolV1";
import { TickUtils } from "./utils/tick";
import { PositionUtils } from "./utils/position";
import { PoolUtils } from './utils/pool';

export class ClmmClient {
  connection: Connection;
  clmmProgramId: PublicKey;
  coder: BorshAccountsCoder;

  constructor(config: ClmmClientConfig) {
    this.connection = new Connection(config.rpc, {
      commitment: 'confirmed',
      httpHeaders: {
        development: 'coin98',
      },
    });
    this.clmmProgramId = config.clmmProgramId
    this.coder = new BorshAccountsCoder(IDL as Idl);
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

    const { account: ownerTokenAccountA, instructionsATA, endInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
      amountSol: baseAmount
    })

    const { account: ownerTokenAccountB, instructionsATA: tokenBInstructionsATA, endInstructionsATA: tokenBEndInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
      amountSol: baseAmount
    })

    instructions.push(...instructionsATA, ...tokenBInstructionsATA)

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
    instructions.push(...endInstructionsATA, ...tokenBEndInstructionsATA)

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

    const { account: ownerTokenAccountA, instructionsATA, endInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
      amountSol: amountMaxA,
    })

    const { account: ownerTokenAccountB, instructionsATA: tokenBInstructionsATA, endInstructionsATA: tokenBEndInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
      amountSol: amountMaxB,
    })

    instructions.push(...instructionsATA, ...tokenBInstructionsATA)

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
    instructions.push(...endInstructionsATA, ...tokenBEndInstructionsATA)

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

    const { account: ownerTokenAccountA, instructionsATA, endInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
    })

    const { account: ownerTokenAccountB, instructionsATA: tokenBInstructionsATA, endInstructionsATA: tokenBEndInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
    })

    instructions.push(...instructionsATA, ...tokenBInstructionsATA)

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
        ownerInfo: { wallet: payer },
        ownerPosition,
        nft2022,
      });

      instructions.push(...closeInsInfo.instructions);
      extInfo = { ...extInfo, ...closeInsInfo.address };

    }

    instructions.push(...endInstructionsATA, ...tokenBEndInstructionsATA)
    return {
      instructions,
      address: extInfo
    }
  }

  public async closePosition({
    poolInfo,
    ownerPosition,
    payer,
  }: {
    poolInfo: PoolInfoConcentratedItem;
    ownerPosition: ClmmPositionLayout;
    payer: PublicKey;
  }) {
    const ins = ClmmInstrument.closePositionInstructions({
      poolInfo,
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

    const { account: ownerTokenAccountA, instructionsATA, endInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
      amountSol: amountIn,
    })

    const { account: ownerTokenAccountB, instructionsATA: tokenBInstructionsATA, endInstructionsATA: tokenBEndInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
      amountSol: amountIn,
    })

    instructions.push(...instructionsATA, ...tokenBInstructionsATA)

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
    instructions.push(...swapInsInfo.instructions)
    instructions.push(...endInstructionsATA, ...tokenBEndInstructionsATA)

    return { ...swapInsInfo, instructions }
  }

  public async swapBaseOut({
    poolInfo,
    poolKeys,
    outputMint,
    amountOut,
    amountInMax,
    priceLimit,
    observationId,
    remainingAccounts,
    payer
  }: {
    poolInfo: PoolInfoConcentratedItem;
    poolKeys: ClmmKeys;
    outputMint: string | PublicKey;
    amountOut: BN;
    amountInMax: BN;
    priceLimit?: Decimal;
    observationId: PublicKey;
    remainingAccounts: PublicKey[];
    payer: PublicKey;
  }) {
    const instructions: TransactionInstruction[] = [];
    const baseIn = outputMint.toString() === poolInfo.mintB.address;
    // const mintAUseSOLBalance = ownerInfo.useSOLBalance && poolInfo.mintA.address === WSOLMint.toBase58();
    // const mintBUseSOLBalance = ownerInfo.useSOLBalance && poolInfo.mintB.address === WSOLMint.toBase58();

    let sqrtPriceLimitX64: BN;
    if (!priceLimit || priceLimit.equals(new Decimal(0))) {
      sqrtPriceLimitX64 =
        outputMint.toString() === poolInfo.mintB.address
          ? MIN_SQRT_PRICE_X64.add(new BN(1))
          : MAX_SQRT_PRICE_X64.sub(new BN(1));
    } else {
      sqrtPriceLimitX64 = SqrtPriceMath.priceToSqrtPriceX64(
        priceLimit,
        poolInfo.mintA.decimals,
        poolInfo.mintB.decimals,
      );
    }
    const { account: ownerTokenAccountA, instructionsATA, endInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintA.address),
      programId: new PublicKey(poolInfo.mintA.programId),
      allowOwnerOffCurve: true,
      amountSol: amountInMax,
    })

    const { account: ownerTokenAccountB, instructionsATA: tokenBInstructionsATA, endInstructionsATA: tokenBEndInstructionsATA } = await getOrCreateATAWithExtension({
      payer,
      connection: this.connection,
      owner: payer,
      mint: new PublicKey(poolInfo.mintB.address),
      programId: new PublicKey(poolInfo.mintB.programId),
      allowOwnerOffCurve: true,
      amountSol: amountInMax,
    })

    instructions.push(...instructionsATA, ...tokenBInstructionsATA)

    const swapInsInfo = ClmmInstrument.makeSwapBaseOutInstructions({
      poolInfo,
      poolKeys,
      observationId,
      ownerInfo: {
        wallet: payer,
        tokenAccountA: ownerTokenAccountA!,
        tokenAccountB: ownerTokenAccountB!,
      },
      outputMint: new PublicKey(outputMint),
      amountOut,
      amountInMax,
      sqrtPriceLimitX64,
      remainingAccounts,
    })


    instructions.push(...swapInsInfo.instructions)
    instructions.push(...endInstructionsATA, ...tokenBEndInstructionsATA)

    return { ...swapInsInfo, instructions }

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
      tradeFeeRate: number; //  Total swap fee (Fee Tier) Example: 2500 / 1_000_000 = 0.25%
      protocolFeeRate: number; // Share of tradeFeeRate sent to protocol
      fundFeeRate: number; // Share of tradeFeeRate sent to fundOwner 
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

  public async getInfoTickArray({
    poolId,
    poolInfo,
  }: {
    poolId: PublicKey,
    poolInfo: ClmmPoolLayout
  }): Promise<{ tick: string; price: string; liquidity: number; }[]> {
    const tickArrayCache = await getTickArrayCache({
      poolId: poolId,
      poolInfo,
      connection: this.connection,
      clmmProgramId: this.clmmProgramId,
      coder: this.coder,
    })

    const dataInfoTick: { tick: string; price: string, liquidityGross: number, liquidityNet: number }[] = [];
    let liquidityActive = 0;

    Object.values(tickArrayCache).forEach(tickArray => {
      tickArray.ticks.forEach(tick => {
        if (!(tick.liquidityNet.isZero && tick.liquidityGross.isZero() && tick.tick === 0)) {
          const priceInfo = TickUtils.getTickPriceDecimals({
            mintDecimalsA: poolInfo.mintDecimalsA,
            mintDecimalsB: poolInfo.mintDecimalsB,
            tick: tick.tick,
            baseIn: true,
          })

          dataInfoTick.push({
            tick: priceInfo.tick.toString(),
            price: priceInfo.price.toString(),
            liquidityGross: tick.liquidityGross.toNumber(),
            liquidityNet: tick.liquidityNet.toNumber(),
          });
        }
      });
    });

    const chartData = dataInfoTick.sort((a, b) => new BN(a.tick).mul(new BN(b.tick)).toNumber());

    return chartData.map(item => {
      liquidityActive += item.liquidityNet;
      return {
        tick: item.tick,
        price: item.price,
        liquidity: liquidityActive
      }

    })
  }


  public async getQuote(quoteParams: QuoteParams) {
    const { poolId, inputMint, swapMode, poolInfo, amount, slippage, priceLimit = new Decimal(0), ammConfig } = quoteParams

    const currentPrice = TickUtils.getTickPriceDecimals({
      mintDecimalsA: poolInfo.mintDecimalsA,
      mintDecimalsB: poolInfo.mintDecimalsB,
      tick: poolInfo.tickCurrent,
      baseIn: true,
    })
    const zeroForOne = inputMint.equals(poolInfo.mintA)

    const poolInFoSwap: AmmV3PoolInfo = {
      id: poolId,
      mintA: {
        mint: poolInfo.mintA,
        decimals: poolInfo.mintDecimalsA,
        vault: poolInfo.vaultA,
      },
      mintB: {
        mint: poolInfo.mintB,
        decimals: poolInfo.mintDecimalsB,
        vault: poolInfo.vaultB,
      },
      ammConfig,
      currentPrice: currentPrice.price,
      programId: this.clmmProgramId,
      tickSpacing: ammConfig.tickSpacing,
      liquidity: poolInfo.liquidity,
      sqrtPriceX64: poolInfo.sqrtPriceX64,
      tickCurrent: poolInfo.tickCurrent,
      tickArrayBitmap: poolInfo.tickArrayBitmap,
      observationId: poolInfo.observationId,
    }

    const tickArrayCache = await getTickArrayCache({
      poolId: poolId,
      poolInfo,
      connection: this.connection,
      clmmProgramId: this.clmmProgramId,
      coder: this.coder,
      zeroForOne
    })
    if (swapMode === 'ExactIn') {
      try {
        const { amountOut, minAmountOut, fee, priceImpact, executionPrice, currentPrice, remainingAccounts } = PoolUtilsV1.computeAmountOut({
          poolInfo: poolInFoSwap,
          tickArrayCache: tickArrayCache,
          amountIn: amount,
          baseMint: inputMint,
          slippage,
          priceLimit,
        });

        return {
          notEnoughLiquidity: false,
          inAmount: amount,
          outAmount: amountOut,
          slippageAmount: minAmountOut,
          executionPrice: executionPrice,
          currentPrice: zeroForOne ? currentPrice : new Decimal(1).div(currentPrice),
          feeAmount: fee,
          priceLimit,
          priceImpact,
          remainingAccounts,
          inputMint,
        };
      } catch (e) {
        console.log("🚀 ~ ClmmClient ~ getQuote ~ e:", e)
        return {
          notEnoughLiquidity: true,
          inAmount: amount,
          outAmount: new BN(0),
          slippageAmount: new BN(0),
          executionPrice: new Decimal(0),
          currentPrice: new Decimal(0),
          feeAmount: new BN(0),
          priceLimit,
          priceImpact: new Decimal(0),
          remainingAccounts: [],
          inputMint
        };
      }
    } else {
      try {
        const { amountIn, maxAmountIn, fee, priceImpact, executionPrice, currentPrice, remainingAccounts } = PoolUtilsV1.computeAmountIn({
          poolInfo: poolInFoSwap,
          tickArrayCache: tickArrayCache,
          amountOut: amount,
          baseMint: inputMint,
          slippage,
          priceLimit,
        });

        return {
          notEnoughLiquidity: false,
          inAmount: amountIn,
          outAmount: amount,
          slippageAmount: maxAmountIn,
          executionPrice: executionPrice,
          currentPrice: zeroForOne ? currentPrice : new Decimal(1).div(currentPrice),
          feeAmount: fee,
          priceLimit,
          priceImpact,
          remainingAccounts,
          inputMint,
        };
      } catch (error) {
        console.log("🚀 ~ ClmmClient ~ getQuote ~ error:", error)
        return {
          notEnoughLiquidity: true,
          inAmount: amount,
          outAmount: new BN(0),
          slippageAmount: new BN(0),
          executionPrice: new Decimal(0),
          currentPrice: new Decimal(0),
          feeAmount: new BN(0),
          priceLimit,
          priceImpact: new Decimal(0),
          remainingAccounts: [],
          inputMint,
        };
      }

    }
  }

  public async getPositionFees({
    poolInfo,
    positionInfo,
    poolId
  }: {
    poolInfo: ClmmPoolLayout,
    positionInfo: ClmmPositionLayout
    poolId: PublicKey
  }) {

    const startTickLowerIndex = TickUtils.getTickArrayStartIndexByTick(
      positionInfo.tickLower,
      poolInfo.tickSpacing
    );
    const startTickUpperIndex = TickUtils.getTickArrayStartIndexByTick(
      positionInfo.tickUpper,
      poolInfo.tickSpacing
    );

    const tickArrayPDALower = getPdaTickArrayAddress(this.clmmProgramId, poolId, startTickLowerIndex);
    const tickArrayPDAUpper = getPdaTickArrayAddress(this.clmmProgramId, poolId, startTickUpperIndex);

    const tickUpperData = await this.connection.getAccountInfo(tickArrayPDAUpper.publicKey);
    const tickLowerData = await this.connection.getAccountInfo(tickArrayPDALower.publicKey);

    if (!tickLowerData?.data || !tickUpperData?.data) {
      throw new Error("tickData null");
    }

    const tickArrayLower = TickArrayLayout.decode(tickLowerData.data)
    const tickArrayUpper = TickArrayLayout.decode(tickUpperData.data)

    const tickLowerState = tickArrayLower.ticks[TickUtils.getTickOffsetInArray(positionInfo.tickLower, poolInfo.tickSpacing)]
    const tickUpperState = tickArrayUpper.ticks[TickUtils.getTickOffsetInArray(positionInfo.tickUpper, poolInfo.tickSpacing)]

    const tokenFees = PositionUtils.GetPositionFeesV2(poolInfo, positionInfo, tickLowerState, tickUpperState)
    const BN_ZERO = new BN(0)
    const [tokenFeeAmountA, tokenFeeAmountB] = [
      tokenFees.tokenFeeAmountA.gte(BN_ZERO) && tokenFees.tokenFeeAmountA.lt(U64_IGNORE_RANGE) ? tokenFees.tokenFeeAmountA : BN_ZERO,
      tokenFees.tokenFeeAmountB.gte(BN_ZERO) && tokenFees.tokenFeeAmountB.lt(U64_IGNORE_RANGE) ? tokenFees.tokenFeeAmountB : BN_ZERO
    ]
    return { tokenFeeAmountA, tokenFeeAmountB }
  }

  public getPositionAprCore({
    poolInfo,
    positionAccount,
    aprInfoPool,
    tokenPrices,
    poolLiquidity,
    timeBasis,
    planType,
    chainTimeOffsetMs = 0
  }: GetAprPositionParameters) {
    if (positionAccount.liquidity.isZero()) {
      return {
        fee: {
          apr: 0,
          percentInTotal: 0
        },
        rewards: poolInfo.rewardDefaultInfos.map((i, idx) => ({
          apr: 0,
          percentInTotal: 0,
          mint: poolInfo.rewardDefaultInfos[idx].mint
        })),
        apr: 0
      }
    }
    if (planType === 'D') {
      const planBApr = PoolUtils.estimateAprsForPriceRangeDelta({
        poolInfo,
        aprInfoPool,
        aprType: timeBasis,
        poolLiquidity,
        mintPrice: tokenPrices,
        positionTickLowerIndex: Math.min(positionAccount.tickLower, positionAccount.tickUpper),
        positionTickUpperIndex: Math.max(positionAccount.tickLower, positionAccount.tickUpper),
        chainTime: (Date.now() + chainTimeOffsetMs) / 1000,
        liquidity: positionAccount.liquidity
      })
      const slicedRewardApr = planBApr.rewardsApr.slice(0, poolInfo.rewardDefaultInfos.length)
      const total = [planBApr.feeApr, ...slicedRewardApr].reduce((a, b) => a + b, 0)
      return {
        fee: {
          apr: planBApr.feeApr,
          percentInTotal: (planBApr.feeApr / total) * 100
        },
        rewards: slicedRewardApr.map((i, idx) => ({
          apr: i,
          percentInTotal: (i / total) * 100,
          mint: poolInfo.rewardDefaultInfos[idx].mint
        })),
        apr: isNaN(planBApr.apr) ? 0 : planBApr.apr
      }
    } else {
      const planCApr = PoolUtils.estimateAprsForPriceRangeMultiplier({
        poolInfo,
        aprInfoPool,
        aprType: timeBasis,
        positionTickLowerIndex: Math.min(positionAccount.tickLower, positionAccount.tickUpper),
        positionTickUpperIndex: Math.max(positionAccount.tickLower, positionAccount.tickUpper)
      })
      const slicedRewardApr = planCApr.rewardsApr.slice(0, poolInfo.rewardDefaultInfos.length)
      const total = [planCApr.feeApr, ...slicedRewardApr].reduce((a, b) => a + b, 0)
      return {
        fee: {
          apr: planCApr.feeApr,
          percentInTotal: (planCApr.feeApr / total) * 100
        },
        rewards: slicedRewardApr.map((i, idx) => ({
          apr: i,
          percentInTotal: (i / total) * 100,
          mint: poolInfo.rewardDefaultInfos[idx].mint
        })),
        apr: isNaN(planCApr.apr) ? 0 : planCApr.apr
      }
    }
  }

  public getPoolTickAprCore({
    poolInfo,
    aprInfoPool,
    tickLower,
    tickUpper,
    tokenPrices,
    timeBasis,
    planType,
    chainTimeOffsetMs = 0,
    poolLiquidity,
    liquidity
  }: GetAprPoolTickParameters) {
    if (liquidity.isZero()) {
      return {
        fee: {
          apr: 0,
          percentInTotal: 0
        },
        rewards: poolInfo.rewardDefaultInfos.map((i, idx) => ({
          apr: 0,
          percentInTotal: 0,
          mint: poolInfo.rewardDefaultInfos[idx].mint
        })),
        apr: 0
      }
    }
    if (planType === 'D') {
      const planBApr = PoolUtils.estimateAprsForPriceRangeDelta({
        aprInfoPool,
        poolInfo,
        poolLiquidity,
        aprType: timeBasis,
        mintPrice: tokenPrices,
        positionTickLowerIndex: Math.min(tickLower, tickUpper),
        positionTickUpperIndex: Math.max(tickLower, tickUpper),
        chainTime: (Date.now() + chainTimeOffsetMs) / 1000,
        liquidity
      })
      const slicedRewardApr = planBApr.rewardsApr.slice(0, poolInfo.rewardDefaultInfos.length)
      const total = [planBApr.feeApr, ...slicedRewardApr].reduce((a, b) => a + b, 0)
      return {
        fee: {
          apr: planBApr.feeApr,
          percentInTotal: (planBApr.feeApr / total) * 100
        },
        rewards: slicedRewardApr.map((i, idx) => ({
          apr: i,
          percentInTotal: (i / total) * 100,
          mint: poolInfo.rewardDefaultInfos[idx].mint
        })),
        apr: planBApr.apr
      }
    }
    const planCApr = PoolUtils.estimateAprsForPriceRangeMultiplier({
      aprInfoPool,
      poolInfo,
      aprType: timeBasis,
      positionTickLowerIndex: Math.min(tickLower, tickUpper),
      positionTickUpperIndex: Math.max(tickLower, tickUpper)
    })
    const slicedRewardApr = planCApr.rewardsApr.slice(0, poolInfo.rewardDefaultInfos.length)
    const total = [planCApr.feeApr, ...slicedRewardApr].reduce((a, b) => a + b, 0)
    return {
      fee: {
        apr: planCApr.feeApr,
        percentInTotal: (planCApr.feeApr / total) * 100
      },
      rewards: slicedRewardApr.map((i, idx) => ({
        apr: i,
        percentInTotal: (i / total) * 100,
        mint: poolInfo.rewardDefaultInfos[idx].mint
      })),
      apr: planCApr.apr
    }

  }
}

