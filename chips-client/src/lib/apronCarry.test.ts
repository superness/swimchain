/**
 * Carrying the apron out of an in-app browser.
 *
 * A player who opens the game from a Messenger/Instagram link plays inside
 * that app's WebView, whose localStorage is sandboxed from the real browser
 * on the SAME phone. Their identity — and with it their table and every
 * crumb — is stranded there the moment they "open it properly" later. This
 * happened on 2026-08-01: a first-night player built a kitchen in
 * Messenger's browser, opened the site in her real browser, and was
 * "back to zero" with the original apron unreachable.
 *
 * The carry: a button (shown ONLY inside known in-app browsers) opens the
 * game's own URL with the identity in the #fragment; on boot the client
 * best-effort imports it. Fragments never reach the server. See
 * apronCarry.ts's header for the threat-model note on putting a seed there.
 *
 * Run: npx tsx src/lib/apronCarry.test.ts
 */
import {
  isInAppBrowser, buildCarryUrl, parseCarryHash, carryImport,
  IDENTITY_KEY, type CarriedIdentity,
} from './apronCarry';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ---------------------------------------------------------------------------
// 1) In-app detection is an ALLOWLIST of social in-app markers — never a
//    generic WebView heuristic. Our own desktop/mobile shells are WebViews;
//    a false positive there would offer players a pointless (and confusing)
//    pop-out inside the native app.
{
  const inApp = [
    // Messenger Android (mom's actual context)
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/389.0.0.0;]',
    // Facebook app
    'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 [FBAN/FB4A;FBAV/388.0.0.0]',
    // Messenger iOS
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/MessengerForiOS;FBAV/430.0.0]',
    // Instagram
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Instagram 310.0.0.0 Android',
    // TikTok
    'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 musical_ly_2022 JsSdk/1.0',
    // Snapchat
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Snapchat/12.0',
    // LINE
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Line/13.0.0',
  ];
  for (const ua of inApp) check(`in-app: ${ua.slice(-40)}`, isInAppBrowser(ua) === true);

  const notInApp = [
    // Plain Chrome on Android
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    // Plain Safari on iOS
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    // Desktop Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    // A BARE Android WebView (`; wv)`) — e.g. our own mobile shell. Deliberately
    // NOT treated as in-app: the allowlist, not the wv marker, is the rule.
    'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36',
    // Tauri desktop shell (WebView2)
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    '',
  ];
  for (const ua of notInApp) check(`not in-app: ${(ua || '(empty)').slice(-40)}`, isInAppBrowser(ua) === false);
}

// ---------------------------------------------------------------------------
// 2) Payload round trip: URL -> hash -> identity, byte-exact.
const APRON: CarriedIdentity = {
  seed: 'a'.repeat(64),
  publicKey: '4a713fe44cffa01ed0b683ee5ca6b2de2523131ca22cfe75b710fc0343c49df6',
  address: 'cs1qp98z0lyfnl6q8ksk6p7uh9xkt0z2gcnrj3zeln4kug0cq6rcjwlvjjeljw',
  createdAt: 1785543900000,
  displayName: 'Late Cook 454',
};
{
  const url = buildCarryUrl('https://swimchain.io/chips/', APRON);
  check('carry URL keeps the page address', url.startsWith('https://swimchain.io/chips/#apron='), url.slice(0, 48));
  check('the fragment is the ONLY addition', !url.replace('https://swimchain.io/chips/', '').slice(1).includes('#'));
  const hash = new URL(url).hash;
  const back = parseCarryHash(hash);
  check('round trip returns the identity', JSON.stringify(back) === JSON.stringify(APRON), back);

  // displayName is optional and must survive being absent.
  const bare = { ...APRON } as Partial<CarriedIdentity>;
  delete bare.displayName;
  const url2 = buildCarryUrl('https://swimchain.io/chips/', bare as CarriedIdentity);
  check('round trip without displayName', JSON.stringify(parseCarryHash(new URL(url2).hash)) === JSON.stringify(bare));
}

// 3) Hostile/garbage fragments parse to null, never throw, never half-parse.
{
  const bad = [
    '', '#', '#apron=', '#apron=!!!not-base64!!!', '#other=abc',
    '#apron=' + btoa('{"seed":"xyz"}'),                                  // wrong shapes
    '#apron=' + Buffer.from(JSON.stringify({ ...APRON, seed: 'a'.repeat(63) })).toString('base64url'),   // short seed
    '#apron=' + Buffer.from(JSON.stringify({ ...APRON, publicKey: 'Z'.repeat(64) })).toString('base64url'), // non-hex
    '#apron=' + Buffer.from(JSON.stringify({ ...APRON, address: '' })).toString('base64url'),
    '#apron=' + Buffer.from(JSON.stringify({ ...APRON, createdAt: 'yesterday' })).toString('base64url'),
    '#apron=' + Buffer.from('[1,2,3]').toString('base64url'),
    '#apron=' + Buffer.from('null').toString('base64url'),
  ];
  for (const h of bad) check(`rejects ${h.slice(0, 34) || '(empty)'}`, parseCarryHash(h) === null);
}

// ---------------------------------------------------------------------------
// 4) Boot-time import rules, against a real (fake) Storage.
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
}
{
  // No identity yet -> the carried one is written.
  const s = fakeStorage();
  const hash = new URL(buildCarryUrl('https://x/', APRON)).hash;
  const r = carryImport(s, hash, 1785550000000);
  check('empty store: imported', r === 'imported', r);
  check('empty store: identity written', JSON.parse(s.getItem(IDENTITY_KEY) as string).publicKey === APRON.publicKey);
}
{
  // Same identity already present -> no-op (the pop-out landed back in the
  // same WebView, or was opened twice) — nothing rewritten, nothing backed up.
  const s = fakeStorage();
  s.setItem(IDENTITY_KEY, JSON.stringify(APRON));
  const r = carryImport(s, new URL(buildCarryUrl('https://x/', APRON)).hash, 1785550000000);
  check('same identity: noop', r === 'noop', r);
  check('same identity: no backup created', s.length === 1, s.length);
}
{
  // A DIFFERENT identity present (e.g. this browser already has a reef/chips
  // apron — the storage key is shared by every client on the origin): the
  // existing one is backed up, never clobbered, then the carried one wins —
  // the player pressed the button, that is what the press means.
  const s = fakeStorage();
  const other = { ...APRON, seed: 'b'.repeat(64), publicKey: 'c'.repeat(64), address: 'cs1other' };
  s.setItem(IDENTITY_KEY, JSON.stringify(other));
  const r = carryImport(s, new URL(buildCarryUrl('https://x/', APRON)).hash, 1785550000000);
  check('different identity: replaced', r === 'replaced', r);
  check('carried identity now active', JSON.parse(s.getItem(IDENTITY_KEY) as string).publicKey === APRON.publicKey);
  const backup = s.getItem(`${IDENTITY_KEY}.replaced.1785550000000`);
  check('previous identity backed up under a stamped key', backup !== null && JSON.parse(backup).publicKey === other.publicKey);
}
{
  // Unparseable existing value: still backed up verbatim, then replaced.
  const s = fakeStorage();
  s.setItem(IDENTITY_KEY, '{corrupt');
  const r = carryImport(s, new URL(buildCarryUrl('https://x/', APRON)).hash, 1785550000001);
  check('corrupt existing: replaced', r === 'replaced', r);
  check('corrupt existing: raw value preserved', s.getItem(`${IDENTITY_KEY}.replaced.1785550000001`) === '{corrupt');
}
{
  // No carry fragment, or a bad one: storage untouched.
  const s = fakeStorage();
  s.setItem(IDENTITY_KEY, JSON.stringify(APRON));
  check('no fragment: noop', carryImport(s, '', 1) === 'noop');
  check('bad fragment: noop', carryImport(s, '#apron=garbage', 1) === 'noop');
  check('storage untouched', s.getItem(IDENTITY_KEY) === JSON.stringify(APRON) && s.length === 1);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
