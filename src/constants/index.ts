import { PublicKey } from "@solana/web3.js";

export const IS_DEV = true

export enum Rounding {
    ROUND_DOWN,
    ROUND_HALF_UP,
    ROUND_UP,
}

export const InstructionType = {
    CreateAccount: "CreateAccount",
    ClmmCreatePool: "ClmmCreatePool",
    ClmmOpenPosition: "ClmmOpenPosition",
    ClmmIncreasePosition: "ClmmIncreasePosition",
}

export const WSOLMint = new PublicKey("So11111111111111111111111111111111111111112");
