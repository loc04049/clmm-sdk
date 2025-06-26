import { blob, bool, i128, i64, publicKey, s32, seq, struct, u128, u16, u32, u64, u8 } from "@raydium-io/raydium-sdk-v2";
import { TICK_ARRAY_SIZE } from "./utils/tick";
import { EXTENSION_TICKARRAY_BITMAP_SIZE } from "./utils/tickarrayBitmap";


export const ExTickArrayBitmapLayout = struct([
  seq(u64(), 256, "positiveTickArrayBitmap"), // 256 * 8 = 2048 bytes
  seq(u64(), 256, "negativeTickArrayBitmap"), // 256 * 8 = 2048 bytes
]);


export const RewardInfo = struct([
  u8("rewardState"),
  u64("openTime"),
  u64("endTime"),
  u64("lastUpdateTime"),
  u128("emissionsPerSecondX64"),
  u64("rewardTotalEmissioned"),
  u64("rewardClaimed"),
  publicKey("tokenMint"),
  publicKey("tokenVault"),
  publicKey("creator"),
  u128("rewardGrowthGlobalX64"),
]);

export const PoolInfoLayout = struct([
  blob(8),
  u8("bump"),
  publicKey("ammConfig"),
  publicKey("creator"),
  publicKey("mintA"),
  publicKey("mintB"),
  publicKey("vaultA"),
  publicKey("vaultB"),
  publicKey("observationId"),
  u8("mintDecimalsA"),
  u8("mintDecimalsB"),
  u16("tickSpacing"),
  u128("liquidity"),
  u128("sqrtPriceX64"),
  s32("tickCurrent"),
  u32(),
  u128("feeGrowthGlobalX64A"),
  u128("feeGrowthGlobalX64B"),
  u64("protocolFeesTokenA"),
  u64("protocolFeesTokenB"),

  u128("swapInAmountTokenA"),
  u128("swapOutAmountTokenB"),
  u128("swapInAmountTokenB"),
  u128("swapOutAmountTokenA"),

  u8("status"),

  seq(u8(), 7, ""),

  seq(RewardInfo, 3, "rewardInfos"),
  seq(u64(), 16, "tickArrayBitmap"),

  u64("totalFeesTokenA"),
  u64("totalFeesClaimedTokenA"),
  u64("totalFeesTokenB"),
  u64("totalFeesClaimedTokenB"),

  u64("fundFeesTokenA"),
  u64("fundFeesTokenB"),

  u64("startTime"),

  seq(u64(), 15 * 4 - 3, "padding"),
]);

export const TickLayout = struct([
  s32("tick"),
  i128("liquidityNet"),
  u128("liquidityGross"),
  u128("feeGrowthOutsideX64A"),
  u128("feeGrowthOutsideX64B"),
  seq(u128(), 3, "rewardGrowthsOutsideX64"),

  seq(u32(), 13, ""),
]);

export const TickArrayLayout = struct([
  blob(8),
  publicKey("poolId"),
  s32("startTickIndex"),
  seq(TickLayout, TICK_ARRAY_SIZE, "ticks"),
  u8("initializedTickCount"),

  seq(u8(), 115, ""),
]);

export const PositionRewardInfoLayout = struct([u128("growthInsideLastX64"), u64("rewardAmountOwed")]);


export const PositionInfoLayout = struct([
  blob(8),
  u8("bump"),
  publicKey("nftMint"),
  publicKey("poolId"),

  s32("tickLower"),
  s32("tickUpper"),
  u128("liquidity"),
  u128("feeGrowthInsideLastX64A"),
  u128("feeGrowthInsideLastX64B"),
  u64("tokenFeesOwedA"),
  u64("tokenFeesOwedB"),

  seq(PositionRewardInfoLayout, 3, "rewardInfos"),

  seq(u64(), 8, ""),
]);

export const TickArrayBitmapExtensionLayout = struct([
  blob(8),
  publicKey("poolId"),
  seq(seq(u64(), 8), EXTENSION_TICKARRAY_BITMAP_SIZE, "positiveTickArrayBitmap"),
  seq(seq(u64(), 8), EXTENSION_TICKARRAY_BITMAP_SIZE, "negativeTickArrayBitmap"),
]);

export type ClmmPositionLayout = ReturnType<typeof PositionInfoLayout.decode>;
export type ClmmPoolLayout = ReturnType<typeof PoolInfoLayout.decode>;


export const splAccountLayout = struct([
  publicKey("mint"),
  publicKey("owner"),
  u64("amount"),
  u32("delegateOption"),
  publicKey("delegate"),
  u8("state"),
  u32("isNativeOption"),
  u64("isNative"),
  u64("delegatedAmount"),
  u32("closeAuthorityOption"),
  publicKey("closeAuthority"),
]);

export const AmmConfigLayout = struct([
  blob(8),
  u8('bump'),
  u16('index'),
  publicKey('owner'),
  u32('protocolFeeRate'),
  u32('tradeFeeRate'),
  u16('tickSpacing'),
  u32('fundFeeRate'),
  u32('paddingU32'),
  publicKey('fundOwner'),
  seq(u64(), 3, 'padding'), // [u64; 3]
]);

