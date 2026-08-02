import test from 'node:test';
import assert from 'node:assert/strict';
import { pickBootstrap, loadFeedSpaces, FEED_SPACES_KEY } from '../web/bootstrap.mjs';

const FALLBACK = ['01000f8857cd77a75d8fcd7951d99ede', '01000da9416b0bd33114a11234a1397d', '01000c35f149d92a466db1e1705d41cb'];

const space = (id, cls, ts) => ({ space_id: id, class: cls, last_activity: ts, post_count: 1, name: null });

// --- pickBootstrap -----------------------------------------------------------

test('pickBootstrap: filters to class===social, top-3 by last_activity descending', () => {
  const result = {
    spaces: [
      space('sp1a', 'social', 100),
      space('sp1b', 'social', 900),
      space('sp1c', 'social', 500),
      space('sp1d', 'social', 300),
    ],
  };
  const picked = pickBootstrap(result, FALLBACK);
  assert.deepEqual(picked, ['sp1b', 'sp1c', 'sp1d']); // 900, 500, 300 -- 100 dropped (only top 3)
});

test('pickBootstrap: THE MUTATION TARGET -- drops the social filter -> a non-social space with higher last_activity than any social space must NOT appear', () => {
  const result = {
    spaces: [
      space('sp1-profile-hot', 'profile', 99999), // most recent overall, but not social
      space('sp1-social-a', 'social', 500),
      space('sp1-social-b', 'social', 300),
    ],
  };
  const picked = pickBootstrap(result, FALLBACK);
  assert.deepEqual(picked, ['sp1-social-a', 'sp1-social-b']);
  assert.ok(!picked.includes('sp1-profile-hot'), 'a non-social space must never be picked, regardless of recency');
});

test('pickBootstrap: mixed classes (dm, private, app, unknown) all excluded, only social ranked', () => {
  const result = {
    spaces: [
      space('sp1-dm', 'dm', 999),
      space('sp1-private', 'private', 998),
      space('sp1-app', 'app', 997),
      space('sp1-unknown', 'unknown', 996),
      space('sp1-social', 'social', 1),
    ],
  };
  const picked = pickBootstrap(result, FALLBACK);
  assert.deepEqual(picked, ['sp1-social']);
});

test('pickBootstrap: fewer than 3 social spaces -> returns however many exist, not padded with fallback', () => {
  const result = { spaces: [space('sp1a', 'social', 500), space('sp1b', 'social', 100)] };
  const picked = pickBootstrap(result, FALLBACK);
  assert.deepEqual(picked, ['sp1a', 'sp1b']);
});

test('pickBootstrap: null last_activity sorts last (never crashes, never wins the ranking)', () => {
  const result = {
    spaces: [
      space('sp1-never', 'social', null),
      space('sp1-recent', 'social', 500),
      space('sp1-old', 'social', 10),
    ],
  };
  const picked = pickBootstrap(result, FALLBACK);
  assert.deepEqual(picked, ['sp1-recent', 'sp1-old', 'sp1-never']);
});

test('pickBootstrap: empty spaces list -> returns the exact fallbackSpaces reference (shell uses === to skip persisting)', () => {
  const picked = pickBootstrap({ spaces: [] }, FALLBACK);
  assert.equal(picked, FALLBACK); // reference equality, not just deepEqual -- matches toggleMoor's own cap-signal idiom
});

test('pickBootstrap: no social spaces at all (only other classes) -> same fallback-reference behavior', () => {
  const picked = pickBootstrap({ spaces: [space('sp1-dm', 'dm', 999)] }, FALLBACK);
  assert.equal(picked, FALLBACK);
});

test('pickBootstrap: missing/malformed listSpacesResult (no .spaces) -> fallback reference, does not throw', () => {
  assert.doesNotThrow(() => pickBootstrap({}, FALLBACK));
  assert.equal(pickBootstrap({}, FALLBACK), FALLBACK);
  assert.equal(pickBootstrap(null, FALLBACK), FALLBACK);
});

test('pickBootstrap: never mutates listSpacesResult.spaces or fallbackSpaces', () => {
  const spaces = [space('sp1a', 'social', 500), space('sp1b', 'social', 900)];
  const spacesCopy = spaces.map((s) => ({ ...s }));
  const fallbackCopy = [...FALLBACK];
  pickBootstrap({ spaces }, FALLBACK);
  assert.deepEqual(spaces, spacesCopy);
  assert.deepEqual(FALLBACK, fallbackCopy);
});

// --- loadFeedSpaces (boot-time re-apply source) -------------------------------

function fakeStore(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('loadFeedSpaces: valid JSON array of strings -> that array', () => {
  const store = fakeStore({ [FEED_SPACES_KEY]: JSON.stringify(['sp1a', 'sp1b']) });
  assert.deepEqual(loadFeedSpaces(store), ['sp1a', 'sp1b']);
});

test('loadFeedSpaces: missing key -> null (channels.json trio stays live, untouched)', () => {
  assert.equal(loadFeedSpaces(fakeStore({})), null);
});

test('loadFeedSpaces: garbage non-JSON stored value -> null, does not throw', () => {
  const store = fakeStore({ [FEED_SPACES_KEY]: 'not json at all {{{' });
  assert.doesNotThrow(() => loadFeedSpaces(store));
  assert.equal(loadFeedSpaces(store), null);
});

test('loadFeedSpaces: valid JSON of the wrong shape -> null', () => {
  assert.equal(loadFeedSpaces(fakeStore({ [FEED_SPACES_KEY]: '7' })), null);
  assert.equal(loadFeedSpaces(fakeStore({ [FEED_SPACES_KEY]: '"feed"' })), null);
  assert.equal(loadFeedSpaces(fakeStore({ [FEED_SPACES_KEY]: '{"a":1}' })), null);
  assert.equal(loadFeedSpaces(fakeStore({ [FEED_SPACES_KEY]: '[1,2,3]' })), null); // array of non-strings
});

test('loadFeedSpaces: stored empty array -> null (treated as absent, never a valid override)', () => {
  assert.equal(loadFeedSpaces(fakeStore({ [FEED_SPACES_KEY]: '[]' })), null);
});

// --- curated-first (2026-08-02) ----------------------------------------------
// A stranger who had just been vouched for by a human landed on a space
// republishing r/dankmemes, because ranking by raw last_activity hands the
// first impression to whoever posts most often. On mainnet that was "Bot talk"
// — 277 posts, 0.0d old — against the operator's own intro space at 4.5d.

test('pickBootstrap: the curated set beats a fresher uncurated space', () => {
  const CURATED = ['sp1curated_a', 'sp1curated_b'];
  const result = {
    spaces: [
      // the relay: freshest by far, and it must NOT win
      space('sp1botrelay', 'social', 9_999_999),
      space('sp1curated_a', 'social', 1_000),
      space('sp1curated_b', 'social', 900),
    ],
  };
  const picked = pickBootstrap(result, CURATED);
  assert.deepEqual(picked, CURATED, 'curated spaces must win the first-run pick');
  assert.ok(!picked.includes('sp1botrelay'), 'the freshest uncurated space must not be adopted');
});

test('pickBootstrap: adopts only the curated spaces this node actually has', () => {
  const CURATED = ['sp1curated_a', 'sp1missing'];
  const result = { spaces: [space('sp1curated_a', 'social', 1_000), space('sp1other', 'social', 5_000)] };
  assert.deepEqual(
    pickBootstrap(result, CURATED),
    ['sp1curated_a'],
    'a curated space this node has never synced must not be adopted'
  );
});

test('pickBootstrap: falls back to ranking when NO curated space is present', () => {
  // This is the B5 resilience that must survive: if the curated set decays
  // away or was never synced, discovery still takes over.
  const CURATED = ['sp1gone_a', 'sp1gone_b'];
  const result = {
    spaces: [space('sp1live', 'social', 9_000), space('sp1older', 'social', 100)],
  };
  assert.deepEqual(
    pickBootstrap(result, CURATED),
    ['sp1live', 'sp1older'],
    'with no curated space present, rank by recency as before'
  );
});
