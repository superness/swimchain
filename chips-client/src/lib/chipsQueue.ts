/**
 * The pending-move queue.
 *
 * Ordering is the whole job. Moves reach the chain in queue order with ONE
 * submission in flight, because a buy that lands ahead of the chips funding it
 * folds as `rejected-cost` — the player's upgrade un-buys itself.
 *
 * Banks batch; buys never do. A buy is one reply, and there are a handful per
 * session, so batching them would widen a consensus-critical grammar for
 * nothing.
 *
 * Persisted, because every queued bank is a mined proof — CPU the player has
 * already spent and cannot get back.
 *
 * PROVENANCE. The store is global to the browser origin: it is keyed by
 * neither identity nor table. Nothing about `loadQueue`/`saveQueue` scopes it,
 * and a new identity (a fresh `tie on the apron`) does not touch it. Every
 * entry therefore carries its own `tableId` and `author`, and every caller
 * that turns queue entries into fold input or a submission MUST filter
 * through `activeFor` first — a table's fold has no way to verify a proof
 * mined for a DIFFERENT table (the Argon2id preimage binds the table id), and
 * crediting one anyway is exactly the "phantom crumbs" bug this file's
 * provenance fields exist to close. See chipsPending.ts and chipsSender.ts,
 * the two callers.
 */
import { MAX_BATCH } from './chipsConst';
import type { ChipEntry } from './chipsEngine';

/** `T extends any ? ... : never` forces distribution over a union when `T`
 *  is a naked type parameter — plain `Omit<A | B, K>` does NOT distribute:
 *  it collapses to `Omit<keyof (A|B) common keys>`, silently losing every
 *  field that isn't shared by every arm of the union (here, `chip` and
 *  `key`). That collapse is what made `enqueue`'s old signature unsound: a
 *  `{ kind: 'bank' as const }` literal with NO `chip` field passed its own
 *  type check, then blew up at runtime (`saveQueue` throwing on
 *  `m.chip.nonce`, `bankBatchBody` throwing on a missing chip forever). This
 *  form distributes, so each arm keeps its own required fields. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type QueuedMove =
  | { id: number; tableId: string; author: string; kind: 'bank'; chip: ChipEntry }
  | { id: number; tableId: string; author: string; kind: 'buy'; key: string };

/** What a caller supplies to `enqueue` — everything but the id, which the
 *  queue itself assigns. */
export type NewMove = DistributiveOmit<QueuedMove, 'id'>;

const STORE_KEY = 'chips.queue.v1';

export function enqueue(q: QueuedMove[], move: NewMove, nextId: number): QueuedMove[] {
  return [...q, { ...move, id: nextId } as QueuedMove];
}

/**
 * Entries belonging to the identity/table currently in play. Every fold and
 * every submission MUST go through this first — see the file header.
 *
 * Non-matching entries are DELIBERATELY NOT removed from the queue here (this
 * is a filter, not a prune): a queue entry for a different table is a mined
 * proof this session cannot safely judge invalid (it may simply belong to an
 * identity this browser held earlier and could hold again), and deleting it
 * on a guess is the same class of loss the whole queue exists to prevent. It
 * just sits inert — never credited, never submitted — until (if ever) the
 * identity/table it belongs to is current again.
 */
export function activeFor(q: QueuedMove[], tableId: string, author: string): QueuedMove[] {
  return q.filter((m) => m.tableId === tableId && m.author === author);
}

/**
 * The head of the queue, as one submittable unit: either a run of banks (up to
 * MAX_BATCH, stopping at the first buy) or exactly one buy.
 *
 * Callers MUST pass an already-`activeFor`-filtered queue — this function has
 * no way to tell a stale entry from a live one, and grouping across that
 * boundary would either submit a proof to the wrong table (wasting a real
 * action PoW — it can only fold `rejected-bits` there) or let a stale entry
 * block a live one behind it forever.
 */
export function takeBatch(q: QueuedMove[]): { moves: QueuedMove[]; kind: 'bank' | 'buy' } | null {
  if (q.length === 0) return null;
  if (q[0].kind === 'buy') return { moves: [q[0]], kind: 'buy' };

  const moves: QueuedMove[] = [];
  for (const m of q) {
    if (m.kind !== 'bank' || moves.length >= MAX_BATCH) break;
    moves.push(m);
  }
  return { moves, kind: 'bank' };
}

/** Drop exactly the moves that landed, by id. */
export function ack(q: QueuedMove[], taken: QueuedMove[]): QueuedMove[] {
  const gone = new Set(taken.map((m) => m.id));
  return q.filter((m) => !gone.has(m.id));
}

/**
 * The next id to hand out, given a (possibly restored) queue.
 *
 * Must never collide with an id already present. `ack` drops entries by id
 * (see above), so two live entries sharing one id would have a single
 * `ack()` call delete BOTH — one of which may be a mined proof that never
 * actually landed. The queue is designed to survive a reload (persisted,
 * restored via `loadQueue`), so a session that always reseeds at a fixed
 * starting value can mint an id that collides with a still-queued restored
 * entry the moment the player's first move of the new session is acked.
 * Seeding above the highest id already present closes that.
 */
export function nextIdAfter(q: QueuedMove[]): number {
  return q.reduce((max, m) => Math.max(max, m.id), 0) + 1;
}

function isSafeId(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function loadQueue(): QueuedMove[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as {
      id: unknown; tableId: unknown; author: unknown; kind: unknown;
      key?: unknown; chip?: { ms: unknown; bits: unknown; nonce: unknown };
    }[];
    if (!Array.isArray(rows)) return [];
    const out: QueuedMove[] = [];
    for (const r of rows) {
      // Every field is validated independently: a row that fails any check is
      // dropped WHOLE rather than partially trusted — a queue entry with a
      // non-numeric id (see `nextIdAfter`'s doc) or a missing tableId/author
      // (the provenance this file exists to enforce) is worse than useless,
      // it's a landmine for the very safety checks it's supposed to carry.
      if (!isSafeId(r.id) || !isNonEmptyString(r.tableId) || !isNonEmptyString(r.author)) continue;
      if (r.kind === 'buy' && typeof r.key === 'string') {
        out.push({ id: r.id, tableId: r.tableId, author: r.author, kind: 'buy', key: r.key });
      } else if (
        r.kind === 'bank' && r.chip
        && typeof r.chip.ms === 'number' && Number.isSafeInteger(r.chip.ms)
        && typeof r.chip.bits === 'number' && Number.isInteger(r.chip.bits)
        && typeof r.chip.nonce === 'string' && /^[0-9a-fA-F]+$/.test(r.chip.nonce)
      ) {
        out.push({
          id: r.id, tableId: r.tableId, author: r.author, kind: 'bank',
          chip: { ms: r.chip.ms, bits: r.chip.bits, nonce: BigInt('0x' + r.chip.nonce) },
        });
      }
      // else: unrecognized/malformed row — dropped, not thrown.
    }
    return out;
  } catch {
    // A corrupt queue must never take the game down with it.
    return [];
  }
}

export function saveQueue(q: QueuedMove[]): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(q.map((m) =>
      m.kind === 'bank'
        ? { id: m.id, tableId: m.tableId, author: m.author, kind: 'bank', chip: { ...m.chip, nonce: m.chip.nonce.toString(16) } }
        : m)));
  } catch { /* quota or private mode — the in-memory queue still works */ }
}

export function clearQueue(): void {
  try { globalThis.localStorage?.removeItem(STORE_KEY); } catch { /* ignore */ }
}
