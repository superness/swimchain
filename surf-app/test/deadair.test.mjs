import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDeadAir,
  freshestTs,
  isMetered,
  classifyChannelDeadAir,
  pickFlareTarget,
  classifyAfterFlare,
} from '../web/deadair.mjs';

const DAY_MS = 86400_000;
const NOW = 10_000_000_000; // an arbitrary epoch-ms "now", well past any test ts below
const NOW_S = Math.floor(NOW / 1000);

const tsDaysAgo = (days) => NOW_S - Math.round(days * 86400);

// --- classifyDeadAir: boundaries ------------------------------------------

test('classifyDeadAir: under 2d is alive', () => {
  assert.equal(classifyDeadAir(tsDaysAgo(0), NOW).state, 'alive');
  assert.equal(classifyDeadAir(tsDaysAgo(1.9), NOW).state, 'alive');
});

test('classifyDeadAir: exactly 2d is fading (the >=2 boundary)', () => {
  assert.equal(classifyDeadAir(tsDaysAgo(2), NOW).state, 'fading');
});

test('classifyDeadAir: 4d is fading', () => {
  assert.equal(classifyDeadAir(tsDaysAgo(4), NOW).state, 'fading');
});

test('classifyDeadAir: exactly 5d is fading, NOT dying (the load-bearing boundary)', () => {
  const r = classifyDeadAir(tsDaysAgo(5), NOW);
  assert.equal(r.state, 'fading');
});

test('classifyDeadAir: just over 5d (5.5d) is dying', () => {
  assert.equal(classifyDeadAir(tsDaysAgo(5.5), NOW).state, 'dying');
});

test('classifyDeadAir: 8d is dying', () => {
  assert.equal(classifyDeadAir(tsDaysAgo(8), NOW).state, 'dying');
});

test('classifyDeadAir: null last_engagement_ts is dying (honest: zero engagements ever)', () => {
  const r = classifyDeadAir(null, NOW);
  assert.equal(r.state, 'dying');
  assert.equal(r.days, Infinity);
});

// --- freshestTs -------------------------------------------------------------

test('freshestTs: returns the freshest (max) ts, ignoring nulls', () => {
  const entries = [
    { last_engagement_ts: tsDaysAgo(6) }, // 6d-stale
    { last_engagement_ts: NOW_S - 3600 }, // 1h-fresh
    { last_engagement_ts: null },
  ];
  assert.equal(freshestTs(entries), NOW_S - 3600);
});

test('freshestTs: all-null entries returns null', () => {
  assert.equal(freshestTs([{ last_engagement_ts: null }, { last_engagement_ts: null }]), null);
  assert.equal(freshestTs([]), null);
});

// --- isMetered / classifyChannelDeadAir (the unmetered guard) --------------

test('isMetered: a channel with spaces:[] is unmetered; a channel with spaces is metered', () => {
  assert.equal(isMetered({ id: 'wiki', spaces: [] }), false);
  assert.equal(isMetered({ id: 'reef' }), false); // spaces omitted entirely
  assert.equal(isMetered({ id: 'feed', spaces: ['s1'] }), true);
});

test('classifyChannelDeadAir: unmetered channel (spaces:[]) -> no classification, no card, EVEN with stale entries', () => {
  const staleEntries = [{ last_engagement_ts: tsDaysAgo(30) }];
  const r = classifyChannelDeadAir({ id: 'wiki', spaces: [] }, staleEntries, NOW);
  assert.equal(r, null);
});

test('classifyChannelDeadAir: metered + alive -> null (no card)', () => {
  const freshEntries = [{ last_engagement_ts: tsDaysAgo(0.1) }];
  const r = classifyChannelDeadAir({ id: 'feed', spaces: ['s1'] }, freshEntries, NOW);
  assert.equal(r, null);
});

test('classifyChannelDeadAir: metered + stale -> real classification', () => {
  const staleEntries = [{ last_engagement_ts: tsDaysAgo(8) }];
  const r = classifyChannelDeadAir({ id: 'feed', spaces: ['s1'] }, staleEntries, NOW);
  assert.equal(r.state, 'dying');
});

// --- pickFlareTarget ---------------------------------------------------------

test('pickFlareTarget: picks the newest item by created_at', () => {
  const items = [
    { content_id: 'sha256:old', created_at: 100 },
    { content_id: 'sha256:new', created_at: 900 },
    { content_id: 'sha256:mid', created_at: 500 },
  ];
  assert.equal(pickFlareTarget(items), 'sha256:new');
});

test('pickFlareTarget: empty items -> null (nothing retrievable, "beyond flares")', () => {
  assert.equal(pickFlareTarget([]), null);
});

// --- classifyAfterFlare (the optimistic flare test) -------------------------

test('classifyAfterFlare: a successful flare re-classifies as alive via the optimistic now-timestamp', () => {
  const staleTs = tsDaysAgo(8); // was dying before the flare
  const pre = classifyDeadAir(staleTs, NOW);
  assert.equal(pre.state, 'dying');

  const post = classifyAfterFlare(staleTs, NOW, /* flareOk */ true);
  assert.equal(post.state, 'alive');
});

test('classifyAfterFlare: a FAILED flare leaves the stale ts classification unchanged', () => {
  const staleTs = tsDaysAgo(8);
  const post = classifyAfterFlare(staleTs, NOW, /* flareOk */ false);
  assert.equal(post.state, 'dying');
});
