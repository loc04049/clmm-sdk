import { PublicKey } from "@solana/web3.js";
import { IS_DEV } from ".";

export const CLMM_PROGRAM_ID = IS_DEV
  ? new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK')
  : new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');

export const METADATA_PROGRAM_ID = IS_DEV
  ? new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
  : new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
