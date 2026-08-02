/**
 * Tap-through for the shell's two input strips.
 *
 * #flip-strip (right edge, 56px wide) and #chart-strip (top edge, 56px tall)
 * sit ABOVE the channel deck so the shell can own its two gestures: a vertical
 * drag flips the channel, a downward drag opens the chart. Neither sets
 * `pointer-events: none`, so they also swallow every TAP that lands in those
 * bands and the channel underneath never hears about it.
 *
 * Measured 2026-08-02, in the live page: chips' "close the boards" button is
 * `top: 14px; right: 20px`, 45x42 — 100% inside the top band, at every
 * viewport width (the offsets are absolute px). Inside the set the leaderboard
 * could be opened and never closed. The same band eats the top 56px of every
 * other channel; nothing else had a control parked there yet.
 *
 * A tap cannot be routed by z-index alone. The shell has to RECEIVE the
 * pointer to find out whether it becomes a drag, and by the time it knows it
 * didn't, the channel has already been skipped. So the shell hands it back
 * afterwards. Channels are same-origin (`/channels/<id>/`; shell.mjs already
 * reaches into contentWindow for the RPC handover and keydown), which is what
 * makes handing it back possible at all.
 *
 * This module is the arithmetic and the decision only — no DOM. shell.mjs owns
 * the wiring, because the one input this cannot compute for itself is
 * `hitIsCurrentFrame`: see planTapThrough.
 */

/** How far a finger may drift and still be a tap. Same slop the flip strip
 *  already allows for its long-press (shell.mjs LONG_PRESS_SLOP_PX). */
export const TAP_SLOP_PX = 10;

/**
 * How long a press may last and still be a tap.
 *
 * Deliberately equal to the flip strip's long-press window: a press held past
 * it has ALREADY toggled power, and the finger lifting afterwards must not
 * also be handed to the channel as a click. A held finger drifts less than the
 * slop, so duration is the only thing that separates the two.
 */
export const TAP_MAX_MS = 800;

export function isTap({ dx, dy, dtMs }, { slopPx = TAP_SLOP_PX, maxMs = TAP_MAX_MS } = {}) {
  return Math.hypot(dx, dy) <= slopPx && dtMs < maxMs;
}

/**
 * Where — if anywhere — a strip gesture should be replayed inside the current
 * channel. Returns frame-local coordinates, or null to let the strip keep it.
 *
 * `hitIsCurrentFrame` is the safety property and shell.mjs computes it by
 * asking the document what would have been hit with the strips made
 * transparent, rather than by listing which overlays are up. That distinction
 * is load-bearing: #sponsor-gate (z 5500), #signal-lost (5500), #dead-air
 * (5550), #node-dead (5600) and #off-screen (8000) all sit BELOW the strips'
 * 6500/6510, so a tap on a strip while any of them is showing would otherwise
 * be forwarded into a channel the viewer is not supposed to be using — and a
 * hand-written list of them would go stale the first time an overlay is added.
 * Asking the document cannot go stale.
 */
export function planTapThrough({
  dx, dy, dtMs,
  powered, acquired, vouched, chartOpen,
  hitIsCurrentFrame,
  frameRect,
  clientX, clientY,
  slopPx = TAP_SLOP_PX,
  maxMs = TAP_MAX_MS,
}) {
  if (!isTap({ dx, dy, dtMs }, { slopPx, maxMs })) return null;
  // The same four conditions flip() checks. A dial that is dead must not be
  // routable around by tapping the strip it lives on.
  if (!powered || !acquired || !vouched || chartOpen) return null;
  if (!hitIsCurrentFrame || !frameRect) return null;
  // Frame-local, NOT the viewport point. The deck happens to be inset:0 today,
  // so the two are equal — subtracting the rect anyway is what keeps this
  // correct if a frame is ever inset, letterboxed or offset.
  return { x: clientX - frameRect.left, y: clientY - frameRect.top };
}
