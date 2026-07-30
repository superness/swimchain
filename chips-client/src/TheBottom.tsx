/**
 * THE BOTTOM OF THE BOWL — the moment, not a page.
 *
 * It appears when you come up through the bottom, shows you everyone else who
 * has, takes your mark, and closes. There is no menu entry, no link, and no way
 * back: operator, "it should stay only an ephemeral moment for people who got
 * there to see at all."
 *
 * That is why this component has no "open" affordance anywhere in the app — App
 * mounts it on arrival and unmounts it when it is done. If you want to see the
 * wall again, the only route is to go down again.
 *
 * The wall is READ from the chain each time, so it is whoever has been there as
 * of this moment — not a cached list, and not something the client pretends to
 * know while offline.
 */
import { useState } from 'react';
import { WHO_MAX, sanitize, type Mark } from './lib/theBottom';
import { CritterArt } from './Crew';

export function TheBottom({ bowls, marks, loading, signed, onSign, onClose }: {
  /** Times you have come up through. Yours is the count you are signing with. */
  bowls: number;
  /** The wall, already collapsed to one line per person. */
  marks: Mark[];
  loading: boolean;
  /** Set once your mark is away, so the form does not offer to do it twice. */
  signed: boolean;
  onSign: (who: string) => void;
  onClose: () => void;
}) {
  const [who, setWho] = useState('');
  const clean = sanitize(who);

  return (
    <div className="bottom" role="dialog" aria-label="the bottom of the bowl">
      <div className="bottom-bed" aria-hidden="true" />

      <div className="bottom-words">
        <span className="bottom-small">you came up through the bottom</span>
        <strong>{bowls === 1 ? 'the first time' : `the ${ordinal(bowls)} time`}</strong>

        <p className="bottom-line">
          {/* No explanation of what this is. Anyone reading it worked for it. */}
          others have been here.
        </p>

        <ul className="bottom-wall">
          {loading && <li className="bottom-waiting">listening…</li>}
          {!loading && marks.length === 0 && (
            <li className="bottom-waiting">nobody yet. you are the first.</li>
          )}
          {marks.map((m) => (
            <li key={`${m.who}:${m.at}`}>
              <span className="bottom-who">{m.who}</span>
              <span className="bottom-times">{m.bowls === 1 ? 'once' : `x${m.bowls}`}</span>
            </li>
          ))}
        </ul>

        {signed ? (
          <p className="bottom-done">your mark is on it.</p>
        ) : (
          <div className="bottom-sign">
            <input
              type="text"
              value={who}
              maxLength={WHO_MAX}
              placeholder="who was here"
              aria-label="the name to leave"
              onChange={(e) => setWho(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && clean) onSign(clean); }}
            />
            <button type="button" disabled={!clean} onClick={() => onSign(clean)}>
              leave it
            </button>
          </div>
        )}

        <button type="button" className="bottom-close" onClick={onClose}>
          {signed ? 'go back up' : 'say nothing'}
        </button>
      </div>

      {/* he is already here. he has been here longer than you. */}
      <span className="bottom-scoop" aria-hidden="true"><CritterArt id="scoop" /></span>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
