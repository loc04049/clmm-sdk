import { AccountInfo, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { ClmmClient } from '../ClmmClient';
import { createSplToken, getLocalWallet } from './utils';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getPdaAmmConfigId } from '../utils/pda';
import { CLMM_PROGRAM_ID } from '../constants/programIds';
import Decimal from 'decimal.js';
import { BN } from 'bn.js';
import { getTickArrayPks, getTokenATokenBAndPrice } from '../utils/util';
import { PoolUtils } from '../utils/pool';
import { SqrtPriceMath, TickMath } from '../utils/math';
import { TickUtils } from '../utils/tick';
import { TickQuery } from '../utils/tickQuery';
import { PoolInfoConcentratedItem, TickArrayBitmapExtensionType, TickArrayCache } from '../type';
import { MIN_SQRT_PRICE_X64, SwapMode } from '../utils/constants';
import { PoolUtilsV1 } from '../utils/poolV1';
import { RPC, WSOLMint } from '../constants';



jest.setTimeout(300000);
describe('ClmmClient', () => {
  const client = new ClmmClient({ rpc: RPC.mainnet, clmmProgramId: CLMM_PROGRAM_ID.main });
  const connection = client.connection;
  const defaultAccount = getLocalWallet();
  const inputMint = Keypair.generate();
  const outputMint = Keypair.generate();


  it('create CLMM pool', async () => {

    // const ammConfig = getPdaAmmConfigId(client.clmmProgramId, 2)
    // console.log("🚀 ~ it ~ publicKey:", ammConfig.publicKey.toString())

    // const test = await client.getAmmConfigInfo('HfFPxHvPftA9ueEgJ4HtM66ZBsfm18QGbC1MGrHo77Vs')
    // console.log("🚀 ~ it ~ fund_owner:", test.fundOwner.toString())
    // console.log("🚀 ~ it ~ index:", test.index)
    // console.log("🚀 ~ it ~ owner:", test.owner.toString())
    // console.log("🚀 ~ it ~ tick_spacing:", test.tickSpacing)
    // console.log("🚀 ~ it ~ fund_fee_rate:", test.fundFeeRate)
    // console.log("🚀 ~ it ~ trade_fee_rate:", test.tradeFeeRate)
    // console.log("🚀 ~ it ~ protocol_fee_rate:", test.protocolFeeRate)

    // const insConfig = await client.createAmmConfig({
    //   payer: defaultAccount.publicKey,
    //   index: 0,
    //   tickSpacing: 60,
    //   feeRate: {
    //     protocolFeeRate: 120000,
    //     tradeFeeRate: 2500,
    //     fundFeeRate: 40000,
    //   },
    //   fundOwner: defaultAccount.publicKey,
    // })
    // console.log("🚀 ~ it ~ insConfig:", insConfig.address.ammConfigId.toString())

    // const transactionConfig = new Transaction().add(insConfig.instructions);
    // const hashConfig = await connection.sendTransaction(transactionConfig, [defaultAccount], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashConfig:", hashConfig)

    const mint1 = {
      address: 'So11111111111111111111111111111111111111112',
      // address: inputMint.publicKey.toString(),
      decimals: 9,
      symbol: 'INPUT',
      name: 'Input Token',
      chainId: 'solanaDev',
      programId: TOKEN_PROGRAM_ID.toString(),
      // programId: TOKEN_2022_PROGRAM_ID.toString(),
      logoURI: 'https://example.com/input-token-logo.png',
    }

    const mint2 = {
      address: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
      // address: outputMint.publicKey.toString(),
      decimals: 6,
      symbol: 'OUTPUT',
      name: 'Output Token',
      chainId: 'solanaDev',
      programId: TOKEN_PROGRAM_ID.toString(),
      // programId: TOKEN_2022_PROGRAM_ID.toString(),
      logoURI: 'https://example.com/input-token-logo.png'
    }

    // await createSplToken({
    //   connection,
    //   initialAmount: BigInt(1_000_000_000_000),
    //   mint: inputMint,
    //   payer: defaultAccount,
    //   decimals: mint1.decimals,
    // });

    // await createSplToken({
    //   connection,
    //   initialAmount: BigInt(1_000_000_000_000),
    //   mint: outputMint,
    //   payer: defaultAccount,
    //   decimals: mint2.decimals,
    // });

    // const tickSpacing = 60
    // const ammConfigId = 'HfFPxHvPftA9ueEgJ4HtM66ZBsfm18QGbC1MGrHo77Vs'
    const ammConfigId = '3XCQJQryqpDvvZBfGxR7CLAw5dpGJ9aa7kt1jRLdyxuZ'
    const poolId = 'B4Vwozy1FGtp8SELXSXydWSzavPUGnJ77DURV2k4MhUV'
    const positionId = 'AyiWPCSkLRokdCBDyD2y1B8mj3CsxRq6E94dGqpTQi5M'

    // const insCreatePoolInfo = await client.createPool({
    //   owner: defaultAccount.publicKey,
    //   mint1,
    //   mint2,
    //   ammConfigId: new PublicKey(ammConfigId),
    //   initialPrice: new Decimal(1), // initialPrice = tokenB_amount / tokenA_amount; (1 tokenA = 2 tokenB)
    // })

    // const { instructions, address } = insCreatePoolInfo
    // console.log("🚀 ~ it ~ address.poolId.toString():", address.poolId.toString())
    // console.log("🚀 ~ it ~ mintA:", address.mintA.address)
    // console.log("🚀 ~ it ~ mintB:", address.mintB.address)


    // // FE chuẩn bị params
    const configInfo = await client.getAmmConfigInfo(ammConfigId)
    const getPoolInfo = await client.getClmmPoolInfo(poolId)

    const currentPrice = TickUtils.getTickPriceDecimals({
      mintDecimalsA: getPoolInfo.mintDecimalsA,
      mintDecimalsB: getPoolInfo.mintDecimalsB,
      tick: getPoolInfo.tickCurrent,
      baseIn: true,
    })

    const positionInfo = await client.getPositionInfo(positionId)
    console.log("🚀 ~ it ~ positionInfo:", positionInfo.tickLower)
    console.log("🚀 ~ it ~ positionInfo:", positionInfo.tickUpper)






    const getEpochInfo = await connection.getEpochInfo()




    const { price: pricePool } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(9919.98))
    console.log("🚀 ~ it ~ pricePool:", pricePool)
    const { price: priceMin, mintA, mintB } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(8377.032435))
    // const { price: priceMax } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(10238.7925))
    // const [priceLower, priceUpper] = [Math.min(priceMin.toNumber(), priceMax.toNumber()), Math.max(priceMin.toNumber(), priceMax.toNumber())]
    // const tickLower = TickMath.getTickWithPriceAndTickspacing(new Decimal(priceLower), configInfo.tickSpacing, getPoolInfo.mintDecimalsA, getPoolInfo.mintDecimalsB)
    // console.log("🚀 ~ it ~ tickLower:", tickLower)
    // const tickUpper = TickMath.getTickWithPriceAndTickspacing(new Decimal(priceUpper), configInfo.tickSpacing, getPoolInfo.mintDecimalsA, getPoolInfo.mintDecimalsB)
    // console.log("🚀 ~ it ~ tickUpper:", tickUpper)
    const poolInfo: PoolInfoConcentratedItem = {
      price: currentPrice.price.toNumber(),
      programId: client.clmmProgramId.toString(),
      id: poolId,
      mintA: mintA,
      mintB: mintB,
      config: {
        id: ammConfigId,
        tickSpacing: configInfo.tickSpacing,
      },
      rewardDefaultInfos: [],
    }

    console.log("🚀 ~ it ~ currentPrice:", currentPrice.price.toNumber())


    // const infoTest = await client.getInfoTickArray({
    //   poolId: new PublicKey(poolId),
    //   poolInfo: getPoolInfo
    // })
    // console.log("🚀 ~ it ~ infoTest:", infoTest)

    const infoLiquidityAmountAB = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo: poolInfo,
      inputA: true,
      tickLower: positionInfo.tickLower,
      tickUpper: positionInfo.tickUpper,
      amount: new BN(10),
      // amount: new BN(new Decimal(1 || '0').mul(10 ** (true ? mintA.decimals : mintB.decimals)).toFixed(0)),
      slippage: 0.1,
      add: true,
      // epochInfo: getEpochInfo,
      epochInfo: {
        epoch: 0,
        slotIndex: 0,
        slotsInEpoch: 0,
        absoluteSlot: 0,
      },
      amountHasFee: true
    })
    console.log("🚀 ~ it ~ amountB:", infoLiquidityAmountAB.amountB.amount.toNumber())
    console.log("🚀 ~ it ~ amountA:", infoLiquidityAmountAB.amountA.amount.toNumber())
    console.log("🚀 ~ it ~ liquidity:", infoLiquidityAmountAB.liquidity.toNumber())


    console.log("🚀 ~ it ~ amountSlippageB:", infoLiquidityAmountAB.amountSlippageB.amount.toNumber())




    // const infoAmountABFromLiquidity = await PoolUtils.getAmountsFromLiquidity({
    //   poolInfo,
    //   tickLower: positionInfo.tickLower,
    //   tickUpper: positionInfo.tickUpper,
    //   liquidity: positionInfo.liquidity,
    //   slippage: 0.1,
    //   add: false,
    //   epochInfo: {
    //     epoch: 0,
    //     slotIndex: 0,
    //     slotsInEpoch: 0,
    //     absoluteSlot: 0,
    //   },
    // })

    // // openPosition

    // const insOpenPositionFromBase = await client.openPositionFromBase({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: poolInfo,
    //   poolKeys: {
    //     vault: { A: address.mintAVault.toString(), B: address.mintBVault.toString() },
    //     rewardInfos: [],
    //   },
    //   tickLower: tickLower,
    //   tickUpper: tickUpper,
    //   base: "MintA",
    //   baseAmount: new BN(100000000),
    //   otherAmountMax: new BN(10000000000),
    //   nft2022: true
    // })

    // const transaction = new Transaction().add(...instructions);

    // transaction.add(...insOpenPositionFromBase.instructions);
    // const hashCreate = await connection.sendTransaction(transaction, [defaultAccount, ...insOpenPositionFromBase.signers], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashCreate:", hashCreate)
    // await connection.confirmTransaction(hashCreate, 'finalized');


    // // add pool


    // const insAddPoolInfo = await client.increasePositionFromLiquidity({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: poolInfo,
    //   poolKeys: {
    //     vault: { A: getPoolInfo.vaultA.toString(), B: getPoolInfo.vaultB.toString() },
    //     rewardInfos: []
    //   },
    //   ownerPosition: positionInfo,
    //   liquidity: infoLiquidityAmountAB.liquidity,
    //   amountMaxA: infoLiquidityAmountAB.amountSlippageA.amount,
    //   amountMaxB: infoLiquidityAmountAB.amountSlippageB.amount,
    // })

    // const transactionAddLiquidity = new Transaction().add(...insAddPoolInfo.instructions);
    // const hashAddLiquidity = await connection.sendTransaction(transactionAddLiquidity, [defaultAccount], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashAddLiquidity:", hashAddLiquidity)

    // await connection.confirmTransaction(hashAddLiquidity, 'finalized');

    // // Swap ExactIn

    const quoteExactIn = await client.getQuote({
      inputMint: getPoolInfo.mintA,
      swapMode: SwapMode.ExactIn,
      poolId: new PublicKey(poolId),
      poolInfo: getPoolInfo,
      amount: new BN(1000),
      slippage: 0.1,
      priceLimit: new Decimal(0),
      ammConfig: {
        tradeFeeRate: configInfo.tradeFeeRate,
        id: new PublicKey(ammConfigId),
        index: configInfo.index,
        tickSpacing: configInfo.tickSpacing,
        fundFeeRate: configInfo.fundFeeRate,
        fundOwner: defaultAccount.publicKey.toString(),
        protocolFeeRate: configInfo.protocolFeeRate,
      }
    })
    console.log("🚀 ~ it ~ quoteExactIn currentPrice:", quoteExactIn.currentPrice.toString())
    console.log("🚀 ~ it ~ quoteExactIn executionPrice:", quoteExactIn.executionPrice.toString())
    console.log("🚀 ~ it ~ quoteExactIn inAmount:", quoteExactIn.inAmount.toString())
    console.log("🚀 ~ it ~ quoteExactIn outAmount:", quoteExactIn.outAmount.toString())
    console.log("🚀 ~ it ~ quoteExactIn feeAmount:", quoteExactIn.feeAmount.toString())

    const insSwapPoolInfo = await client.swap({
      payer: defaultAccount.publicKey,
      poolInfo: poolInfo,
      poolKeys: {
        vault: { A: getPoolInfo.vaultA.toString(), B: getPoolInfo.vaultB.toString() },
        rewardInfos: []
      },
      inputMint: quoteExactIn.inputMint,
      amountIn: quoteExactIn.inAmount,
      amountOutMin: quoteExactIn.slippageAmount,
      priceLimit: quoteExactIn.priceLimit,
      observationId: getPoolInfo.observationId,
      // remainingAccounts: [insOpenPositionFromBase.address.tickArrayLower, insOpenPositionFromBase.address.tickArrayUpper], // calculator tick array
      remainingAccounts: quoteExactIn.remainingAccounts,

    })

    const transactionSwap = new Transaction().add(...insSwapPoolInfo.instructions);
    const hashSwap = await connection.sendTransaction(transactionSwap, [defaultAccount], {
      skipPreflight: true
    });
    console.log("🚀 ~ it ~ hashSwap:", hashSwap)

    await connection.confirmTransaction(hashSwap, 'finalized');



    // Swap ExactOut

    // const quoteSwapOut = await client.getQuote({
    //   inputMint: getPoolInfo.mintB,
    //   swapMode: SwapMode.ExactOut,
    //   poolId: new PublicKey(poolId),
    //   poolInfo: getPoolInfo,
    //   amount: new BN(1000),
    //   slippage: 0,
    //   priceLimit: new Decimal(0),
    //   ammConfig: {
    //     tradeFeeRate: configInfo.tradeFeeRate,
    //     id: new PublicKey(ammConfigId),
    //     index: configInfo.index,
    //     tickSpacing: configInfo.tickSpacing,
    //     fundFeeRate: configInfo.fundFeeRate,
    //     fundOwner: defaultAccount.publicKey.toString(),
    //     protocolFeeRate: configInfo.protocolFeeRate,
    //   }
    // })
    // console.log("🚀 ~ it ~ quoteSwapOut currentPrice:", quoteSwapOut.currentPrice.toString())
    // console.log("🚀 ~ it ~ quoteSwapOut executionPrice:", quoteSwapOut.executionPrice.toString())
    // console.log("🚀 ~ it ~ quoteSwapOut inAmount:", quoteSwapOut.inAmount.toString())
    // console.log("🚀 ~ it ~ quoteSwapOut outAmount:", quoteSwapOut.outAmount.toString())
    // console.log("🚀 ~ it ~ quoteSwapOut feeAmount:", quoteSwapOut.feeAmount.toString())
    // console.log("🚀 ~ it ~ quoteSwapOut slippageAmount:", quoteSwapOut.slippageAmount.toString())


    // const insSwapOut = await client.swapBaseOut({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: poolInfo,
    //   poolKeys: {
    //     vault: { A: getPoolInfo.vaultA.toString(), B: getPoolInfo.vaultB.toString() },
    //     rewardInfos: []
    //   },
    //   outputMint: quoteSwapOut.inputMint,
    //   amountOut: quoteSwapOut.outAmount,
    //   amountInMax: quoteSwapOut.slippageAmount,
    //   priceLimit: quoteSwapOut.priceLimit,
    //   observationId: getPoolInfo.observationId,
    //   remainingAccounts: quoteSwapOut.remainingAccounts,
    // })

    // const transactionSwapOut = new Transaction().add(...insSwapOut.instructions);
    // const hashSwapOut = await connection.sendTransaction(transactionSwapOut, [defaultAccount], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashSwapOut:", hashSwapOut)

    // await connection.confirmTransaction(hashSwapOut, 'finalized');



    // const poolInfo222 = await client.getClmmPoolInfo(address.poolId.toString())
    // console.log("🚀 ~ it ~ poolInfo222:", poolInfo222.tickCurrent.toString())

    // // remove liquidity

    // const positionInfoRemove = await client.getPositionInfo(insOpenPositionFromBase.address.personalPosition.toString())
    // console.log("🚀 ~ it ~ positionInfoRemove:", positionInfoRemove.liquidity.toString())

    // const insRemovePoolInfo = await client.decreaseLiquidity({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: poolInfo,
    //   poolKeys: {
    //     vault: { A: getPoolInfo.vaultA.toString(), B: getPoolInfo.vaultB.toString() },
    //     rewardInfos: []
    //   },
    //   ownerPosition: positionInfo,
    //   liquidity: new BN(15396302),
    //   amountMinA: new BN(0),
    //   amountMinB: new BN(0),
    //   isClosePosition: false,
    // })

    // const transactionRemoveLiquidity = new Transaction().add(...insRemovePoolInfo.instructions);

    // const hashRemoveLiquidity = await connection.sendTransaction(transactionRemoveLiquidity, [defaultAccount], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashRemoveLiquidity:", hashRemoveLiquidity)

    // await connection.confirmTransaction(hashRemoveLiquidity, 'finalized');
  })
})
