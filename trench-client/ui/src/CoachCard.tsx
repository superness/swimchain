import type { ReactNode } from 'react';
import { CLAIM_MIN_SPACING } from './lib/trenchEngine';

/**
 * Show-don't-tell coach cards (spec §4): one slot floats over the map's bottom
 * edge (see App.tsx's `.tut-float`), never a modal — the map stays fully
 * clickable underneath. Each kind is shown at most once per browser, keyed in
 * localStorage; a corrupt or absent store just means "skip, never nag" (the
 * same defensive shape as reef/chess's tutorial flags).
 */
export type CoachKind = 'found' | 'lantern' | 'expedition';

const STORAGE_PREFIX = 'trench-coach:';

export function hasSeenCoach(kind: CoachKind): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + kind) === '1';
  } catch {
    return true; // storage-less or corrupt: skip rather than nag every visit
  }
}

export function markCoachSeen(kind: CoachKind): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + kind, '1');
  } catch {
    /* storage unavailable — the card will just show again next visit */
  }
}

const KICKER: Record<CoachKind, string> = {
  found: '🏮 Founding a homestead',
  lantern: '🏮 Your lantern',
  expedition: '🌊 Expeditions',
};

// Plain-first, diegetic copy (spec §4's "Diegetic-first" rule — the game
// speaks for itself; no protocol vocabulary in gameplay copy). Every number
// interpolated from the engine, never a literal.
const COPY: Record<CoachKind, ReactNode> = {
  found: (
    <>
      The seafloor is one shared world. Pick dark ground at least{' '}
      <strong>{CLAIM_MIN_SPACING} units</strong> from any neighbor.
    </>
  ),
  lantern: (
    <>
      Your lantern burns while The Trench runs. <strong>LIT</strong> farms grow fastest; go dark
      and the abyss advances.
    </>
  ),
  expedition: (
    <>
      Explorers carry light — every visit keeps a neighbor's claim from fading into the dark.
    </>
  ),
};

/** A small inline coach-mark card, rendered in the slot floating over the map.
 *  Never a modal — the map stays fully interactive; clicking elsewhere doesn't
 *  dismiss it, only "Got it" does (matches reef/chess's tut-card idiom). */
export function CoachCard({ kind, onGotIt }: { kind: CoachKind; onGotIt: () => void }) {
  return (
    <div className={`tut-card coach-${kind}`} role="note">
      <span className="tut-shimmer" aria-hidden="true" />
      <div className="tut-kicker">
        <span className="tut-kicker-label">{KICKER[kind]}</span>
      </div>
      <div className="tut-body">{COPY[kind]}</div>
      <div className="tut-actions">
        <button className="btn primary" onClick={onGotIt}>
          Got it
        </button>
      </div>
    </div>
  );
}
