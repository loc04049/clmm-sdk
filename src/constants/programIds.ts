import { PublicKey } from "@solana/web3.js";
import { IS_DEV } from ".";

export const CLMM_PROGRAM_ID = IS_DEV
  ? new PublicKey('devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH')
  // ? new PublicKey('8B5YGiYcyoRDntzdqkqi1JbxanhBSM2TJaQ9vorxQwQ8')
  : new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');

export const METADATA_PROGRAM_ID = IS_DEV
  ? new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
  : new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

export const RENT_PROGRAM_ID = IS_DEV
  ? new PublicKey("SysvarRent111111111111111111111111111111111")
  : new PublicKey("SysvarRent111111111111111111111111111111111")


export const MEMO_PROGRAM_ID = IS_DEV
  ? new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
  : new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr") 
