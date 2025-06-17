import { PublicKey } from "@solana/web3.js";

export enum Rounding {
    ROUND_DOWN,
    ROUND_HALF_UP,
    ROUND_UP,
}

export const InstructionType = {
    ClmmInitConfig: "ClmmInitConfig",
    CreateAccount: "CreateAccount",
    ClmmCreatePool: "ClmmCreatePool",
    ClmmOpenPosition: "ClmmOpenPosition",
    ClmmIncreasePosition: "ClmmIncreasePosition",
    ClmmDecreasePosition: "ClmmDecreasePosition",
    ClmmClosePosition: "ClmmClosePosition",
    ClmmSwapBaseIn: "ClmmSwapBaseIn",
}

export const WSOLMint = new PublicKey("So11111111111111111111111111111111111111112");
