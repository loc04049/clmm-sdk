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
jest.setTimeout(30000);
describe('ClmmClient', () => {
  const client = new ClmmClient({ rpc: 'https://api.devnet.solana.com' })
  const connection = client.connection;
  const defaultAccount = getLocalWallet();
  const inputMint = Keypair.generate();
  const outputMint = Keypair.generate();

  it('create CLMM pool', async () => {
    console.log('create CLMM pool')

    // const test = client.getClmmPoolInfo('8TarrZgrMS75QyQPPXtYYMPLyd7rWq5pWLjdTYqXrB9E')
    // console.log("🚀 ~ it ~ test:", test)

    // const test = getPdaAmmConfigId(CLMM_PROGRAM_ID, 1)
    // console.log("🚀 ~ it ~ test:", test)

    const mint1 = {
      // address: 'EBNrDgp2aoZFxgQvgY6X8CN1ucWtCRjrTSCFV3nr2Hzk',
      address: inputMint.publicKey.toString(),
      decimals: 6,
      symbol: 'INPUT',
      name: 'Input Token',
      chainId: 'solanaDev',
      programId: TOKEN_PROGRAM_ID.toString(),
      logoURI: 'https://example.com/input-token-logo.png',
    }

    const mint2 = {
      // address: '4VevDiT3MSEB6xa5FovNd8gqS4StYq2ZbJUEfRjjnVAk',
      address: outputMint.publicKey.toString(),
      decimals: 9,
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

    const insCreatePoolInfo = await client.createPool({
      owner: defaultAccount.publicKey,
      mint1,
      mint2,
      ammConfig: {
        // id: new PublicKey('9iFER3bpjf1PTTCQCfTRu17EJgvsxo9pVyA9QWwEuX4x'),
        id: new PublicKey('B9H7TR8PSjJT7nuW2tuPkFC63z7drtMZ4LoCtD7PrCN1'),
        index: 0,
        protocolFeeRate: 0.003,
        tradeFeeRate: 0.0005,
        tickSpacing: 60,
        fundFeeRate: 0.0001,
        fundOwner: 'FUND_OWNER_ADDRESS',
        description: 'Test AMM Config'
      },
      // initialPrice = tokenB_amount / tokenA_amount; (1 tokenA = 3 tokenB)
      initialPrice: new Decimal(3),
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
          tickSpacing: 60,
        }
      },
      poolKeys: {
        vault: { A: address.mintAVault.toString(), B: address.mintBVault.toString() }
      },
      tickLower: TickUtils.getTickLowerUpper(1.1, 60),
      tickUpper: TickUtils.getTickLowerUpper(3, 60),

      base: "MintA",
      baseAmount: new BN(1000000),
      otherAmountMax: new BN(1000000000000),
      nft2022: true
    })

    const transaction = new Transaction().add(...instructions);
    // const hash = await connection.sendTransaction(transaction, [defaultAccount], {
    //   skipPreflight: false
    // });

    transaction.add(...insOpenPositionFromBase.instructions);
    const hash = await connection.sendTransaction(transaction, [defaultAccount, ...insOpenPositionFromBase.signers], {
      skipPreflight: true
    });
    console.log("🚀 ~ it ~ hash:", hash)
  })
})
