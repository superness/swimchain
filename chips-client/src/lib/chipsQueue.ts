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
 */
import { MAX_BATCH } from './chipsConst';
import type { ChipEntry } from './chipsEngine';

export type QueuedMove =
  | { id: number; kind: 'bank'; chip: ChipEntry }
  | { id: number; kind: 'buy'; key: string };

const STORE_KEY = 'chips.queue.v1';

export function enqueue(q: QueuedMove[], move: Omit<QueuedMove, 'id'>, nextId: number): QueuedMove[] {
  return [...q, { ...move, id: nextId } as QueuedMove];
}

/**
 * The head of the queue, as one submittable unit: either a run of banks (up to
 * MAX_BATCH, stopping at the first buy) or exactly one buy.
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

export function loadQueue(): QueuedMove[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as { id: number; kind: string; key?: string; chip?: { ms: number; bits: number; nonce: string } }[];
    const out: QueuedMove[] = [];
    for (const r of rows) {
      if (r.kind === 'buy' && typeof r.key === 'string') out.push({ id: r.id, kind: 'buy', key: r.key });
      else if (r.kind === 'bank' && r.chip) out.push({ id: r.id, kind: 'bank', chip: { ...r.chip, nonce: BigInt('0x' + r.chip.nonce) } });
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
      m.kind === 'bank' ? { id: m.id, kind: 'bank', chip: { ...m.chip, nonce: m.chip.nonce.toString(16) } } : m)));
  } catch { /* quota or private mode — the in-memory queue still works */ }
}

export function clearQueue(): void {
  try { globalThis.localStorage?.removeItem(STORE_KEY); } catch { /* ignore */ }
}
