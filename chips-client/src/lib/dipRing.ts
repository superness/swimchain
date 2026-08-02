/**
 * WHAT THE CLIENT THOUGHT EACH DIP PAID.
 *
 * WHY THIS EXISTS. Twice now (2026-07-28, 2026-07-29) a big dip has "paid
 * nothing" and the report could not say which of four completely different
 * bugs it was:
 *
 *   1. the chip was worth less than it looked   (worth disagrees with the art)
 *   2. the dip credited, the display did not    (fold/render gap)
 *   3. the dip never reached the queue          (submit gap)
 *   4. the dip credited ZERO on purpose         (bowl at its cap; it spilled)
 *
 * The snapshot could already show the fold, the queue, and the rack — and
 * every one of those is a state AFTER the fact. A dip is destructive: the
 * basket restarts a fresh chip in the same tick, so the pot that was actually
 * dipped is gone the instant it happens and the rack can never show it again.
 * Nothing recorded the EVENT, so the operator's report and the chain agreed
 * on every number and still could not distinguish (4) from (2).
 *
 * The one that matters most is (4), because it is not a bug at all and the
 * whole conversation goes the wrong way for an hour if you cannot rule it out.
 * So a note here records `bowlCap`, `crumbsBefore`, `room`, `credited` and
 * `spilled` together: a dip that spilled its whole worth is legible at a
 * glance instead of being inferred from two other numbers minutes later.
 *
 * Deliberately dumb, for the same reason as [[errorRing]]: a fixed array, no
 * timers, no I/O, no dependencies. It only matters when something else has
 * already broken, so it must never be the thing that breaks.
 */

/**
 * WHERE A BASKET TAP WENT. Four of these consume the chip and only `dip` pays
 * crumbs — so on a phone, with a bubble you may not read, they are the same
 * gesture with wildly different outcomes.
 *
 * `hermit` is the one that cost two debugging sessions: it is the ONLY route
 * that eats a chip and writes nothing to the chain and nothing to the queue,
 * so from the outside it is indistinguishable from a dip that was lost. It was
 * identified on 2026-07-29 only by excluding the other three.
 */
export type TapRoute = 'dip' | 'hermit' | 'jar' | 'porcelain' | 'boss';

export interface DipNote {
  /**
   * WHEN THE TAP HAPPENED. Wall clock.
   *
   * THIS IS NOT `ms`, AND CONFUSING THE TWO SENDS YOU SOMEWHERE WRONG. On
   * 2026-07-29 the `ms` values in a chain history were read as the moments
   * dips occurred; they are chip BIRTH times (`freshChip(ms)`), so a chip that
   * cooked 158 seconds reports an `ms` 158 seconds before its own dip. That
   * offset made a normal dip look like a chip that vanished untraceably, and
   * produced a confident and completely wrong diagnosis.
   *
   * `at - ms` is the cook duration. If those two are ever equal, something
   * dipped a newborn.
   */
  at: number;
  /** What the tap actually did. Anything but `dip` pays no crumbs. */
  route: TapRoute;
  /** Which basket. */
  index: number;
  /** The chip's BIRTH ms. `at - ms` is the cook duration (see `at` above).
   *  NO LONGER the join key to the chain: a dip body now carries the ms it was
   *  DIPPED at, not the ms its chip was cast on — see `wireMs`, and cooking.ts's
   *  dipFor for why the two had to be separated. */
  ms: number;
  /** The ms that actually went out in `dip <amount>#<ms>~` — the join key to
   *  the move on chain, and the fold's ordering key until the move is sealed.
   *  Null for routes that post no dip. */
  wireMs: number | null;
  /** How long it actually cooked, as the client measured it. Explains the pot
   *  without anyone having to re-derive it from a tick rate. */
  cookedMs: number;
  /** The pot at the moment of the dip. Unrecoverable afterwards: gone. */
  pot: number;
  /** Crackles at the moment of the dip. `pot * 2**crackles` is the raw worth. */
  crackles: number;
  /** What dipChip returned, before any of the game's multipliers. */
  raw: number;
  /** What was actually enqueued, after wing/oracle/grain and double-dip. */
  amount: number;
  /** Did the double-dip proc. */
  doubled: boolean;
  /** THE CAP STORY — why `credited` can be 0 for a huge `amount`. */
  bowlCap: number;
  crumbsBefore: number;
  /** `bowlCap - crumbsBefore`, floored at 0. */
  room: number;
  /** `min(amount, room)` — what the fold will actually keep. */
  credited: number;
  /** `amount - credited` — burned at the rim. */
  spilled: number;
  /** The queue id it went out as, so it can be followed into `queue`/chain. */
  queuedId: number | null;
}

/**
 * Shorter than the error ring: a dip is ~2-6 seconds of play, so twenty of
 * them is a couple of minutes — past the point where a player still remembers
 * which one they meant.
 */
export const DIP_RING_MAX = 20;

const ring: DipNote[] = [];

/** Record a dip. Never throws: a recorder that can throw inside onDip would
 *  turn "my dip paid nothing" into "my dip crashed the game". */
export function noteDip(n: DipNote): void {
  try {
    ring.push(n);
    if (ring.length > DIP_RING_MAX) ring.splice(0, ring.length - DIP_RING_MAX);
  } catch {
    /* nothing to do, and nowhere useful to say it */
  }
}

/**
 * A tap that was routed AWAY from dipping — fed to a critter, swung at the
 * porcelain, spent on a boss. Every one of these is a chip gone for zero
 * crumbs, which is the player's complaint verbatim, so they belong in the same
 * ring as the dips rather than in a separate place nobody thinks to compare.
 *
 * The cap fields are meaningless here (nothing was credited), so they are
 * zeroed rather than faked — a `route` other than `dip` is the signal.
 */
export function noteTapAway(
  route: Exclude<TapRoute, 'dip'>,
  at: number, index: number,
  chip: { ms: number; pot: number; crackles: number; cookedMs: number },
): void {
  const worth = chip.pot * 2 ** chip.crackles;
  noteDip({
    // wireMs null: a tap-away posts no dip, so there is no move to join to.
    at, route, index, ms: chip.ms, wireMs: null, cookedMs: chip.cookedMs,
    pot: chip.pot, crackles: chip.crackles,
    raw: worth, amount: worth, doubled: false,
    bowlCap: 0, crumbsBefore: 0, room: 0, credited: 0, spilled: 0,
    queuedId: null,
  });
}

/** A copy, oldest first. Callers may not mutate the ring. */
export function dipEntries(): DipNote[] {
  return ring.slice();
}

export function clearDipRing(): void {
  ring.length = 0;
}
