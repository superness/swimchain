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
import { SALT_TICK_BONUS } from './lib/chipsEngine';
import { CritterArt } from './Crew';

/** The four beats of the reveal. Beat two names the layer YOU are standing
 *  in — it read "you clear the queso" at the Abyssal Dip, which is a
 *  different layer four rungs up (designer review). */
export function discoveryFor(layerLabel: string): string[] {
  return [
    'the chip stops. the dip does not end here — but something does.',
    `you clear the ${layerLabel.toLowerCase()}. there is a surface underneath. it is smooth. it is cold.`,
    'it is porcelain. it goes on in every direction and it curves. all of it curves.',
    'you were never digging down. you were emptying a bowl. someone set it out for you.',
  ];
}

/** Stamped on the underside, which you can only read from down here. */
export const MAKERS_MARK = 'DISHWASHER SAFE. MICROWAVE SAFE. NOT SAFE.';

const BEAT_MS = 2600;

/**
 * The reveal: one line at a time over the dig floor, then the mark, then the
 * offer. Dismissing it does NOT tip — the bowl stays struck and the offer
 * lives on the counter from then on, so nobody loses a run to a stray tap.
 */
export function BowlReveal({ salt, layerLabel, jarCount, depth, onTip, onClose }: {
  salt: number; layerLabel: string; jarCount: number; depth: string;
  onTip: () => void; onClose: () => void;
}) {
  const DISCOVERY = discoveryFor(layerLabel);
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

              {/* THE LEDGER. The review refused to click this and was right
                  to: the offer stated its cost only in metaphor, and the
                  destructive button was the bright one. It is now an
                  itemised, plain-language before/after, and "keep digging"
                  is the primary. */}
              <div className="bowl-ledger">
                <div className="ledger-col lose">
                  <span className="ledger-head">you lose</span>
                  <ul>
                    <li>every crumb in the bowl</li>
                    <li>all {jarCount} {jarCount === 1 ? 'jar' : 'jars'} you have bought</li>
                    <li>your depth — back to Plain Salsa from {depth}</li>
                  </ul>
                </div>
                <div className="ledger-col keep">
                  <span className="ledger-head">you keep</span>
                  <ul>
                    <li><strong>{compact(salt)} old salt</strong>, permanently</li>
                    <li>+{Math.round(salt * SALT_TICK_BONUS * 100)}% on every tick, forever, in every run after this</li>
                    <li>the whole crew — they stay</li>
                  </ul>
                </div>
              </div>

              <div className="bowl-buttons">
                <button type="button" className="bowl-later primary" onClick={onClose}>keep digging</button>
                <button type="button" className="bowl-tip danger" onClick={onTip} disabled={salt <= 0}>
                  {salt > 0 ? 'tip the bowl' : 'not deep enough yet'}
                </button>
              </div>
              <p className="bowl-fine">
                nothing is lost by waiting — the floor is struck, and this offer will be here whenever you want it.
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
export function TipCeremony({ salt, total, taken }: { salt: number; total: number; taken: number }) {
  return (
    <div className="tip-ceremony" role="status">
      <div className="tip-flood" aria-hidden="true" />
      <div className="tip-words">
        <span className="tip-small">the bowl goes back over</span>
        <strong>+{compact(salt)} OLD SALT</strong>
        <span className="tip-total">{compact(total)} in all</span>
        {/* WHAT THE OIL STILL HELD, NAMED. Tipping empties the fryers, and
            before this the chips simply vanished with no line anywhere the
            player could see — the acknowledgement was a speech bubble fired
            while the ceremony had the crew row hidden, then overwritten
            before the hush lifted, so it had literally never been visible
            once (operator: "scoop is not acknowledging my first chip that he
            eats (I get no points) ... the user is just annoyed and confused
            and thinks it is broken").

            It belongs HERE and not in a bubble: this overlay is the only
            thing on screen at the moment the chips go, so it is the only
            place the explanation cannot be missed. */}
        {taken > 0 && (
          <span className="tip-taken">
            scoop took what was still in the oil — {compact(taken)}.
            <em>&ldquo;thanks for the chip. that is the one i needed.&rdquo;</em>
          </span>
        )}
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
