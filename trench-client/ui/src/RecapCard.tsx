import { useEffect } from 'react';
import { INTEGRITY_MAX, LIT_MIN, type StructureKind } from './lib/trenchEngine';
import type { RecapFacts } from './lib/awayRecap';

/** Half-unit display, the per-file one-liner idiom (HowToPlay.tsx, App.tsx). */
const half = (n: number): string => (n % 2 === 0 ? String(n / 2) : (n / 2).toFixed(1));

const KIND_NAME: Record<StructureKind, string> = {
  farm: 'kelp farm',
  storehouse: 'storehouse',
  beacon: 'beacon',
};

/** "While you were gone" homecoming card (spec §4): what the darkness cost,
 *  and how to climb back. Rendered as a full overlay — a session-start
 *  moment, not an in-play coach mark. Every dismissal path (button, Escape,
 *  backdrop) runs the SAME `onDismiss`, which is what stamps the once-per-day
 *  gate and the mourned-ruin set. */
export function RecapCard({ facts, onDismiss }: { facts: RecapFacts; onDismiss: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const gone = facts.daysAway >= 1;
  return (
    <div className="overlay" onClick={onDismiss}>
      <div className="help-panel recap-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{gone ? '🏮 While you were gone' : '🏮 Your lantern is dark'}</h2>
        <p>
          {gone
            ? `${facts.daysAway} ${facts.daysAway === 1 ? 'day' : 'days'} in the dark — your lantern burns only while The Trench runs.`
            : 'It burns only while The Trench runs — and it went out.'}
        </p>
        {(facts.newRuins.length > 0 || facts.damaged.length > 0) && (
          <ul className="recap-list">
            {facts.newRuins.map((ru) => (
              <li key={`r${ru.idx}`} className="recap-ruin">
                The abyss took your {KIND_NAME[ru.kind]}.
              </li>
            ))}
            {facts.damaged.map((d) => (
              <li key={`d${d.idx}`}>
                {KIND_NAME[d.kind]} — {half(d.integrity)} of {half(INTEGRITY_MAX)} health
              </li>
            ))}
          </ul>
        )}
        <p className="fine">
          {facts.hbWeek} of {LIT_MIN} beats this week. Leave The Trench running to climb back to LIT.
        </p>
        <button className="btn primary" onClick={onDismiss}>
          Light it again
        </button>
      </div>
    </div>
  );
}
