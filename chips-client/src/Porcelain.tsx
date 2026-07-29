/**
 * THE PORCELAIN — the descent's first boss, as a takeover.
 *
 * Modal by operator ruling, and it earns it: "the bowl cracking above you" is
 * an image, where a background condition would only ever be a sentence in a
 * toast. Two rules keep a takeover from killing an actively-played game
 * (design doc §3):
 *
 *   - THE POT KEEPS TICKING BEHIND IT. This is your real rack under a
 *     spotlight, not a minigame with borrowed numbers. Nothing pauses, so
 *     losing costs real time and winning is the game you already know.
 *   - YOU CHOOSE WHEN IT STARTS. Entering with cold pots is a worse decision
 *     than the game should force on you, so the setup is part of the fight.
 *
 * The condition teaches the game: one dip must beat everything else banked
 * this run, and banking raises that bar. Grinding cannot crack it. Only
 * parking a chip can.
 */
import { compact } from './lib/format';
import { crackProgress, type Readiness } from './lib/porcelain';
import { CritterArt } from './Crew';

/** Hairlines, drawn from the same number the rule uses. */
function Cracks({ p }: { p: number }) {
  // Eight fissures spreading from the centre; each appears in turn as the
  // dip's worth closes on the bar, so the drawing IS the progress bar.
  const lines = [
    'M50 50 L18 8', 'M50 50 L82 6', 'M50 50 L96 44', 'M50 50 L88 92',
    'M50 50 L46 98', 'M50 50 L8 88', 'M50 50 L2 52', 'M50 50 L30 24',
  ];
  return (
    <svg className="porc-cracks" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
      {lines.map((d, i) => {
        const at = (i + 1) / lines.length;
        const on = p >= at * 0.92;
        return (
          <path
            key={i} d={d}
            style={{ opacity: on ? 1 : Math.max(0, (p - at * 0.55) * 3), strokeWidth: 0.5 + p * 1.2 }}
          />
        );
      })}
    </svg>
  );
}

export function PorcelainFight({ ready, bar, best, onDip, onLeave, broken }: {
  ready: Readiness['ready'];
  bar: number;
  best: Readiness['best'];
  /** Dip the fattest basket — the only move this fight has. */
  onDip: (index: number) => void;
  onLeave: () => void;
  /** It went through. The bowl is open and the descent has begun. */
  broken: boolean;
}) {
  const worth = best?.worth ?? 0;
  const p = crackProgress(worth, bar / 1000);   // bar is crumbs; crackProgress takes chips
  const short = Math.max(0, bar - worth);

  return (
    <div className="porc" role="dialog" aria-label="the porcelain">
      <div className={`porc-bowl${broken ? ' through' : ''}`} aria-hidden="true">
        <Cracks p={broken ? 1 : p} />
      </div>

      <div className="porc-words">
        {broken ? (
          <>
            <strong className="porc-through">THE BOWL GOES</strong>
            <span className="porc-line">there is a surface underneath. it is not porcelain.</span>
          </>
        ) : (
          <>
            <span className="porc-small">the bowl, from underneath</span>
            <strong>{compact(bar)}</strong>
            <span className="porc-line">
              everything you have banked this run. one dip has to beat it —
              and every crumb you cash makes it heavier.
            </span>

            {best && (
              <p className="porc-best">
                your fattest basket is worth <b>{compact(worth)}</b>
                {short > 0
                  ? <em>{compact(short)} short. stop dipping. let it cook.</em>
                  : <em className="porc-enough">that will go through.</em>}
              </p>
            )}

            <div className="porc-acts">
              {ready && best ? (
                <button type="button" className="porc-hit" onClick={() => onDip(best.index)}>
                  swing it
                </button>
              ) : (
                <p className="porc-cold">
                  nothing happens. it is a bowl. you are holding a crisp.
                </p>
              )}
              <button type="button" className="porc-leave" onClick={onLeave}>not yet</button>
            </div>
          </>
        )}
      </div>

      {/* scoop is already down here, and says nothing at all */}
      <span className="porc-scoop" aria-hidden="true"><CritterArt id="scoop" /></span>
    </div>
  );
}
