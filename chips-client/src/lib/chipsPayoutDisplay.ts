/**
 * DISPLAY-ONLY payout feedback: what a bank just credited, and what a frying
 * chip would pay right now if lifted.
 *
 * Same reasoning as sogProjection.ts's file header, restated for a second
 * mirror risk: the fold's payout resolution (base -> golden -> dip tier ->
 * congeal -> seasoning, chipsEngine.ts's `payoutFor`) is consensus-critical
 * and exported specifically so this file never restates it. Everything below
 * either calls `payoutFor` directly or works from `MoveResult.crumbs`, which
 * IS that function's own output, captured at fold time.
 *
 * The one thing `payoutFor`'s return value does NOT already reflect is the
 * bowl cap: `foldChips` clamps `state.crumbs` to `state.bowlCap` AFTER computing
 * a bank's payout, so `MoveResult.crumbs` is the notional, pre-clamp figure —
 * a full bowl still reports the same big number a chip would have paid on an
 * empty one. Showing that number as "what you gained" is exactly the lie this
 * module exists to prevent, so `actualGains` below replays that one clamp line
 * (nothing more) to recover what really landed. `worthIfBankedNow` applies the
 * identical clamp to a live projection for the same reason.
 */
import { payoutFor, type ChipsState, type MoveResult } from './chipsEngine';
import { projectedCrumbs } from './sogProjection';
import { BANK_MIN_BITS } from './chipsConst';

/** The identifying fields of a banked chip, pulled from a `MoveResult`. */
export interface BankedMove {
  ms: number;
  bits: number;
  /** The fold's own payout for this chip — notional, pre-cap, and already
   *  including any double-dip doubling. */
  crumbs: number;
  /** True when the fold doubled this chip (chipsEngine's `doubleDip` flag). */
  doubleDip: boolean;
}

/**
 * Which `banked` moves in `moves` have not been announced yet, keyed on the
 * chip's own `ms` (never on array position or length).
 *
 * `ms` is the one identity that survives a chip's whole life unchanged: it is
 * assigned once, by the fryer's ms allocator (useFryers.ts), carried verbatim
 * into the queued move, embedded verbatim in the synthetic pending reply
 * (chipsPending.ts's `withPending` builds the body from the SAME `ChipEntry`),
 * and embedded verbatim again in the real reply once the batch is submitted
 * (chipsBody.ts's `bankBatchBody` writes `${c.ms}:...`). A chip's `content_id`
 * changes across that pending -> confirmed swap (`pending:<queueId>` becomes a
 * real `sha256:...`) and so does its outcome for one tick if a settling twin
 * briefly overlaps it (`rejected-duplicate`) — `ms` is the only field that
 * does not, which is what makes it safe to key a once-only announcement on.
 */
export function newBankedMoves(moves: MoveResult[], announced: ReadonlySet<number>): BankedMove[] {
  const out: BankedMove[] = [];
  for (const m of moves) {
    if (m.outcome !== 'banked' || m.bits === undefined || m.crumbs === undefined) continue;
    if (announced.has(m.ms)) continue;
    out.push({ ms: m.ms, bits: m.bits, crumbs: m.crumbs, doubleDip: m.doubleDip === true });
  }
  return out;
}

/** One chip's actual, bowl-cap-true credit — see `actualGains`. */
export interface GainEvent {
  ms: number;
  bits: number;
  /** What the fold computed — before the cap, after any double dip. */
  notional: number;
  /** What the bowl actually gained once clamped to `bowlCap`. Never negative. */
  gained: number;
  /** Passed through from the fold's move record, for the celebration. */
  doubleDip: boolean;
}

/**
 * Replay the fold's own `Math.min(state.crumbs + crumbs, state.bowlCap)` clamp
 * across a run of newly-banked chips, so each one's reported gain is what the
 * bowl actually took rather than the notional payout a full bowl would clip.
 *
 * `beforeCrumbs` must be the bowl's real level immediately before the FIRST of
 * these chips landed — callers pass `projectedCrumbs` of the state as it stood
 * before this batch, which is exact absent any confirmed reply landing between
 * the two folds that neither decays nor is one of `moves` (there is no such
 * reply: every confirmed reply is parsed into a move). `bowlCap` is the
 * CURRENT state's cap; it can only ever have grown since these chips banked
 * (bowl-cap upgrades never shrink it), so using the latest value cannot
 * overstate a gain, only — in the vanishingly rare case of a cap upgrade
 * landing in the same instant as one of these chips — slightly understate one
 * that would in fact have had a hair more headroom at the exact moment it
 * banked. That is the safe direction for a module whose whole purpose is never
 * to overclaim.
 */
export function actualGains(beforeCrumbs: number, bowlCap: number, moves: BankedMove[]): GainEvent[] {
  let running = beforeCrumbs;
  const out: GainEvent[] = [];
  for (const m of moves) {
    const next = Math.min(running + m.crumbs, bowlCap);
    out.push({ ms: m.ms, bits: m.bits, notional: m.crumbs, gained: Math.max(0, next - running), doubleDip: m.doubleDip });
    running = next;
  }
  return out;
}

/** What a live, still-frying chip is worth — see `worthIfBankedNow`. */
export interface LiveWorth {
  /** What would actually land in the bowl if banked this instant. */
  worth: number;
  /** True when the bowl cap, not the chip, is the reason `worth` is small —
   *  the caller's cue to echo the bowl's own "at the rim" truth rather than
   *  let a modest number sit next to a nearly-golden chip looking like a bug. */
  capped: boolean;
}

/**
 * What banking THIS chip, right now, would actually add to the bowl.
 *
 * `null` below `BANK_MIN_BITS`: the fold would reject the bank outright (see
 * `foldChips`'s `rejected-bits`), so there is no honest number to show — only
 * "not yet". At or above it, `worth` is `payoutFor`'s real output clamped to
 * whatever headroom is left under the cap, exactly mirroring how a real bank
 * would land — never the raw payout a full bowl would clip.
 *
 * `atMs` is the wall clock, same as everywhere else display-only projects the
 * fold forward (`projectedCrumbs`) — congeal and the cap both move with time
 * even when the chip's own bits do not, which is real: `payoutFor` legitimately
 * returns a different number a minute later, and the caller should keep
 * calling this on a clock tick rather than only when `bits` changes.
 */
export function worthIfBankedNow(state: ChipsState, bits: number, atMs: number): LiveWorth | null {
  if (bits < BANK_MIN_BITS) return null;
  const notional = payoutFor(state, bits, atMs);
  const headroom = Math.max(0, state.bowlCap - projectedCrumbs(state, atMs));
  const worth = Math.min(notional, headroom);
  return { worth, capped: worth < notional };
}
