import * as anchor from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import nacl from 'tweetnacl';


export function getLocalWallet() {
  const privateKey = "2FPQzKf1ZAQernWJDcCyEZqeWgqNtcKZodp2VedpMswBiFU7iym2qwj17AZ26XCS9sahUtFpx7bz1nFCzBoz6QDP";

  const secretKey = bs58.decode(privateKey); // Uint8Array
  const keypair = Keypair.fromSecretKey(secretKey);
  return keypair
}

export async function createSplToken({
  connection,
  payer,
  mint,
  decimals = 0,
  initialAmount = BigInt(1_000_000_000_000_000),
}: {
  connection: Connection;
  payer: Keypair;
  mint: Keypair;
  decimals?: number;
  initialAmount: bigint;
}): Promise<{
  mint: PublicKey;
  payerATA: PublicKey;
}> {
  // Create mint (normal SPL token)
  const mintPubkey = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    null,             // freeze authority
    decimals,
    mint,
    undefined,
    TOKEN_PROGRAM_ID
  );

  // Create or get associated token account for payer
  const payerATA = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintPubkey,
      payer.publicKey,
      true,
      "confirmed",
      undefined,
      TOKEN_PROGRAM_ID
    )
  ).address;

  // Mint tokens to payer's associated token account
  await mintTo(
    connection,
    payer,
    mintPubkey,
    payerATA,
    payer,
    initialAmount,
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );

  return {
    mint: mintPubkey,
    payerATA,
  };
}
