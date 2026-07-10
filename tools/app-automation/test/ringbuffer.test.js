const { test } = require('node:test');
const assert = require('node:assert');
const { RingBuffer } = require('../lib/ringbuffer');

function entry(kind, type, text) {
  return { ts: 0, kind, type, text, location: '' };
}

test('caps at capacity, keeping newest', () => {
  const b = new RingBuffer(3);
  for (let i = 1; i <= 5; i++) b.push(entry('console', 'log', `m${i}`));
  assert.strictEqual(b.size, 3);
  assert.deepStrictEqual(b.list().map(e => e.text), ['m3', 'm4', 'm5']);
});

test('errorsOnly filters to errors', () => {
  const b = new RingBuffer(10);
  b.push(entry('console', 'log', 'info'));
  b.push(entry('console', 'error', 'boom'));
  b.push(entry('pageerror', '', 'crash'));
  b.push(entry('requestfailed', '', 'net'));
  assert.deepStrictEqual(b.list({ errorsOnly: true }).map(e => e.text), ['boom', 'crash', 'net']);
});

test('tail limits to last N after filtering', () => {
  const b = new RingBuffer(10);
  for (let i = 1; i <= 5; i++) b.push(entry('console', 'log', `m${i}`));
  assert.deepStrictEqual(b.list({ tail: 2 }).map(e => e.text), ['m4', 'm5']);
});

test('clear empties the buffer', () => {
  const b = new RingBuffer(10);
  b.push(entry('console', 'log', 'x'));
  b.clear();
  assert.strictEqual(b.size, 0);
});
