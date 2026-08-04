/**
 * A DEEP BOSS, as a takeover — "chipping away at the table".
 *
 * The porcelain is a single enormous swing and its screen is built for that: one
 * bar, one moment, cracks spreading. This is the opposite fight and needs the
 * opposite screen — a healthbar you come back to, that remembers what you did
 * last time.
 *
 * Two rules carried over from the porcelain (design doc 3), because they are what
 * make a takeover survivable:
 *   - THE POT KEEPS TICKING BEHIND IT. Your real rack, under a spotlight.
 *     Nothing pauses, so time spent here is real and winning is the game you
 *     already know.
 *   - YOU CHOOSE WHEN IT STARTS. And, unlike the porcelain, when it STOPS: the
 *     damage is kept, so leaving is a pause and not a loss.
 */
import { compact } from './lib/format';
import { type DeepFight, finishes, blowsLeft } from './lib/deepBoss';
import { CritterArt } from './Crew';

/** Deliberately plain: a bar that fills. The porcelain gets the spectacle. */
function Health({ frac }: { frac: number }) {
  return (
    <div className="deep-hp" aria-hidden="true">
      <div className="deep-hp-fill" style={{ width: `${Math.min(100, frac * 100).toFixed(1)}%` }} />
      <div className="deep-hp-notches">
        {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
      </div>
    </div>
  );
}

export function DeepFightScreen({ fight, best, ready, onHit, onLeave, broke }: {
  fight: DeepFight;
  best: { index: number; worth: number; crackles: number } | null;
  ready: boolean;
  /** Feed the fattest basket to it. The only move this fight has. */
  onHit: (index: number) => void;
  onLeave: () => void;
  /** It gave. The band is behind you. */
  broke: boolean;
}) {
  const worth = best?.worth ?? 0;
  const willFinish = best !== null && finishes(fight, worth);
  const more = best !== null && worth > 0 ? blowsLeft(fight, worth) : Infinity;

  // `deep-screen`, never `deep`: the bare class collided with the Long Fry's
  // state modifier in Kitchen.tsx and turned a ×64 basket into a full-screen
  // blackout. See the note above `.deep-screen` in styles.css.
  return (
    <div className="deep-screen" role="dialog" aria-label={fight.label}>
      <div className={`deep-bed${broke ? ' through' : ''}`} data-band={fight.band} aria-hidden="true" />

      <div className="deep-words">
        {broke ? (
          <>
            <strong className="deep-through">{fight.flavour.boss.toUpperCase()} GIVES</strong>
            <span className="deep-line">{fight.flavour.gives}</span>
            {/* He has been quiet the whole descent. When he finally speaks it
                should not share a beat with anything else. */}
            {fight.flavour.scoop && (
              <span className="deep-scoop-said">scoop: &ldquo;{fight.flavour.scoop}&rdquo;</span>
            )}
          </>
        ) : (
          <>
            <span className="deep-small">you are chipping away at</span>
            {/* THE BOSS, not the stratum. "chipping away at The Floor" is a
                location; naming the thing you are hitting is a fight. */}
            <strong>{fight.flavour.boss}</strong>
            <span className="deep-where">in {fight.label.toLowerCase()}</span>
            {fight.done === 0 && (
              <p className="deep-arrive">{fight.flavour.arrive}</p>
            )}

            <Health frac={fight.frac} />
            <p className="deep-tally">
              <b>{compact(fight.done)}</b> of <b>{compact(fight.hp)}</b>
              {fight.done > 0 && <em>it remembers. so do you.</em>}
            </p>

            {best && (
              <p className="deep-best">
                your fattest basket would do <b>{compact(worth)}</b>
                {willFinish
                  ? <em className="deep-enough">that finishes it.</em>
                  : <em>
                      {more === Infinity
                        ? 'nothing, yet. let it cook.'
                        : `about ${more} more like it.`}
                    </em>}
              </p>
            )}

            <div className="deep-acts">
              {ready && best ? (
                <button type="button" className="deep-hit" onClick={() => onHit(best.index)}>
                  {willFinish ? 'finish it' : 'chip it'}
                </button>
              ) : (
                <p className="deep-cold">
                  you are holding a crisp. it is a table.
                </p>
              )}
              <button type="button" className="deep-leave" onClick={onLeave}>
                {fight.done > 0 ? 'come back to it' : 'not yet'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* scoop, further down each time, still saying nothing */}
      <span className="deep-scoop" aria-hidden="true"><CritterArt id="scoop" /></span>
    </div>
  );
}
