/**
 * Persistence round-trip for the queue's localStorage backing.
 *
 * Every queued bank is a mined Argon2id proof — CPU the player cannot get
 * back — so `saveQueue`/`loadQueue` losing a field (especially the nonce,
 * which crosses a bigint <-> hex-string boundary on every save/load) would
 * silently discard real work. There is no committed proof of this round trip
 * anywhere else, so this file is that proof.
 *
 * Node has no `localStorage`. This file installs a minimal in-memory stub on
 * `globalThis` for its own duration only, and removes it (via `finally`)
 * before the process exits, so it cannot leak into any other test file that
 * might share a process.
 *
 * Run: npx tsx src/lib/chipsQueue.persist.test.ts
 */
import { loadQueue, saveQueue, clearQueue, type QueuedMove } from './chipsQueue';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

type GlobalWithStorage = Omit<typeof globalThis, 'localStorage'> & { localStorage?: Storage };

function installFakeStorage(): () => void {
  const data = new Map<string, string>();
  const fake: Storage = {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  const g = globalThis as GlobalWithStorage;
  const hadOwn = Object.prototype.hasOwnProperty.call(g, 'localStorage');
  const prev = g.localStorage;
  g.localStorage = fake;
  return () => {
    if (hadOwn) g.localStorage = prev;
    else delete g.localStorage;
  };
}

const STORE_KEY = 'chips.queue.v1'; // must match chipsQueue.ts's private STORE_KEY

const uninstall = installFakeStorage();
try {
  clearQueue();

  // 1) Full save -> load round trip, every field, nonce as a real bigint —
  //    including 0n and the u64-max edge value the chip grammar allows.
  const q: QueuedMove[] = [
    { id: 1, kind: 'bank', chip: { ms: 1_000_000, bits: 10, nonce: 0n } },
    { id: 2, kind: 'buy', key: 'season1' },
    { id: 3, kind: 'bank', chip: { ms: 2_000_000, bits: 22, nonce: 2n ** 64n - 1n } },
  ];
  saveQueue(q);
  const loaded = loadQueue();

  check('round trip preserves length', loaded.length === q.length, loaded.length);
  check('round trip preserves ids and kinds in order',
    loaded.every((m, i) => m.id === q[i].id && m.kind === q[i].kind),
    loaded.map((m) => [m.id, m.kind]));

  const e0 = loaded[0];
  check('bank chip fields round trip',
    e0?.kind === 'bank' && e0.chip.ms === 1_000_000 && e0.chip.bits === 10 && e0.chip.nonce === 0n,
    e0);
  check('zero nonce round trips as a real bigint',
    e0?.kind === 'bank' && typeof e0.chip.nonce === 'bigint' && e0.chip.nonce === 0n);

  const e1 = loaded[1];
  check('buy key round trips', e1?.kind === 'buy' && e1.key === 'season1', e1);

  const e2 = loaded[2];
  check('u64-max nonce round trips exactly',
    e2?.kind === 'bank' && e2.chip.nonce === 2n ** 64n - 1n,
    e2?.kind === 'bank' ? e2.chip.nonce.toString() : e2);
  check('u64-max nonce is a real bigint, not a string',
    e2?.kind === 'bank' && typeof e2.chip.nonce === 'bigint');

  // 2) clearQueue empties the store.
  clearQueue();
  check('clearQueue leaves loadQueue empty', loadQueue().length === 0, loadQueue().length);

  // 3) Corrupt JSON in storage must degrade to [], never throw — a queue full
  //    of unspent proofs must not take the game down with it.
  globalThis.localStorage.setItem(STORE_KEY, '{not json');
  let threw = false;
  let corrupt: QueuedMove[] = [];
  try {
    corrupt = loadQueue();
  } catch {
    threw = true;
  }
  check('corrupt JSON does not throw', !threw);
  check('corrupt JSON degrades to an empty queue', corrupt.length === 0, corrupt.length);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
} finally {
  uninstall();
}
process.exit(failures === 0 ? 0 : 1);
