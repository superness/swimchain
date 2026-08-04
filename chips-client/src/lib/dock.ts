/**
 * HOW TALL IS THE BOTTOM DOCK, ACTUALLY.
 *
 * The phone layout docks a stack of fixed furniture to the bottom edge — the
 * boards pill, the crew bench, the chat strip above it, the tutorial banner —
 * and the scrolling counter column (crumbs readout, bowl ticket, jars) has to
 * stop short of all of it. That reservation was the literal constant `240px`:
 *
 *     .counter { max-height: calc(100dvh - 240px - var(--safe)) }
 *
 * A constant cannot describe that stack. `.crew-toast` is a wrapping line of
 * dialogue, so its height is whatever the writer typed; `--bench-h` is a clamp
 * on viewport width; the tutorial banner comes and goes. When the stack grew
 * past 240px it climbed onto the crumbs readout and the bottom-of-the-bowl
 * ticket — both of which are cards IN that column, not overlays, so there was
 * nothing they could do about it (operator, 2026-08-03: "a lot of these
 * commentary dialogs \ temporary modals for events are blocking the crumbs
 * counter section and the 'bottom of the bowl' button").
 *
 * So measure it. `dockHeight` turns the boxes of the docked elements into the
 * height the column must reserve; the caller writes it to `--dock-h` and the
 * CSS keeps `240px` only as the before-first-measurement fallback.
 *
 * THE TRAP THIS FUNCTION EXISTS TO AVOID: not everything with a `bottom` is
 * docked. `.crier` sets `top: clamp(64px, 11vh, 110px)` AND, inside the phone
 * media query, a `bottom` — and a fixed box with both edges pinned and `height:
 * auto` STRETCHES between them. Measured naively it reports a top of ~64px on a
 * 740px screen, i.e. a "dock" of 676px, and the counter column would collapse
 * to nothing. Anything taller than `STRETCHED` is a pinned-both-ends box, not
 * furniture, and is ignored.
 */

export interface DockBox {
  /** Distance from the viewport's top edge to the box's top edge. */
  top: number;
  height: number;
}

/** Above this fraction of the viewport a box is pinned at both ends rather
 *  than docked — see the note above. */
const STRETCHED = 0.6;
/** The column may never be squeezed smaller than this fraction of the screen,
 *  whatever the measurement says. A dock that ate the whole screen would be a
 *  worse bug than the one being fixed, and it would look like the game had
 *  simply lost its content. */
const MAX_RESERVE = 0.55;

/**
 * @param boxes  the docked elements' boxes, in viewport coordinates
 * @param viewportH  the visual viewport height (`innerHeight`)
 * @param pad  breathing room between the column's last card and the dock
 * @returns pixels the column must leave free at the bottom, or `null` when
 *          nothing measurable is docked — the caller keeps the CSS fallback
 *          rather than inventing a number.
 */
export function dockHeight(boxes: DockBox[], viewportH: number, pad = 8): number | null {
  if (!(viewportH > 0)) return null;
  const docked = boxes.filter((b) =>
    b.height > 0 &&                      // not rendered / display:none
    b.height <= viewportH * STRETCHED && // not pinned top-and-bottom
    b.top < viewportH &&                 // not scrolled off below the fold
    b.top + b.height > 0                 // not entirely above the viewport
  );
  if (docked.length === 0) return null;
  const highest = Math.min(...docked.map((b) => b.top));
  // Rounded: `getBoundingClientRect` returns subpixels, and a max-height of
  // 557.2396px is noise in a devtools readout for no benefit.
  const reserve = Math.round(viewportH - highest + pad);
  return Math.max(0, Math.min(reserve, Math.round(viewportH * MAX_RESERVE)));
}

/** Everything that docks to the bottom edge on a phone. An EXPLICIT list, not
 *  a scan for `position: fixed` — the whole defect being fixed here came from
 *  assuming what the bottom of the screen contained. Anything added to the
 *  dock later must be added here too; `.counter` will otherwise reserve for a
 *  stack it cannot see. */
export const DOCKED_SELECTORS = [
  '.crew-toast', '.crew-row', '.tut-banner', '.working',
  /* THE CRIER'S CHILDREN, NEVER THE CRIER. The crier pins `top` AND `bottom`
     on a phone, so its own box stretches most of the screen and `dockHeight`
     rightly throws it out as a pinned-both-ends box (see STRETCHED). But its
     BANNERS are real static boxes sitting above the chat strip, and nothing
     was reserving for them: measured at 448x899, `--dock-h` came out 199px
     against the 281px the visible stack actually occupies — 82px the counter
     column was free to run into, which is where the bowl ticket meets the
     deep-fight call. Reserving for the crier's contents rather than its
     silhouette is the distinction. */
  '.crier > *',
] as const;

/**
 * THE HEIGHT OF EACH RUNG OF THE BOTTOM STACK, as it actually rendered.
 *
 * The stack was built out of one constant:
 *
 *     --bench-h: clamp(38px, 11vw, 52px);
 *     .crew-toast { bottom: calc(... + var(--bench-h)) }
 *     .crier      { bottom: calc(... + var(--bench-h) + 44px) }
 *
 * At 448px wide that resolves to 49px. The bench is **91px** tall — a critter
 * is `clamp(60px, 16vw, 84px)` before its name pill and the ledge's padding.
 * So the chat strip was placed 42px too low, i.e. INSIDE the bench: measured
 * toast bottom 793 against bench top 746, a 47px overlap, landing squarely on
 * the critters and on the `buy` tags that sit at their top edge (operator,
 * 2026-08-04: "the critter dialog is already obscuring the critters themselves
 * so it is hard to see them and their buy icons"). The crier then stacked on
 * the same wrong base plus a hand-picked 44px and made no allowance for the
 * strip's own height at all, so it landed on the strip ("the other type of
 * popups stack on top of those dialog popups").
 *
 * Every rung is now measured from the rung below it. A constant cannot describe
 * a bench whose height comes from a viewport clamp, or a strip whose height is
 * however many lines somebody wrote.
 */
export interface StackHeights {
  /** The crew ledge, as rendered. */
  bench: number;
  /** The chat strip, or 0 when nobody is speaking. */
  toast: number;
}

export function measureStack(doc: Document): StackHeights {
  const h = (sel: string): number => {
    const el = doc.querySelector(sel);
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return r.height > 0 ? Math.round(r.height) : 0;
  };
  return { bench: h('.crew-row'), toast: h('.crew-toast') };
}

/** Measure the live dock. Split from `dockHeight` so the rules above are
 *  testable without a DOM. */
export function measureDock(doc: Document, viewportH: number): number | null {
  const boxes: DockBox[] = [];
  for (const sel of DOCKED_SELECTORS) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      boxes.push({ top: r.top, height: r.height });
    }
  }
  return dockHeight(boxes, viewportH);
}
