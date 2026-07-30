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
 * THE SEA UNDERNEATH IS THE SHALLOWS, AND IT IS PLAYABLE. When this was
 * written the water under this layer was the real one, in which a refused
 * swimmer could do nothing at all; `seaChoice.chooseWater` now puts them in the
 * tutorial water while their writes keep knocking, so everything they do moves
 * a fish they can see. So:
 *
 *   - above the line, the sea is barely touched. That is where everyone else
 *     is, and it has to stay legible or there is nothing to be outside of;
 *   - below it, the water is drained of colour and light (`backdrop-filter`,
 *     over the live canvas, so it is genuinely the same sea one shade colder
 *     rather than a panel pasted on top) — and only in a BAND under the line,
 *     never over the middle of the window, which is where the camera holds the
 *     fish the player is steering;
 *   - the line itself is two slow waves at different speeds, so it reads as
 *     water meeting water rather than as a horizon or a wall.
 *
 * ## THE SURROGATE FISH IS GONE, AND THAT IS A DECISION, NOT A TIDY-UP
 *
 * A small pale fish used to circle below the line, and the comment beside it
 * said "that is the player". It was true once: this layer was written over water
 * a refused swimmer could not move in, so the only fish on screen that was
 * theirs was the one this file drew. It has been false since the shallows went
 * underneath — the player's own fish is centred, ringed, tethered and answers
 * the mouse, and this one answered nothing. Two fish, one of them yours, no way
 * to tell which: a picture that has to be explained is worse than no picture.
 *
 * It was also depicting something the game does not do. It came from §2.16's
 * "unvouched newcomers appear as small fish circling at the edge of the real
 * water, VISIBLE TO EVERYONE" — and that sentence is superseded (§2.16's
 * RESOLVED block, 2026-07-29). A refused write never reaches a peer, so no one
 * is watching this swimmer circle. Drawing the circling anyway made this
 * window the only place in the world where that image was true, which is a
 * quiet lie to the one player who cannot check it.
 *
 * What is left is water: a boundary, colder water on the near side of it, and
 * the player's own real fish swimming a real sea below. Nothing on this layer
 * pretends to be them any more.
 *
 * ## THE MOMENT IT LIFTS (`lifting`)
 *
 * The payoff of the whole newcomer arc, and it is taught the way spec §2.18
 * teaches the only lesson that matters: WITH NO TEXT. Not one word is added,
 * removed or changed — the two lines simply go, first and fastest, because the
 * answer to "someone has to bring you through" is not another sentence.
 *
 * Then the cold band and the boundary rise together and off the top of the
 * window — the edge passing over the player rather than switching off — and a
 * wash of open-water light comes down over them as it goes. `theEdge.css`
 * carries the timings; `wayIn.CROSSING_MS` is how long this component stays in
 * the tree afterwards, and it is deliberately longer than the animation.
 *
 * NOTHING IS BEING WAITED FOR WHILE IT PLAYS. The write was accepted before
 * this prop was ever true; the player is already in the real water, already
 * folding the real sea, already being seen by everyone else in it. This layer
 * has no pointer events and never had, so the lift cannot cost them a frame of
 * play — it is a picture of something that has already happened.
 *
 * The whole layer is `pointer-events: none` on purpose. The player can still
 * steer, still dart, still open a line to speak — and now those verbs reach a
 * sea that answers them. Their writes into the REAL water are still refused, so
 * nothing they do reaches another person yet; taking the controls away as well
 * would turn a place into a modal dialog, which is exactly what §2.16 forbids.
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
 * in `App.tsx`, which cannot express `@keyframes` or `@media
 * (prefers-reduced-motion)`. Both earn their place here, and the lift is why
 * the first one is now load-bearing rather than decorative: THE MOMENT IS AN
 * ANIMATION AND NOTHING ELSE — there is no copy to fall back on, so a build
 * that lost these keyframes would show a player nothing happening at the one
 * instant the whole newcomer arc pays off. The reduced-motion rule matters for
 * the same reason: a player who asked their system for stillness must still be
 * told, so the lift becomes a plain fade rather than being switched off. The
 * rules are scoped under one `.shoal-edge` root so nothing here can reach the
 * canvas.
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

export interface TheEdgeProps {
  /**
   * The water has taken this swimmer in and the boundary is on its way out.
   *
   * A PROP RATHER THAN A SECOND MOUNT, deliberately: React keeps this element
   * across the change (same type, same position), so the root's fade-in does
   * not restart and the boundary the player has been looking at is the one
   * that lifts, rather than a fresh copy appearing to replace it.
   */
  readonly lifting: boolean;
}

/**
 * Drawn while `wayIn.ts` says this client is at the edge, and for `CROSSING_MS`
 * after it stops. It reads no state of its own, holds no timer, and never
 * mounts for any other failure — see `wayIn.afterWrite` for which of the three
 * kinds of failed write gets here, and why an `unreachable` or an `unknown`
 * must neither raise this surface nor take it away.
 */
export function TheEdge({ lifting }: TheEdgeProps) {
  return (
    <div className={lifting ? 'shoal-edge shoal-edge--lifting' : 'shoal-edge'}>
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
      {/* The open water coming down over them as the boundary goes up. Mounted
          only for the moment itself — a permanently-present pane at zero
          opacity would be one more compositing layer over a live canvas for
          the entire wait, to save one node on the one frame it matters. */}
      {lifting && <div className="shoal-edge-swell" />}
      <div className="shoal-edge-copy">
        <p className="shoal-edge-title">{EDGE_TITLE}</p>
        <p className="shoal-edge-body">{EDGE_BODY}</p>
      </div>
    </div>
  );
}
