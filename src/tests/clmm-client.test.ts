import { AccountInfo, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
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
import { AprKey, PoolInfoConcentratedItem, TickArrayBitmapExtensionType, TickArrayCache } from '../type';
import { MIN_SQRT_PRICE_X64, SwapMode } from '../utils/constants';
import { PoolUtilsV1 } from '../utils/poolV1';
import { RPC, WSOLMint } from '../constants';
import { TickArrayLayout } from '../layout';



jest.setTimeout(300000);
describe('ClmmClient', () => {
  const client = new ClmmClient({ rpc: RPC.devnet, clmmProgramId: CLMM_PROGRAM_ID.devContract });
  const connection = client.connection;
  const defaultAccount = getLocalWallet();
  const inputMint = Keypair.generate();
  const outputMint = Keypair.generate();

  it('create CLMM pool', async () => {

    const ammConfig = getPdaAmmConfigId(client.clmmProgramId, 0)
    console.log("🚀 ~ it ~ publicKey:", ammConfig.publicKey.toString())

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
      // address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',

      address: 'CykyynGfJCo3Et6bxBqEyyGhSLWvkRwtLoD1qPsiuWYG',
      // address: inputMint.publicKey.toString(),
      decimals: 6,
      symbol: 'INPUT',
      name: 'Input Token',
      chainId: 'solanaDev',
      programId: TOKEN_PROGRAM_ID.toString(),
      // programId: TOKEN_2022_PROGRAM_ID.toString(),
      logoURI: 'https://example.com/input-token-logo.png',
    }

    const mint2 = {
      // address: 'SarosY6Vscao718M4A778z4CGtvcwcGef5M9MEH1LGL',
      address: 'GpyFXGqd4x5CUNi3yT8Teaob2aexqS5DHRtg68XdhZSB',
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

    const ammConfigId = "3NKqFyEJyvoaDxdCVDz1LZ2DaqSwTA9ghswid5qkaKNa"
    const configInfo = await client.getAmmConfigInfo(ammConfigId)
    // console.log("🚀 ~ it ~ tradeFeeRate:", configInfo.tradeFeeRate)
    // console.log("🚀 ~ it ~ tickSpacing:", configInfo.tickSpacing)

    const poolId = '4bqZZLedBsF5XY5gX5K3oNehc7Ab4czfansutyUHMzt3'

    // const positionId = '6eSvuzXibZzM8bkBooEw529BAbbiPzUoxRCMVLUN682e'
    // const positionId = '3FN2kaNLY1FLkbKyFB9Kw6gSPhXJKsKLfxsJDPJWG4tG'


    // const insCreatePoolInfo = await client.createPool({
    //   owner: defaultAccount.publicKey,
    //   mint1,
    //   mint2,
    //   ammConfigId: new PublicKey(ammConfigId),
    //   initialPrice: new Decimal(5), // initialPrice = tokenB_amount / tokenA_amount; (1 tokenA = 2 tokenB)
    // })

    // const { instructions, address } = insCreatePoolInfo
    // console.log("🚀 ~ it ~ address.poolId.toString():", address.poolId.toString())

    // const transaction11 = new Transaction().add(...instructions);

    // const hashCreate11 = await connection.sendTransaction(transaction11, [defaultAccount], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashCreate:", hashCreate11)
    // await connection.confirmTransaction(hashCreate11, 'finalized');

    // // FE chuẩn bị params

    const getPoolInfo = await client.getClmmPoolInfo(poolId)
    // console.log("🚀 ~ it ~ mintA:", getPoolInfo.mintA.toString())
    // console.log("🚀 ~ it ~ mintB:", getPoolInfo.mintB.toString())

    const currentPrice = TickUtils.getTickPriceDecimals({
      mintDecimalsA: getPoolInfo.mintDecimalsA,
      mintDecimalsB: getPoolInfo.mintDecimalsB,
      tick: getPoolInfo.tickCurrent,
      baseIn: true,
    })

    // const currentPriceTest = TickUtils.getTickPriceDecimals({
    //   mintDecimalsA: getPoolInfo.mintDecimalsA,
    //   mintDecimalsB: getPoolInfo.mintDecimalsB,
    //   tick: 14400,
    //   baseIn: true,
    // })
    // console.log("🚀 ~ it ~ currentPriceTest:", currentPriceTest.price.toNumber())
    console.log("🚀 ~ it ~ currentPrice:", currentPrice.price.toNumber())

    // const positionInfo = await client.getPositionInfo(positionId)
    // console.log("🚀 ~ it ~ tickLower:", positionInfo.tickLower.toString())
    // console.log("🚀 ~ it ~ tickUpper:", positionInfo.tickUpper.toString())

    // const { price: pricePool } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(9919.98))
    const { price: priceMin, mintA, mintB } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(0.1))
    const { price: priceMax } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(1.5))
    const [priceLower, priceUpper] = [Math.min(priceMin.toNumber(), priceMax.toNumber()), Math.max(priceMin.toNumber(), priceMax.toNumber())]
    const tickLower = TickMath.getTickWithPriceAndTickspacing(new Decimal(priceLower), configInfo.tickSpacing, getPoolInfo.mintDecimalsA, getPoolInfo.mintDecimalsB)
    // console.log("🚀 ~ it ~ tickLower:", tickLower)
    const tickUpper = TickMath.getTickWithPriceAndTickspacing(new Decimal(priceUpper), configInfo.tickSpacing, getPoolInfo.mintDecimalsA, getPoolInfo.mintDecimalsB)
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

    // const infoLiquidityAmountAB = await client.computePairAmountLiquidity({
    //   inputA: false,
    //   poolInfo: poolInfo,
    //   // tickLower: positionInfo.tickLower,
    //   // tickUpper: positionInfo.tickUpper,
    //   tickLower,
    //   tickUpper,
    //   amount: new BN(10000000),
    //   slippage: 0.2,
    //   add: true
    // })
    // console.log("🚀 ~ it ~ infoLiquidityAmountAB:", infoLiquidityAmountAB.liquidity.toNumber())
    // console.log("🚀 ~ it ~ infoLiquidityAmountAB:", infoLiquidityAmountAB.amountA.toNumber())
    // console.log("🚀 ~ it ~ infoLiquidityAmountAB:", infoLiquidityAmountAB.amountB.toNumber())



    // // openPosition

    // const insOpenPositionFromBase = await client.openPositionFromBase({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: poolInfo,
    //   poolKeys: {
    //     vault: { A: getPoolInfo.vaultA.toString(), B: getPoolInfo.vaultB.toString() },
    //     rewardInfos: [],
    //   },
    //   // tickLower: positionInfo.tickLower,
    //   // tickUpper: positionInfo.tickUpper,
    //   tickLower,
    //   tickUpper,
    //   base: "MintB",
    //   baseAmount: infoLiquidityAmountAB.amountB,
    //   otherAmountMax: infoLiquidityAmountAB.amountSlippageA,
    //   nft2022: true
    // })
    // console.log("🚀 ~ it ~ insOpenPositionFromBase:", insOpenPositionFromBase.address.personalPosition.toString())

    // const transaction = new Transaction().add(...insOpenPositionFromBase.instructions);

    // const hashOpenPosition = await connection.sendTransaction(transaction, [defaultAccount, ...insOpenPositionFromBase.signers], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ openPosition:", hashOpenPosition)
    // await connection.confirmTransaction(hashOpenPosition, 'finalized');

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
    //   amountMaxA: infoLiquidityAmountAB.amountSlippageA,
    //   amountMaxB: infoLiquidityAmountAB.amountSlippageB,
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
      amount: new BN(100000),
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
    console.log("🚀 ~ it ~ quoteExactIn currentPrice:", quoteExactIn.currentPrice.toNumber())
    console.log("🚀 ~ it ~ quoteExactIn executionPrice:", quoteExactIn.executionPrice.toNumber())
    console.log("🚀 ~ it ~ quoteExactIn priceImpact:", quoteExactIn.priceImpact.toString())

    console.log("🚀 ~ it ~ quoteExactIn inAmount:", quoteExactIn.inAmount.toString())
    console.log("🚀 ~ it ~ quoteExactIn outAmount:", quoteExactIn.outAmount.toString())


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


    //////////////// remove liquidity //////////

    // const insRemovePoolInfo = await client.decreaseLiquidity({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: poolInfo,
    //   poolKeys: {
    //     vault: { A: getPoolInfo.vaultA.toString(), B: getPoolInfo.vaultB.toString() },
    //     rewardInfos: []
    //   },
    //   ownerPosition: positionInfo,
    //   liquidity: positionInfo.liquidity,
    //   amountMinA: new BN(0),
    //   amountMinB: new BN(0),
    //   isClosePosition: true,
    // })


    // const transactionRemoveLiquidity = new Transaction().add(...insRemovePoolInfo.instructions);

    // const hashRemoveLiquidity = await connection.sendTransaction(transactionRemoveLiquidity, [defaultAccount], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashRemoveLiquidity:", hashRemoveLiquidity)

    // await connection.confirmTransaction(hashRemoveLiquidity, 'finalized');
  })
})



//**************** main net 


// describe('ClmmClient', () => {
//   const client = new ClmmClient({ rpc: RPC.mainnet, clmmProgramId: CLMM_PROGRAM_ID.main });
//   const connection = client.connection;
//   const defaultAccount = getLocalWallet();
//   const inputMint = Keypair.generate();
//   const outputMint = Keypair.generate();


//   it('create CLMM pool', async () => {

//     const mint1 = {
//       address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
//       // address: inputMint.publicKey.toString(),
//       decimals: 6,
//       symbol: 'INPUT',
//       name: 'Input Token',
//       chainId: 'solanaDev',
//       programId: TOKEN_PROGRAM_ID.toString(),
//       // programId: TOKEN_2022_PROGRAM_ID.toString(),
//       logoURI: 'https://example.com/input-token-logo.png',
//     }

//     const mint2 = {
//       address: 'SarosY6Vscao718M4A778z4CGtvcwcGef5M9MEH1LGL',
//       // address: outputMint.publicKey.toString(),
//       decimals: 6,
//       symbol: 'OUTPUT',
//       name: 'Output Token',
//       chainId: 'solanaDev',
//       programId: TOKEN_PROGRAM_ID.toString(),
//       // programId: TOKEN_2022_PROGRAM_ID.toString(),
//       logoURI: 'https://example.com/input-token-logo.png'
//     }

//     const { price: priceMin, mintA, mintB } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(0.3))



//     const ammConfigId = "E64NGkDLLCdQ2yFNPcavaKptrEgmiQaNykUuLC1Qgwyp"
//     const poolId = 'J3FBhMSKi5eRB1feMBaxqbBM9ZBzr5TH2H2Q7xQsptHF'
//     const positionId = '5zGF4g1QxXAb4f4r1hPrRXb1gHRPG5wTwALRdvRZPwVZ'


//     // // FE chuẩn bị params
//     const configInfo = await client.getAmmConfigInfo(ammConfigId)
//     console.log("🚀 ~ it ~ tradeFeeRate:", configInfo.tradeFeeRate)
//     console.log("🚀 ~ it ~ tickSpacing:", configInfo.tickSpacing)



//     const getPoolInfo = await client.getClmmPoolInfo(poolId)
//     console.log("🚀 ~ it ~ getPoolInfo:", getPoolInfo.mintA.toString())


//     const currentPrice = TickUtils.getTickPriceDecimals({
//       mintDecimalsA: getPoolInfo.mintDecimalsA,
//       mintDecimalsB: getPoolInfo.mintDecimalsB,
//       tick: getPoolInfo.tickCurrent,
//       baseIn: true,
//     })
//     console.log("🚀 ~ it ~ currentPrice:", currentPrice.price.toNumber())

//     // const positionInfo = await client.getPositionInfo(positionId)
//     // console.log("🚀 ~ it ~ tickLower:", positionInfo.tickLower.toFixed(0))
//     // console.log("🚀 ~ it ~ tickUpper:", positionInfo.tickUpper.toFixed(0))
//     // console.log("🚀 ~ it ~ positionInfo:", positionInfo.liquidity.toNumber())

//     const poolInfo: PoolInfoConcentratedItem = {
//       price: currentPrice.price.toNumber(),
//       programId: client.clmmProgramId.toString(),
//       id: poolId,
//       mintA: mintA,
//       mintB: mintB,
//       config: {
//         id: ammConfigId,
//         tickSpacing: configInfo.tickSpacing,
//       },
//       rewardDefaultInfos: [],
//     }

//     // const infoLiquidityAmountAB = await client.computePairAmountLiquidity({
//     //   inputA: true,
//     //   poolInfo: poolInfo,
//     //   tickLower: positionInfo.tickLower,
//     //   tickUpper: positionInfo.tickUpper,
//     //   // tickLower: tickLower,
//     //   // tickUpper: tickUpper,
//     //   amount: new BN(1000000),
//     //   slippage: 0,
//     //   add: true
//     // })


//     // const insAddPoolInfo = await client.increasePositionFromLiquidity({
//     //   payer: defaultAccount.publicKey,
//     //   poolInfo: poolInfo,
//     //   poolKeys: {
//     //     vault: { A: getPoolInfo.vaultA.toString(), B: getPoolInfo.vaultB.toString() },
//     //     rewardInfos: []
//     //   },
//     //   ownerPosition: positionInfo,
//     //   liquidity: infoLiquidityAmountAB.liquidity,
//     //   amountMaxA: infoLiquidityAmountAB.amountSlippageA,
//     //   amountMaxB: infoLiquidityAmountAB.amountSlippageB,
//     // })

//     // const transactionAddLiquidity = new Transaction().add(...insAddPoolInfo.instructions);
//     // const hashAddLiquidity = await connection.sendTransaction(transactionAddLiquidity, [defaultAccount], {
//     //   skipPreflight: true
//     // });
//     // console.log("🚀 ~ it ~ hashAddLiquidity:", hashAddLiquidity)

//     // await connection.confirmTransaction(hashAddLiquidity, 'finalized');




//   })
// })


