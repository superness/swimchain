/**
 * The edge of the water — what a swimmer nobody has let in actually sees
 * (spec §2.16, "Newcomers").
 *
 * DISPLAY SIDE, and the loosest part of it: colour, blur and time, none of
 * which any other client ever has to agree with.
 *
 * ## It is a place, not a message
 *
 * Spec §2.16 closes with the bar this file is judged against: *"Never let a
 * downloader dead-end. A player who cannot reach the shoal sees a place, not
 * an error."* So the sea keeps running underneath — the same canvas, the same
 * wild shoal drifting through it, live — and this layer does one thing to it:
 * it draws a BOUNDARY across the water and puts the player on the wrong side.
 *
 *   - above the line, the sea is barely touched. That is where everyone else
 *     is, and it has to stay legible or there is nothing to be outside of;
 *   - below it, the water is drained of colour and light (`backdrop-filter`,
 *     over the live canvas, so it is genuinely the same sea one shade colder
 *     rather than a panel pasted on top);
 *   - the line itself is two slow waves at different speeds, so it reads as
 *     water meeting water rather than as a horizon or a wall;
 *   - and one small pale fish circles below it. That is the player, doing the
 *     only thing §2.16 says an unvouched newcomer does: circling at the edge.
 *
 * The whole layer is `pointer-events: none` on purpose. The player can still
 * steer, still dart, still open a line to speak — their writes are refused, so
 * nothing they do reaches anyone, but taking the controls away as well would
 * turn a place into a modal dialog, which is exactly what §2.16 forbids.
 *
 * ## The words
 *
 * Two lines, and they are not written here — they are `EDGE_TITLE` and
 * `EDGE_BODY` in `wayIn.ts`, where `wayIn.test.ts` holds them to spec §1.1's
 * diegetic rule by name. A string typed straight into JSX is a string nothing
 * checks, and this is the only player-facing copy in the client apart from a
 * player's own speech.
 *
 * ## Why a stylesheet rather than inline styles
 *
 * The rest of the shell styles itself with the inline `CSSProperties` objects
 * in `App.tsx`, which cannot express `@keyframes`, `@media
 * (prefers-reduced-motion)` or a pseudo-element. All three earn their place
 * here: the circling IS the mechanic being shown, a player who has asked their
 * system for less motion must still get the picture, and the fade-in is what
 * keeps the boundary from snapping into existence mid-swim. The rules are
 * scoped under one `.shoal-edge` root so nothing here can reach the canvas.
 *
 * IT WAS A `<style>` ELEMENT AND THAT DID NOT SURVIVE BEING SHIPPED. Tauri
 * stamps a nonce on the inline styles it finds in `index.html` and appends the
 * matching source to `style-src`, which per CSP3 makes `'unsafe-inline'`
 * ignored — so a `<style>` element React creates at runtime carries no nonce
 * and is dropped, and this boundary reached a real player as unstyled black
 * serif text in a corner. `theEdge.css` carries the whole argument and
 * `shippedStyles.test.ts` is what stops it happening again.
 */
import { EDGE_BODY, EDGE_TITLE } from './wayIn';
import './theEdge.css';


/**
 * One period of the boundary, repeated three times across the 300%-wide svg so
 * the drift can wrap seamlessly at exactly one third of its width.
 *
 * `w` is the viewBox width and `k` the vertical offset, so the two waves can be
 * drawn from the same generator at different depths and amplitudes without the
 * near one being a copy of the far one shifted down.
 */
function waveD(w: number, amp: number, k: number): string {
  const period = w / 6;
  let d = `M 0 ${k}`;
  for (let i = 0; i < 6; i++) {
    const x0 = i * period;
    d += ` C ${x0 + period * 0.25} ${k - amp},`
      + ` ${x0 + period * 0.75} ${k + amp},`
      + ` ${x0 + period} ${k}`;
  }
  return d;
}

const VIEW_W = 1200;
const VIEW_H = 120;
const FAR = waveD(VIEW_W, 15, 50);
const NEAR = waveD(VIEW_W, 23, 64);

/**
 * The player's own fish, pointing along +x, drawn to the same silhouette rules
 * `seaPaint.paintFish` follows: mass forward, blunt nose, taper to a narrow
 * caudal peduncle so the tail has something to hinge on. Small and pale —
 * a swimmer with nothing behind it.
 */
function Fish() {
  return (
    <svg width="34" height="17" viewBox="0 0 48 24" aria-hidden="true">
      <g className="shoal-edge-beat">
        <path
          d="M11 12 L1 4 C4 9 4 15 1 20 Z"
          fill="rgba(150, 196, 210, 0.55)"
        />
        <path
          d="M28 6 C25 2 21 1 18 5 Z"
          fill="rgba(150, 196, 210, 0.45)"
        />
        <path
          d="M46 12 C42 5 30 3 18 6 C12 7.5 9 10 8 12 C9 14 12 16.5 18 18 C30 21 42 19 46 12 Z"
          fill="rgba(178, 216, 228, 0.72)"
        />
      </g>
    </svg>
  );
}

/**
 * Drawn only while `wayIn.ts` says this client is at the edge. It reads no
 * state of its own, holds no timer, and never mounts for any other failure —
 * see `wayIn.afterWrite` for which of the three kinds of failed write gets
 * here and why the other two must not.
 */
export function TheEdge() {
  return (
    <div className="shoal-edge">
      <div className="shoal-edge-open" />
      <div className="shoal-edge-below" />
      <svg
        className="shoal-edge-line"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g className="shoal-edge-wave-far">
          <path className="shoal-edge-glow" d={FAR} fill="none" stroke="#1b8095" strokeWidth="3" />
          <path d={FAR} fill="none" stroke="rgba(120, 186, 205, 0.5)" strokeWidth="1" />
        </g>
        <g className="shoal-edge-wave-near">
          <path className="shoal-edge-glow" d={NEAR} fill="none" stroke="#2a9db4" strokeWidth="4" />
          <path d={NEAR} fill="none" stroke="rgba(158, 216, 232, 0.62)" strokeWidth="1.1" />
        </g>
      </svg>
      <div className="shoal-edge-orbit">
        <div className="shoal-edge-arm">
          <div className="shoal-edge-heading"><Fish /></div>
        </div>
      </div>
      <div className="shoal-edge-copy">
        <p className="shoal-edge-title">{EDGE_TITLE}</p>
        <p className="shoal-edge-body">{EDGE_BODY}</p>
      </div>
    </div>
  );
}
