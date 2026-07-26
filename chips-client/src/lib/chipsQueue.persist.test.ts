/**
 * Persistence round-trip for the queue's localStorage backing.
 *
 * Every queued bank is a mined Argon2id proof — CPU the player cannot get
 * back — so `saveQueue`/`loadQueue` losing a field (especially the nonce,
 * which crosses a bigint <-> hex-string boundary on every save/load) would
 * silently discard real work. There is no committed proof of this round trip
 * anywhere else, so this file is that proof.
 *
 * It also pins `loadQueue`'s per-row validation: a row with a non-numeric id,
 * or missing/blank provenance (`tableId`/`author`), must be dropped rather
 * than trusted. Without this, a corrupt id (e.g. `NaN`, which JSON.parse
 * cannot itself produce but a hand-edited or partially-written row could) is
 * catastrophic in a way a mere throw is not: `markSent`'s landed-id `Set` uses
 * SameValueZero, under which `NaN === NaN` for `Set` membership purposes, so
 * a SINGLE `markSent` call would stamp EVERY entry with a `NaN` id as settled
 * at once — silently telling the sender to stop submitting every other mined
 * proof sharing that fate, not just the corrupt one.
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
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) : ''}`);
  }
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
const TABLE = 'sha256:table-a';
const ME = 'aaaa';

const uninstall = installFakeStorage();
try {
  clearQueue();

  // 1) Full save -> load round trip, every field, nonce as a real bigint —
  //    including 0n and the u64-max edge value the chip grammar allows.
  const q: QueuedMove[] = [
    { id: 1, tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 1_000_000, bits: 10, nonce: 0n } },
    { id: 2, tableId: TABLE, author: ME, kind: 'buy', key: 'season1' },
    { id: 3, tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 2_000_000, bits: 22, nonce: 2n ** 64n - 1n } },
  ];
  saveQueue(q);
  const loaded = loadQueue();

  check('round trip preserves length', loaded.length === q.length, loaded.length);
  check('round trip preserves ids and kinds in order',
    loaded.every((m, i) => m.id === q[i].id && m.kind === q[i].kind),
    loaded.map((m) => [m.id, m.kind]));
  check('round trip preserves provenance (tableId/author)',
    loaded.every((m, i) => m.tableId === q[i].tableId && m.author === q[i].author),
    loaded.map((m) => [m.tableId, m.author]));

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

  // 4) Per-row validation: a well-formed row survives NEXT TO a malformed
  //    one, which is dropped rather than crashing the whole load or (worse)
  //    being trusted with a corrupt id. Proven with the actual mutation this
  //    guards against: a NaN id. `JSON.parse` cannot itself produce a NaN
  //    (it isn't valid JSON), but `Number("not-a-number")` — the kind of
  //    thing an ad-hoc migration or a hand-edited row could produce — is
  //    exactly the shape this row-by-row check exists to catch.
  clearQueue();
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify([
    { id: 1, tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 1_000_000, bits: 10, nonce: '5' } }, // good
    { id: Number('not-a-number'), tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 2_000_000, bits: 12, nonce: 'a' } }, // NaN id
    { id: 3, tableId: '', author: ME, kind: 'buy', key: 'season1' },  // blank tableId
    { id: 4, tableId: TABLE, author: '', kind: 'buy', key: 'season1' }, // blank author
    { id: 5, tableId: TABLE, author: ME, kind: 'buy', key: 'season1' }, // good
  ]));
  const rows = loadQueue();
  check('rows with a non-numeric id, or blank tableId/author, are dropped; good rows survive',
    rows.length === 2 && rows[0].id === 1 && rows[1].id === 5,
    rows.map((m) => m.id));
  check('no row in the loaded queue ever has a NaN id',
    rows.every((m) => Number.isSafeInteger(m.id)), rows.map((m) => m.id));

  /* ── 5) The settling mark survives the round trip, and cannot be faked ───
   *
   * Settling entries are PERSISTED deliberately (see chipsQueue.ts's `sentAt`
   * doc): losing them on reload brings the purchase flicker back on every
   * refresh, which is the whole thing chipsSettling.ts exists to remove. The
   * cost of persisting is that a stale row can outlive its own truth across
   * sessions — bounded by `SETTLE_TTL_MS`, which is measured against the wall
   * clock, so a row restored from an old session is already expired the moment
   * it loads if enough time has passed.
   *
   * The dangerous direction is a mark that fails to load: an unsent row gets
   * SUBMITTED, and a settling row has already landed, so silently downgrading
   * one would resubmit an already-confirmed batch — the exact waste the ack
   * exists to prevent. Such a row is therefore dropped whole.
   */
  clearQueue();
  saveQueue([
    { id: 10, tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 3_000_000, bits: 11, nonce: 9n }, sentAt: 1_700_000_000_000 },
    { id: 11, tableId: TABLE, author: ME, kind: 'buy', key: 'season1', sentAt: 1_700_000_000_001 },
    { id: 12, tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 4_000_000, bits: 13, nonce: 0x1fn } },
  ]);
  const marked = loadQueue();
  const m0 = marked[0];
  check('a settling bank round-trips with its sentAt and its nonce intact',
    m0?.sentAt === 1_700_000_000_000 && m0?.kind === 'bank' && m0.chip.nonce === 9n,
    m0 && { sentAt: m0.sentAt, kind: m0.kind });
  const m1 = marked[1];
  check('a settling buy round-trips with its sentAt and its key',
    m1?.sentAt === 1_700_000_000_001 && m1?.kind === 'buy' && m1.key === 'season1', m1);
  const raw = JSON.parse(globalThis.localStorage.getItem(STORE_KEY) as string) as Record<string, unknown>[];
  check('a never-sent row comes back with NO sentAt at all (not null, not 0)',
    marked[2]?.sentAt === undefined && !('sentAt' in raw[2]), { loaded: marked[2]?.sentAt, stored: raw[2] });

  clearQueue();
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify([
    { id: 20, tableId: TABLE, author: ME, kind: 'buy', key: 'season1', sentAt: 'soon' },       // not a number
    { id: 21, tableId: TABLE, author: ME, kind: 'buy', key: 'season1', sentAt: Number('x') },  // NaN -> null in JSON
    { id: 22, tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 5_000_000, bits: 10, nonce: '3' }, sentAt: 1_700_000_000_000 },
    { id: 23, tableId: TABLE, author: ME, kind: 'buy', key: 'season2' },                        // good, unsent
  ]));
  const mixed = loadQueue();
  check('a row whose sentAt is unusable is DROPPED, never downgraded to unsent',
    !mixed.some((m) => m.id === 20), mixed.map((m) => ({ id: m.id, sentAt: m.sentAt })));
  check('...including a JSON null, which is what a NaN sentAt serialises to',
    !mixed.some((m) => m.id === 21), mixed.map((m) => m.id));
  check('good rows either side of a corrupt mark still load, marks intact',
    mixed.length === 2 && mixed[0].id === 22 && mixed[0].sentAt === 1_700_000_000_000
    && mixed[1].id === 23 && mixed[1].sentAt === undefined,
    mixed.map((m) => ({ id: m.id, sentAt: m.sentAt })));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
} finally {
  uninstall();
}
process.exit(failures === 0 ? 0 : 1);
