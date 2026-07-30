import test from 'node:test';
import assert from 'node:assert/strict';
import { chartRows, bandOf, toggleMoor, loadMoored } from '../web/chart.mjs';
import { glow, MOOR_CAP } from '../web/policy.mjs';

// Minimal getItem-only fake store (dwell.test.mjs's fakeStore convention).
function fakeStore(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null) };
}

const NOW = 10_000_000_000; // an arbitrary epoch-ms "now" (exact multiple of 1000, so ts*1000 round-trips exactly)
const NOW_S = Math.floor(NOW / 1000);
const tsDaysAgo = (days) => NOW_S - Math.round(days * 86400);

// --- bandOf: boundaries per §3.4 --------------------------------------------

test('bandOf: surface 2-19, mid 20-49, reef 50-79, trench 80-98 (exact boundaries)', () => {
  assert.equal(bandOf(19), 'surface');
  assert.equal(bandOf(20), 'mid');
  assert.equal(bandOf(49), 'mid');
  assert.equal(bandOf(50), 'reef');
  assert.equal(bandOf(79), 'reef');
  assert.equal(bandOf(80), 'trench');
});

// --- chartRows: canonical dial order = number order = depth order ----------

test('chartRows: rows come back in canonical dial order regardless of input order', () => {
  const channels = [
    { id: 'reef', number: 50, name: 'REEF', spaces: [] },
    { id: 'feed', number: 2, name: 'FEED', spaces: [] },
    { id: 'wiki', number: 4, name: 'WIKI', spaces: [] },
  ];
  const rows = chartRows(channels, {}, new Set(), new Set(), NOW);
  assert.deepEqual(rows.map((r) => r.id), ['feed', 'wiki', 'reef']);
  assert.deepEqual(rows.map((r) => r.band), ['surface', 'surface', 'reef']);
});

// --- chartRows: glowValue uses freshestTs (freshest space wins) ------------

test("chartRows: glowValue uses freshestTs across a channel's spaces (freshest wins, not stale)", () => {
  const channels = [{ id: 'feed', number: 2, name: 'FEED', spaces: ['s1', 's2'] }];
  const health = {
    feed: [
      { last_engagement_ts: tsDaysAgo(6) }, // 6d-stale
      { last_engagement_ts: NOW_S - 3600 }, // 1h-fresh
    ],
  };
  const rows = chartRows(channels, health, new Set(), new Set(), NOW);
  const expectedAgeSeconds = (NOW - (NOW_S - 3600) * 1000) / 1000; // exactly 3600
  assert.equal(rows[0].glowValue, glow(expectedAgeSeconds));
  assert.notEqual(rows[0].glowValue, glow((NOW - tsDaysAgo(6) * 1000) / 1000)); // NOT the stale one
});

// --- chartRows: afterglow flag ----------------------------------------------

test('chartRows: warm-deck channels flagged afterglow; non-warm not', () => {
  const channels = [
    { id: 'feed', number: 2, name: 'FEED', spaces: [] },
    { id: 'wiki', number: 4, name: 'WIKI', spaces: [] },
  ];
  const rows = chartRows(channels, {}, new Set(['feed']), new Set(), NOW);
  assert.equal(rows.find((r) => r.id === 'feed').afterglow, true);
  assert.equal(rows.find((r) => r.id === 'wiki').afterglow, false);
});

test("chartRows: warmSet accepts a plain array (deck.warm's own return shape)", () => {
  const channels = [{ id: 'feed', number: 2, name: 'FEED', spaces: [] }];
  const rows = chartRows(channels, {}, ['feed'], new Set(), NOW);
  assert.equal(rows[0].afterglow, true);
});

// --- chartRows: unmetered vs measured-dead (THE blocker) --------------------

test('chartRows: metered channel with no matching health entries -> glowValue 0 (measured, honest), unmetered:false', () => {
  const channels = [{ id: 'feed', number: 2, name: 'FEED', spaces: ['s1'] }];
  const rows = chartRows(channels, {}, new Set(), new Set(), NOW); // no 'feed' key in healthByChannel at all
  assert.equal(rows[0].unmetered, false);
  assert.equal(rows[0].glowValue, 0);
});

test('chartRows: spaces:[] channel -> unmetered:true, glowValue null, NEVER 0 — even with stale/fake health data present under its id', () => {
  const channels = [{ id: 'wiki', number: 4, name: 'WIKI', spaces: [] }];
  const deliberatelyStale = { wiki: [{ last_engagement_ts: tsDaysAgo(30) }] };
  const rows = chartRows(channels, deliberatelyStale, new Set(), new Set(), NOW);
  assert.equal(rows[0].unmetered, true);
  assert.equal(rows[0].glowValue, null);
});

// --- chartRows: moored flag --------------------------------------------------

test('chartRows: moored flag reflects the moored set', () => {
  const channels = [
    { id: 'feed', number: 2, name: 'FEED', spaces: [] },
    { id: 'wiki', number: 4, name: 'WIKI', spaces: [] },
  ];
  const rows = chartRows(channels, {}, new Set(), new Set(['wiki']), NOW);
  assert.equal(rows.find((r) => r.id === 'feed').moored, false);
  assert.equal(rows.find((r) => r.id === 'wiki').moored, true);
});

// --- toggleMoor ---------------------------------------------------------------

test('toggleMoor: adds when under cap (returns a NEW set, pure)', () => {
  const moored = new Set(['a']);
  const next = toggleMoor(moored, 'b', 3);
  assert.deepEqual([...next].sort(), ['a', 'b']);
  assert.notEqual(next, moored);
  assert.deepEqual([...moored], ['a']); // input untouched
});

test('toggleMoor: removes when already moored', () => {
  const moored = new Set(['a', 'b']);
  const next = toggleMoor(moored, 'a', 3);
  assert.deepEqual([...next], ['b']);
});

test('toggleMoor: past cap returns the UNCHANGED set (same reference) -- shell surfaces "deck full" via ===', () => {
  const moored = new Set(['a', 'b', 'c']);
  const next = toggleMoor(moored, 'd', 3);
  assert.equal(next, moored); // reference equality, not just value equality
  assert.equal(next.size, 3);
});

test('toggleMoor: default cap is MOOR_CAP from policy.mjs', () => {
  assert.equal(MOOR_CAP, 3);
  const moored = new Set(['a', 'b', 'c']);
  const next = toggleMoor(moored, 'd'); // no explicit cap arg
  assert.equal(next, moored);
});

// --- loadMoored (review fix: a corrupted stored value must degrade to ------
// "nothing moored", never throw and brick the whole shell module import) ---

test('loadMoored: valid JSON array -> a Set of those ids', () => {
  const store = fakeStore({ 'surf.moored': '["feed","wiki"]' });
  assert.deepEqual([...loadMoored(store, 'surf.moored')].sort(), ['feed', 'wiki']);
});

test('loadMoored: missing key -> empty Set (unchanged first-boot behavior)', () => {
  const store = fakeStore({});
  assert.deepEqual([...loadMoored(store, 'surf.moored')], []);
});

test('loadMoored: garbage (non-JSON) stored value -> empty Set, does NOT throw', () => {
  const store = fakeStore({ 'surf.moored': 'not json at all {{{' });
  assert.doesNotThrow(() => loadMoored(store, 'surf.moored'));
  assert.deepEqual([...loadMoored(store, 'surf.moored')], []);
});

test('loadMoored: valid JSON but wrong shape (a bare number/string, not an array) -> empty Set', () => {
  assert.deepEqual([...loadMoored(fakeStore({ 'surf.moored': '7' }), 'surf.moored')], []);
  assert.deepEqual([...loadMoored(fakeStore({ 'surf.moored': '"feed"' }), 'surf.moored')], []);
  assert.deepEqual([...loadMoored(fakeStore({ 'surf.moored': '{"feed":true}' }), 'surf.moored')], []);
});
