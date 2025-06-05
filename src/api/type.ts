
type FarmRewardInfoOld = {
  mint: ApiV3Token;
  perSecond: number;
};

export type PoolFarmRewardInfo = FarmRewardInfoOld & {
  startTime?: number;
  endTime?: number;
};

export interface TransferFeeDataBaseType {
  transferFeeConfigAuthority: string;
  withdrawWithheldAuthority: string;
  withheldAmount: string;
  olderTransferFee: {
    epoch: string;
    maximumFee: string;
    transferFeeBasisPoints: number;
  };
  newerTransferFee: {
    epoch: string;
    maximumFee: string;
    transferFeeBasisPoints: number;
  };
}

export type ExtensionsItem = {
  coingeckoId?: string;
  feeConfig?: TransferFeeDataBaseType;
};

export type ApiV3Token = {
  chainId: number;
  address: string;
  programId: string;
  logoURI: string;
  symbol: string;
  name: string;
  decimals: number;
  tags: string[]; // "hasFreeze" | "hasTransferFee" | "token-2022" | "community" | "unknown" ..etc
  extensions: ExtensionsItem;
  freezeAuthority?: string;
  mintAuthority?: string;
};

export interface ApiV3PoolInfoBaseItem {
  programId: string;
  id: string;
  mintA: ApiV3Token;
  mintB: ApiV3Token;
  rewardDefaultInfos: PoolFarmRewardInfo[];
  rewardDefaultPoolInfos: "Ecosystem" | "Fusion" | "Raydium" | "Clmm";
  price: number;
  mintAmountA: number;
  mintAmountB: number;
  feeRate: number;
  openTime: string;
  tvl: number;

  day: ApiV3PoolInfoCountItem;
  week: ApiV3PoolInfoCountItem;
  month: ApiV3PoolInfoCountItem;
  pooltype: PoolTypeItem[];

  farmUpcomingCount: number;
  farmOngoingCount: number;
  farmFinishedCount: number;

  burnPercent: number;
}

export interface ApiV3PoolInfoCountItem {
  volume: number;
  volumeQuote: number;
  volumeFee: number;
  apr: number;
  feeApr: number;
  priceMin: number;
  priceMax: number;
  rewardApr: number[];
}

type PoolTypeItem = "StablePool" | "OpenBookMarket";

export type ApiV3PoolInfoConcentratedItem = ApiV3PoolInfoBaseItem & {
  type: "Concentrated";
  config: ApiClmmConfigV3;
};

export interface ApiClmmConfigV3 {
  id: string;
  index: number;
  protocolFeeRate: number;
  tradeFeeRate: number;
  tickSpacing: number;
  fundFeeRate: number;
  description: string;
  defaultRange: number;
  defaultRangePoint: number[];
}