/**
 * Memoized chip verification.
 *
 * The fold is pure and synchronous, so Argon2id verification happens here and
 * is handed in as a completed map. Each chip is verified once ever and the
 * result persists to localStorage, so a returning player re-checks nothing and
 * a fresh install pays a one-time catch-up cost.
 *
 * Memoization is PURE CACHING: a cached result is by definition the same value
 * the hash would produce again, so it can never change fold output.
 */
import { verifyChipBits } from './chipsPow';
import { parseMove, type ChipsReply } from './chipsEngine';

const STORE_KEY = 'chips.verified.v1';
const memory = new Map<string, number>();
let loaded = false;

/**
 * Count of REAL Argon2id hashes performed (i.e. cache misses), monotonic for
 * the process lifetime.
 *
 * This exists because a TIMING assertion cannot prove a cache works: on fast
 * hardware, or under Windows' coarse Date.now() tick, a completely broken
 * cache still looks fast. Tests take deltas around a call and assert the exact
 * number of hashes, which is deterministic and environment-independent. It is
 * also what proves the owner filter runs BEFORE hashing rather than merely
 * stripping foreign entries from the result.
 */
let hashCount = 0;
export function verifyHashCount(): number {
  return hashCount;
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, number>)) memory.set(k, v);
  } catch { /* no storage (node/test) — memory cache only */ }
}

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch { /* quota or no storage — cache stays in memory */ }
}

export function clearVerifyCache(): void {
  memory.clear();
  loaded = false;
  try { globalThis.localStorage?.removeItem(STORE_KEY); } catch { /* ignore */ }
}

/**
 * Verify every bank reply, returning content_id -> actual leading zero bits.
 * The result is complete for all bank moves, which is `foldChips`'s precondition.
 */
export async function verifyReplies(
  tableId: string,
  owner: string,
  replies: ChipsReply[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, number>> {
  load();
  const banks = replies
    // Same owner filter the fold applies. Without it a stranger's spam replies
    // cost this browser one Argon2id-8MiB hash each — a free DoS on a victim.
    .filter((r) => r.author_id === owner)
    .map((r) => ({ reply: r, parsed: parseMove(r.body) }))
    .filter((x): x is { reply: ChipsReply; parsed: Extract<ReturnType<typeof parseMove>, { kind: 'bank' }> } =>
      x.parsed?.kind === 'bank');

  const out = new Map<string, number>();
  let done = 0;
  let dirty = false;

  for (const { reply, parsed } of banks) {
    let bits = memory.get(reply.content_id);
    if (bits === undefined) {
      bits = await verifyChipBits(reply.author_id, tableId, parsed.ms, parsed.nonce);
      hashCount++;
      memory.set(reply.content_id, bits);
      dirty = true;
    }
    out.set(reply.content_id, bits);
    onProgress?.(++done, banks.length);
  }

  if (dirty) persist();
  return out;
}
