import test from 'node:test';
import assert from 'node:assert/strict';
import { isTap, planTapThrough, TAP_SLOP_PX, TAP_MAX_MS } from '../web/tapthru.mjs';

const RECT = { left: 0, top: 0 };

/** A tap that should be forwarded: everything up, nothing in the way. */
function ok(over = {}) {
  return {
    dx: 0, dy: 0, dtMs: 60,
    powered: true, acquired: true, vouched: true, chartOpen: false,
    hitIsCurrentFrame: true,
    frameRect: RECT,
    clientX: 391, clientY: 35,
    ...over,
  };
}

test('a still tap is a tap', () => {
  assert.equal(isTap({ dx: 0, dy: 0, dtMs: 50 }), true);
});

test('drift up to the slop is still a tap; past it is not', () => {
  assert.equal(isTap({ dx: TAP_SLOP_PX, dy: 0, dtMs: 50 }), true);
  assert.equal(isTap({ dx: TAP_SLOP_PX + 1, dy: 0, dtMs: 50 }), false);
});

test('slop is a radius, not per-axis — diagonal drift counts', () => {
  // 8,8 is 11.3px away: inside the box the two axes would draw, outside the
  // circle. A per-axis check would call this a tap and forward a real drag.
  assert.equal(isTap({ dx: 8, dy: 8, dtMs: 50 }), false);
});

test('a flip drag is not a tap', () => {
  assert.equal(isTap({ dx: 2, dy: 120, dtMs: 200 }), false);
});

test('a press held past the long-press window is not a tap', () => {
  // The power toggle already fired at 800ms. Lifting must not ALSO click the
  // channel underneath.
  assert.equal(isTap({ dx: 0, dy: 0, dtMs: TAP_MAX_MS }), false);
  assert.equal(isTap({ dx: 0, dy: 0, dtMs: TAP_MAX_MS - 1 }), true);
});

test('a tap on the current channel forwards', () => {
  assert.deepEqual(planTapThrough(ok()), { x: 391, y: 35 });
});

test('a drag is never forwarded', () => {
  assert.equal(planTapThrough(ok({ dy: 90 })), null);
});

for (const [name, over] of [
  ['unpowered', { powered: false }],
  ['no signal yet', { acquired: false }],
  ['not vouched', { vouched: false }],
  ['chart open', { chartOpen: true }],
]) {
  test(`a tap is not forwarded while ${name}`, () => {
    assert.equal(planTapThrough(ok(over)), null);
  });
}

test('a tap is not forwarded when the current channel is not what was hit', () => {
  // This is the case that covers EVERY shell overlay at once — sponsor gate,
  // signal-lost, dead-air, node-dead, off-screen. They all sit below the
  // strips, so without this check a strip tap would reach through them.
  assert.equal(planTapThrough(ok({ hitIsCurrentFrame: false })), null);
});

test('coordinates are frame-local, not viewport', () => {
  assert.deepEqual(
    planTapThrough(ok({ frameRect: { left: 30, top: 12 }, clientX: 391, clientY: 35 })),
    { x: 361, y: 23 },
  );
});

test('a missing frame rect forwards nothing rather than NaN coordinates', () => {
  assert.equal(planTapThrough(ok({ frameRect: null })), null);
});

test('the measured chips close button lands inside the top band', () => {
  // Not a behaviour test — the geometry that made this module necessary,
  // pinned so a future strip resize has to face it. Measured in the live page
  // 2026-08-02: .boards-close is top:14 right:20, 45x42, absolute px.
  const CHART_STRIP_H = 56, FLIP_STRIP_W = 56, VIEWPORT_W = 411;
  const btn = { top: 14, bottom: 14 + 42, right: VIEWPORT_W - 20, left: VIEWPORT_W - 20 - 45 };
  assert.ok(btn.bottom <= CHART_STRIP_H, 'button is wholly inside the top strip');
  assert.ok(btn.right > VIEWPORT_W - FLIP_STRIP_W, 'and overlaps the right strip too');
});
