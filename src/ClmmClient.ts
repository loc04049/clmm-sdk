import { Connection, PublicKey } from "@solana/web3.js";
import { ClmmClientConfig } from "./type";
import { PoolInfoLayout } from "./layout";

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
            tokenA: poolData.mintA.toString(),
            tokenB: poolData.mintB.toString(),
            tickSpacing: poolData.tickSpacing,
            sqrtPriceX64: poolData.sqrtPriceX64.toString(),
            liquidity: poolData.liquidity.toString(),
        });

        return poolData;
    }
}



