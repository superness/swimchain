import type { ReactNode } from 'react';
import type { TutorialCardKind } from './tutorial';
import { COST_GROW, COST_CONTEST, CONTEST_DAMAGE, EPOCH_MOVES } from './lib/reefEngine';

// Plain-first teaching copy: every mechanic in plain words, flavor terms
// introduced in bold at the moment they're earned (see design spec §2).
const COPY: Record<TutorialCardKind, ReactNode> = {
  plant: (
    <>
      <strong>Welcome to The Reef 🪸</strong> — a territory game: grow a coral reef, keep it
      alive, outlast your rivals. <strong>Click any open square</strong> to plant your first
      coral.
    </>
  ),
  grow: (
    <>
      That coral is yours — permanently. It cost <strong>{COST_GROW} energy</strong> (the bar
      below). Grow by clicking squares <strong>next to</strong> your coral (−{COST_GROW} each).
    </>
  ),
  tide: (
    <>
      Every <strong>{EPOCH_MOVES} moves</strong> — counting everyone's — the{' '}
      <strong>tide</strong> turns (meter below): all coral shrinks a little and your energy
      refills. Click your own coral to <strong>tend</strong> it — free, restores full health.
    </>
  ),
  strike: (
    <>
      Enemy coral on your border? Click it to <strong>strike</strong> (−{COST_CONTEST} energy,
      −{CONTEST_DAMAGE} to its health). Break it, then take the square.
    </>
  ),
};

/** A small inline coach-mark card, rendered next to the element it explains.
 *  Never a modal — the board stays fully clickable; clicking IS how you advance. */
export function TutorialCard({
  kind,
  onGotIt,
  onSkip,
}: {
  kind: TutorialCardKind;
  onGotIt: () => void;
  onSkip: (() => void) | null;
}) {
  return (
    <div className={`tut-card tut-${kind}`} role="note">
      <div className="tut-body">{COPY[kind]}</div>
      <div className="tut-actions">
        <button className="btn primary" onClick={onGotIt}>Got it</button>
        {onSkip && <button className="link fine" onClick={onSkip}>Skip tutorial</button>}
      </div>
    </div>
  );
}
