import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfigMessage, isFromFrame, createReadinessGate } from '../web/handover.mjs';

test('config message matches the client contract, omitting absent optionals', () => {
  const msg = buildConfigMessage({ rpcEndpoint: 'http://localhost:8080/rpc', rpcAuth: 'Basic x' });
  assert.deepEqual(msg, {
    type: 'SWIMCHAIN_RPC_CONFIG',
    rpcEndpoint: 'http://localhost:8080/rpc',
    rpcAuth: 'Basic x',
  });
  assert.equal('nodeAddress' in msg, false); // omitted, not undefined
  const withId = buildConfigMessage({ rpcEndpoint: 'e', rpcAuth: 'a', nodeAddress: 'cs1q' });
  assert.equal(withId.nodeAddress, 'cs1q');
});

test('isFromFrame requires the exact source window AND exact origin', () => {
  const frameWin = {}; const otherWin = {};
  const ORIGIN = 'http://localhost:8080';
  assert.equal(isFromFrame({ source: frameWin, origin: ORIGIN }, frameWin, ORIGIN), true);
  assert.equal(isFromFrame({ source: otherWin, origin: ORIGIN }, frameWin, ORIGIN), false); // sibling
  assert.equal(isFromFrame({ source: frameWin, origin: 'http://evil.test' }, frameWin, ORIGIN), false);
  assert.equal(isFromFrame({ source: frameWin, origin: 'http://localhost:8080.evil.test' }, frameWin, ORIGIN), false); // prefix trick
});

function fakeTimers() {
  const pending = new Map(); let nextId = 1;
  return {
    set: (fn, ms) => { const id = nextId++; pending.set(id, { fn, ms }); return id; },
    clear: (id) => pending.delete(id),
    fire: () => { for (const { fn } of pending.values()) fn(); pending.clear(); },
    count: () => pending.size,
  };
}

test('gate: timeout fires when nothing was ready', () => {
  const t = fakeTimers(); let readyVia = null; let timedOut = false;
  createReadinessGate({ timeoutMs: 2000, onReady: (v) => { readyVia = v; }, onTimeout: () => { timedOut = true; },
    setTimeoutFn: t.set, clearTimeoutFn: t.clear });
  t.fire();
  assert.equal(timedOut, true);
  assert.equal(readyVia, null);
});

test('gate: ready settles, cancels the timeout, and reports the signal', () => {
  const t = fakeTimers(); let readyVia = null; let timedOut = false;
  const gate = createReadinessGate({ timeoutMs: 2000, onReady: (v) => { readyVia = v; }, onTimeout: () => { timedOut = true; },
    setTimeoutFn: t.set, clearTimeoutFn: t.clear });
  assert.equal(gate.ready('dom-peek'), true);
  assert.equal(readyVia, 'dom-peek');
  assert.equal(t.count(), 0);        // timeout cleared
  t.fire();
  assert.equal(timedOut, false);
});

test('gate: first signal wins — duplicate and post-timeout ready are ignored', () => {
  const t = fakeTimers(); let readyCount = 0;
  const gate = createReadinessGate({ timeoutMs: 2000, onReady: () => { readyCount++; }, onTimeout: () => {},
    setTimeoutFn: t.set, clearTimeoutFn: t.clear });
  assert.equal(gate.ready('message'), true);
  assert.equal(gate.ready('dom-peek'), false);  // duplicate
  assert.equal(readyCount, 1);

  const t2 = fakeTimers();
  const gate2 = createReadinessGate({ timeoutMs: 2000, onReady: () => { assert.fail('ready after timeout'); },
    onTimeout: () => {}, setTimeoutFn: t2.set, clearTimeoutFn: t2.clear });
  t2.fire();
  assert.equal(gate2.ready('late'), false);
});

test('gate: cancel prevents both callbacks (flip-away mid-mount)', () => {
  const t = fakeTimers();
  const gate = createReadinessGate({ timeoutMs: 2000, onReady: () => assert.fail('ready'), onTimeout: () => assert.fail('timeout'),
    setTimeoutFn: t.set, clearTimeoutFn: t.clear });
  gate.cancel();
  t.fire();
  assert.equal(gate.ready('x'), false);
});
