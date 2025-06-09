import { RENT_PROGRAM_ID, struct, u128, u64 } from "@raydium-io/raydium-sdk-v2";
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { ZERO } from "./utils/constants";
import { ApiV3Token } from "./api";
import { ReturnTypeMakeInstructions } from "./type";
import { getPdaExBitmapAccount, getPdaObservationAccount, getPdaPoolId, getPdaPoolVaultId } from "./utils/pda";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionType } from "./constants";

const anchorDataBuf = {
  createPool: [233, 146, 209, 142, 207, 104, 64, 188],
  initReward: [95, 135, 192, 196, 242, 129, 230, 68],
  setRewardEmissions: [112, 52, 167, 75, 32, 201, 211, 137],
  openPosition: [77, 184, 74, 214, 112, 86, 241, 199],
  openPositionWithTokenEx: [77, 255, 174, 82, 125, 29, 201, 46],
  closePosition: [123, 134, 81, 0, 49, 68, 98, 98],
  increaseLiquidity: [133, 29, 89, 223, 69, 238, 176, 10],
  decreaseLiquidity: [58, 127, 188, 62, 79, 82, 196, 96],
  swap: [43, 4, 237, 11, 26, 201, 30, 98], // [248, 198, 158, 145, 225, 117, 135, 200],
  collectReward: [18, 237, 166, 197, 34, 16, 213, 144],
};

interface CreatePoolInstruction {
  connection: Connection;
  programId: PublicKey;
  owner: PublicKey;
  mintA: ApiV3Token;
  mintB: ApiV3Token;
  ammConfigId: PublicKey;
  initialPriceX64: BN;
  forerunCreate?: boolean;
  extendMintAccount?: PublicKey[];
}

export class ClmmInstrument {
  static createPoolInstruction(
    programId: PublicKey,
    poolId: PublicKey,
    poolCreator: PublicKey,
    ammConfigId: PublicKey,
    observationId: PublicKey,
    mintA: PublicKey,
    mintVaultA: PublicKey,
    mintProgramIdA: PublicKey,
    mintB: PublicKey,
    mintVaultB: PublicKey,
    mintProgramIdB: PublicKey,
    exTickArrayBitmap: PublicKey,
    sqrtPriceX64: BN,
    extendMintAccount?: PublicKey[],
  ): TransactionInstruction {
    const dataLayout = struct([u128("sqrtPriceX64"), u64("zero")]);

    const keys = [
      { pubkey: poolCreator, isSigner: true, isWritable: true },
      { pubkey: ammConfigId, isSigner: false, isWritable: false },
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: mintA, isSigner: false, isWritable: false },
      { pubkey: mintB, isSigner: false, isWritable: false },
      { pubkey: mintVaultA, isSigner: false, isWritable: true },
      { pubkey: mintVaultB, isSigner: false, isWritable: true },
      { pubkey: observationId, isSigner: false, isWritable: true },
      { pubkey: exTickArrayBitmap, isSigner: false, isWritable: true },
      { pubkey: mintProgramIdA, isSigner: false, isWritable: false },
      { pubkey: mintProgramIdB, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: RENT_PROGRAM_ID, isSigner: false, isWritable: false },
      ...(extendMintAccount?.map((k) => ({ pubkey: k, isSigner: false, isWritable: false })) || []),
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        sqrtPriceX64,
        zero: ZERO,
      },
      data,
    );
    const aData = Buffer.from([...anchorDataBuf.createPool, ...data]);

    return new TransactionInstruction({
      keys,
      programId,
      data: aData,
    });
  }

  static async createPoolInstructions(props: CreatePoolInstruction): Promise<
    ReturnTypeMakeInstructions<{
      poolId: PublicKey;
      observationId: PublicKey;
      exBitmapAccount: PublicKey;
      mintAVault: PublicKey;
      mintBVault: PublicKey;
    }>
  > {
    const { programId, owner, mintA, mintB, ammConfigId, initialPriceX64, extendMintAccount } = props;
    const [mintAAddress, mintBAddress] = [new PublicKey(mintA.address), new PublicKey(mintB.address)];

    const { publicKey: poolId } = getPdaPoolId(programId, ammConfigId, mintAAddress, mintBAddress);
    const { publicKey: observationId } = getPdaObservationAccount(programId, poolId);
    const { publicKey: mintAVault } = getPdaPoolVaultId(programId, poolId, mintAAddress);
    const { publicKey: mintBVault } = getPdaPoolVaultId(programId, poolId, mintBAddress);
    const exBitmapAccount = getPdaExBitmapAccount(programId, poolId).publicKey;

    const ins = [
      this.createPoolInstruction(
        programId,
        poolId,
        owner,
        ammConfigId,
        observationId,
        mintAAddress,
        mintAVault,
        new PublicKey(mintA.programId || TOKEN_PROGRAM_ID),
        mintBAddress,
        mintBVault,
        new PublicKey(mintB.programId || TOKEN_PROGRAM_ID),
        exBitmapAccount,
        initialPriceX64,
        extendMintAccount,
      ),
    ];

    return {
      signers: [],
      instructions: ins,
      instructionTypes: [InstructionType.CreateAccount, InstructionType.ClmmCreatePool],
      address: { poolId, observationId, exBitmapAccount, mintAVault, mintBVault },
      lookupTableAddress: [],
    };
  }
}
