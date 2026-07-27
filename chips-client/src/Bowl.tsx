/**
 * THE BOTTOM OF THE BOWL — the game's twist and its loop.
 *
 * You strike porcelain at Queso, long before the deep shelves exist. The
 * reveal lands in four beats and then makes an offer: tip the whole bowl
 * back over, lose everything, keep OLD SALT. It is offered EARLY on purpose
 * (operator: "offer it BEFORE the best upgrades can be taken so users would
 * want to perhaps restart early") — with sqrt-shaped salt, two short runs
 * beat one long one, so looping is a strategy and not a consolation.
 *
 * Copy is verbatim from the comedy pass. Do not paraphrase it.
 */
import { useEffect, useState } from 'react';
import { compact } from './lib/format';
import { CritterArt } from './Crew';

/** The four beats of the reveal, one at a time. */
export const DISCOVERY = [
  'the chip stops. the dip does not end here — but something does.',
  'you clear the queso. there is a surface underneath. it is smooth. it is cold.',
  'it is porcelain. it goes on in every direction and it curves. all of it curves.',
  'you were never digging down. you were emptying a bowl. someone set it out for you.',
] as const;

/** Stamped on the underside, which you can only read from down here. */
export const MAKERS_MARK = 'DISHWASHER SAFE. MICROWAVE SAFE. NOT SAFE.';

const BEAT_MS = 2600;

/**
 * The reveal: one line at a time over the dig floor, then the mark, then the
 * offer. Dismissing it does NOT tip — the bowl stays struck and the offer
 * lives on the counter from then on, so nobody loses a run to a stray tap.
 */
export function BowlReveal({ salt, onTip, onClose }: {
  salt: number; onTip: () => void; onClose: () => void;
}) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (beat >= DISCOVERY.length) return;
    const t = window.setTimeout(() => setBeat((b) => b + 1), BEAT_MS);
    return () => window.clearTimeout(t);
  }, [beat]);
  const done = beat >= DISCOVERY.length;

  return (
    <div className="bowl-reveal" role="dialog" aria-label="the bottom of the bowl">
      <div className="bowl-porcelain" aria-hidden="true" />
      <div className="bowl-copy">
        {DISCOVERY.slice(0, Math.min(beat + 1, DISCOVERY.length)).map((line, i) => (
          <p key={i} className={`bowl-beat${i === DISCOVERY.length - 1 ? ' final' : ''}`}>{line}</p>
        ))}
        {done && (
          <>
            <p className="bowl-mark">{MAKERS_MARK}</p>
            <div className="bowl-offer">
              <p className="bowl-offer-line">tip the bowl. everything goes back in. you keep what stuck to you.</p>
              <p className="bowl-salt">
                this run is worth <strong>{compact(salt)}</strong> old salt
                <em>every grain makes every tick fatter, forever</em>
              </p>
              <div className="bowl-buttons">
                <button type="button" className="bowl-tip" onClick={onTip}>tip the bowl</button>
                <button type="button" className="bowl-later" onClick={onClose}>keep digging</button>
              </div>
              <p className="bowl-fine">
                the crew stays. the crumbs don&apos;t. you can tip whenever you like — it will be here.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** What the crew makes of the floor, once you've struck it. */
export const BOWL_LINES: Record<string, string> = {
  scoop: "a bowl. huh. i've been under this table my whole life and nobody mentioned the table.",
  rat: 'i knew there was a floor. i pay no rent on it. dip it again.',
  angel: 'the bowl has been witnessed. you have been witnessed inside the bowl.',
  firstchip: 'i was dipped when it was full. i felt it go down. i said nothing because you had not arrived yet.',
};

/** The start of a new loop. */
export const WELCOME_BACK = [
  'scoop is at the door. he kept your stool. nobody sat in it. he made sure.',
  "back at the salsa. it's shallower than you remember. that's not the salsa's doing.",
  "the fryer's already warm. somebody's been running it. nobody's saying who.",
  "scoop: 'you look salty. good. that's the good kind of salty.'",
  'everything is where you left it, except lower down, and it remembers you.',
] as const;

/** The tip ceremony: the world pours back in and the salt stays. */
export function TipCeremony({ salt, total }: { salt: number; total: number }) {
  return (
    <div className="tip-ceremony" role="status">
      <div className="tip-flood" aria-hidden="true" />
      <div className="tip-words">
        <span className="tip-small">the bowl goes back over</span>
        <strong>+{compact(salt)} OLD SALT</strong>
        <span className="tip-total">{compact(total)} in all</span>
        <span className="tip-line">salt that has been through a bowl. it does not dissolve and it does not forget.</span>
      </div>
    </div>
  );
}

/** The standing offer once the bowl has been struck — lives on the counter. */
export function BowlTicket({ salt, onOpen }: { salt: number; onOpen: () => void }) {
  return (
    <button type="button" className="bowl-ticket" onClick={onOpen}>
      <span className="bowl-ticket-face" aria-hidden="true"><CritterArt id="firstchip" /></span>
      <span className="bowl-ticket-copy">
        <strong>the bottom of the bowl</strong>
        <em>tip it for {compact(salt)} old salt</em>
      </span>
    </button>
  );
}
