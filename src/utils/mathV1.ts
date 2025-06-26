import { PublicKey } from "@solana/web3.js";
import { TickArray } from "./tick";
import BN from "bn.js";
import { Fee, FEE_RATE_DENOMINATOR, MAX_SQRT_PRICE_X64, MAX_TICK, MIN_SQRT_PRICE_X64, MIN_TICK, NEGATIVE_ONE, ONE, ZERO } from "./constants";
import { LiquidityMath, MathUtil, SqrtPriceMath, StepComputations } from "./math";
import { TickQuery } from "./tickQuery";
import { TickQueryV1 } from "./tickQueryV1";
import { get } from "lodash";

type SwapStep = {
    sqrtPriceX64Next: BN;
    amountIn: BN;
    amountOut: BN;
    feeAmount: BN;
};

export abstract class SwapMathV1 {
    public static swapCompute(
        programId: PublicKey,
        poolId: PublicKey,
        tickArrayCache: { [key: string]: TickArray },
        zeroForOne: boolean,
        fee: number,
        liquidity: BN,
        currentTick: number,
        tickSpacing: number,
        currentSqrtPriceX64: BN,
        amountSpecified: BN,
        lastSavedTickArrayStartIndex: number,
        sqrtPriceLimitX64?: BN
    ) {
        if (amountSpecified.eq(ZERO)) {
            throw new Error("amountSpecified must not be 0");
        }
        if (!sqrtPriceLimitX64)
            sqrtPriceLimitX64 = zeroForOne
                ? MIN_SQRT_PRICE_X64.add(ONE)
                : MAX_SQRT_PRICE_X64.sub(ONE);

        if (zeroForOne) {
            if (sqrtPriceLimitX64.lt(MIN_SQRT_PRICE_X64)) {
                throw new Error("sqrtPriceX64 must greater than MIN_SQRT_PRICE_X64");
            }

            if (sqrtPriceLimitX64.gte(currentSqrtPriceX64)) {
                throw new Error("sqrtPriceX64 must smaller than current");
            }
        } else {
            if (sqrtPriceLimitX64.gt(MAX_SQRT_PRICE_X64)) {
                throw new Error("sqrtPriceX64 must smaller than MAX_SQRT_PRICE_X64");
            }

            if (sqrtPriceLimitX64.lte(currentSqrtPriceX64)) {
                throw new Error("sqrtPriceX64 must greater than current");
            }
        }
        const baseInput = amountSpecified.gt(ZERO);

        const state = {
            amountSpecifiedRemaining: amountSpecified,
            amountCalculated: ZERO,
            sqrtPriceX64: currentSqrtPriceX64,
            tick: currentTick,
            accounts: [] as PublicKey[],
            liquidity,
            feeAmount: new BN(0),
        };
        let loopCount = 0;
        while (
            !state.amountSpecifiedRemaining.eq(ZERO) &&
            state.sqrtPriceX64 != sqrtPriceLimitX64 &&
            state.tick < MAX_TICK &&
            state.tick > MIN_TICK
        ) {
            if (loopCount > 10) {
                throw Error("liquidity limit");
            }
            const step: Partial<StepComputations> = {};
            step.sqrtPriceStartX64 = state.sqrtPriceX64;
            const { nextTick: nextInitTick, tickArrayAddress, tickArrayStartTickIndex: tickAarrayStartIndex } = TickQuery.nextInitializedTick(
                programId,
                poolId,
                tickArrayCache,
                state.tick,
                tickSpacing,
                zeroForOne
            );
            step.tickNext = nextInitTick.tick;
            step.initialized = nextInitTick.liquidityGross.gtn(0);
            if (
                lastSavedTickArrayStartIndex !== tickAarrayStartIndex &&
                tickArrayAddress
            ) {
                state.accounts.push(tickArrayAddress);
                lastSavedTickArrayStartIndex = tickAarrayStartIndex;
            }
            if (step.tickNext < MIN_TICK) {
                step.tickNext = MIN_TICK;
            } else if (step.tickNext > MAX_TICK) {
                step.tickNext = MAX_TICK;
            }

            step.sqrtPriceNextX64 = SqrtPriceMath.getSqrtPriceX64FromTick(
                step.tickNext
            );
            let targetPrice: BN;
            if (
                (zeroForOne && step.sqrtPriceNextX64.lt(sqrtPriceLimitX64)) ||
                (!zeroForOne && step.sqrtPriceNextX64.gt(sqrtPriceLimitX64))
            ) {
                targetPrice = sqrtPriceLimitX64;
            } else {
                targetPrice = step.sqrtPriceNextX64;
            }
            [state.sqrtPriceX64, step.amountIn, step.amountOut, step.feeAmount] =
                SwapMathV1.swapStepCompute(
                    state.sqrtPriceX64,
                    targetPrice,
                    state.liquidity,
                    state.amountSpecifiedRemaining,
                    fee
                );

            state.feeAmount = state.feeAmount.add(step.feeAmount)

            if (baseInput) {
                state.amountSpecifiedRemaining = state.amountSpecifiedRemaining.sub(
                    step.amountIn.add(step.feeAmount)
                );
                state.amountCalculated = state.amountCalculated.sub(step.amountOut);
            } else {
                state.amountSpecifiedRemaining = state.amountSpecifiedRemaining.add(
                    step.amountOut
                );
                state.amountCalculated = state.amountCalculated.add(
                    step.amountIn.add(step.feeAmount)
                );
            }
            if (state.sqrtPriceX64.eq(step.sqrtPriceNextX64)) {
                if (step.initialized) {
                    let liquidityNet = nextInitTick.liquidityNet;
                    if (zeroForOne) liquidityNet = liquidityNet.mul(NEGATIVE_ONE);
                    state.liquidity = LiquidityMath.addDelta(
                        state.liquidity,
                        liquidityNet
                    );
                }
                state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
            } else if (state.sqrtPriceX64 != step.sqrtPriceStartX64) {
                state.tick = SqrtPriceMath.getTickFromSqrtPriceX64(state.sqrtPriceX64);
            }
            ++loopCount;
        }

        try {
            //   const { tickArrayAddress, tickArrayStartTickIndex: tickAarrayStartIndex } = TickQueryV1.nextInitializedTickArray(
            const nextInitializedTickArray = TickQueryV1.nextInitializedTickArray(

                programId,
                poolId,
                tickArrayCache,
                state.tick,
                tickSpacing,
                zeroForOne
            );

            const tickArrayAddress = get(nextInitializedTickArray, 'tickArrayAddress')
            const tickAarrayStartIndex = get(nextInitializedTickArray, 'tickArrayStartTickIndex')

            if (
                lastSavedTickArrayStartIndex !== tickAarrayStartIndex &&
                tickArrayAddress
            ) {
                state.accounts.push(tickArrayAddress);
                lastSavedTickArrayStartIndex = tickAarrayStartIndex as number;
            }
        } catch (e) { }

        return {
            amountCalculated: state.amountCalculated,
            feeAmount: state.feeAmount,
            sqrtPriceX64: state.sqrtPriceX64,
            liquidity: state.liquidity,
            tickCurrent: state.tick,
            accounts: state.accounts,
        };
    }

    private static swapStepCompute(
        sqrtPriceX64Current: BN,
        sqrtPriceX64Target: BN,
        liquidity: BN,
        amountRemaining: BN,
        feeRate: Fee
    ): [BN, BN, BN, BN] {
        const swapStep: SwapStep = {
            sqrtPriceX64Next: new BN(0),
            amountIn: new BN(0),
            amountOut: new BN(0),
            feeAmount: new BN(0),
        };

        const zeroForOne = sqrtPriceX64Current.gte(sqrtPriceX64Target);
        const baseInput = amountRemaining.gte(ZERO);

        if (baseInput) {
            const amountRemainingSubtractFee = MathUtil.mulDivFloor(
                amountRemaining,
                FEE_RATE_DENOMINATOR.sub(new BN(feeRate.toString())),
                FEE_RATE_DENOMINATOR
            );
            swapStep.amountIn = zeroForOne
                ? LiquidityMath.getTokenAmountAFromLiquidity(
                    sqrtPriceX64Target,
                    sqrtPriceX64Current,
                    liquidity,
                    true
                )
                : LiquidityMath.getTokenAmountBFromLiquidity(
                    sqrtPriceX64Current,
                    sqrtPriceX64Target,
                    liquidity,
                    true
                );
            if (amountRemainingSubtractFee.gte(swapStep.amountIn)) {
                swapStep.sqrtPriceX64Next = sqrtPriceX64Target;
            } else {
                swapStep.sqrtPriceX64Next = SqrtPriceMath.getNextSqrtPriceX64FromInput(
                    sqrtPriceX64Current,
                    liquidity,
                    amountRemainingSubtractFee,
                    zeroForOne
                );
            }
        } else {
            swapStep.amountOut = zeroForOne
                ? LiquidityMath.getTokenAmountBFromLiquidity(
                    sqrtPriceX64Target,
                    sqrtPriceX64Current,
                    liquidity,
                    false
                )
                : LiquidityMath.getTokenAmountAFromLiquidity(
                    sqrtPriceX64Current,
                    sqrtPriceX64Target,
                    liquidity,
                    false
                );
            if (amountRemaining.mul(NEGATIVE_ONE).gte(swapStep.amountOut)) {
                swapStep.sqrtPriceX64Next = sqrtPriceX64Target;
            } else {
                swapStep.sqrtPriceX64Next = SqrtPriceMath.getNextSqrtPriceX64FromOutput(
                    sqrtPriceX64Current,
                    liquidity,
                    amountRemaining.mul(NEGATIVE_ONE),
                    zeroForOne
                );
            }
        }

        const reachTargetPrice = sqrtPriceX64Target.eq(swapStep.sqrtPriceX64Next);

        if (zeroForOne) {
            if (!(reachTargetPrice && baseInput)) {
                swapStep.amountIn = LiquidityMath.getTokenAmountAFromLiquidity(
                    swapStep.sqrtPriceX64Next,
                    sqrtPriceX64Current,
                    liquidity,
                    true
                );
            }

            if (!(reachTargetPrice && !baseInput)) {
                swapStep.amountOut = LiquidityMath.getTokenAmountBFromLiquidity(
                    swapStep.sqrtPriceX64Next,
                    sqrtPriceX64Current,
                    liquidity,
                    false
                );
            }
        } else {
            swapStep.amountIn =
                reachTargetPrice && baseInput
                    ? swapStep.amountIn
                    : LiquidityMath.getTokenAmountBFromLiquidity(
                        sqrtPriceX64Current,
                        swapStep.sqrtPriceX64Next,
                        liquidity,
                        true
                    );
            swapStep.amountOut =
                reachTargetPrice && !baseInput
                    ? swapStep.amountOut
                    : LiquidityMath.getTokenAmountAFromLiquidity(
                        sqrtPriceX64Current,
                        swapStep.sqrtPriceX64Next,
                        liquidity,
                        false
                    );
        }

        if (
            !baseInput &&
            swapStep.amountOut.gt(amountRemaining.mul(NEGATIVE_ONE))
        ) {
            swapStep.amountOut = amountRemaining.mul(NEGATIVE_ONE);
        }
        if (baseInput && !swapStep.sqrtPriceX64Next.eq(sqrtPriceX64Target)) {
            swapStep.feeAmount = amountRemaining.sub(swapStep.amountIn);
        } else {
            swapStep.feeAmount = MathUtil.mulDivCeil(
                swapStep.amountIn,
                new BN(feeRate),
                FEE_RATE_DENOMINATOR.sub(new BN(feeRate))
            );
        }
        return [
            swapStep.sqrtPriceX64Next,
            swapStep.amountIn,
            swapStep.amountOut,
            swapStep.feeAmount,
        ];
    }
}