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
  // Length-prefixed binary encoding prevents collision from delimiter ambiguity.
  // Delimiter-joined encoding (e.g., `chips-v1|a|b|c|5|`) fails when field values
  // contain delimiters or pipes; different tuples can shift field boundaries.
  // Length prefixes make every byte unambiguous: authorIdHex|tableId can't shift
  // across their length-prefixed boundary no matter what they contain.
  //
  // Case-fold the author HERE, not at each caller: this is the one place the
  // miner (crunch.worker.ts, via chipHash) and the verifier (chipsVerify.ts,
  // via verifyChipBits) are GUARANTEED to agree, since both funnel through
  // this exact function. `proofKey` case-folds independently for the same
  // reason (it hashes nothing, so it can't rely on this). Every author id in
  // play today is already lower-case hex (bytesToHex only emits lower-case),
  // so this changes no existing hash.
  const author = authorIdHex.toLowerCase();
  const domainBytes = new TextEncoder().encode(DOMAIN);
  const authorBytes = new TextEncoder().encode(author);
  const tableBytes = new TextEncoder().encode(tableId);

  const out = new Uint8Array(
    domainBytes.length +
    4 + authorBytes.length +
    4 + tableBytes.length +
    8 + // ms as u64
    8   // nonce as u64
  );

  let offset = 0;

  // Domain (8 bytes of "chips-v1")
  out.set(domainBytes, offset);
  offset += domainBytes.length;

  // u32 LE: length of authorIdHex
  new DataView(out.buffer).setUint32(offset, authorBytes.length, true);
  offset += 4;
  out.set(authorBytes, offset);
  offset += authorBytes.length;

  // u32 LE: length of tableId
  new DataView(out.buffer).setUint32(offset, tableBytes.length, true);
  offset += 4;
  out.set(tableBytes, offset);
  offset += tableBytes.length;

  // u64 LE: ms
  new DataView(out.buffer).setBigUint64(offset, BigInt(ms), true);
  offset += 8;

  // u64 LE: nonce
  new DataView(out.buffer).setBigUint64(offset, BigInt.asUintN(64, nonce), true);
  offset += 8;

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

/**
 * Exported so crunch.worker.ts (Task 9's off-thread grinder) can call the
 * EXACT same Argon2id call — same params, same salt — that verification
 * uses. A worker that re-implemented this call with its own copy of SALT/
 * CHIP_POW would only need one of those two copies to drift for every chip
 * it mines to silently fail verification later (rejected-bits, not a
 * crash) — this keeps there being exactly one place that can drift.
 */
export async function chipHash(preimage: Uint8Array): Promise<Uint8Array> {
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
