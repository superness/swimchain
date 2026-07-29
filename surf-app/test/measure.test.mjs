import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlipTimer, viaCounts } from '../web/measure.mjs';

function clockAt(values) { let i = 0; return () => values[Math.min(i++, values.length - 1)]; }

test('start/end measures elapsed ms and tags kind + via', () => {
  const t = createFlipTimer(clockAt([100, 350]));
  t.start('forum', 'warm');
  assert.deepEqual(t.end('dom-peek'), { to: 'forum', kind: 'warm', via: 'dom-peek', ms: 250 });
});

test('end without start returns null; abort discards the pending flip', () => {
  const t = createFlipTimer(clockAt([0]));
  assert.equal(t.end('x'), null);
  t.start('feed', 'cold');
  t.abort();
  assert.equal(t.end('x'), null);
  assert.deepEqual(t.all(), []);
});

test('stats: median and p95 over one kind only, on UNSORTED arrivals', () => {
  // Durations arrive out of order (300, 100, 200) — real flips do too. A
  // stats() that forgets to sort before taking percentiles must fail here.
  const t = createFlipTimer(clockAt([0, 300, 0, 100, 0, 200, 0, 5000]));
  t.start('a', 'warm'); t.end('v');
  t.start('b', 'warm'); t.end('v');
  t.start('c', 'warm'); t.end('v');
  t.start('d', 'cold'); t.end('v');   // must not pollute warm stats
  const s = t.stats('warm');
  assert.equal(s.n, 3);
  assert.equal(s.median, 200);
  assert.equal(s.p95, 300);
  assert.equal(s.max, 300);
  assert.equal(t.stats('cold').n, 1);
  assert.equal(t.stats('nope'), null);
});

test('viaCounts tallies one kind by via, unsorted arrivals, other kinds excluded', () => {
  // Arrivals interleave kind and via out of any grouped order — a filter
  // that forgets to check kind, or a tally keyed wrong, must fail here.
  const flips = [
    { to: 'reef', kind: 'warm', via: 'dom-peek-backstop', ms: 400 },
    { to: 'feed', kind: 'cold', via: 'dom-peek', ms: 1200 },
    { to: 'forum', kind: 'warm', via: 'raf', ms: 90 },
    { to: 'wiki', kind: 'warm', via: 'dom-peek-backstop', ms: 350 },
    { to: 'chat', kind: 'cold', via: 'dom-peek-backstop', ms: 1500 },
    { to: 'reef', kind: 'warm', via: 'raf', ms: 80 },
    { to: 'feed', kind: 'warm', via: 'dom-peek-backstop', ms: 420 },
  ];
  assert.deepEqual(viaCounts(flips, 'warm'), { 'dom-peek-backstop': 3, raf: 2 });
  assert.deepEqual(viaCounts(flips, 'cold'), { 'dom-peek': 1, 'dom-peek-backstop': 1 });
  assert.deepEqual(viaCounts(flips, 'power'), {});
});
