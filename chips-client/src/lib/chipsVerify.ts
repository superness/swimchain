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
import { parseMove, type ChipEntry, type ChipsReply } from './chipsEngine';
import { proofKey } from './proofKey';
import type { VerifyReq, VerifyRes } from './chipsVerify.worker';

/**
 * v3: the cache key is now `proofKey`, one entry per CHIP rather than per
 * reply — a batch reply carries many chips, and each needs its own cache
 * entry. The version bump is load-bearing — v2 entries are keyed differently
 * (per-reply, on table+author+content_id) and must not be read back as if
 * they were v3.
 */
const STORE_KEY = 'chips.verified.v3';
const memory = new Map<string, number>();
let loaded = false;

/* ── the hash, off the UI thread ────────────────────────────────────────── */

/**
 * One long-lived worker for all verification. See chipsVerify.worker.ts for
 * why this must not run on the main thread at all.
 *
 * `null` means "no worker available, hash inline": that is the test/Node path
 * (there is no global `Worker`) and the very-old-runtime path. Correctness is
 * identical either way — the same `verifyChipBits`, the same cache, the same
 * returned map — only the tab's responsiveness differs.
 */
let hasher: Worker | null = null;
let hasherTried = false;
const pending = new Map<number, { resolve: (bits: number) => void; reject: (e: Error) => void }>();
let nextReqId = 1;

function getHasher(): Worker | null {
  if (hasherTried) return hasher;
  hasherTried = true;
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./chipsVerify.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<VerifyRes>) => {
      const waiter = pending.get(e.data.id);
      if (!waiter) return;
      pending.delete(e.data.id);
      if ('error' in e.data) waiter.reject(new Error(e.data.error));
      else waiter.resolve(e.data.bits);
    };
    w.onerror = () => {
      // The worker died. Fail every waiter so `verifyReplies` rejects rather
      // than hanging forever, and drop back to inline hashing from here on —
      // a frozen tab beats a game that never finishes counting its chips.
      //
      // TERMINATE before dropping the reference. `onerror` fires for an
      // unhandled error inside a worker that is still ALIVE, so merely nulling
      // `hasher` orphans a live thread (and its Argon2id 8 MiB arena) for the
      // life of the tab, with nothing left holding a handle to stop it.
      w.terminate();
      hasher = null;
      const waiters = [...pending.values()];
      pending.clear();
      for (const waiter of waiters) waiter.reject(new Error('verify worker failed'));
    };
    hasher = w;
  } catch {
    hasher = null;
  }
  return hasher;
}

function hashBits(authorIdHex: string, tableId: string, ms: number, nonce: bigint): Promise<number> {
  const w = getHasher();
  if (!w) return verifyChipBits(authorIdHex, tableId, ms, nonce);
  const id = nextReqId++;
  return new Promise<number>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const req: VerifyReq = { id, authorIdHex, tableId, ms, nonceHex: nonce.toString(16) };
    w.postMessage(req);
  });
}

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
 * Verify every chip of every bank reply, returning proofKey -> actual leading
 * zero bits. The result is complete for all bank moves, which is `foldChips`'s
 * precondition.
 */
export async function verifyReplies(
  tableId: string,
  owner: string,
  replies: ChipsReply[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, number>> {
  load();
  const wanted: { reply: ChipsReply; chip: ChipEntry }[] = [];
  for (const r of replies) {
    if (r.author_id !== owner) continue;          // DoS control, still before any hashing
    const parsed = parseMove(r.body);
    if (parsed?.kind !== 'bank') continue;         // 'oversize' verifies nothing, by design
    for (const chip of parsed.chips) wanted.push({ reply: r, chip });
  }

  const out = new Map<string, number>();
  let done = 0;
  let dirty = false;

  for (const { reply, chip } of wanted) {
    const key = proofKey(tableId, reply.author_id, chip.ms, chip.nonce);
    let bits = memory.get(key);
    if (bits === undefined) {
      bits = await hashBits(reply.author_id, tableId, chip.ms, chip.nonce);
      hashCount++;
      memory.set(key, bits);
      dirty = true;
    }
    out.set(key, bits);
    onProgress?.(++done, wanted.length);
  }

  if (dirty) persist();
  return out;
}
