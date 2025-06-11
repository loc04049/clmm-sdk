import { bool, RENT_PROGRAM_ID, s32, struct, u128, u64, u8 } from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, PublicKey, Signer, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { ZERO } from "./utils/constants";
import { ApiV3PoolInfoConcentratedItem, ApiV3Token } from "./api";
import { ClmmKeys, PoolInfoConcentratedItem, ReturnTypeMakeInstructions } from "./type";
import { getPdaExBitmapAccount, getPdaMetadataKey, getPdaObservationAccount, getPdaPersonalPositionAddress, getPdaPoolId, getPdaPoolVaultId, getPdaProtocolPositionAddress, getPdaTickArrayAddress } from "./utils/pda";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionType } from "./constants";
import { TickUtils } from "./utils/tick";
import { getATAAddress } from "./utils/util";
import { PoolUtils } from "./utils/pool";
import { METADATA_PROGRAM_ID } from "./constants/programIds";
import { ClmmPositionLayout } from "./layout";

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
      mintA: ApiV3Token;
      mintB: ApiV3Token;
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
      address: { poolId, observationId, exBitmapAccount, mintAVault, mintBVault, mintA, mintB },
      lookupTableAddress: [],
    };
  }

  static async openPositionFromBaseInstructions({
    poolInfo,
    poolKeys,
    ownerInfo,
    tickLower,
    tickUpper,
    base,
    baseAmount,
    otherAmountMax,
    withMetadata,
    getEphemeralSigners,
    nft2022,
  }: {
    poolInfo: PoolInfoConcentratedItem;
    poolKeys: ClmmKeys;
    ownerInfo: {
      feePayer: PublicKey;
      wallet: PublicKey;
      tokenAccountA: PublicKey;
      tokenAccountB: PublicKey;
    };

    tickLower: number;
    tickUpper: number;

    base: "MintA" | "MintB";
    baseAmount: BN;

    otherAmountMax: BN;
    withMetadata: "create" | "no-create";
    getEphemeralSigners?: (k: number) => any;
    nft2022?: boolean;
  }) {
    const signers: Signer[] = [];
    const [programId, id] = [new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)];

    let nftMintAccount: PublicKey;
    if (getEphemeralSigners) {
      nftMintAccount = new PublicKey((await getEphemeralSigners(1))[0]);
    } else {
      const _k = Keypair.generate();
      console.log("🚀 ~ ClmmInstrument ~ _k:", _k.publicKey.toString())
      signers.push(_k);
      nftMintAccount = _k.publicKey;
    }

    const tickArrayLowerStartIndex = TickUtils.getTickArrayStartIndexByTick(tickLower, poolInfo.config.tickSpacing);
    const tickArrayUpperStartIndex = TickUtils.getTickArrayStartIndexByTick(tickUpper, poolInfo.config.tickSpacing);

    const { publicKey: tickArrayLower } = getPdaTickArrayAddress(programId, id, tickArrayLowerStartIndex);
    const { publicKey: tickArrayUpper } = getPdaTickArrayAddress(programId, id, tickArrayUpperStartIndex);

    const { publicKey: positionNftAccount } = nft2022
      ? getATAAddress(ownerInfo.wallet, nftMintAccount, TOKEN_2022_PROGRAM_ID)
      : getATAAddress(ownerInfo.wallet, nftMintAccount, TOKEN_PROGRAM_ID);
    const { publicKey: metadataAccount } = getPdaMetadataKey(nftMintAccount);
    const { publicKey: personalPosition } = getPdaPersonalPositionAddress(programId, nftMintAccount);
    const { publicKey: protocolPosition } = getPdaProtocolPositionAddress(programId, id, tickLower, tickUpper);

    const ins = nft2022
      ? this.openPositionFromBaseInstruction22(
        programId,
        ownerInfo.feePayer,
        id,
        ownerInfo.wallet,
        nftMintAccount,
        positionNftAccount,
        protocolPosition,
        tickArrayLower,
        tickArrayUpper,
        personalPosition,
        ownerInfo.tokenAccountA,
        ownerInfo.tokenAccountB,
        new PublicKey(poolKeys.vault.A),
        new PublicKey(poolKeys.vault.B),
        new PublicKey(poolInfo.mintA.address),
        new PublicKey(poolInfo.mintB.address),

        tickLower,
        tickUpper,
        tickArrayLowerStartIndex,
        tickArrayUpperStartIndex,

        withMetadata,

        base,
        baseAmount,

        otherAmountMax,
        PoolUtils.isOverflowDefaultTickarrayBitmap(poolInfo.config.tickSpacing, [
          tickArrayLowerStartIndex,
          tickArrayUpperStartIndex,
        ])
          ? getPdaExBitmapAccount(programId, id).publicKey
          : undefined,
      )
      : this.openPositionFromBaseInstruction(
        programId,
        ownerInfo.feePayer,
        id,
        ownerInfo.wallet,
        nftMintAccount,
        positionNftAccount,
        metadataAccount,
        protocolPosition,
        tickArrayLower,
        tickArrayUpper,
        personalPosition,
        ownerInfo.tokenAccountA,
        ownerInfo.tokenAccountB,
        new PublicKey(poolKeys.vault.A),
        new PublicKey(poolKeys.vault.B),
        new PublicKey(poolInfo.mintA.address),
        new PublicKey(poolInfo.mintB.address),

        tickLower,
        tickUpper,
        tickArrayLowerStartIndex,
        tickArrayUpperStartIndex,

        withMetadata,

        base,
        baseAmount,

        otherAmountMax,
        PoolUtils.isOverflowDefaultTickarrayBitmap(poolInfo.config.tickSpacing, [
          tickArrayLowerStartIndex,
          tickArrayUpperStartIndex,
        ])
          ? getPdaExBitmapAccount(programId, id).publicKey
          : undefined,
      );

    return {
      address: {
        nftMint: nftMintAccount,
        tickArrayLower,
        tickArrayUpper,
        positionNftAccount,
        metadataAccount,
        personalPosition,
        protocolPosition,
      },
      instructions: [ins],
      signers,
      instructionTypes: [InstructionType.ClmmOpenPosition],
      lookupTableAddress: poolKeys.lookupTableAccount ? [poolKeys.lookupTableAccount] : [],
    };
  }

  static openPositionFromBaseInstruction22(
    programId: PublicKey,
    payer: PublicKey,
    poolId: PublicKey,
    positionNftOwner: PublicKey,
    positionNftMint: PublicKey,
    positionNftAccount: PublicKey,
    protocolPosition: PublicKey,
    tickArrayLower: PublicKey,
    tickArrayUpper: PublicKey,
    personalPosition: PublicKey,
    ownerTokenAccountA: PublicKey,
    ownerTokenAccountB: PublicKey,
    tokenVaultA: PublicKey,
    tokenVaultB: PublicKey,
    tokenMintA: PublicKey,
    tokenMintB: PublicKey,

    tickLowerIndex: number,
    tickUpperIndex: number,
    tickArrayLowerStartIndex: number,
    tickArrayUpperStartIndex: number,

    withMetadata: "create" | "no-create",
    base: "MintA" | "MintB",
    baseAmount: BN,

    otherAmountMax: BN,

    exTickArrayBitmap?: PublicKey,
  ): TransactionInstruction {
    const dataLayout = struct([
      s32("tickLowerIndex"),
      s32("tickUpperIndex"),
      s32("tickArrayLowerStartIndex"),
      s32("tickArrayUpperStartIndex"),
      u128("liquidity"),
      u64("amountMaxA"),
      u64("amountMaxB"),
      bool("withMetadata"),
      u8("optionBaseFlag"),
      bool("baseFlag"),
    ]);

    const remainingAccounts = [
      ...(exTickArrayBitmap ? [{ pubkey: exTickArrayBitmap, isSigner: false, isWritable: true }] : []),
    ];

    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: positionNftOwner, isSigner: false, isWritable: false },
      { pubkey: positionNftMint, isSigner: true, isWritable: true },
      { pubkey: positionNftAccount, isSigner: false, isWritable: true },
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: protocolPosition, isSigner: false, isWritable: true },
      { pubkey: tickArrayLower, isSigner: false, isWritable: true },
      { pubkey: tickArrayUpper, isSigner: false, isWritable: true },
      { pubkey: personalPosition, isSigner: false, isWritable: true },
      { pubkey: ownerTokenAccountA, isSigner: false, isWritable: true },
      { pubkey: ownerTokenAccountB, isSigner: false, isWritable: true },
      { pubkey: tokenVaultA, isSigner: false, isWritable: true },
      { pubkey: tokenVaultB, isSigner: false, isWritable: true },

      { pubkey: RENT_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },

      { pubkey: tokenMintA, isSigner: false, isWritable: false },
      { pubkey: tokenMintB, isSigner: false, isWritable: false },

      ...remainingAccounts,
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        tickLowerIndex,
        tickUpperIndex,
        tickArrayLowerStartIndex,
        tickArrayUpperStartIndex,
        liquidity: new BN(0),
        amountMaxA: base === "MintA" ? baseAmount : otherAmountMax,
        amountMaxB: base === "MintA" ? otherAmountMax : baseAmount,
        withMetadata: withMetadata === "create",
        baseFlag: base === "MintA",
        optionBaseFlag: 1,
      },
      data,
    );

    const aData = Buffer.from([...anchorDataBuf.openPositionWithTokenEx, ...data]);

    return new TransactionInstruction({
      keys,
      programId,
      data: aData,
    });
  }

  static openPositionFromBaseInstruction(
    programId: PublicKey,
    payer: PublicKey,
    poolId: PublicKey,
    positionNftOwner: PublicKey,
    positionNftMint: PublicKey,
    positionNftAccount: PublicKey,
    metadataAccount: PublicKey,
    protocolPosition: PublicKey,
    tickArrayLower: PublicKey,
    tickArrayUpper: PublicKey,
    personalPosition: PublicKey,
    ownerTokenAccountA: PublicKey,
    ownerTokenAccountB: PublicKey,
    tokenVaultA: PublicKey,
    tokenVaultB: PublicKey,
    tokenMintA: PublicKey,
    tokenMintB: PublicKey,

    tickLowerIndex: number,
    tickUpperIndex: number,
    tickArrayLowerStartIndex: number,
    tickArrayUpperStartIndex: number,

    withMetadata: "create" | "no-create",
    base: "MintA" | "MintB",
    baseAmount: BN,

    otherAmountMax: BN,

    exTickArrayBitmap?: PublicKey,
  ): TransactionInstruction {
    const dataLayout = struct([
      s32("tickLowerIndex"),
      s32("tickUpperIndex"),
      s32("tickArrayLowerStartIndex"),
      s32("tickArrayUpperStartIndex"),
      u128("liquidity"),
      u64("amountMaxA"),
      u64("amountMaxB"),
      bool("withMetadata"),
      u8("optionBaseFlag"),
      bool("baseFlag"),
    ]);

    const remainingAccounts = [
      ...(exTickArrayBitmap ? [{ pubkey: exTickArrayBitmap, isSigner: false, isWritable: true }] : []),
    ];

    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: positionNftOwner, isSigner: false, isWritable: false },
      { pubkey: positionNftMint, isSigner: true, isWritable: true },
      { pubkey: positionNftAccount, isSigner: false, isWritable: true },
      { pubkey: metadataAccount, isSigner: false, isWritable: true },
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: protocolPosition, isSigner: false, isWritable: true },
      { pubkey: tickArrayLower, isSigner: false, isWritable: true },
      { pubkey: tickArrayUpper, isSigner: false, isWritable: true },
      { pubkey: personalPosition, isSigner: false, isWritable: true },
      { pubkey: ownerTokenAccountA, isSigner: false, isWritable: true },
      { pubkey: ownerTokenAccountB, isSigner: false, isWritable: true },
      { pubkey: tokenVaultA, isSigner: false, isWritable: true },
      { pubkey: tokenVaultB, isSigner: false, isWritable: true },

      { pubkey: RENT_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },

      { pubkey: tokenMintA, isSigner: false, isWritable: false },
      { pubkey: tokenMintB, isSigner: false, isWritable: false },

      ...remainingAccounts,
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        tickLowerIndex,
        tickUpperIndex,
        tickArrayLowerStartIndex,
        tickArrayUpperStartIndex,
        liquidity: new BN(0),
        amountMaxA: base === "MintA" ? baseAmount : otherAmountMax,
        amountMaxB: base === "MintA" ? otherAmountMax : baseAmount,
        withMetadata: withMetadata === "create",
        baseFlag: base === "MintA",
        optionBaseFlag: 1,
      },
      data,
    );

    const aData = Buffer.from([...anchorDataBuf.openPosition, ...data]);

    return new TransactionInstruction({
      keys,
      programId,
      data: aData,
    });
  }

  static increasePositionFromLiquidityInstructions({
    poolInfo,
    poolKeys,
    ownerPosition,
    ownerInfo,
    liquidity,
    amountMaxA,
    amountMaxB,
    nft2022,
  }: {
    poolInfo: ApiV3PoolInfoConcentratedItem;
    poolKeys: ClmmKeys;
    ownerPosition: ClmmPositionLayout;

    ownerInfo: {
      wallet: PublicKey;
      tokenAccountA: PublicKey;
      tokenAccountB: PublicKey;
    };

    liquidity: BN;
    amountMaxA: BN;
    amountMaxB: BN;
    nft2022?: boolean;
  }) {
    const [programId, id] = [new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)];
    const tickArrayLowerStartIndex = TickUtils.getTickArrayStartIndexByTick(
      ownerPosition.tickLower,
      poolInfo.config.tickSpacing,
    );
    const tickArrayUpperStartIndex = TickUtils.getTickArrayStartIndexByTick(
      ownerPosition.tickUpper,
      poolInfo.config.tickSpacing,
    );

    const { publicKey: tickArrayLower } = getPdaTickArrayAddress(programId, id, tickArrayLowerStartIndex);
    const { publicKey: tickArrayUpper } = getPdaTickArrayAddress(programId, id, tickArrayUpperStartIndex);

    const { publicKey: positionNftAccount } = nft2022
      ? getATAAddress(ownerInfo.wallet, ownerPosition.nftMint, TOKEN_2022_PROGRAM_ID)
      : getATAAddress(ownerInfo.wallet, ownerPosition.nftMint, TOKEN_PROGRAM_ID);

    const { publicKey: personalPosition } = getPdaPersonalPositionAddress(programId, ownerPosition.nftMint);
    const { publicKey: protocolPosition } = getPdaProtocolPositionAddress(
      programId,
      id,
      ownerPosition.tickLower,
      ownerPosition.tickUpper,
    );

    const ins = this.increasePositionFromLiquidityInstruction(
      programId,
      ownerInfo.wallet,
      positionNftAccount,
      personalPosition,
      id,
      protocolPosition,
      tickArrayLower,
      tickArrayUpper,
      ownerInfo.tokenAccountA,
      ownerInfo.tokenAccountB,
      new PublicKey(poolKeys.vault.A),
      new PublicKey(poolKeys.vault.B),
      new PublicKey(poolInfo.mintA.address),
      new PublicKey(poolInfo.mintB.address),

      liquidity,
      amountMaxA,
      amountMaxB,
      PoolUtils.isOverflowDefaultTickarrayBitmap(poolInfo.config.tickSpacing, [
        tickArrayLowerStartIndex,
        tickArrayUpperStartIndex,
      ])
        ? getPdaExBitmapAccount(programId, id).publicKey
        : undefined,
    );

    return {
      address: {
        tickArrayLower,
        tickArrayUpper,
        positionNftAccount,
        personalPosition,
        protocolPosition,
      },
      signers: [],
      instructions: [ins],
      instructionTypes: [InstructionType.ClmmIncreasePosition],
      lookupTableAddress: poolKeys.lookupTableAccount ? [poolKeys.lookupTableAccount] : [],
    };
  }

  static increasePositionFromLiquidityInstruction(
    programId: PublicKey,
    positionNftOwner: PublicKey,
    positionNftAccount: PublicKey,
    personalPosition: PublicKey,

    poolId: PublicKey,
    protocolPosition: PublicKey,
    tickArrayLower: PublicKey,
    tickArrayUpper: PublicKey,
    ownerTokenAccountA: PublicKey,
    ownerTokenAccountB: PublicKey,
    mintVaultA: PublicKey,
    mintVaultB: PublicKey,
    mintMintA: PublicKey,
    mintMintB: PublicKey,

    liquidity: BN,
    amountMaxA: BN,
    amountMaxB: BN,

    exTickArrayBitmap?: PublicKey,
  ): TransactionInstruction {
    const dataLayout = struct([
      u128("liquidity"),
      u64("amountMaxA"),
      u64("amountMaxB"),
      u8("optionBaseFlag"),
      bool("baseFlag"),
    ]);

    const remainingAccounts = [
      ...(exTickArrayBitmap ? [{ pubkey: exTickArrayBitmap, isSigner: false, isWritable: true }] : []),
    ];

    const keys = [
      { pubkey: positionNftOwner, isSigner: true, isWritable: false },
      { pubkey: positionNftAccount, isSigner: false, isWritable: false },
      { pubkey: poolId, isSigner: false, isWritable: true },
      { pubkey: protocolPosition, isSigner: false, isWritable: true },
      { pubkey: personalPosition, isSigner: false, isWritable: true },
      { pubkey: tickArrayLower, isSigner: false, isWritable: true },
      { pubkey: tickArrayUpper, isSigner: false, isWritable: true },
      { pubkey: ownerTokenAccountA, isSigner: false, isWritable: true },
      { pubkey: ownerTokenAccountB, isSigner: false, isWritable: true },
      { pubkey: mintVaultA, isSigner: false, isWritable: true },
      { pubkey: mintVaultB, isSigner: false, isWritable: true },

      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },

      { pubkey: mintMintA, isSigner: false, isWritable: false },
      { pubkey: mintMintB, isSigner: false, isWritable: false },

      ...remainingAccounts,
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        liquidity,
        amountMaxA,
        amountMaxB,
        optionBaseFlag: 0,
        baseFlag: false,
      },
      data,
    );

    const aData = Buffer.from([...anchorDataBuf.increaseLiquidity, ...data]);

    return new TransactionInstruction({
      keys,
      programId,
      data: aData,
    });
  }

}
