/**
 * configTrust — the origin + event.source gate for the SWIMCHAIN_RPC_CONFIG
 * handover (Surf spec §2.2, C1 Task 4). Byte-identical copy of
 * swimchain-frontend/src/hooks/configTrust.ts; this file exercises the copy that
 * actually ships in this client, not the canonical original. Run:
 *   npx tsx src/lib/configTrust.test.ts
 */
import assert from 'node:assert/strict';
import { isConfigMessageTrusted } from './configTrust';

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}  ${err instanceof Error ? err.message : String(err)}`);
  }
}

const SELF = 'http://localhost:5173';
const parent = {};
const sibling = {};
const ctx = { selfOrigin: SELF, parentWindow: parent };

check('trusts an exact same-origin message from the real parent window', () => {
  assert.strictEqual(isConfigMessageTrusted({ origin: SELF, source: parent }, ctx), true);
});

check('trusts the enumerated Tauri shell origins from the parent', () => {
  for (const o of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
    assert.strictEqual(isConfigMessageTrusted({ origin: o, source: parent }, ctx), true, o);
  }
});

check('rejects a prefix-lookalike origin', () => {
  // §7: `http://localhost.evil.com` starts with `http://localhost` and
  // `http://tauri.localhost.evil.com` starts with `http://tauri.localhost` — exactly
  // the shape the old `origin.startsWith(allowed)` check let through.
  assert.strictEqual(isConfigMessageTrusted({ origin: 'http://localhost.evil.com', source: parent }, ctx), false);
  assert.strictEqual(isConfigMessageTrusted({ origin: 'http://tauri.localhost.evil.com', source: parent }, ctx), false);
});

check('rejects a message whose source is not window.parent', () => {
  assert.strictEqual(isConfigMessageTrusted({ origin: SELF, source: sibling }, ctx), false);
  assert.strictEqual(isConfigMessageTrusted({ origin: SELF, source: null }, ctx), false);
});

check('rejects an empty origin, even from the real parent', () => {
  assert.strictEqual(isConfigMessageTrusted({ origin: '', source: parent }, ctx), false);
});

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
