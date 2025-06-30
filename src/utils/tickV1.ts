import BN from "bn.js";
import { TICK_ARRAY_BITMAP_SIZE, TICK_ARRAY_SIZE } from "./tick";

export class TickUtilsV1 {
    public static searchLowBitFromStart(
        tickArrayBitmap: BN,
        start: number,
        end: number,
        expectedCount: number,
        tickSpacing: number
    ) {
        let fetchNum = 0;
        const result: number[] = [];
        for (let i = start; i >= end; i--) {
            if (tickArrayBitmap.shrn(i).and(new BN(1)).eqn(1)) {
                const nextStartIndex = (i - 512) * (tickSpacing * TICK_ARRAY_SIZE);
                result.push(nextStartIndex);
                fetchNum++;
            }
            if (fetchNum >= expectedCount) {
                break;
            }
        }
        return result;
    }

    public static searchHightBitFromStart(
        tickArrayBitmap: BN,
        start: number,
        end: number,
        expectedCount: number,
        tickSpacing: number
    ) {
        console.log("🚀 ~ TickUtilsV1 ~ end:", end)
        console.log("🚀 ~ TickUtilsV1 ~ start:", start)
        let fetchNum = 0;
        const result: number[] = [];
        for (let i = start; i < end; i++) {
            if (tickArrayBitmap.shrn(i).and(new BN(1)).eqn(1)) {
                const nextStartIndex = (i - 512) * (tickSpacing * TICK_ARRAY_SIZE);
                result.push(nextStartIndex);
                fetchNum++;
            }
            if (fetchNum >= expectedCount) {
                break;
            }
        }
        return result;
    }

    public static getInitializedTickArrayInRange(
        tickArrayBitmap: BN,
        tickSpacing: number,
        tickArrayStartIndex: number,
        expectedCount: number,
        zeroForOne: boolean
    ) {
        if (tickArrayStartIndex % (tickSpacing * TICK_ARRAY_SIZE) != 0) {
            throw new Error('Invild tickArrayStartIndex');
        }
        const tickArrayOffset = Math.floor(tickArrayStartIndex / (tickSpacing * TICK_ARRAY_SIZE)) + 512;
        if (zeroForOne) {
            return [
                // find right of currenct offset
                ...TickUtilsV1.searchLowBitFromStart(tickArrayBitmap, tickArrayOffset - 1, 0, expectedCount, tickSpacing),
            ];
        }

        return [
            // find left of current offset
            ...TickUtilsV1.searchHightBitFromStart(
                tickArrayBitmap,
                tickArrayOffset,
                TICK_ARRAY_BITMAP_SIZE,
                expectedCount,
                tickSpacing
            ),
        ];
    }


}