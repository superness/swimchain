import test from 'node:test';
import assert from 'node:assert/strict';
import { mapStats } from './static-shader.mjs';

test('no data -> sparse dead-sea static', () => {
  assert.deepEqual(mapStats(null), { density: 0.05, drift: 0, ghost: '' });
});

test('peers raise density, clamped at 0.35', () => {
  assert.equal(mapStats({ peer_count: 2 }).density, 0.05 + 2 * 0.03);
  assert.equal(mapStats({ peer_count: 500 }).density, 0.35);
});

test('mempool drives drift, clamped at 3 px/frame', () => {
  assert.equal(mapStats({ mempool_actions: 4 }).drift, 1);
  assert.equal(mapStats({ mempool_actions: 999 }).drift, 3);
});

test('ghost is the first 16 chars of the tip hash', () => {
  assert.equal(mapStats({ tip_hash: 'abcdef0123456789ff' }).ghost, 'abcdef0123456789');
  assert.equal(mapStats({ tip_hash: null }).ghost, '');
});
