/**
 * Carrying the apron out of an in-app browser.
 *
 * A link opened from Messenger/Instagram/etc. runs in that app's WebView,
 * whose localStorage is sandboxed from the phone's real browser. The identity
 * minted there — and the table and every crumb bound to it — is unreachable
 * the moment the player graduates to Chrome/Safari on the SAME device. This
 * is not hypothetical: on 2026-08-01 a first-night player built a kitchen in
 * Messenger's browser, later opened the site properly, and was "back to
 * zero" with the original apron permanently stranded (tables Back Hand 588 /
 * Back Station 548 vs the fresh real-browser identity).
 *
 * The carry is a URL: the game's own address with the stored identity in the
 * `#apron=` fragment, base64url over the exact `swimchain-identity` JSON.
 * On boot, `carryImport` best-effort applies it. Fragments are never sent to
 * the server.
 *
 * THREAT MODEL, STATED PLAINLY: the fragment contains the SEED, and it lands
 * in the history of both browsers. That is a deliberate trade — this is a
 * game identity a player mints with one tap and holds no funds; the
 * alternative (encrypt + password prompt) is exactly the friction that made
 * her abandon the first session. Do not reuse this module for anything that
 * guards more than crumbs.
 *
 * DETECTION IS AN ALLOWLIST, not a WebView heuristic. Our own desktop and
 * mobile shells ARE WebViews (`; wv)` UAs, WebView2 on desktop); a generic
 * "am I in a WebView" test would offer players a pop-out inside the native
 * app, where it is at best a no-op and at worst loses the shell's node-mode
 * plumbing. Only known in-app SOCIAL browsers — the contexts links actually
 * arrive through — qualify.
 */

/** Same literal as swimchain-react's IDENTITY_STORAGE_KEY (useStoredIdentity.ts:67)
 *  — the hook does not export it. Shared by EVERY client on the origin, which
 *  is why an existing different identity is backed up, never overwritten. */
export const IDENTITY_KEY = 'swimchain-identity';

/** Mirrors swimchain-react's StoredIdentity exactly — the fragment payload IS
 *  the stored JSON, so the shapes must never drift apart. */
export interface CarriedIdentity {
  seed: string;
  publicKey: string;
  address: string;
  createdAt: number;
  displayName?: string;
}

const MARKERS = [
  'FBAN', 'FBAV', 'FB_IAB',          // Facebook & Messenger, both platforms
  'Instagram',
  'musical_ly', 'TikTok', 'BytedanceWebview',
  'Snapchat',
  'Line/',
];

/** Whether this UA is a known social in-app browser. Allowlist only — see
 *  the header for why a bare `; wv)` deliberately does NOT count. */
export function isInAppBrowser(ua: string): boolean {
  return MARKERS.some((m) => ua.includes(m));
}

const PREFIX = '#apron=';

// base64url over UTF-8, browser-native (no Buffer): apron names are player
// text and can hold anything.
function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

const isHex64 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v);

/** The page's own URL with the identity riding the fragment. `base` must be
 *  origin+path (no hash); the caller passes location.origin + location.pathname. */
export function buildCarryUrl(base: string, id: CarriedIdentity): string {
  if (!isHex64(id.seed) || !isHex64(id.publicKey)) {
    throw new Error('buildCarryUrl: refusing to carry a malformed identity');
  }
  // Serialize the exact stored shape — `carryImport` writes the parsed value
  // straight back to storage, so what rides the URL is what gets stored.
  const payload: CarriedIdentity = {
    seed: id.seed, publicKey: id.publicKey, address: id.address, createdAt: id.createdAt,
    ...(id.displayName !== undefined ? { displayName: id.displayName } : {}),
  };
  return base + PREFIX + b64urlEncode(JSON.stringify(payload));
}

/** Strict parse of a location.hash. Null on ANYTHING off — a carry that
 *  cannot be trusted whole is not applied at all. */
export function parseCarryHash(hash: string): CarriedIdentity | null {
  if (!hash.startsWith(PREFIX)) return null;
  const raw = b64urlDecode(hash.slice(PREFIX.length));
  if (raw === null) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isHex64(o.seed) || !isHex64(o.publicKey)) return null;
  if (typeof o.address !== 'string' || o.address.length === 0) return null;
  if (typeof o.createdAt !== 'number' || !Number.isFinite(o.createdAt)) return null;
  if (o.displayName !== undefined && typeof o.displayName !== 'string') return null;
  return {
    seed: o.seed, publicKey: o.publicKey, address: o.address, createdAt: o.createdAt,
    ...(o.displayName !== undefined ? { displayName: o.displayName } : {}),
  };
}

export type CarryResult = 'imported' | 'replaced' | 'noop';

/**
 * Best-effort boot-time import. Must run BEFORE anything reads the identity
 * (main.tsx, ahead of the React render — useStoredIdentity reads on mount).
 *
 * - no stored identity          -> write the carried one            ('imported')
 * - same identity already there -> nothing (the pop-out landed back
 *   in the same WebView, or the link was opened twice)              ('noop')
 * - a DIFFERENT identity there  -> back it up under a stamped key,
 *   then write the carried one — the button press is the player
 *   saying "THIS session is the one I mean", and the key is shared
 *   across clients on the origin, so the loser is preserved, never
 *   destroyed                                                       ('replaced')
 *
 * `at` is supplied by the caller so this stays deterministic under test.
 */
export function carryImport(storage: Storage, hash: string, at: number): CarryResult {
  const carried = parseCarryHash(hash);
  if (!carried) return 'noop';
  const existing = storage.getItem(IDENTITY_KEY);
  if (existing !== null) {
    let samePub = false;
    try { samePub = (JSON.parse(existing) as { publicKey?: unknown }).publicKey === carried.publicKey; }
    catch { /* unparseable counts as different — it still gets backed up */ }
    if (samePub) return 'noop';
    storage.setItem(`${IDENTITY_KEY}.replaced.${at}`, existing);
    storage.setItem(IDENTITY_KEY, JSON.stringify(carried));
    return 'replaced';
  }
  storage.setItem(IDENTITY_KEY, JSON.stringify(carried));
  return 'imported';
}
