/**
 * Minimal browser shims so client modules import cleanly under Node.
 *
 * We intentionally do NOT use jsdom/happy-dom: the clients' rpc/pow modules
 * only need `window` (forum logger checks window.parent at import time) and
 * `localStorage` (archiver AutoEngageEngine / bridge BridgeEngine persist
 * budget & config). Real fetch/crypto come from Node >= 18.
 */

const g = globalThis as Record<string, unknown>;

if (typeof g.window === 'undefined') {
  // window.parent === window  ->  clients detect "not embedded"
  g.window = globalThis;
  (globalThis as { parent?: unknown }).parent = globalThis;
}

// Some modules register listeners at import time (e.g. @swimchain/frontend
// providers); Node's globalThis lacks the DOM event APIs.
for (const fn of ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const) {
  if (typeof (g.window as Record<string, unknown>)[fn] !== 'function') {
    (g.window as Record<string, unknown>)[fn] = () => undefined;
  }
}

if (typeof g.localStorage === 'undefined') {
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

if (typeof g.navigator === 'undefined') {
  g.navigator = { userAgent: 'node-e2e', language: 'en-US' };
}
