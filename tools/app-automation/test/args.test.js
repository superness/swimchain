const { test } = require('node:test');
const assert = require('node:assert');
const { parseArgs } = require('../lib/args');

test('positionals and flags', () => {
  assert.deepStrictEqual(parseArgs(['click', 'text=New Thread', '--shot']), {
    _: ['click', 'text=New Thread'],
    shot: true,
  });
});

test('flag values', () => {
  assert.deepStrictEqual(parseArgs(['wait', '#root', '--timeout=5000']), {
    _: ['wait', '#root'],
    timeout: '5000',
  });
  assert.deepStrictEqual(parseArgs(['screenshot', '--out=x.png', '--full']), {
    _: ['screenshot'],
    out: 'x.png',
    full: true,
  });
});

test('multi-word tail stays positional', () => {
  const a = parseArgs(['type', '#title', 'hello', 'world']);
  assert.deepStrictEqual(a._, ['type', '#title', 'hello', 'world']);
});
