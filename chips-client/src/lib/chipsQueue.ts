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
 *
 * KNOWN GAP, DELIBERATELY NOT FIXED HERE: two tabs on the same origin. Every
 * write is a whole-array `localStorage` read-modify-write (`loadQueue` then
 * `saveQueue`, no lock, no `storage` event listener), and `nextIdAfter` seeds
 * per tab from whatever that tab last loaded — so two tabs open at once can
 * both mint the same id and each clobber the other's queued moves on its next
 * save. Bounded (a player would need two tabs open) and unlikely, but real:
 * this file reasons carefully about table/identity provenance and not at all
 * about concurrent tabs on the SAME table/identity. Left as a gap rather than
 * solved.
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

/**
 * `sentAt` is what makes an entry SETTLING rather than QUEUED: the wall clock
 * at which its submission succeeded.
 *
 * A move used to be deleted the moment it was acked, which meant the fold lost
 * it before the chain could supply the confirmed twin — the player's purchase
 * appeared, vanished, and reappeared a poll later. Keeping it, marked, closes
 * that: `withPending` still folds it (so the credit holds steady) while
 * `planSend` skips it (so it is never resubmitted, which is the whole reason
 * the ack exists). chipsSettling.ts retires it when the twin actually shows up,
 * or when it has waited longer than the chain could plausibly take.
 *
 * `undefined` — not `0`, not `null` — is "never sent". `saveQueue` omits the
 * field entirely in that case, and `loadQueue` DROPS a row whose `sentAt` is
 * present but unusable rather than reading it back as unsent: silently
 * downgrading a settling row to a queued one would resubmit an already-landed
 * batch, i.e. exactly the bug the ack prevents.
 */
export type QueuedMove =
  | { id: number; tableId: string; author: string; kind: 'bank'; chip: ChipEntry; sentAt?: number }
  | { id: number; tableId: string; author: string; kind: 'buy'; key: string; sentAt?: number }
  /** Give a jar back for BURN_REFUND of its price. Carries `ms` because,
   *  unlike a buy, you can burn the SAME key more than once in a run (buy it
   *  again, burn it again) — so the key alone cannot identify the move. */
  | { id: number; tableId: string; author: string; kind: 'burn'; key: string; ms: number; sentAt?: number }
  /** A pot-x-multi cash-out. `ms` is the dip's identity (allocator-unique) —
   *  it becomes the body's authoring ms, which is how the confirmed reply is
   *  matched back to this entry (chipsSettling.moveKey). */
  | { id: number; tableId: string; author: string; kind: 'dip'; amount: number; ms: number; sentAt?: number }
  /** `keep` is the jar THE CRACK saves; absent for a plain tip. */
  | { id: number; tableId: string; author: string; kind: 'tip'; keep?: string; ms: number; sentAt?: number }
  /** One band of the descent. `paid` is the chip FED to the boss — it buys the
   *  band and pays nothing. The fold works out WHICH band from state it can
   *  see, so there is nothing here to forge. */
  | { id: number; tableId: string; author: string; kind: 'broke'; paid: number; ms: number; sentAt?: number }
  /** Char spent at scoop's for a rule change. The cost rides along because
   *  prices are policy — the fold only refuses to let char go negative. */
  | { id: number; tableId: string; author: string; kind: 'spend'; ability: string; cost: number; ms: number; sentAt?: number };

/** What a caller supplies to `enqueue` — everything but the id, which the
 *  queue itself assigns, and `sentAt`, which only a successful submission may
 *  ever set (`markSent`). */
export type NewMove = DistributiveOmit<QueuedMove, 'id' | 'sentAt'>;

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
export function takeBatch(q: QueuedMove[]): { moves: QueuedMove[]; kind: 'bank' | 'buy' | 'dip' | 'tip' | 'burn' | 'broke' | 'spend' } | null {
  if (q.length === 0) return null;
  if (q[0].kind === 'buy') return { moves: [q[0]], kind: 'buy' };
  if (q[0].kind === 'burn') return { moves: [q[0]], kind: 'burn' };
  // One dip per reply — the verb carries a single amount.
  if (q[0].kind === 'dip') return { moves: [q[0]], kind: 'dip' };
  if (q[0].kind === 'tip') return { moves: [q[0]], kind: 'tip' };
  if (q[0].kind === 'broke') return { moves: [q[0]], kind: 'broke' };
  if (q[0].kind === 'spend') return { moves: [q[0]], kind: 'spend' };

  const moves: QueuedMove[] = [];
  for (const m of q) {
    if (m.kind !== 'bank' || moves.length >= MAX_BATCH) break;
    moves.push(m);
  }
  return { moves, kind: 'bank' };
}

/**
 * Entries still awaiting submission. Everything the sender does — batching,
 * ordering, submitting — must go through this first: a settling entry has
 * ALREADY landed on the chain, and resubmitting it burns a real action PoW and
 * a chain write to be folded as `rejected-duplicate`.
 *
 * Order is preserved — NOT because a settling entry is guaranteed to sit in a
 * strict prefix of the queue (it isn't: a stale foreign-provenance entry, or
 * one `submittable` rejects, can sit ahead of a live one and is never marked
 * settling at all) but because `.filter` never reorders what survives it. That
 * alone is what keeps the queue's FIFO contract intact for whatever unsent
 * entries remain, regardless of where the settling ones were sitting.
 */
export function unsent(q: QueuedMove[]): QueuedMove[] {
  return q.filter((m) => m.sentAt === undefined);
}

/**
 * Mark exactly the moves that landed as SETTLING, stamped `at`. Replaces the
 * old "delete on ack": the entry stays in the queue, and therefore stays in the
 * optimistic fold, until its confirmed twin arrives or it expires.
 *
 * Returns `q` UNCHANGED (same reference) when there is nothing to mark, so a
 * caller can pass this straight to `setQueue` without forcing a re-render or a
 * needless `saveQueue` write.
 *
 * Already-settling entries keep their ORIGINAL `sentAt`: re-stamping one would
 * restart its expiry clock, and an entry that keeps being re-marked would never
 * expire at all.
 */
export function markSent(q: QueuedMove[], taken: QueuedMove[], at: number): QueuedMove[] {
  const landed = new Set(taken.map((m) => m.id));
  let changed = false;
  const out = q.map((m) => {
    if (!landed.has(m.id) || m.sentAt !== undefined) return m;
    changed = true;
    return { ...m, sentAt: at };
  });
  return changed ? out : q;
}

/**
 * The next id to hand out, given a (possibly restored) queue.
 *
 * Must never collide with an id already present. `markSent` marks entries by
 * id, matching via a `Set` built from `taken.map((m) => m.id)` (see above), so
 * two live entries sharing one id would have a single `markSent` call stamp
 * BOTH as settled — one of which may be a mined proof that never actually
 * landed. The queue is designed to survive a reload (persisted, restored via
 * `loadQueue`), so a session that always reseeds at a fixed starting value can
 * mint an id that collides with a still-queued restored entry the moment the
 * player's first move of the new session is submitted. Seeding above the
 * highest id already present closes that.
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
      id: unknown; tableId: unknown; author: unknown; kind: unknown; sentAt?: unknown;
      key?: unknown; amount?: unknown; ms?: unknown; paid?: unknown; keep?: unknown;
      ability?: unknown; cost?: unknown;
      chip?: { ms: unknown; bits: unknown; nonce: unknown };
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
      // SETTLING rows are persisted (see the file header on `sentAt`), so this
      // has to read the mark back. A row carrying a `sentAt` that is present
      // but not a finite number is DROPPED WHOLE, never downgraded to unsent:
      // an unsent row gets submitted, and this row has already landed, so the
      // downgrade would spend a real action PoW re-sending it. Dropping costs
      // the player nothing — the move is on the chain; only the local
      // optimistic echo of it is lost, and the next poll supplies the truth.
      // `undefined` — and ONLY undefined — means "the key was absent", i.e.
      // never sent. A stored `null` must NOT be read as that: `JSON.stringify`
      // turns a `NaN` (or an `Infinity`) `sentAt` into exactly `null`, so
      // treating null as absent would silently downgrade a corrupted settling
      // row into a submittable one and resubmit a batch that already landed.
      // JSON can never produce an `undefined` value, so this test really does
      // separate "absent" from "present but broken".
      const hasMark = r.sentAt !== undefined;
      if (hasMark && !(typeof r.sentAt === 'number' && Number.isFinite(r.sentAt))) continue;
      const sentAt = hasMark ? { sentAt: r.sentAt as number } : {};
      if (r.kind === 'buy' && typeof r.key === 'string') {
        out.push({ id: r.id, tableId: r.tableId, author: r.author, kind: 'buy', key: r.key, ...sentAt });
      } else if (
        r.kind === 'broke'
        && typeof r.ms === 'number' && Number.isSafeInteger(r.ms) && r.ms > 0
      ) {
        out.push({ id: r.id, tableId: r.tableId, author: r.author, kind: 'broke', paid: typeof r.paid === 'number' ? r.paid : 0, ms: r.ms, ...sentAt });
      } else if (
        r.kind === 'spend' && typeof r.ability === 'string' && typeof r.cost === 'number'
        && Number.isSafeInteger(r.cost) && r.cost > 0
        && typeof r.ms === 'number' && Number.isSafeInteger(r.ms) && r.ms > 0
      ) {
        out.push({ id: r.id, tableId: r.tableId, author: r.author, kind: 'spend', ability: r.ability, cost: r.cost, ms: r.ms, ...sentAt });
      } else if (
        r.kind === 'burn' && typeof r.key === 'string'
        && typeof r.ms === 'number' && Number.isSafeInteger(r.ms) && r.ms > 0
      ) {
        out.push({ id: r.id, tableId: r.tableId, author: r.author, kind: 'burn', key: r.key, ms: r.ms, ...sentAt });
      } else if (
        r.kind === 'dip'
        && typeof r.amount === 'number' && Number.isSafeInteger(r.amount) && r.amount >= 0
        && typeof r.ms === 'number' && Number.isSafeInteger(r.ms) && r.ms > 0
      ) {
        out.push({ id: r.id, tableId: r.tableId, author: r.author, kind: 'dip', amount: r.amount, ms: r.ms, ...sentAt });
      } else if (
        r.kind === 'tip'
        && typeof r.ms === 'number' && Number.isSafeInteger(r.ms) && r.ms > 0
      ) {
        out.push({ id: r.id, tableId: r.tableId, author: r.author, kind: 'tip', ...(typeof r.keep === 'string' ? { keep: r.keep } : {}), ms: r.ms, ...sentAt });
      } else if (
        r.kind === 'bank' && r.chip
        && typeof r.chip.ms === 'number' && Number.isSafeInteger(r.chip.ms)
        && typeof r.chip.bits === 'number' && Number.isInteger(r.chip.bits)
        && typeof r.chip.nonce === 'string' && /^[0-9a-fA-F]+$/.test(r.chip.nonce)
      ) {
        out.push({
          id: r.id, tableId: r.tableId, author: r.author, kind: 'bank',
          chip: { ms: r.chip.ms, bits: r.chip.bits, nonce: BigInt('0x' + r.chip.nonce) },
          ...sentAt,
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
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(q.map((m) => {
      // Spread `sentAt` conditionally so a never-sent row serialises with no
      // `sentAt` key at all, rather than an explicit `undefined`/`null` that
      // `loadQueue` would then have to disambiguate from a corrupt mark.
      const mark = m.sentAt === undefined ? {} : { sentAt: m.sentAt };
      return m.kind === 'bank'
        ? { id: m.id, tableId: m.tableId, author: m.author, kind: 'bank', chip: { ...m.chip, nonce: m.chip.nonce.toString(16) }, ...mark }
        : m.kind === 'dip'
          ? { id: m.id, tableId: m.tableId, author: m.author, kind: 'dip', amount: m.amount, ms: m.ms, ...mark }
          : m.kind === 'tip'
            ? { id: m.id, tableId: m.tableId, author: m.author, kind: 'tip', ...(m.keep ? { keep: m.keep } : {}), ms: m.ms, ...mark }
            : m.kind === 'spend'
              ? { id: m.id, tableId: m.tableId, author: m.author, kind: 'spend', ability: m.ability, cost: m.cost, ms: m.ms, ...mark }
            : m.kind === 'broke'
              ? { id: m.id, tableId: m.tableId, author: m.author, kind: 'broke', paid: m.paid, ms: m.ms, ...mark }
              : m.kind === 'burn'
                ? { id: m.id, tableId: m.tableId, author: m.author, kind: 'burn', key: m.key, ms: m.ms, ...mark }
                : { id: m.id, tableId: m.tableId, author: m.author, kind: 'buy', key: m.key, ...mark };
    })));
  } catch { /* quota or private mode — the in-memory queue still works */ }
}

export function clearQueue(): void {
  try { globalThis.localStorage?.removeItem(STORE_KEY); } catch { /* ignore */ }
}
