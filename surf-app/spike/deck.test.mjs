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

test('current channel is never evicted even at warmSize 2 with a pin', () => {
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
