import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { ClmmClient } from '../ClmmClient';
import { createSplToken, getLocalWallet } from './utils';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getPdaAmmConfigId } from '../utils/pda';
import { CLMM_PROGRAM_ID } from '../constants/programIds';
import Decimal from 'decimal.js';
import { BN } from 'bn.js';
import { TickUtils } from '../utils/tick';
import { sleep } from '@raydium-io/raydium-sdk-v2';
import { TickMath } from '../utils/math';
import { getTokenATokenBAndPrice } from '../utils/util';
jest.setTimeout(300000);
describe('ClmmClient', () => {
  const client = new ClmmClient({ rpc: 'https://api.devnet.solana.com', clmmProgramId: CLMM_PROGRAM_ID.dev });
  const connection = client.connection;
  const defaultAccount = getLocalWallet();
  const inputMint = Keypair.generate();
  const outputMint = Keypair.generate();

  it('create CLMM pool', async () => {

    const test = client.getClmmPoolInfo('H7NYgvEH2qFeJ3STX3qgNNWVv41rkzucRgojjfyhnaQX')
    console.log("🚀 ~ it ~ test:", (await test).tickCurrent.toString())

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
      address: '6SCMd9BYv5Ack3MC9CKfjDz9BcKuR5yeDb3Eue9k4Z8L',
      // address: inputMint.publicKey.toString(),
      decimals: 6,
      symbol: 'INPUT',
      name: 'Input Token',
      chainId: 'solanaDev',
      programId: TOKEN_PROGRAM_ID.toString(),
      logoURI: 'https://example.com/input-token-logo.png',
    }

    const mint2 = {
      address: '2EYWeNzTPGKzBtfiEyCk2wZsz6WwkfwyTtSjjRmE5rfy',
      // address: outputMint.publicKey.toString(),
      decimals: 6,
      symbol: 'OUTPUT',
      name: 'Output Token',
      chainId: 'solanaDev',
      programId: TOKEN_PROGRAM_ID.toString(),
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

    // await sleep(30000)

    const tickSpacing = 60
    const ammConfigId = 'HfFPxHvPftA9ueEgJ4HtM66ZBsfm18QGbC1MGrHo77Vs'

    const { mintA, mintB } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(2))
    const { price: priceTick1 } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(1))
    const { price: priceTick2 } = getTokenATokenBAndPrice(mint1, mint2, new Decimal(3))

    const [priceLower, priceUpper] = [Math.min(priceTick1.toNumber(), priceTick2.toNumber()), Math.max(priceTick1.toNumber(), priceTick2.toNumber())]

    const insCreatePoolInfo = await client.createPool({
      owner: defaultAccount.publicKey,
      mint1,
      mint2,
      ammConfigId: new PublicKey(ammConfigId),
      initialPrice: new Decimal(2), // initialPrice = tokenB_amount / tokenA_amount; (1 tokenA = 2 tokenB)
    })

    const { instructions, address } = insCreatePoolInfo
    console.log("🚀 ~ it ~ address.poolId.toString():", address.poolId.toString())


    const insOpenPositionFromBase = await client.openPositionFromBase({
      payer: defaultAccount.publicKey,
      poolInfo: {
        programId: client.clmmProgramId.toString(),
        id: address.poolId.toString(),
        mintA,
        mintB,
        config: {
          id: ammConfigId,
          tickSpacing,
        },
        rewardDefaultInfos: [],
      },
      poolKeys: {
        vault: { A: address.mintAVault.toString(), B: address.mintBVault.toString() },
        rewardInfos: [],
      },
      tickLower: TickMath.getTickWithPriceAndTickspacing(new Decimal(priceLower), tickSpacing, mintA.decimals, mintB.decimals),
      tickUpper: TickMath.getTickWithPriceAndTickspacing(new Decimal(priceUpper), tickSpacing, mintA.decimals, mintB.decimals),

      base: "MintA",
      baseAmount: new BN(1000000),
      otherAmountMax: new BN(1000000000000),
      nft2022: true
    })

    const transaction = new Transaction().add(...instructions);

    transaction.add(...insOpenPositionFromBase.instructions);
    const hashCreate = await connection.sendTransaction(transaction, [defaultAccount, ...insOpenPositionFromBase.signers], {
      skipPreflight: true
    });
    console.log("🚀 ~ it ~ hashCreate:", hashCreate)

    // await connection.confirmTransaction(hashCreate, 'finalized');

    // // // add pool

    // const positionInfo = await client.getPositionInfo(insOpenPositionFromBase.address.personalPosition.toString())

    // const insAddPoolInfo = await client.increasePositionFromLiquidity({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: {
    //     programId: client.clmmProgramId.toString(),
    //     id: address.poolId.toString(),
    //     mintA: address.mintA,
    //     mintB: address.mintB,
    //     config: {
    //       id: ammConfigId,
    //       tickSpacing,
    //     },
    //     rewardDefaultInfos: [],
    //   },
    //   poolKeys: {
    //     vault: { A: address.mintAVault.toString(), B: address.mintBVault.toString() },
    //     rewardInfos: []
    //   },
    //   ownerPosition: positionInfo,
    //   liquidity: new BN(1000000),
    //   amountMaxA: new BN(1000000000),
    //   amountMaxB: new BN(1000000000),
    // })

    // const transactionAddLiquidity = new Transaction().add(...insAddPoolInfo.instructions);
    // const hashAddLiquidity = await connection.sendTransaction(transactionAddLiquidity, [defaultAccount], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashAddLiquidity:", hashAddLiquidity)

    // await connection.confirmTransaction(hashAddLiquidity, 'finalized');

    // // swap 

    // const insSwapPoolInfo = await client.swap({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: {
    //     programId: client.clmmProgramId.toString(),
    //     id: address.poolId.toString(),
    //     mintA: address.mintA,
    //     mintB: address.mintB,
    //     config: {
    //       id: ammConfigId,
    //       tickSpacing,
    //     },
    //     rewardDefaultInfos: [],
    //   },
    //   poolKeys: {
    //     vault: { A: address.mintAVault.toString(), B: address.mintBVault.toString() },
    //     rewardInfos: []
    //   },
    //   inputMint: address.mintA.address,
    //   amountIn: new BN(100000),
    //   amountOutMin: new BN(0),
    //   priceLimit: new Decimal(0),
    //   observationId: address.observationId,
    //   remainingAccounts: [insOpenPositionFromBase.address.tickArrayLower, insOpenPositionFromBase.address.tickArrayUpper], // calculator tick array
    // })


    // const transactionSwap = new Transaction().add(...insSwapPoolInfo.instructions);

    // const hashSwap = await connection.sendTransaction(transactionSwap, [defaultAccount], {
    //   skipPreflight: true
    // });
    // console.log("🚀 ~ it ~ hashSwap:", hashSwap)

    // await connection.confirmTransaction(hashSwap, 'finalized');

    // // remove liquidity

    // const positionInfoRemove = await client.getPositionInfo(insOpenPositionFromBase.address.personalPosition.toString())
    // console.log("🚀 ~ it ~ positionInfoRemove:", positionInfoRemove.liquidity.toString())

    // const insRemovePoolInfo = await client.decreaseLiquidity({
    //   payer: defaultAccount.publicKey,
    //   poolInfo: {
    //     programId: client.clmmProgramId.toString(),
    //     id: address.poolId.toString(),
    //     mintA: address.mintA,
    //     mintB: address.mintB,
    //     config: {
    //       id: ammConfigId,
    //       tickSpacing,
    //     },
    //     rewardDefaultInfos: [],
    //   },
    //   poolKeys: {
    //     vault: { A: address.mintAVault.toString(), B: address.mintBVault.toString() },
    //     rewardInfos: []
    //   },
    //   ownerPosition: positionInfo,
    //   liquidity: positionInfoRemove.liquidity,
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
