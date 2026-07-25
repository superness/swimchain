/**
 * The chip proof.
 *
 * A chip is an Argon2id hash over a preimage bound to the player and their
 * table; its CRISPNESS is the count of leading zero bits. Finding a d-bit chip
 * costs ~2^d attempts, while checking one costs exactly one hash — the PoW
 * asymmetry that lets every client re-verify every other player's chips.
 *
 * The preimage binds author_id and table_id specifically so a chip is
 * non-transferable: copying someone else's winning nonce proves nothing on
 * your own table.
 */
import { argon2id } from 'hash-wasm';
import { CHIP_POW, MAX_BITS } from './chipsConst';

const DOMAIN = 'chips-v1';
/** Fixed 16-byte salt. Argon2 requires >= 8; the domain separation lives in the
 *  password, so a constant salt is correct here and keeps verification pure. */
const SALT = new TextEncoder().encode('chips-v1-salt-16');

export function chipPreimage(
  authorIdHex: string,
  tableId: string,
  ms: number,
  nonce: bigint
): Uint8Array {
  const head = new TextEncoder().encode(`${DOMAIN}|${authorIdHex}|${tableId}|${ms}|`);
  const tail = new Uint8Array(8);
  new DataView(tail.buffer).setBigUint64(0, BigInt.asUintN(64, nonce), true); // little-endian
  const out = new Uint8Array(head.length + 8);
  out.set(head, 0);
  out.set(tail, head.length);
  return out;
}

/** Count leading zero BITS of a hash. */
export function leadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

async function chipHash(preimage: Uint8Array): Promise<Uint8Array> {
  const hash = await argon2id({
    password: preimage,
    salt: SALT,
    parallelism: CHIP_POW.parallelism,
    memorySize: CHIP_POW.memoryKib,
    iterations: CHIP_POW.iterations,
    hashLength: CHIP_POW.hashLength,
    outputType: 'binary',
  });
  return new Uint8Array(hash);
}

/** Actual crispness of a claimed chip. One Argon2id call. */
export async function verifyChipBits(
  authorIdHex: string,
  tableId: string,
  ms: number,
  nonce: bigint
): Promise<number> {
  const bits = leadingZeroBits(await chipHash(chipPreimage(authorIdHex, tableId, ms, nonce)));
  return Math.min(bits, MAX_BITS);
}

export interface MineOpts {
  targetBits: number;
  /** Called every attempt so the UI can show the chip crisping. */
  onProgress?: (attempts: number, bestBits: number) => void;
  /** Return true to stop early and keep the best chip so far. */
  shouldStop?: () => boolean;
}

/**
 * Grind until `targetBits` is reached or `shouldStop` fires. Returns the BEST
 * chip found, so an early stop still banks whatever crispness was achieved.
 */
export async function mineChip(
  authorIdHex: string,
  tableId: string,
  ms: number,
  opts: MineOpts
): Promise<{ nonce: bigint; bits: number }> {
  let nonce = 0n;
  let best = { nonce: 0n, bits: -1 };
  let attempts = 0;
  for (;;) {
    const bits = leadingZeroBits(await chipHash(chipPreimage(authorIdHex, tableId, ms, nonce)));
    attempts++;
    if (bits > best.bits) best = { nonce, bits: Math.min(bits, MAX_BITS) };
    opts.onProgress?.(attempts, best.bits);
    if (best.bits >= opts.targetBits) return best;
    if (opts.shouldStop?.()) return best;
    nonce++;
  }
}
