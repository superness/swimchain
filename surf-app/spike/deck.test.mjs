import test from 'node:test';
import assert from 'node:assert/strict';
import { Deck } from './deck.mjs';

const IDS = ['feed', 'forum', 'wiki', 'chat', 'reef'];

test('first tune mounts and sets current', () => {
  const d = new Deck(IDS, 3);
  assert.deepEqual(d.tune('feed'), { mounted: ['feed'], evicted: [], current: 'feed' });
  assert.equal(d.current, 'feed');
  assert.deepEqual(d.warm, ['feed']);
});

test('warm set grows to warmSize without eviction', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum');
  const r = d.tune('wiki');
  assert.deepEqual(r.evicted, []);
  assert.equal(d.warm.length, 3);
});

test('exceeding warmSize evicts the least-recently-current channel', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum'); d.tune('wiki');
  const r = d.tune('chat');
  assert.deepEqual(r, { mounted: ['chat'], evicted: ['feed'], current: 'chat' });
});

test('re-tuning refreshes recency', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum'); d.tune('wiki');
  d.tune('feed');               // feed is now most recent
  const r = d.tune('chat');     // forum is now LRU
  assert.deepEqual(r.evicted, ['forum']);
});

test('tuning a warm channel mounts nothing', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum');
  assert.deepEqual(d.tune('feed').mounted, []);
});

test('pinned channels are never LRU-evicted', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.pin('feed');
  d.tune('forum'); d.tune('wiki');
  const r = d.tune('chat');     // candidates exclude pinned feed and current chat
  assert.deepEqual(r.evicted, ['forum']);
  assert.deepEqual(new Set(d.warm), new Set(['feed', 'wiki', 'chat']));
});

test('pinned survives eviction pressure at warmSize 2', () => {
  const d = new Deck(IDS, 2);
  d.tune('feed'); d.pin('feed');
  d.tune('forum');
  const r = d.tune('wiki');     // warm {feed(pinned), forum, wiki(current)} > 2
  assert.deepEqual(r.evicted, ['forum']);
});

test('next/prev walk dial order and wrap', () => {
  const d = new Deck(IDS, 3);
  d.tune('reef');
  assert.equal(d.next().current, 'feed');   // wrap bottom -> top
  assert.equal(d.prev().current, 'reef');   // and back
});

test('unknown channel throws; warmSize < 2 throws', () => {
  const d = new Deck(IDS, 3);
  assert.throws(() => d.tune('nope'), /unknown channel/);
  assert.throws(() => new Deck(IDS, 1), /warmSize/);
});

test('forced evict removes a warm channel but refuses the current one', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum');
  d.evict('feed');
  assert.deepEqual(d.warm, ['forum']);
  assert.throws(() => d.evict('forum'), /current/);
});

test('eviction never selects the channel being tuned', () => {
  // Verify the current-protection invariant: after any sequence of tunes,
  // the current channel is never in the evicted list, and always in the warm set.
  // Runs ~20 scripted tunes across all 5 ids at warmSize 2 and 3, testing that
  // the cid !== this.#current filter is load-bearing (even if only defensively).
  const testWarmSizes = [2, 3];
  for (const warmSize of testWarmSizes) {
    const d = new Deck(IDS, warmSize);
    // Scripted tune sequence: cycle through all ids multiple times
    const tuneSequence = [...IDS, ...IDS, 'feed', 'chat', 'wiki', 'forum', 'reef', 'feed'];
    for (const id of tuneSequence) {
      const r = d.tune(id);
      // Invariant 1: evicted list never contains the channel just tuned (current)
      assert.ok(!r.evicted.includes(r.current),
        `evicted should not contain current; got evicted=[${r.evicted}] current=${r.current} warmSize=${warmSize}`);
      // Invariant 2: current is always in the warm set
      assert.ok(d.warm.includes(d.current),
        `warm set must include current; warm=[${d.warm}] current=${d.current} warmSize=${warmSize}`);
    }
  }
});
