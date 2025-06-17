import { EpochInfo, Keypair, PublicKey, Signer, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js";
import { ClmmPositionLayout, PoolInfoLayout } from "./layout";
import { GetStructureSchema, Percent, Price, TokenAmount, TransferAmountFee } from "@raydium-io/raydium-sdk-v2";
import { TickArray } from "./utils/tick";
import { ApiClmmConfigV3, ApiV3PoolInfoConcentratedItem, ApiV3Token } from "./api";
import { splAccountLayout } from "./layout";


export interface ReturnTypeMakeInstructions<T = Record<string, PublicKey>> {
  signers: (Signer | Keypair)[];
  instructions: TransactionInstruction[];
  instructionTypes: string[];
  address: T;
}
export interface ClmmClientConfig {
  rpc: string;
  clmmProgramId: PublicKey;
}

export interface ClmmConfigInfo {
  id: PublicKey;
  index: number;
  protocolFeeRate: number;
  tradeFeeRate: number;
  tickSpacing: number;
  fundFeeRate: number;
  fundOwner: string;
  description: string;
}

export interface CreateConcentratedPool {
  owner: PublicKey;
  mint1: ApiV3Token;
  mint2: ApiV3Token;
  ammConfigId: PublicKey;
  initialPrice: Decimal;
}


export interface ComputeBudgetConfig {
  units?: number;
  microLamports?: number;
}

export interface TxTipConfig {
  feePayer?: PublicKey;
  address: PublicKey;
  amount: BN;
}

export interface ReturnTypeFetchMultiplePoolTickArrays {
  [poolId: string]: { [key: string]: TickArray };
}

export interface TickArrayBitmapExtensionType {
  poolId: PublicKey;
  positiveTickArrayBitmap: BN[][];
  negativeTickArrayBitmap: BN[][];
}

export interface ReturnTypeGetLiquidityAmountOut {
  liquidity: BN;
  amountSlippageA: GetTransferAmountFee;
  amountSlippageB: GetTransferAmountFee;
  amountA: GetTransferAmountFee;
  amountB: GetTransferAmountFee;
  expirationTime: number | undefined;
}

export interface GetTransferAmountFee {
  amount: BN;
  fee: BN | undefined;
  expirationTime: number | undefined;
}

export interface ClmmPoolInfo {
  id: PublicKey;
  mintA: {
    programId: PublicKey;
    mint: PublicKey;
    vault: PublicKey;
    decimals: number;
  };
  mintB: {
    programId: PublicKey;
    mint: PublicKey;
    vault: PublicKey;
    decimals: number;
  };

  ammConfig: ClmmConfigInfo;
  observationId: PublicKey;

  creator: PublicKey;
  programId: PublicKey;
  version: 6;

  tickSpacing: number;
  liquidity: BN;
  sqrtPriceX64: BN;
  currentPrice: Decimal;
  tickCurrent: number;
  feeGrowthGlobalX64A: BN;
  feeGrowthGlobalX64B: BN;
  protocolFeesTokenA: BN;
  protocolFeesTokenB: BN;
  swapInAmountTokenA: BN;
  swapOutAmountTokenB: BN;
  swapInAmountTokenB: BN;
  swapOutAmountTokenA: BN;
  tickArrayBitmap: BN[];

  rewardInfos: ClmmPoolRewardInfo[];

  day: {
    volume: number;
    volumeFee: number;
    feeA: number;
    feeB: number;
    feeApr: number;
    rewardApr: {
      A: number;
      B: number;
      C: number;
    };
    apr: number;
    priceMin: number;
    priceMax: number;
  };
  week: {
    volume: number;
    volumeFee: number;
    feeA: number;
    feeB: number;
    feeApr: number;
    rewardApr: {
      A: number;
      B: number;
      C: number;
    };
    apr: number;
    priceMin: number;
    priceMax: number;
  };
  month: {
    volume: number;
    volumeFee: number;
    feeA: number;
    feeB: number;
    feeApr: number;
    rewardApr: {
      A: number;
      B: number;
      C: number;
    };
    apr: number;
    priceMin: number;
    priceMax: number;
  };
  tvl: number;
  lookupTableAccount: PublicKey;

  startTime: number;

  exBitmapInfo: TickArrayBitmapExtensionType;
}

export interface ClmmPoolRewardInfo {
  rewardState: number;
  openTime: BN;
  endTime: BN;
  lastUpdateTime: BN;
  emissionsPerSecondX64: BN;
  rewardTotalEmissioned: BN;
  rewardClaimed: BN;
  tokenMint: PublicKey;
  tokenVault: PublicKey;
  creator: PublicKey;
  rewardGrowthGlobalX64: BN;
  perSecond: Decimal;
  remainingRewards: undefined | BN;
  tokenProgramId: PublicKey;
}

export interface ClmmPoolRewardLayoutInfo {
  rewardState: number;
  openTime: BN;
  endTime: BN;
  lastUpdateTime: BN;
  emissionsPerSecondX64: BN;
  rewardTotalEmissioned: BN;
  rewardClaimed: BN;
  tokenMint: PublicKey;
  tokenVault: PublicKey;
  creator: PublicKey;
  rewardGrowthGlobalX64: BN;
  feePayer?: PublicKey;
}

export interface ComputeClmmPoolInfo {
  id: PublicKey;
  version: 6;
  mintA: ApiV3Token;
  mintB: ApiV3Token;

  ammConfig: ClmmConfigInfo;
  observationId: PublicKey;
  exBitmapAccount: PublicKey;

  creator: PublicKey;
  programId: PublicKey;

  tickSpacing: number;
  liquidity: BN;
  sqrtPriceX64: BN;
  currentPrice: Decimal;
  tickCurrent: number;
  feeGrowthGlobalX64A: BN;
  feeGrowthGlobalX64B: BN;
  protocolFeesTokenA: BN;
  protocolFeesTokenB: BN;
  swapInAmountTokenA: BN;
  swapOutAmountTokenB: BN;
  swapInAmountTokenB: BN;
  swapOutAmountTokenA: BN;
  tickArrayBitmap: BN[];

  startTime: number;

  exBitmapInfo: TickArrayBitmapExtensionType;
  rewardInfos: ReturnType<typeof PoolInfoLayout.decode>["rewardInfos"];
}

export interface ReturnTypeComputeAmountOut {
  allTrade: boolean;
  realAmountIn: GetTransferAmountFee;
  amountOut: GetTransferAmountFee;
  minAmountOut: GetTransferAmountFee;
  expirationTime: number | undefined;
  currentPrice: Decimal;
  executionPrice: Decimal;
  priceImpact: Percent;
  fee: BN;
  remainingAccounts: PublicKey[];
  executionPriceX64: BN;
}
export interface ReturnTypeComputeAmountOutBaseOut {
  amountIn: GetTransferAmountFee;
  maxAmountIn: GetTransferAmountFee;
  realAmountOut: GetTransferAmountFee;
  expirationTime: number | undefined;
  currentPrice: Decimal;
  executionPrice: Decimal;
  priceImpact: Percent;
  fee: BN;
  remainingAccounts: PublicKey[];
}

export interface ReturnTypeComputeAmountOutFormat {
  allTrade: boolean;
  realAmountIn: TransferAmountFee;
  amountOut: TransferAmountFee;
  minAmountOut: TransferAmountFee;
  expirationTime: number | undefined;
  currentPrice: Price;
  executionPrice: Price;
  priceImpact: Percent;
  fee: TokenAmount;
  remainingAccounts: PublicKey[];
  executionPriceX64: BN;
}

export interface ReturnTypeFetchExBitmaps {
  [exBitmapId: string]: TickArrayBitmapExtensionType;
}

export type SDKParsedConcentratedInfo = {
  state: ClmmPoolInfo;
  positionAccount?: ClmmPoolPersonalPosition[];
};

export interface ClmmPoolPersonalPosition {
  poolId: PublicKey;
  nftMint: PublicKey;

  priceLower: Decimal;
  priceUpper: Decimal;
  amountA: BN;
  amountB: BN;
  tickLower: number;
  tickUpper: number;
  liquidity: BN;
  feeGrowthInsideLastX64A: BN;
  feeGrowthInsideLastX64B: BN;
  tokenFeesOwedA: BN;
  tokenFeesOwedB: BN;
  rewardInfos: {
    growthInsideLastX64: BN;
    rewardAmountOwed: BN;
    pendingReward: BN;
  }[];

  leverage: number;
  tokenFeeAmountA: BN;
  tokenFeeAmountB: BN;
}

export interface GetAmountParams {
  poolInfo: ApiV3PoolInfoConcentratedItem;
  ownerPosition: ClmmPositionLayout;
  liquidity: BN;
  slippage: number;
  add: boolean;
  epochInfo: EpochInfo;
}

export interface TokenAccountRaw {
  programId: PublicKey;
  pubkey: PublicKey;
  accountInfo: SplAccount;
}

export type SplAccountLayout = typeof splAccountLayout;
export type SplAccount = GetStructureSchema<SplAccountLayout>;

export interface OpenPositionFromBase {
  payer: PublicKey
  poolInfo: PoolInfoConcentratedItem;
  poolKeys: ClmmKeys;
  tickLower: number;
  tickUpper: number;

  base: "MintA" | "MintB";
  baseAmount: BN;
  otherAmountMax: BN;

  nft2022?: boolean;
  withMetadata?: "create" | "no-create";
  getEphemeralSigners?: (k: number) => any;
}

type rewardDefaultInfo = {
  mint: {
    address: string
  }
}

export type PoolInfoConcentratedItem = {
  programId: string;
  id: string;
  mintA: ApiV3Token;
  mintB: ApiV3Token;
  config: {
    id: string;
    tickSpacing: number;
  },
  rewardDefaultInfos: rewardDefaultInfo[] | [];
}

export interface ClmmRewardType {
  mint: ApiV3Token;
  vault: string;
}

export type ClmmKeys = {
  vault: { A: string; B: string };
  rewardInfos: ClmmRewardType[] | []
};

export interface IncreasePositionFromLiquidity {
  payer: PublicKey
  poolInfo: PoolInfoConcentratedItem;
  poolKeys: ClmmKeys;
  ownerPosition: ClmmPositionLayout;
  amountMaxA: BN;
  amountMaxB: BN;
  liquidity: BN;
}

export interface DecreaseLiquidity {
  payer: PublicKey;
  poolInfo: PoolInfoConcentratedItem;
  poolKeys: ClmmKeys;
  ownerPosition: ClmmPositionLayout;
  liquidity: BN;
  amountMinA: BN;
  amountMinB: BN;
  nftAccount?: PublicKey;
  isClosePosition: boolean;
}

