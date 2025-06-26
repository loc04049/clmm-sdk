import Decimal from "decimal.js";
import { AmmV3PoolInfo } from "../type";
import { TickArray, TickUtils } from "./tick";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { MAX_SQRT_PRICE_X64, MIN_SQRT_PRICE_X64, NEGATIVE_ONE, ONE } from "./constants";
import { SqrtPriceMath } from "./math";
import { getPdaTickArrayAddress } from "./pda";
import { TickUtilsV1 } from "./tickV1";
import { SwapMathV1 } from "./mathV1";

export class PoolUtilsV1 {
    static computeAmountOut({
        poolInfo,
        tickArrayCache,
        baseMint,
        amountIn,
        slippage,
        priceLimit = new Decimal(0),
    }: {
        poolInfo: AmmV3PoolInfo;
        tickArrayCache: { [key: string]: TickArray };
        baseMint: PublicKey;

        amountIn: BN;
        slippage: number;
        priceLimit?: Decimal;
    }) {
        let sqrtPriceLimitX64: BN;
        if (priceLimit.equals(new Decimal(0))) {
            sqrtPriceLimitX64 = baseMint.equals(poolInfo.mintA.mint)
                ? MIN_SQRT_PRICE_X64.add(ONE)
                : MAX_SQRT_PRICE_X64.sub(ONE);
        } else {
            sqrtPriceLimitX64 = SqrtPriceMath.priceToSqrtPriceX64(
                priceLimit,
                poolInfo.mintA.decimals,
                poolInfo.mintB.decimals
            );
        }

        const {
            expectedAmountOut,
            remainingAccounts,
            executionPrice: _executionPriceX64,
            feeAmount,
        } = this.getOutputAmountAndRemainAccounts(poolInfo, tickArrayCache, baseMint, amountIn, sqrtPriceLimitX64);

        const _executionPrice = SqrtPriceMath.sqrtPriceX64ToPrice(
            _executionPriceX64,
            poolInfo.mintA.decimals,
            poolInfo.mintB.decimals
        );
        const executionPrice = baseMint.equals(poolInfo.mintA.mint) ? _executionPrice : new Decimal(1).div(_executionPrice);

        const minAmountOut = expectedAmountOut
            .mul(new BN(Math.floor((1 - slippage) * 10000000000)))
            .div(new BN(10000000000));

        const poolPrice = poolInfo.mintA.mint.equals(baseMint)
            ? poolInfo.currentPrice
            : new Decimal(1).div(poolInfo.currentPrice);
        const priceImpact =
            Math.abs(parseFloat(executionPrice.toFixed()) - parseFloat(poolPrice.toFixed())) /
            parseFloat(poolPrice.toFixed());

        return {
            amountOut: expectedAmountOut,
            minAmountOut,
            currentPrice: poolInfo.currentPrice,
            executionPrice,
            priceImpact,
            fee: feeAmount,

            remainingAccounts,
        };
    }

    public static getOutputAmountAndRemainAccounts(
        poolInfo: AmmV3PoolInfo,
        tickArrayCache: { [key: string]: TickArray },
        inputTokenMint: PublicKey,
        inputAmount: BN,
        sqrtPriceLimitX64?: BN
    ) {
        const zeroForOne = inputTokenMint.equals(poolInfo.mintA.mint);

        const allNeededAccounts: PublicKey[] = [];
        const {
            isExist,
            startIndex: firstTickArrayStartIndex,
            nextAccountMeta,
        } = this.getFirstInitializedTickArray(poolInfo, zeroForOne);
        if (!isExist || firstTickArrayStartIndex === undefined || !nextAccountMeta) {
            throw new Error('Invalid tick array');
        }

        try {
            const preTick = this.preInitializedTickArrayStartIndex(poolInfo, !zeroForOne)
            if (preTick.isExist) {
                const { publicKey: address } = getPdaTickArrayAddress(
                    poolInfo.programId,
                    poolInfo.id,
                    preTick.nextStartIndex
                );
                allNeededAccounts.push(address)
            }
        } catch (e) { }

        allNeededAccounts.push(nextAccountMeta);
        const {
            amountCalculated: outputAmount,
            accounts: reaminAccounts,
            sqrtPriceX64: executionPrice,
            feeAmount,
        } = SwapMathV1.swapCompute(
            poolInfo.programId,
            poolInfo.id,
            tickArrayCache,
            zeroForOne,
            poolInfo.ammConfig.tradeFeeRate,
            poolInfo.liquidity,
            poolInfo.tickCurrent,
            poolInfo.tickSpacing,
            poolInfo.sqrtPriceX64,
            inputAmount,
            firstTickArrayStartIndex,
            sqrtPriceLimitX64
        );
        allNeededAccounts.push(...reaminAccounts);
        return {
            expectedAmountOut: outputAmount.mul(NEGATIVE_ONE),
            remainingAccounts: allNeededAccounts,
            executionPrice,
            feeAmount,
        };
    }

    public static getFirstInitializedTickArray(
        poolInfo: AmmV3PoolInfo,
        zeroForOne: boolean
    ):
        | { isExist: true; startIndex: number; nextAccountMeta: PublicKey }
        | { isExist: false; startIndex: undefined; nextAccountMeta: undefined } {
        const tickArrayBitmap = TickUtils.mergeTickArrayBitmap(poolInfo.tickArrayBitmap);
        const { isInitialized, startIndex } = TickUtils.checkTickArrayIsInitialized(
            tickArrayBitmap,
            poolInfo.tickCurrent,
            poolInfo.tickSpacing
        );
        if (isInitialized) {
            const { publicKey: address } = getPdaTickArrayAddress(poolInfo.programId, poolInfo.id, startIndex);
            return {
                isExist: true,
                startIndex,
                nextAccountMeta: address,
            };
        }
        const { isExist, nextStartIndex } = this.nextInitializedTickArrayStartIndex(poolInfo, zeroForOne);
        if (isExist) {
            const { publicKey: address } = getPdaTickArrayAddress(poolInfo.programId, poolInfo.id, nextStartIndex);
            return {
                isExist: true,
                startIndex: nextStartIndex,
                nextAccountMeta: address,
            };
        }
        return { isExist: false, nextAccountMeta: undefined, startIndex: undefined };
    }
    public static nextInitializedTickArrayStartIndex(poolInfo: AmmV3PoolInfo, zeroForOne: boolean) {
        const tickArrayBitmap = TickUtils.mergeTickArrayBitmap(poolInfo.tickArrayBitmap);
        const currentOffset = TickUtils.getTickArrayOffsetInBitmapByTick(poolInfo.tickCurrent, poolInfo.tickSpacing);
        const result: number[] = zeroForOne
            ? TickUtilsV1.searchLowBitFromStart(tickArrayBitmap, currentOffset - 1, 0, 1, poolInfo.tickSpacing)
            : TickUtilsV1.searchHightBitFromStart(tickArrayBitmap, currentOffset, 1024, 1, poolInfo.tickSpacing);

        return result.length > 0 ? { isExist: true, nextStartIndex: result[0] } : { isExist: false, nextStartIndex: 0 };
    }

    public static preInitializedTickArrayStartIndex(
        poolInfo: AmmV3PoolInfo,
        zeroForOne: boolean) {
        const tickArrayBitmap = TickUtils.mergeTickArrayBitmap(
            poolInfo.tickArrayBitmap
        );
        const currentOffset = TickUtils.getTickArrayOffsetInBitmapByTick(
            poolInfo.tickCurrent,
            poolInfo.tickSpacing
        );
        const result: number[] = zeroForOne ? TickUtilsV1.searchLowBitFromStart(
            tickArrayBitmap,
            currentOffset - 1,
            0,
            1,
            poolInfo.tickSpacing
        ) : TickUtilsV1.searchHightBitFromStart(
            tickArrayBitmap,
            currentOffset + 1,
            1024,
            1,
            poolInfo.tickSpacing
        );

        return result.length > 0 ? { isExist: true, nextStartIndex: result[0] } : { isExist: false, nextStartIndex: 0 }
    }

    static computeAmountIn(
        {
            poolInfo,
            tickArrayCache,
            baseMint,
            amountOut,
            slippage,
            priceLimit = new Decimal(0)
        }: {
            poolInfo: AmmV3PoolInfo,
            tickArrayCache: { [key: string]: TickArray },
            baseMint: PublicKey,

            amountOut: BN,
            slippage: number,
            priceLimit?: Decimal
        }
    ) {
        let sqrtPriceLimitX64: BN;
        if (priceLimit.equals(new Decimal(0))) {
            sqrtPriceLimitX64 = baseMint.equals(poolInfo.mintB.mint)
                ? MIN_SQRT_PRICE_X64.add(ONE)
                : MAX_SQRT_PRICE_X64.sub(ONE);
        } else {
            sqrtPriceLimitX64 = SqrtPriceMath.priceToSqrtPriceX64(
                priceLimit,
                poolInfo.mintA.decimals,
                poolInfo.mintB.decimals
            );
        }

        const { expectedAmountIn, remainingAccounts, executionPrice: _executionPriceX64, feeAmount } = PoolUtilsV1.getInputAmountAndRemainAccounts(
            poolInfo,
            tickArrayCache,
            baseMint,
            amountOut,
            sqrtPriceLimitX64
        );

        const _executionPrice = SqrtPriceMath.sqrtPriceX64ToPrice(_executionPriceX64, poolInfo.mintA.decimals, poolInfo.mintB.decimals)
        const executionPrice = baseMint.equals(poolInfo.mintA.mint) ? _executionPrice : new Decimal(1).div(_executionPrice)

        const maxAmountIn = expectedAmountIn.mul(new BN(Math.floor((1 + slippage) * 10000000000))).div(new BN(10000000000));

        const poolPrice = poolInfo.mintA.mint.equals(baseMint) ? poolInfo.currentPrice : new Decimal(1).div(poolInfo.currentPrice)
        const priceImpact = Math.abs(parseFloat(executionPrice.toFixed()) - parseFloat(poolPrice.toFixed())) /
            parseFloat(poolPrice.toFixed());

        return {
            amountIn: expectedAmountIn,
            maxAmountIn,
            currentPrice: poolInfo.currentPrice,
            executionPrice,
            priceImpact,
            fee: feeAmount,
            remainingAccounts
        }
    }

    public static getInputAmountAndRemainAccounts(
        poolInfo: AmmV3PoolInfo,
        tickArrayCache: { [key: string]: TickArray },
        outputTokenMint: PublicKey,
        outputAmount: BN,
        sqrtPriceLimitX64?: BN,
    ) {
        const zeroForOne = outputTokenMint.equals(poolInfo.mintB.mint);

        const allNeededAccounts: PublicKey[] = [];
        const { isExist, startIndex: firstTickArrayStartIndex, nextAccountMeta } = this.getFirstInitializedTickArray(poolInfo, zeroForOne);
        if (!isExist || firstTickArrayStartIndex === undefined || !nextAccountMeta) throw new Error("Invalid tick array");

        try {
            const preTick = this.preInitializedTickArrayStartIndex(poolInfo, !zeroForOne)
            if (preTick.isExist) {
                const { publicKey: address } = getPdaTickArrayAddress(
                    poolInfo.programId,
                    poolInfo.id,
                    preTick.nextStartIndex
                );
                allNeededAccounts.push(address)
            }
        } catch (e) { }

        allNeededAccounts.push(nextAccountMeta);
        const {
            amountCalculated: inputAmount,
            accounts: reaminAccounts,
            sqrtPriceX64: executionPrice,
            feeAmount
        } = SwapMathV1.swapCompute(
            poolInfo.programId,
            poolInfo.id,
            tickArrayCache,
            zeroForOne,
            poolInfo.ammConfig.tradeFeeRate,
            poolInfo.liquidity,
            poolInfo.tickCurrent,
            poolInfo.tickSpacing,
            poolInfo.sqrtPriceX64,
            outputAmount.mul(NEGATIVE_ONE),
            firstTickArrayStartIndex,
            sqrtPriceLimitX64
        );
        allNeededAccounts.push(...reaminAccounts);
        return { expectedAmountIn: inputAmount, remainingAccounts: allNeededAccounts, executionPrice, feeAmount };
    }


}