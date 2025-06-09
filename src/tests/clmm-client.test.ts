import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { ClmmClient } from '../ClmmClient';
import { createSplToken, getLocalWallet } from './utils';
import { getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getPdaAmmConfigId } from '../utils/pda';
import { CLMM_PROGRAM_ID } from '../constants/programIds';
import Decimal from 'decimal.js';
jest.setTimeout(30000);
describe('ClmmClient', () => {
  const client = new ClmmClient({ rpc: 'https://api.devnet.solana.com' })
  const connection = client.connection;
  const defaultAccount = getLocalWallet();
  const inputMint = Keypair.generate();
  const outputMint = Keypair.generate();

  it('create CLMM pool', async () => {
    console.log('create CLMM pool')

    const test = getPdaAmmConfigId(CLMM_PROGRAM_ID, 1)
    console.log("🚀 ~ it ~ pub:", test.publicKey.toString())

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
      decimals: 9,
    });

    const insCreatePool = await client.createPool({
      owner: defaultAccount.publicKey,
      mint1: {
        address: inputMint.publicKey.toString(),
        decimals: 6,
        symbol: 'INPUT',
        name: 'Input Token',
        chainId: 'solanaDev',
        programId: TOKEN_PROGRAM_ID.toString(),
        logoURI: 'https://example.com/input-token-logo.png',
        extensions: {
          coingeckoId: 'input-token'
        }
      },
      mint2: {
        address: outputMint.publicKey.toString(),
        decimals: 9,
        symbol: 'OUTPUT',
        name: 'Output Token',
        chainId: 'solanaDev',
        programId: TOKEN_PROGRAM_ID.toString(),
        logoURI: 'https://example.com/input-token-logo.png',
        extensions: {
          coingeckoId: 'output-token'
        }
      },
      ammConfig: {
        // id: new PublicKey('9iFER3bpjf1PTTCQCfTRu17EJgvsxo9pVyA9QWwEuX4x'),
        id: new PublicKey('B9H7TR8PSjJT7nuW2tuPkFC63z7drtMZ4LoCtD7PrCN1'),
        index: 0,
        protocolFeeRate: 0.003,
        tradeFeeRate: 0.0005,
        tickSpacing: 64,
        fundFeeRate: 0.0001,
        fundOwner: 'FUND_OWNER_ADDRESS',
        description: 'Test AMM Config'
      },
      // initialPrice = tokenB_amount / tokenA_amount; (1 tokenA = 3 tokenB)
      initialPrice: new Decimal(3),
    })

    const transaction = new Transaction().add(...insCreatePool);
    const hash = await connection.sendTransaction(transaction, [defaultAccount], {
      skipPreflight: true
    });
    console.log("🚀 ~ it ~ hash:", hash)
  })
})
