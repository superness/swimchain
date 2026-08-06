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
import { SALT_TICK_BONUS, type ChipsState } from './lib/chipsEngine';
import { tipReceipt, tipCommitReady, TIP_ARM_DEAD_MS } from './lib/tipLedger';
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
 *
 * IT TAKES THE WHOLE STATE, not a handful of pre-chewed numbers. The old
 * signature was `salt, jarCount, depth`, and the two things that went wrong on
 * 2026-08-04 are both visible in that list: the losses it did NOT ask for
 * (`broken`, `lifetimeChips`, `bossDamage`) could not be shown, and `jarCount`
 * was computed by the caller and so never noticed the keep-picker four lines
 * below it. `tipReceipt` derives all of it from the same fields the fold's tip
 * verb clears, here, where the picker's state is — see lib/tipLedger.ts.
 */
export function BowlReveal({ state, crumbs, layerLabel, depth, keepable, onTip, onClose }: {
  state: ChipsState;
  /** Crumbs as the player is LOOKING at them — sog-projected, not
   *  `state.crumbs`. See TipReceipt.crumbs for why the difference matters. */
  crumbs: number;
  layerLabel: string; depth: string;
  /** THE CRACK: jars this bowl could carry through. Empty without the ability,
   *  which is also the whole UI — no picker, no mention, nothing to explain. */
  keepable: { key: string; label: string }[];
  onTip: (keep?: string) => void; onClose: () => void;
}) {
  const DISCOVERY = discoveryFor(layerLabel);
  const [beat, setBeat] = useState(0);
  /** Which jar THE CRACK carries. Undefined = take nothing through, which
   *  stays the default: the ability lets you keep one, it does not oblige you. */
  const [keep, setKeep] = useState<string | undefined>(undefined);
  /** When the destructive button was armed, null while it is not. */
  const [armedAt, setArmedAt] = useState<number | null>(null);
  /** Whether the armed receipt has been up long enough to commit. */
  const [readable, setReadable] = useState(false);
  useEffect(() => {
    if (beat >= DISCOVERY.length) return;
    const t = window.setTimeout(() => setBeat((b) => b + 1), BEAT_MS);
    return () => window.clearTimeout(t);
  }, [beat]);
  /* THE ARM DIES WHEN ITS NUMBERS DO. Changing what you carry through changes
     the receipt you were shown, so the agreement to that receipt is void and
     has to be given again. */
  useEffect(() => { setArmedAt(null); }, [keep]);
  useEffect(() => {
    setReadable(false);
    if (armedAt === null) return;
    const t = window.setTimeout(() => setReadable(true), TIP_ARM_DEAD_MS);
    return () => window.clearTimeout(t);
  }, [armedAt]);
  const done = beat >= DISCOVERY.length;

  const r = tipReceipt(state, crumbs, keep, depth);
  const armed = armedAt !== null;

  function commit(): void {
    // `disabled` is a paint: a tap already travelling when the attribute lifts
    // still dispatches, and on a phone that is precisely the tap this exists
    // to refuse. The pure guard is the rule (lib/tipLedger.ts).
    if (!tipCommitReady(armedAt, Date.now())) return;
    onTip(keep);
  }

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
                  destructive button was the bright one. So it became an
                  itemised before/after with "keep digging" as the primary —
                  and it was STILL not enough. On 2026-08-04 the operator
                  tipped twelve times on one table and was surprised every
                  time, once flatly "i did not tip".

                  Two reasons:

                  1. It stated three losses in words, and the tip verb clears
                     rather more than three. `broken` was never mentioned, and
                     losing it is the "reset to 0 no upgrades" report we spent
                     an hour chasing — you re-break the porcelain from the top.
                  2. "all N jars you have bought" sat four lines above a picker
                     that saves one, and never moved when it was used. All
                     twelve tips on chain carry a keep, so that line was wrong
                     every single time it was read.

                  It is numbers now, from `tipReceipt`, which reads the same
                  fields the fold is about to zero. */}
              <div className="bowl-ledger">
                <div className="ledger-col lose">
                  <span className="ledger-head">you lose</span>
                  <ul>
                    <li><strong>{compact(r.crumbs)}</strong> crumbs — the whole bowl</li>
                    <li>
                      <strong>{r.jarsLost}</strong> {r.jarsLost === 1 ? 'jar' : 'jars'}
                      {r.keptLabel ? ' — every one except the kept jar' : ' — everything you have bought'}
                    </li>
                    {r.bandsBroken > 0 && (
                      <li>
                        <strong>{r.bandsBroken}</strong> {r.bandsBroken === 1 ? 'band' : 'bands'} broken
                        {' '}— you start again at the porcelain
                      </li>
                    )}
                    {r.bossDamage > 0 && (
                      <li><strong>{compact(r.bossDamage)}</strong> damage on the fight you are in</li>
                    )}
                    <li><strong>{compact(r.lifetimeChips)}</strong> lifetime chips — the salt is counted off this</li>
                    <li>your depth — back to Plain Salsa from {depth}</li>
                  </ul>
                </div>
                <div className="ledger-col keep">
                  <span className="ledger-head">you keep</span>
                  <ul>
                    <li><strong>{compact(r.saltGained)} old salt</strong>, permanently — {compact(r.saltAfter)} in all</li>
                    <li>+{Math.round(r.saltGained * SALT_TICK_BONUS * 100)}% on every tick, forever, in every run after this</li>
                    {r.keptLabel && <li><strong>{r.keptLabel}</strong> — the crack carries it through</li>}
                    {/* Named because a player who has just watched a tip take
                        everything reads "0 bands broken" as having lost these
                        too. Scoop says it in his shop; it belongs here, where
                        the loss is being agreed to. */}
                    {state.charOwned.size > 0 && (
                      <li>
                        {state.charOwned.size === 1 ? 'the ability' : `all ${state.charOwned.size} abilities`}
                        {' '}scoop sold you — char never goes
                      </li>
                    )}
                    <li>the whole crew — they stay</li>
                  </ul>
                </div>
              </div>

              {/* THE CRACK. Shown only when you own it and have something to
                  save — a player without the ability never learns this exists,
                  which is the right amount of explaining. */}
              {keepable.length > 0 && (
                <div className="bowl-keep">
                  <span className="bowl-keep-head">
                    the crack: one jar comes with you.
                  </span>
                  <div className="bowl-keep-row">
                    <button
                      type="button"
                      className={keep === undefined ? 'on' : ''}
                      onClick={() => setKeep(undefined)}
                    >nothing</button>
                    {keepable.map((j) => (
                      <button
                        key={j.key}
                        type="button"
                        className={keep === j.key ? 'on' : ''}
                        onClick={() => setKeep(j.key)}
                      >{j.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* THE COMMIT ARMS FIRST. It was one tap on a destructive
                  button, inside a full-screen overlay, over a game the player
                  is tapping at speed — fryers, critters, the rat. Two taps is
                  what a tap-stream produces by accident, and twelve accidental
                  tips is what it produced. So the first tap swaps this row for
                  the receipt in one sentence, and the second one cannot fire
                  for TIP_ARM_DEAD_MS — longer than any double-tap, shorter
                  than reading six numbers. NOT a setting and NOT a second
                  dialog to dismiss: the same one path, told honestly. */}
              {!armed ? (
                <div className="bowl-buttons">
                  <button type="button" className="bowl-later primary" onClick={onClose}>keep digging</button>
                  <button
                    type="button" className="bowl-tip danger"
                    onClick={() => setArmedAt(Date.now())}
                    disabled={r.saltGained <= 0}
                  >
                    {r.saltGained > 0
                      ? (r.keptLabel ? `tip the bowl — keep ${r.keptLabel}` : 'tip the bowl')
                      : 'not deep enough yet'}
                  </button>
                </div>
              ) : (
                <div className="bowl-commit" role="group" aria-label="confirm the tip">
                  <strong className="bowl-commit-head">this empties the bowl now.</strong>
                  {/* The ledger above says it in columns; this says it in one
                      line, because the line is what gets read at speed. */}
                  <p className="bowl-commit-line">
                    {compact(r.crumbs)} crumbs, {r.jarsLost} {r.jarsLost === 1 ? 'jar' : 'jars'}
                    {r.bandsBroken > 0 && <>, {r.bandsBroken} {r.bandsBroken === 1 ? 'band' : 'bands'}</>}
                    {' '}and {compact(r.lifetimeChips)} lifetime chips go back in.
                    {' '}you get <strong>{compact(r.saltGained)} old salt</strong>
                    {r.keptLabel && <> and <strong>{r.keptLabel}</strong></>}.
                  </p>
                  <div className="bowl-buttons">
                    <button
                      type="button" className="bowl-later primary"
                      onClick={() => setArmedAt(null)}
                    >no — keep digging</button>
                    <button
                      type="button" className="bowl-tip danger" onClick={commit}
                      disabled={!readable}
                      aria-disabled={!readable}
                    >
                      {readable ? 'yes. tip it.' : 'one second…'}
                    </button>
                  </div>
                </div>
              )}
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
