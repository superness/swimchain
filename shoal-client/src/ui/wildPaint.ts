/**
 * The wild shoal, drawn (spec 2.6).
 *
 * DISPLAY SIDE, and the loosest part of it: colour, wobble and alpha, none of
 * which any other client has to agree with. Every coordinate comes from
 * `wildView.ts`, which is pure and tested; this file decides only what a wild
 * fish LOOKS like. There is no test file for it, on the same grounds as
 * `seaPaint.ts`: the only assertion available against a canvas context is "it
 * was called", which passes against a black rectangle.
 *
 * =============================================================================
 * THE ONE JOB: A WILD FISH MUST NEVER BE MISTAKEN FOR A PERSON
 * =============================================================================
 *
 * The whole honesty of this feature rests on SPEECH being the tell — anyone
 * who says a word is a person — and speech is a thing that only sometimes
 * happens. So the picture has to carry the difference on its own, permanently,
 * at a glance, in a crowd, with no text. Six channels do it, and they are
 * listed here because "make them look different" is not a specification:
 *
 *  1. **Silhouette.** A person's fish (`seaPaint.paintFish`) has a forked
 *     caudal fin, a dorsal, an anal fin and a rowing pectoral — four
 *     appendages and a two-lobed tail. A wild fish has a spindle and one
 *     plain triangular tail. Nothing else. Silhouette is the channel that
 *     survives distance, overlap and a dark frame, so it does the heavy work.
 *  2. **Size.** Drawn at WILD_BODY_SCALE of the radius the same `size` would
 *     give a swimmer. This is a free lie and it is worth saying why it is not
 *     a dishonest one: `bodyShelterWeight` gives a wild fish a FLAT
 *     WILD_SHELTER_WEIGHT regardless of size, so a wild fish's size carries no
 *     information a player could act on. Spec 2.8's "size is the scoreboard"
 *     is a rule about people, and drawing scenery on the same scale would make
 *     the scoreboard unreadable rather than more honest.
 *  3. **Uniformity.** One colour for the whole population — no per-id palette,
 *     no per-fish rim, no flank highlight. `seaPaint` gives swimmers FOUR
 *     colour sets precisely because a shoal of identical fish reads as a
 *     sprite repeated; here that is the point. They are not individuals.
 *  4. **Light.** A person catches the light: rim, flank, a white catchlight in
 *     the eye, and the player themselves glows warm. A wild fish catches none
 *     of it. The eye is a single dim dot with no catchlight — enough that the
 *     shape reads as an animal, not enough that it reads as someone at home.
 *  5. **Depth.** Drawn at WILD_ALPHA, under a cooler wash, so the shoal sits
 *     BACK in the water. A person is in your plane; scenery is behind it.
 *  6. **Nothing attached.** No tether of its own, no wake, no dart ring, no
 *     word over its head, no name. All four of those are drawn from
 *     `Frame.swimmers`, which `wildView` never enters.
 *
 * The tail beat is the one channel deliberately pushed the OTHER way — see
 * `schoolBeat` — because a school that flickers in near-unison reads as a
 * shoal, and a shoal is what these are.
 *
 * =============================================================================
 * THE BOLT
 * =============================================================================
 *
 * Spec 2.6: *"cover that felt solid a second ago evaporates exactly when it
 * matters, and the crowd you are left standing in is made only of people."*
 * `wildAt` does the leaving; this file makes it visible. Two additions, both
 * only during the flight:
 *
 *  - a hard motion streak behind every fish along its own outward ray, so
 *    thirty-six radiating lines say *away* before the eye has counted anything;
 *  - the fish BRIGHTEN as they go, which is the opposite of receding and is
 *    what turns a disappearance into a departure.
 *
 * No text, and nothing on the player's own body: the ocean emptying is the
 * whole message.
 */
import { bodyRadiusCu, isVisible, worldToScreen, type Camera, type Viewport } from './render';
import { rgba, unit } from './paintKit';
import { WILD_PER_SCHOOL } from '../lib/wild';
import type { WildView } from './wildView';

/** What the wild paint needs from the frame. `seaPaint.Frame` satisfies it. */
export interface WildFrame {
  view: Viewport;
  cam: Camera;
  atMs: number;
}

/**
 * How big a wild fish is drawn, against the radius its `size` would give a
 * swimmer. See channel 2 in the header for why this is allowed to be a lie.
 * At the sea's default scale this puts a wild fish at roughly 6 px of radius
 * against a starting swimmer's 14.
 */
export const WILD_BODY_SCALE = 0.55;

/** How present a wild fish is in calm water. Present, but behind you. */
export const WILD_ALPHA = 0.74;

/** The whole population's one colour: cold, desaturated, unlit. */
const WILD_BODY = '#1b3743';
const WILD_BELLY = '#0a1b23';
const WILD_BACK = '#2c5464';
const WILD_EYE = '#050d12';

/**
 * The tail beat, per SCHOOL rather than per fish.
 *
 * Every other cosmetic phase in this codebase is per-id, because a shoal of
 * people beating in lockstep would read as a sprite sheet. Here it is
 * inverted on purpose: a school whose twelve members flick within a few
 * hundredths of a second of each other reads instantly as ONE thing with
 * twelve parts. The small per-fish jitter keeps it from being a machine.
 */
function schoolBeat(atMs: number, index: number): number {
  const school = Math.trunc(index / WILD_PER_SCHOOL);
  const jitter = unit(index * 97 + 13);
  const hz = 3.1 + unit(school * 31 + 7) * 0.6;
  return Math.sin((atMs / 1000) * hz * Math.PI * 2 + school * 2.1 + jitter * 0.55);
}

/**
 * One wild fish: a spindle and a triangular tail, in its own rotated frame.
 *
 * Compare `seaPaint.paintFish`, which is 150 lines. That asymmetry IS the
 * design — see channel 1 in the header — and every attempt to give these a
 * dorsal or a forked tail during development made them read as small people.
 */
function paintWildBody(
  ctx: CanvasRenderingContext2D, f: WildFrame, w: WildView, index: number,
  sx: number, sy: number, alpha: number, streak: number,
): void {
  const rPx = bodyRadiusCu(w.size) * WILD_BODY_SCALE * f.cam.scale;
  if (rPx < 0.3) return;
  const lenPx = rPx * 2.5;
  const beat = schoolBeat(f.atMs, index);
  const bend = beat * rPx * 0.22;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(w.facing);
  ctx.globalAlpha = alpha;

  // The bolt's streak, behind the nose, along the body's own axis. Drawn
  // first so the fish sits on top of its own trail.
  if (streak > 0) {
    const tail = lenPx + streak * rPx * 26;
    const g = ctx.createLinearGradient(-lenPx * 0.5, 0, -tail, 0);
    g.addColorStop(0, rgba(186, 226, 240, 0.42 * streak));
    g.addColorStop(1, rgba(160, 210, 232, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-lenPx * 0.5, -rPx * 0.72);
    ctx.lineTo(-tail, 0);
    ctx.lineTo(-lenPx * 0.5, rPx * 0.72);
    ctx.closePath();
    ctx.fill();
  }

  // The tail: one plain triangle, hinged at the peduncle. No fork.
  ctx.save();
  ctx.translate(-lenPx * 0.62, bend * 0.7);
  ctx.rotate(beat * 0.62);
  ctx.fillStyle = WILD_BELLY;
  ctx.beginPath();
  ctx.moveTo(rPx * 0.4, 0);
  ctx.lineTo(-lenPx * 0.4, -rPx * 0.95);
  ctx.lineTo(-lenPx * 0.34, 0);
  ctx.lineTo(-lenPx * 0.4, rPx * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // The body: a plain spindle, darker underneath. A two-stop gradient, not the
  // swimmer's three — there is no lit flank on a thing that catches no light.
  const g = ctx.createLinearGradient(0, -rPx, 0, rPx);
  g.addColorStop(0, WILD_BACK);
  g.addColorStop(0.55, WILD_BODY);
  g.addColorStop(1, WILD_BELLY);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(lenPx * 0.98, bend * 0.4);
  ctx.quadraticCurveTo(lenPx * 0.3, -rPx * 1.0 + bend, -lenPx * 0.62, -rPx * 0.22 + bend);
  ctx.quadraticCurveTo(-lenPx * 0.7, bend, -lenPx * 0.62, rPx * 0.22 + bend);
  ctx.quadraticCurveTo(lenPx * 0.3, rPx * 1.0 + bend, lenPx * 0.98, bend * 0.4);
  ctx.closePath();
  ctx.fill();

  // A separating edge, so a dense school stays a school of fish and not a
  // single dark smear.
  ctx.strokeStyle = 'rgba(1, 9, 14, 0.5)';
  ctx.lineWidth = Math.max(0.4, rPx * 0.09);
  ctx.stroke();

  // The eye. One dim dot, no catchlight — see channel 4.
  if (rPx > 2.6) {
    ctx.fillStyle = WILD_EYE;
    ctx.beginPath();
    ctx.arc(lenPx * 0.55, -rPx * 0.2 + bend, Math.max(0.6, rPx * 0.15), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The whole wild shoal.
 *
 * `bolt` is 0 in calm water and climbs to 1 across the flight — the shell
 * reads it off the hush, so this file has no opinion about when a bolt is
 * happening, only about what one looks like.
 */
export function paintWildShoal(
  ctx: CanvasRenderingContext2D, f: WildFrame, wild: readonly WildView[], bolt: number,
): void {
  if (wild.length === 0) return;
  ctx.save();
  for (let i = 0; i < wild.length; i++) {
    const w = wild[i];
    const rCu = bodyRadiusCu(w.size) * WILD_BODY_SCALE * 2.6;
    if (!isVisible(f.cam, f.view, w.x, w.y, rCu * f.cam.scale + 40)) continue;
    const s = worldToScreen(f.cam, f.view, w.x, w.y);
    // Fleeing fish BRIGHTEN. A thing that dims as it leaves has receded; a
    // thing that brightens as it leaves has bolted.
    const alpha = WILD_ALPHA * w.presence * (1 + 0.34 * bolt);
    paintWildBody(ctx, f, w, i, s.x, s.y, Math.min(1, alpha), bolt);
  }
  ctx.restore();
}

/**
 * A cold wash over the water in the seconds the shoal is leaving, thrown from
 * the middle of the frame outward.
 *
 * This is the ONE thing the bolt draws that is not a fish, and it exists for a
 * specific failure: a player standing where there happened to be no wild fish
 * would otherwise see nothing happen at all. The wash is centred on the window
 * rather than on the player's body so it reads as the water reacting, not as
 * something about them — the same division of labour `paintHush` uses for the
 * pall (shared) against the tether (personal).
 *
 * Deliberately faint next to the pall it runs under: the hush is already
 * draining the colour out of the sea, and two full-frame effects competing at
 * the same weight made both illegible.
 */
export function paintBoltWash(ctx: CanvasRenderingContext2D, f: WildFrame, bolt: number): void {
  if (bolt <= 0) return;
  // Strongest in the middle of the flight, gone by the end of it: what the
  // eye should be left with is the emptiness, not an effect over it.
  const k = Math.sin(Math.min(1, bolt) * Math.PI);
  if (k <= 0.004) return;
  const cx = f.view.w / 2;
  const cy = f.view.h / 2;
  const r = Math.hypot(cx, cy);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, r * (0.1 + 0.7 * bolt), cx, cy, r * 1.25);
  g.addColorStop(0, rgba(120, 190, 215, 0));
  g.addColorStop(0.7, rgba(132, 200, 224, 0.05 * k));
  g.addColorStop(1, rgba(150, 214, 236, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.view.w, f.view.h);
  ctx.restore();
}
