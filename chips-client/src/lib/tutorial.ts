/**
 * The opening tour — a video-game quest line for the first session.
 *
 * One objective at a time, each completed by the REAL GAME STATE — but
 * progress is a LATCHED, FORWARD-ONLY POINTER, never a live derivation.
 * The first cut derived the current step from current conditions and the
 * designer review caught both failure modes on a real first run: transient
 * conditions (a chip's pot, a crackle on the live basket) "completed" the
 * whole line during the connect wait, greeting a genuine stranger at 5/5 —
 * and completed quests un-latched (dipping at 5/5 resurrected quest 4,
 * forever). Now:
 *
 *   - `initialPointer` fast-forwards from DURABLE state only (moves on
 *     chain, owned jars, the tier) — never from live baskets.
 *   - a step's live condition is consulted ONLY while it is the active
 *     step; passing it advances the pointer, and the pointer never moves
 *     backwards. Tutorial.tsx persists it (`chips.tutorial.v1`).
 *
 * PURE MODULE: no React, no DOM, no storage.
 */
import type { ChipsState } from './chipsEngine';
import type { CookingChip } from './cooking';
import { UPGRADES, DIP_TIERS } from './chipsConst';
import { compact } from './format';

export type TutorialHighlight = 'basket' | 'shelf' | null;
/** invite = pulsing "touch this"; hold = calm "leave this alone" (quest 4's
 *  instruction is DON'T touch — the review flagged the mixed signal);
 *  wait = dimmed, the target exists but isn't usable yet. */
export type RingMode = 'invite' | 'hold' | 'wait';

const GUAC_AT = DIP_TIERS[1].minLifetime;

/** Cheapest jar a fresh player is working toward — the affordability bridge
 *  ("keep dipping — Seasoning I wants 10.0k"). */
export function cheapestOpenCost(state: ChipsState): number {
  let min = Infinity;
  for (const u of Object.values(UPGRADES)) if (!state.owned.has(u.key) && u.cost < min) min = u.cost;
  return Number.isFinite(min) ? min : 0;
}

export interface TutorialStep {
  id: string;
  /** The quest title — short, imperative, video-game voice. */
  title: string;
  /** Supporting line — dynamic, so it can carry live progress. */
  text(state: ChipsState, chips: CookingChip[]): string;
  highlight: TutorialHighlight;
  ringMode(state: ChipsState, chips: CookingChip[]): RingMode;
  /** Live pass condition — consulted ONLY while this step is active. */
  isDone(state: ChipsState, chips: CookingChip[]): boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'watch',
    title: 'Your chip is cooking',
    text: () => 'Watch the pot under it climb — tick, tick, tick. That value is yours the moment you take it.',
    highlight: 'basket',
    ringMode: () => 'hold',
    isDone: (_s, chips) => chips.some((c) => c.pot >= 750),
  },
  {
    id: 'dip',
    title: 'Dip it!',
    text: () => 'Click the chip to dip it — the whole pot lands in your bowl, times its multiplier.',
    highlight: 'basket',
    ringMode: () => 'invite',
    isDone: (s) => s.moves.some((m) => m.outcome === 'dipped' || m.outcome === 'banked'),
  },
  {
    id: 'buy',
    title: 'Hit the shelf',
    text: (s) => {
      const cost = cheapestOpenCost(s);
      return s.crumbs >= cost
        ? 'Spend your crumbs on a jar — Seasoning makes every tick fatter.'
        : `Keep dipping — the first jar wants ${compact(cost)} and you're at ${compact(s.crumbs)}.`;
    },
    highlight: 'shelf',
    ringMode: (s) => (s.crumbs >= cheapestOpenCost(s) ? 'invite' : 'wait'),
    isDone: (s) => s.owned.size >= 1,
  },
  {
    id: 'crackle',
    title: 'Hold one for a crackle',
    text: () => 'Let a chip keep cooking. When it CRACKLES, its multiplier doubles — nerve pays.',
    highlight: 'basket',
    ringMode: () => 'hold',
    isDone: (_s, chips) => chips.some((c) => c.crackles >= 1),
  },
  {
    id: 'guac',
    title: 'Dig into the Guacamole',
    text: (s) => `Keep dipping — the floor gives way ${GUAC_AT} chips down. You're ${Math.min(s.lifetimeChips, GUAC_AT)}/${GUAC_AT}.`,
    highlight: null,
    ringMode: () => 'invite',
    isDone: (s) => s.dipIndex >= 1,
  },
];

/**
 * Where a player's tour STARTS, derived from durable state only — chain
 * moves, owned jars, the tier. Live baskets are deliberately not consulted:
 * they are transient, and trusting them is exactly the first-run race the
 * review caught. Returns TUTORIAL_STEPS.length for "nothing to teach".
 */
export function initialPointer(state: ChipsState): number {
  if (state.dipIndex >= 1) return TUTORIAL_STEPS.length;          // been to guac: done
  if (state.owned.size >= 1) return 3;                            // has bought: crackle next
  if (state.moves.some((m) => m.outcome === 'dipped' || m.outcome === 'banked')) return 2; // has dipped: shelf next
  return 0;
}
