import { TokenInfo } from "../type";

type FarmRewardInfoOld = {
  mint: TokenInfo;
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




export interface ApiV3PoolInfoBaseItem {
  programId: string;
  id: string;
  mintA: TokenInfo;
  mintB: TokenInfo;
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