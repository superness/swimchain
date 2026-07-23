import type { ReactNode } from 'react';
import type { TutorialCardKind } from './tutorial';
import { COST_GROW, COST_CONTEST, CONTEST_DAMAGE, EPOCH_MOVES } from './lib/reefEngine';

// Plain-first teaching copy: every mechanic in plain words, flavor terms
// introduced in bold at the moment they're earned (see design spec §2).
// Each card carries a kicker (the moment's name) and, for the three main
// steps, a progress trail — so a newcomer knows this is short and going
// somewhere. The grow/tide copy points at the element that GLOWS below
// while its card is up (see the tut-glow class in App).
const STEP_OF: Record<TutorialCardKind, number | null> = {
  plant: 1,
  grow: 2,
  tide: 3,
  strike: null, // contextual tip, outside the numbered flow
};
const TOTAL_STEPS = 3;

const KICKER: Record<TutorialCardKind, string> = {
  plant: '🪸 Welcome to The Reef',
  grow: '🪸 Your reef begins',
  tide: '🌊 The tide',
  strike: '⚔ Reef tip',
};

const COPY: Record<TutorialCardKind, ReactNode> = {
  plant: (
    <>
      A territory game: grow a coral reef, keep it alive, outlast your rivals.{' '}
      <strong>Click any open square</strong> to plant your first coral.
    </>
  ),
  grow: (
    <>
      That coral is yours. It cost <strong>{COST_GROW} energy</strong> — the glowing bar
      below. Grow by clicking squares <strong>next to</strong> your coral (−{COST_GROW} each).
    </>
  ),
  tide: (
    <>
      Every <strong>{EPOCH_MOVES} moves</strong> — counting everyone's — the{' '}
      <strong>tide</strong> turns (the glowing meter below): all coral shrinks a little and
      your energy refills. Click your own coral to <strong>tend</strong> it — free, restores
      full health.
    </>
  ),
  strike: (
    <>
      Enemy coral on your border? Click it to <strong>strike</strong> (−{COST_CONTEST} energy,
      −{CONTEST_DAMAGE} to its health). Break it, then take the square.
    </>
  ),
};

/** A small inline coach-mark card, rendered in the slot above the board.
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
  const step = STEP_OF[kind];
  return (
    <div className={`tut-card tut-${kind}`} role="note">
      <span className="tut-shimmer" aria-hidden="true" />
      <div className="tut-kicker">
        <span className="tut-kicker-label">{KICKER[kind]}</span>
        {step !== null && (
          <span className="tut-dots" aria-label={`step ${step} of ${TOTAL_STEPS}`}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
              <span key={n} className={`tut-dot${n < step ? ' done' : ''}${n === step ? ' now' : ''}`} />
            ))}
          </span>
        )}
      </div>
      <div className="tut-body">{COPY[kind]}</div>
      <div className="tut-actions">
        <button className="btn primary" onClick={onGotIt}>Got it</button>
        {onSkip && <button className="link fine" onClick={onSkip}>Skip tutorial</button>}
      </div>
    </div>
  );
}
