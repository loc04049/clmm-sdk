import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { ClmmClientConfig, CreateConcentratedPool } from "./type";
import { PoolInfoLayout } from "./layout";
import { CLMM_PROGRAM_ID } from "./constants/programIds";
import { BN } from "bn.js";
import Decimal from "decimal.js";
import { SqrtPriceMath } from "./utils/math";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getPdaMintExAccount } from "./utils/pda";
import { ClmmInstrument } from "./instrument";

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
      feePayer,
    } = props;
    // const txBuilder = this.createTxBuilder(feePayer);
    const instructions: TransactionInstruction[] = [];
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

    instructions.push(...insInfo.instructions);


    return instructions

    // return txBuilder.versionBuild<{
    //   mockPoolInfo: ApiV3PoolInfoConcentratedItem;
    //   address: ClmmKeys;
    //   forerunCreate?: boolean;
    // }>({
    //   txVersion,
    //   extInfo: {
    //     address: {
    //       ...insInfo.address,
    //       observationId: insInfo.address.observationId.toBase58(),
    //       exBitmapAccount: insInfo.address.exBitmapAccount.toBase58(),
    //       programId: CLMM_PROGRAM_ID.toString(),
    //       id: insInfo.address.poolId.toString(),
    //       mintA,
    //       mintB,
    //       openTime: "0",
    //       vault: { A: insInfo.address.mintAVault.toString(), B: insInfo.address.mintBVault.toString() },
    //       rewardInfos: [],
    //       config: {
    //         id: ammConfig.id.toString(),
    //         index: ammConfig.index,
    //         protocolFeeRate: ammConfig.protocolFeeRate,
    //         tradeFeeRate: ammConfig.tradeFeeRate,
    //         tickSpacing: ammConfig.tickSpacing,
    //         fundFeeRate: ammConfig.fundFeeRate,
    //         description: ammConfig.description,
    //         defaultRange: 0,
    //         defaultRangePoint: [],
    //       },
    //     },
    //     mockPoolInfo: {
    //       type: "Concentrated",
    //       rewardDefaultPoolInfos: "Clmm",
    //       id: insInfo.address.poolId.toString(),
    //       mintA,
    //       mintB,
    //       feeRate: ammConfig.tradeFeeRate,
    //       openTime: "0",
    //       programId: CLMM_PROGRAM_ID.toString(),
    //       price: initPrice.toNumber(),
    //       config: {
    //         id: ammConfig.id.toString(),
    //         index: ammConfig.index,
    //         protocolFeeRate: ammConfig.protocolFeeRate,
    //         tradeFeeRate: ammConfig.tradeFeeRate,
    //         tickSpacing: ammConfig.tickSpacing,
    //         fundFeeRate: ammConfig.fundFeeRate,
    //         description: ammConfig.description,
    //         defaultRange: 0,
    //         defaultRangePoint: [],
    //       },
    //       burnPercent: 0,
    //       ...mockV3CreatePoolInfo,
    //     },
    //     forerunCreate,
    //   },
    // })
  }
}



