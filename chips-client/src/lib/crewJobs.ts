/**
 * CREW JOBS — the cheese rat (risk) and the queso angel (reward).
 *
 * THE RAT: once recruited he periodically latches onto a fryer. While latched
 * he banks that fryer's ticks into his cheeks instead of the pot, and he EATS
 * ANY CRACKLE that lands there — even a blessing. Click him to shoo: he pays
 * out his hoard times a gorge bonus that grows the fatter he got (×1.0 fresh
 * → ×1.75 fully gorged). "It depends" tension by design: on a ×1 chip he is
 * pure profit (his ×1.75 beats the pot's ×1); on a cooked ×8 chip he is a
 * disaster (those ticks would have been multiplied). The Sous Chef refuses to
 * touch rats.
 *
 * THE ANGEL: occasionally begins to glow, and stays glowing until used.
 * Click her → she blesses one fryer with a GUARANTEED CRACKLE on its next
 * tick. The skill is saving her for a fat pot: a forced crackle is worth the
 * whole expected wait at that level, which doubles per rung.
 *
 * All client policy — the rat's payout rides the ordinary self-declared
 * `dip <amount>` verb, the blessing just moves a tick the clock would have
 * granted eventually. No consensus surface anywhere in this file.
 *
 * PURE MODULE: no React, no timers, injected RNG — the driver is App.tsx's
 * cook-events callback, which runs exactly once per cooking tick.
 */
import { TICK_MS } from './cooking';

/** Both jobs unlock with their critters — the Queso breakthrough. */
export const JOBS_MIN_DIP_INDEX = 3;

/** Expected seconds between latches while the rat is loose. */
export const RAT_LATCH_EXPECT_S = 150;
/** Seconds of latching to reach the full gorge bonus. */
export const RAT_FULL_GORGE_S = 120;
/** The gorge bonus climbs ×1.0 → ×(1 + RAT_GORGE_MAX). */
export const RAT_GORGE_MAX = 0.75;

/** Expected seconds between glows once the angel is idle again. */
export const ANGEL_GLOW_EXPECT_S = 240;
/** Cooldown after a blessing before she can start glowing again. */
export const ANGEL_COOLDOWN_S = 180;

export interface RatState {
  /** Fryer index he is latched to, or null while loose. */
  latched: number | null;
  /** Crumbs siphoned from that fryer's ticks since latching. */
  hoard: number;
  latchedTicks: number;
  /** Crackles he has eaten this latch (visual outrage counter). */
  eaten: number;
}

export interface AngelState {
  glowing: boolean;
  cooldownTicks: number;
}

export const freshRat = (): RatState => ({ latched: null, hoard: 0, latchedTicks: 0, eaten: 0 });
export const freshAngel = (): AngelState => ({ glowing: false, cooldownTicks: 0 });

const perTickP = (expectS: number): number => TICK_MS / 1000 / expectS;

/**
 * One cooking tick of rat life. Loose → maybe latch a random fryer; latched →
 * he digs in one tick deeper (the hoard itself grows via `ratAbsorb`, fed by
 * the cooking engine's diverted-gain events). He never leaves on his own:
 * ignoring him is the punishment — he keeps eating crackles until shooed.
 */
export function ratTick(rat: RatState, fryerCount: number, rng: () => number): RatState {
  if (rat.latched !== null) {
    // A shrunken rack (never happens live, but cheap to be exact about)
    // drops him loose rather than leaving him latched to a missing fryer.
    if (rat.latched >= fryerCount) return freshRat();
    return { ...rat, latchedTicks: rat.latchedTicks + 1 };
  }
  if (fryerCount <= 0) return rat;
  if (rng() < perTickP(RAT_LATCH_EXPECT_S)) {
    return { latched: Math.min(fryerCount - 1, Math.floor(rng() * fryerCount)), hoard: 0, latchedTicks: 0, eaten: 0 };
  }
  return rat;
}

/** A diverted tick lands in his cheeks. */
export function ratAbsorb(rat: RatState, amount: number): RatState {
  return rat.latched === null ? rat : { ...rat, hoard: rat.hoard + Math.max(0, amount) };
}

/** He ate a crackle. He is not sorry. */
export function ratAte(rat: RatState): RatState {
  return rat.latched === null ? rat : { ...rat, eaten: rat.eaten + 1 };
}

/** ×1.0 the moment he latches, ×(1+RAT_GORGE_MAX) once fully gorged. */
export function gorgeOf(rat: RatState): number {
  return 1 + RAT_GORGE_MAX * Math.min(1, (rat.latchedTicks * TICK_MS) / 1000 / RAT_FULL_GORGE_S);
}

/** Shoo him: the hoard pays out ×gorge and he scurries back into the queso. */
export function shooRat(rat: RatState): { payout: number; rat: RatState } {
  return { payout: Math.floor(rat.hoard * gorgeOf(rat)), rat: freshRat() };
}

/** One cooking tick of angel life: cooldown burns down, then she may glow.
 *  A glow PERSISTS until spent — the skill is in when you spend it. */
export function angelTick(angel: AngelState, rng: () => number): AngelState {
  if (angel.glowing) return angel;
  if (angel.cooldownTicks > 0) return { ...angel, cooldownTicks: angel.cooldownTicks - 1 };
  if (rng() < perTickP(ANGEL_GLOW_EXPECT_S)) return { ...angel, glowing: true };
  return angel;
}

/** Spend the glow on a blessing; she rests for ANGEL_COOLDOWN_S. */
export function spendBlessing(_angel: AngelState): AngelState {
  return { glowing: false, cooldownTicks: Math.round((ANGEL_COOLDOWN_S * 1000) / TICK_MS) };
}

/* ══ THE DEEP JOBS ═══════════════════════════════════════════════════════
   Past Queso nothing new ever HAPPENED — every deeper critter was scenery
   with a price tag, which the operator named exactly: "this is creating a
   gap in interactions." Four mechanics, one per deep character, each a
   different verb:

     wing (Buffalo)      — attention:  a basket is worth double while it sits there
     committee (Seven)   — a decision: lobby a vote, or don't, and live with it
     hermit (Buffalo)    — a gamble:   hand over a chip, maybe get it back fat
     oracle (Fondue)     — a promise:  dip the basket it names, be paid for obeying

   All of them pay through the ordinary self-declared `dip <amount>` verb or
   through tick timing, so NOTHING here touches the fold.
   ═══════════════════════════════════════════════════════════════════════ */

/** Each job unlocks with its character's layer. */
export const JOB_LAYER = { wing: 5, committee: 4, hermit: 5, oracle: 6 } as const;

/* ── the wing with no bird: it sits where it hurts ─────────────────────── */

export const WING_HOP_EXPECT_S = 45;
export const WING_PAYS = 2;

export interface WingState {
  /** Basket it is perched on, or null before its first hop. */
  at: number | null;
  /** Hop timestamp — keys the landing animation. */
  since: number;
}

export const freshWing = (): WingState => ({ at: null, since: 0 });

/** It hops on its own schedule and never leaves — the only "skill" is
 *  noticing where it went, which is the whole point of the mechanic. */
export function wingTick(w: WingState, fryerCount: number, now: number, rng: () => number): WingState {
  if (fryerCount <= 0) return w.at === null ? w : freshWing();
  if (w.at !== null && w.at >= fryerCount) return { at: fryerCount - 1, since: now };
  if (w.at === null) return { at: Math.min(fryerCount - 1, Math.floor(rng() * fryerCount)), since: now };
  if (rng() >= perTickP(WING_HOP_EXPECT_S)) return w;
  // Never hop onto the basket it is already on — a hop nobody can see is a
  // hop that reads as the mechanic being broken.
  if (fryerCount === 1) return w;
  let next = Math.floor(rng() * (fryerCount - 1));
  if (next >= w.at) next += 1;
  return { at: next, since: now };
}

/* ── the committee: a motion regarding your fryers ─────────────────────── */

export const VOTE_EXPECT_S = 300;
/** How long the floor stays open for lobbying. */
export const VOTE_OPEN_S = 25;
/** How long a carried motion fattens every tick. */
export const MOTION_S = 90;
export const MOTION_BONUS = 0.5;
/** Lobbying is not a formality: the olives abstain either way. */
export const LOBBY_CARRIES = 0.65;

export type VotePhase = 'idle' | 'open' | 'carried' | 'failed';

export interface VoteState {
  phase: VotePhase;
  /** Ticks remaining in the current phase. */
  ticks: number;
  /** True once the player has lobbied this vote — you get one. */
  lobbied: boolean;
}

export const freshVote = (): VoteState => ({ phase: 'idle', ticks: 0, lobbied: false });
const secsToTicks = (s: number): number => Math.max(1, Math.round((s * 1000) / TICK_MS));

/**
 * Votes call themselves, stay open briefly, then resolve. An UNLOBBIED vote
 * fails: ignoring the committee is a choice with a cost, which is what makes
 * answering one feel like anything at all.
 */
export function voteTick(v: VoteState, rng: () => number): VoteState {
  if (v.phase === 'idle') {
    if (rng() >= perTickP(VOTE_EXPECT_S)) return v;
    return { phase: 'open', ticks: secsToTicks(VOTE_OPEN_S), lobbied: false };
  }
  if (v.ticks > 1) return { ...v, ticks: v.ticks - 1 };
  if (v.phase === 'open') {
    // The floor closes. Only a lobbied motion can carry, and even then the
    // beans want more time sometimes.
    const carries = v.lobbied && rng() < LOBBY_CARRIES;
    return { phase: carries ? 'carried' : 'failed', ticks: secsToTicks(carries ? MOTION_S : 6), lobbied: v.lobbied };
  }
  return freshVote();
}

/** Lobby the open motion. One per vote — the committee is not lobbied twice. */
export function lobby(v: VoteState): VoteState {
  return v.phase === 'open' && !v.lobbied ? { ...v, lobbied: true } : v;
}

/** Every tick is this much fatter while a motion is carried. */
export const motionBonus = (v: VoteState): number => (v.phase === 'carried' ? 1 + MOTION_BONUS : 1);

/* ── the blue cheese hermit: he takes it down, he brings it back ────────── */

export const HERMIT_OFFER_EXPECT_S = 420;
/** How long he keeps a chip before returning (or not returning) it. */
export const HERMIT_HOLD_S = 120;
export const HERMIT_RETURNS = 3;
/** He gets hungry. You were told there were outcomes. */
export const HERMIT_EATS = 0.25;

export type HermitPhase = 'idle' | 'offering' | 'holding' | 'returned' | 'ate';

export interface HermitState {
  phase: HermitPhase;
  ticks: number;
  /** Crumbs he is holding (the fed chip's worth). */
  held: number;
  /** What he handed back — read by the app to pay it out. */
  payout: number;
}

export const freshHermit = (): HermitState => ({ phase: 'idle', ticks: 0, held: 0, payout: 0 });

export function hermitTick(h: HermitState, rng: () => number): HermitState {
  if (h.phase === 'idle') {
    if (rng() >= perTickP(HERMIT_OFFER_EXPECT_S)) return h;
    return { ...freshHermit(), phase: 'offering', ticks: secsToTicks(40) };
  }
  if (h.ticks > 1) return { ...h, ticks: h.ticks - 1 };
  if (h.phase === 'offering') return freshHermit();          // offer lapses
  if (h.phase === 'holding') {
    if (rng() < HERMIT_EATS) return { phase: 'ate', ticks: secsToTicks(8), held: 0, payout: 0 };
    return { phase: 'returned', ticks: secsToTicks(10), held: 0, payout: h.held * HERMIT_RETURNS };
  }
  return freshHermit();                                       // returned/ate clear
}

/** Hand him a chip worth `worth`. Only while he is actually offering. */
export function giveHermit(h: HermitState, worth: number): HermitState {
  if (h.phase !== 'offering' || worth <= 0) return h;
  return { phase: 'holding', ticks: secsToTicks(HERMIT_HOLD_S), held: worth, payout: 0 };
}

/* ── the fondue oracle: the strings do not lie ─────────────────────────── */

export const PROPHECY_EXPECT_S = 240;
export const PROPHECY_WINDOW_S = 60;
export const PROPHECY_PAYS = 1.5;

export interface OracleState {
  /** The basket the strings are pointing at, or null. */
  at: number | null;
  ticks: number;
}

export const freshOracle = (): OracleState => ({ at: null, ticks: 0 });

export function oracleTick(o: OracleState, fryerCount: number, rng: () => number): OracleState {
  if (o.at !== null) {
    if (o.at >= fryerCount) return freshOracle();
    return o.ticks > 1 ? { ...o, ticks: o.ticks - 1 } : freshOracle();
  }
  if (fryerCount <= 0 || rng() >= perTickP(PROPHECY_EXPECT_S)) return o;
  return { at: Math.min(fryerCount - 1, Math.floor(rng() * fryerCount)), ticks: secsToTicks(PROPHECY_WINDOW_S) };
}

/**
 * What a dip on `index` is worth right now, given who is watching it. The
 * wing and the oracle STACK — a prophesied basket with a wing on it is the
 * best moment in the game, and it should be.
 */
export function dipBonusFor(index: number, wing: WingState, oracle: OracleState): number {
  let mult = 1;
  if (wing.at === index) mult *= WING_PAYS;
  if (oracle.at === index) mult *= PROPHECY_PAYS;
  return mult;
}
