import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { ClmmClient } from '../ClmmClient';
import { createSplToken, getLocalWallet } from './utils';
import { getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getPdaAmmConfigId } from '../utils/pda';
import { CLMM_PROGRAM_ID } from '../constants/programIds';
import Decimal from 'decimal.js';
import { aw } from '@raydium-io/raydium-sdk-v2/lib/api-7daf490d';
import { BN } from 'bn.js';
import { TickUtils } from '../utils/tick';
jest.setTimeout(300000);
describe('ClmmClient', () => {
  const client = new ClmmClient({ rpc: 'https://api.devnet.solana.com' })
  const connection = client.connection;
  const defaultAccount = getLocalWallet();
  const inputMint = Keypair.generate();
  const outputMint = Keypair.generate();

  it('create CLMM pool', async () => {
    console.log('create CLMM pool')

    // FEPMUrHnWvteKohpKm5LGnKUh3QfE4ADLBURQiLcChMP




    // const test = client.getClmmPoolInfo('8pQZVCNSs3XZtzP1RHFwrt4hG9UrnFgQs9sSScnKFR6t')
    // console.log("🚀 ~ it ~ test:", test)


    // const test = getPdaAmmConfigId(CLMM_PROGRAM_ID, 2)
    // console.log("🚀 ~ it ~ test:", test.publicKey.toString())

    const mint1 = {
      // address: '84L2XDrnuKYebpdp1fBaoPL1rQPkDJDsrnupMeprtafV',
      address: inputMint.publicKey.toString(),
      decimals: 6,
      symbol: 'INPUT',
      name: 'Input Token',
      chainId: 'solanaDev',
      programId: TOKEN_PROGRAM_ID.toString(),
      logoURI: 'https://example.com/input-token-logo.png',
    }

    const mint2 = {
      // address: '5gWHaiP46p3W6E2p4MKb3ZGVN2routj2XXLpu9xeVwbd',
      address: outputMint.publicKey.toString(),
      decimals: 6,
      symbol: 'OUTPUT',
      name: 'Output Token',
      chainId: 'solanaDev',
      programId: TOKEN_PROGRAM_ID.toString(),
      logoURI: 'https://example.com/input-token-logo.png'
    }


    await createSplToken({
      connection,
      initialAmount: BigInt(1_000_000_000_000),
      mint: inputMint,
      payer: defaultAccount,
      decimals: 6,
    });


    await createSplToken({
      connection,
      initialAmount: BigInt(1_000_000_000_000),
      mint: outputMint,
      payer: defaultAccount,
      decimals: 6,
    });

    const tickSpacing = 60

    const insCreatePoolInfo = await client.createPool({
      owner: defaultAccount.publicKey,
      mint1,
      mint2,
      ammConfig: {
        // id: new PublicKey('8pQZVCNSs3XZtzP1RHFwrt4hG9UrnFgQs9sSScnKFR6t'),
        id: new PublicKey('B9H7TR8PSjJT7nuW2tuPkFC63z7drtMZ4LoCtD7PrCN1'),
        index: 0,
        protocolFeeRate: 0.003,
        tradeFeeRate: 0.0005,
        tickSpacing,
        fundFeeRate: 0.0001,
        fundOwner: 'FUND_OWNER_ADDRESS',
        description: 'Test AMM Config'
      },
      // initialPrice = tokenB_amount / tokenA_amount; (1 tokenA = 3 tokenB)
      initialPrice: new Decimal(2),
    })

    const { instructions, address } = insCreatePoolInfo
    console.log("🚀 ~ it ~ address.poolId.toString():", address.poolId.toString())


    const insOpenPositionFromBase = await client.openPositionFromBase({
      payer: defaultAccount.publicKey,
      poolInfo: {
        programId: CLMM_PROGRAM_ID.toString(),
        id: address.poolId.toString(),
        mintA: address.mintA,
        mintB: address.mintB,
        config: {
          tickSpacing,
        }
      },
      poolKeys: {
        vault: { A: address.mintAVault.toString(), B: address.mintBVault.toString() }
      },
      tickLower: TickUtils.getTickLowerUpper(1, tickSpacing),
      tickUpper: TickUtils.getTickLowerUpper(3, tickSpacing),

      base: "MintA",
      baseAmount: new BN(1000000),
      otherAmountMax: new BN(1000000000000),
      nft2022: true
    })
    console.log("🚀 ~ it ~ personalPosition:", insOpenPositionFromBase.address.personalPosition.toString())


    const transaction = new Transaction().add(...instructions);

    transaction.add(...insOpenPositionFromBase.instructions);
    const hash = await connection.sendTransaction(transaction, [defaultAccount, ...insOpenPositionFromBase.signers], {
      skipPreflight: true
    });
    console.log("🚀 ~ it ~ hash:", hash)

    await connection.confirmTransaction(hash, 'finalized');

    // add pool

    const positionInfo = await client.getPositionInfo(insOpenPositionFromBase.address.personalPosition.toString())
    // console.log("🚀 ~ it ~ positionInfo:", {
    //   nft: positionInfo.nftMint.toString(),
    //   poolId: positionInfo.poolId.toString(),
    //   tickLower: positionInfo.tickLower.toString(),
    //   tickUpper: positionInfo.tickUpper.toString(),
    //   liquidity: positionInfo.liquidity.toString(),
    //   baseAmountClaimed: positionInfo.feeGrowthInsideLastX64A.toString(),
    //   otherAmountClaimed: positionInfo.feeGrowthInsideLastX64B.toString(),
    //   feeGrowthInsideA: positionInfo.tokenFeesOwedA.toString(),
    //   feeGrowthInsideB: positionInfo.tokenFeesOwedB.toString(),
    // })


    const insAddPoolInfo = await client.increasePositionFromLiquidity({
      payer: defaultAccount.publicKey,
      poolInfo: {
        programId: CLMM_PROGRAM_ID.toString(),
        id: address.poolId.toString(),
        mintA: address.mintA,
        mintB: address.mintB,
        config: {
          tickSpacing,
        }
      },
      poolKeys: {
        vault: { A: address.mintAVault.toString(), B: address.mintBVault.toString() }
      },
      ownerPosition: positionInfo,
      liquidity: new BN(1),
      amountMaxA: new BN(1000000000),
      amountMaxB: new BN(1000000000),
    })

    const transactionAddLiquidity = new Transaction().add(...insAddPoolInfo.instructions);
    const hashAddLiquidity = await connection.sendTransaction(transactionAddLiquidity, [defaultAccount], {
      skipPreflight: true
    });
    console.log("🚀 ~ it ~ hashAddLiquidity:", hashAddLiquidity)

    await connection.confirmTransaction(hashAddLiquidity, 'finalized');

    // remove liquidity



  })
})
