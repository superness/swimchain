import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMount } from './server.mjs';

const CHANNELS = [{ id: 'feed', dist: 'x' }, { id: 'reef', dist: 'y' }];

test('root serves the shell index', () => {
  assert.deepEqual(resolveMount('/', CHANNELS), { channelId: null, rel: '/index.html' });
});

test('shell files resolve to the spike dir', () => {
  assert.deepEqual(resolveMount('/shell.mjs', CHANNELS), { channelId: null, rel: '/shell.mjs' });
});

test('channel root serves that dist index', () => {
  assert.deepEqual(resolveMount('/channels/feed/', CHANNELS), { channelId: 'feed', rel: '/index.html' });
  assert.deepEqual(resolveMount('/channels/feed', CHANNELS), { channelId: 'feed', rel: '/index.html' });
});

test('channel assets resolve inside that dist', () => {
  assert.deepEqual(resolveMount('/channels/reef/assets/index-abc.js', CHANNELS),
    { channelId: 'reef', rel: '/assets/index-abc.js' });
});

test('extensionless channel path falls back to its index (SPA deep link)', () => {
  assert.deepEqual(resolveMount('/channels/feed/space/123', CHANNELS),
    { channelId: 'feed', rel: '/index.html' });
});

test('unknown channel is rejected', () => {
  assert.equal(resolveMount('/channels/nope/index.html', CHANNELS), null);
});

test('traversal is rejected, encoded or not', () => {
  assert.equal(resolveMount('/channels/feed/%2e%2e/%2e%2e/server.mjs', CHANNELS), null);
  assert.equal(resolveMount('/..%2f..%2fsecret', CHANNELS), null);
  assert.equal(resolveMount('/channels/feed/..%5c..%5cserver.mjs', CHANNELS), null);
});
