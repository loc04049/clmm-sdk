import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { TickArrayBitmapExtensionType, TickArrayCache, TokenInfo } from "../type";
import Decimal from "decimal.js";
import { TICK_ARRAY_SIZE, TickUtils } from "./tick";
import { ClmmPoolLayout, ExTickArrayBitmapLayout } from "../layout";
import { FETCH_TICKARRAY_COUNT } from "./tickQuery";
import { getPdaTickArrayAddress } from "./pda";
import { TickUtilsV1 } from "./tickV1";
import { BorshAccountsCoder } from "@project-serum/anchor";
import { WSOLMint } from "../constants";
export function u16ToBytes(num: number): Uint8Array {
  const arr = new ArrayBuffer(2);
  const view = new DataView(arr);
  view.setUint16(0, num, false);
  return new Uint8Array(arr);
}

export function i16ToBytes(num: number): Uint8Array {
  const arr = new ArrayBuffer(2);
  const view = new DataView(arr);
  view.setInt16(0, num, false);
  return new Uint8Array(arr);
}

export function u32ToBytes(num: number): Uint8Array {
  const arr = new ArrayBuffer(4);
  const view = new DataView(arr);
  view.setUint32(0, num, false);
  return new Uint8Array(arr);
}

export function i32ToBytes(num: number): Uint8Array {
  const arr = new ArrayBuffer(4);
  const view = new DataView(arr);
  view.setInt32(0, num, false);
  return new Uint8Array(arr);
}

export function leadingZeros(bitNum: number, data: BN): number {
  let i = 0;
  for (let j = bitNum - 1; j >= 0; j--) {
    if (!data.testn(j)) {
      i++;
    } else {
      break;
    }
  }
  return i;
}

export function trailingZeros(bitNum: number, data: BN) {
  let i = 0;
  for (let j = 0; j < bitNum; j++) {
    if (!data.testn(j)) {
      i++;
    } else {
      break;
    }
  }
  return i;
}

export function isZero(bitNum: number, data: BN): boolean {
  for (let i = 0; i < bitNum; i++) {
    if (data.testn(i)) return false;
  }
  return true;
}

export function mostSignificantBit(bitNum: number, data: BN): number | null {
  if (isZero(bitNum, data)) return null;
  else return leadingZeros(bitNum, data);
}

export function leastSignificantBit(bitNum: number, data: BN): number | null {
  if (isZero(bitNum, data)) return null;
  else return trailingZeros(bitNum, data);
}

export function findProgramAddress(
  seeds: Array<Buffer | Uint8Array>,
  programId: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  const [publicKey, nonce] = PublicKey.findProgramAddressSync(seeds, programId);
  return { publicKey, nonce };
}

export const getOrCreateATAWithExtension = async ({
  payer,
  connection,
  owner,
  mint,
  instruction,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
  allowOwnerOffCurve = false,
  amountInLamports,
}: {
  connection: Connection;
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  instruction: TransactionInstruction[];
  programId?: PublicKey;
  associatedTokenProgramId?: PublicKey;
  allowOwnerOffCurve?: boolean;
  amountInLamports?: BN
}) => {

  const isWSol = WSOLMint.equals(mint);

  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    programId,
    associatedTokenProgramId,
  );

  try {
    await getAccount(connection, ata, 'confirmed', programId);
    if (isWSol && amountInLamports?.gt(new BN(0))) {
      instruction.push(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: ata,
          lamports: amountInLamports.toNumber(),
        })
      );

      instruction.push(createSyncNativeInstruction(ata));
    }
    return ata;
  } catch (e) {
    const ix = createAssociatedTokenAccountInstruction(
      payer,
      ata,
      owner,
      mint,
      programId,
      associatedTokenProgramId,
    );
    instruction.push(ix);
    if (isWSol && amountInLamports?.gt(new BN(0))) {
      instruction.push(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: ata,
          lamports: amountInLamports.toNumber(),
        })
      );
    }
    if (isWSol) instruction.push(createSyncNativeInstruction(ata));
    return ata;
  }
};

export function getATAAddress(
  owner: PublicKey,
  mint: PublicKey,
  programId?: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress(
    [owner.toBuffer(), (programId ?? TOKEN_PROGRAM_ID).toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  );
}


export function getTokenATokenBAndPrice(
  mint1: TokenInfo,
  mint2: TokenInfo,
  initialPrice = new Decimal(0)
) {
  const [mintA, mintB, price] = new BN(new PublicKey(mint1.address).toBuffer()).gt(
    new BN(new PublicKey(mint2.address).toBuffer()),
  )
    ? [mint2, mint1, new Decimal(1).div(initialPrice)]
    : [mint1, mint2, initialPrice];

  return {
    mintA,
    mintB,
    price
  }
}

export const getTickArrayPks = (address: PublicKey, poolState: ClmmPoolLayout, programId: PublicKey, zeroForOne?: boolean): PublicKey[] => {
  const tickArrayBitmap = TickUtils.mergeTickArrayBitmap(poolState.tickArrayBitmap);
  const currentTickArrayStartIndex = TickUtils.getTickArrayStartIndexByTick(
    poolState.tickCurrent,
    poolState.tickSpacing
  );

  const tickArrayPks: PublicKey[] = [];
  const startIndexArray = TickUtilsV1.getInitializedTickArrayInRange(
    tickArrayBitmap,
    poolState.tickSpacing,
    currentTickArrayStartIndex,
    // Math.floor(FETCH_TICKARRAY_COUNT / 2),
    1000,
    zeroForOne,
  );

  for (const itemIndex of startIndexArray) {
    const { publicKey: tickArrayAddress } = getPdaTickArrayAddress(programId, address, itemIndex);
    tickArrayPks.push(tickArrayAddress);
  }
  return tickArrayPks;
}

export const getTickArrayCache = async ({
  poolInfo,
  poolId,
  connection,
  clmmProgramId,
  coder,
  zeroForOne
}: {
  poolInfo: ClmmPoolLayout;
  poolId: PublicKey;
  connection: Connection;
  clmmProgramId: PublicKey;
  coder: BorshAccountsCoder;
  zeroForOne?: boolean;
}) => {

  const tickArrayPks = getTickArrayPks(poolId, poolInfo, clmmProgramId, zeroForOne);
  const infos = await connection.getMultipleAccountsInfo(tickArrayPks);

  const accountInfoMap = new Map<string, AccountInfo<Buffer>>();
  tickArrayPks.forEach((pk, i) => {
    const info = infos[i];
    if (info) {
      accountInfoMap.set(pk.toBase58(), info);
    }
  });

  const tickArrayCache: TickArrayCache = {};
  for (const tickArrayPk of tickArrayPks) {
    const tickArrayAccountInfo = accountInfoMap.get(tickArrayPk.toBase58());
    if (!tickArrayAccountInfo) continue;
    const tickArray = coder.decode('tickArrayState', tickArrayAccountInfo.data);
    tickArrayCache[tickArray.startTickIndex] = {
      ...tickArray,
      address: tickArrayPk,
    };
  }

  return tickArrayCache
}


