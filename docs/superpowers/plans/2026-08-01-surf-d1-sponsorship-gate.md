# Surf D1 — The Set Does Not Transmit Until Someone Vouches For You

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fresh Surf install shows a sponsorship screen instead of the dial, and keeps showing it until the phone's node identity holds a real, unscoped sponsorship granted by a person — no channel, no flip, no chart until then.

**Architecture:** A new pure module `web/sponsorship.mjs` owns offer selection, claim PoW, claim-message construction, and the two RPC calls. `shell.mjs` gains one gate that runs after `rpcReady` on **every** power-on (not cached in `localStorage`, because sponsorship can lapse) and short-circuits both the fresh-boot and already-acquired paths. The gate offers exactly one action — request sponsorship against an **unscoped** offer — then polls until the chain records it. Separately, reef/chess/chips stop running their own space-scoped auto-sponsor when they are embedded in node mode, so the phone identity can never accumulate a patchwork of per-game grants.

**Tech Stack:** Plain ESM (`web/*.mjs`, no bundler for the shell), `node --test` for unit tests, Tauri v2 loopback JSON-RPC with cookie auth, React + TypeScript for the three game clients.

## Global Constraints

- **The gate is on sponsorship, not on acquisition.** `surf.acquired` stays exactly as it is; the new gate runs *before* it and is never persisted. An install that was already `acquired` under a previous build must still hit the gate on next power-on.
- **Only unscoped offers may be claimed.** An offer with a non-null `space_scope` is never eligible in Surf, regardless of `auto_approve` or slot count. Claiming a game-scoped offer is the exact defect this plan removes.
- **No auto-approve assumption.** Mainnet has no standing global auto-approve offer and per operator ruling must not have one. The UI's success state is "your request is in, a person has to approve it", not "you're in".
- **`sign_message` signs raw bytes passed as hex.** The shell's existing `sign(messageHex)` helper (`shell.mjs:86-89`) wraps it and returns a hex signature. Follow `engage.mjs:98-99`'s calling convention.
- **Difficulty is in zero BITS, not bytes.** `requirements.min_pow_difficulty` on live mainnet offers is `8`. Count leading zero bits (see `ensureSponsored.ts:182-190`); a byte-counting miner over-mines 8× and appears to hang.
- **The shell cannot import from `@swimchain/react`.** `web/*.mjs` is served raw, unbundled. Claim logic is reimplemented in `web/sponsorship.mjs`; do not add a build step.
- **No new copy invents a fake approval path.** The screen must say plainly that a human being has to sponsor them.

## Operator prerequisite — BLOCKS GO-LIVE, not implementation

Live mainnet today (verified 2026-08-01 via `https://swimchain.io/rpc` → `list_sponsorship_offers`) has **7 offers**: six are `auto_approve: true` but every one carries a `space_scope` (reef/chess/chips spaces, sponsor `0530df507ad26a2e…`); the only unscoped offer is `offer_type: "probationary"`, `auto_approve: false`, `slots_remaining: 1`, `expires_at: 1786052805` (~2026-08-08).

**A standing UNSCOPED offer with real slots and a far expiry must exist before this ships**, or the gate's request button has nothing to claim and every new user lands on the "ask someone you know" fallback. Creating it is an operator action (offer creation + who works the approval queue), out of scope for this plan. Task 4's fallback branch is what makes the gate honest in the meantime, not a substitute for the offer.

## File Structure

| File | Responsibility |
|---|---|
| `surf-app/web/sponsorship.mjs` (create) | Pure + RPC-injected: offer selection, claim PoW, claim message, `isSponsored`, `requestSponsorship`. No DOM. |
| `surf-app/test/sponsorship.test.mjs` (create) | `node --test` unit tests for the above, with fake `rpc`/`sign`/`digest`. |
| `surf-app/web/index.html` (modify) | Add the `#sponsor-gate` overlay markup + styles, alongside `#node-dead`/`#dead-air`. |
| `surf-app/web/shell.mjs` (modify) | Wire the gate into `powerOn()`; render/poll; reveal the set on success. |
| `reef-client/src/App.tsx` (modify:286-306) | Skip space-scoped auto-sponsor when `mode === 'node'`. |
| `chess-client/src/App.tsx` (modify) | Same. |
| `chips-client/src/App.tsx` (modify) | Same. |
| `surf-app/README.md` (modify) | Document the gate + the operator offer prerequisite. |

---

### Task 1: `sponsorship.mjs` — offer selection and claim construction

**Files:**
- Create: `surf-app/web/sponsorship.mjs`
- Test: `surf-app/test/sponsorship.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `selectSponsorOffer(offers: Offer[]): Offer | null`
  - `mineClaimPow(minZeroBits: number, digest: (buf: Uint8Array) => Promise<ArrayBuffer>): Promise<{nonce, nonceSpace: Uint8Array, powHash: Uint8Array}>`
  - `buildClaimMessage(offerIdHex, claimantHex, timestamp, powHash): Uint8Array`
  - `bytesToHex(bytes: Uint8Array): string`, `hexToBytes(hex: string): Uint8Array`
  - `isSponsored(rpc, pubkeyHex): Promise<boolean>`
  - `requestSponsorship({rpc, sign, pubkeyHex, digest, now}): Promise<{claimed: true, offerId: string}>` — throws `Error('no-unscoped-offer')` when nothing is claimable.

- [ ] **Step 1: Write the failing tests**

Create `surf-app/test/sponsorship.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectSponsorOffer, buildClaimMessage, mineClaimPow,
  bytesToHex, hexToBytes, isSponsored, requestSponsorship,
} from '../web/sponsorship.mjs';

const scoped = (id, slots) => ({
  offer_id: id, sponsor_pubkey: 'aa'.repeat(32), auto_approve: true,
  slots_remaining: slots, space_scope: 'sp1qqzc0w94g6hqlvaqxy735mjss84qrwk88e',
  requirements: { min_pow_difficulty: 8 },
});
const unscoped = (id, slots, auto = false) => ({
  offer_id: id, sponsor_pubkey: 'bb'.repeat(32), auto_approve: auto,
  slots_remaining: slots, space_scope: null,
  requirements: { min_pow_difficulty: 8 },
});

// THE load-bearing test: a game-scoped offer is never claimable in Surf, even
// when it is auto-approve and has 100 slots and the only unscoped one has 1.
test('selectSponsorOffer never returns a space-scoped offer', () => {
  const picked = selectSponsorOffer([scoped('a1', 100), unscoped('b1', 1)]);
  assert.equal(picked.offer_id, 'b1');
});

test('selectSponsorOffer returns null when every offer is space-scoped', () => {
  assert.equal(selectSponsorOffer([scoped('a1', 100), scoped('a2', 99)]), null);
});

test('selectSponsorOffer skips exhausted offers', () => {
  assert.equal(selectSponsorOffer([unscoped('b1', 0)]), null);
});

test('selectSponsorOffer prefers the offer with the most slots', () => {
  const picked = selectSponsorOffer([unscoped('b1', 2), unscoped('b2', 40)]);
  assert.equal(picked.offer_id, 'b2');
});

test('selectSponsorOffer tolerates a missing space_scope key as unscoped', () => {
  const o = { offer_id: 'c1', slots_remaining: 5, requirements: {} };
  assert.equal(selectSponsorOffer([o]).offer_id, 'c1');
});

test('buildClaimMessage lays out offer_id(16) + claimant(32) + ts(8 BE) + pow(32)', () => {
  const msg = buildClaimMessage('0a'.repeat(16), 'cd'.repeat(32), 1, new Uint8Array(32).fill(7));
  assert.equal(msg.length, 88);
  assert.equal(msg[0], 0x0a);
  assert.equal(msg[16], 0xcd);
  // timestamp is big-endian in the last byte of its 8-byte field
  assert.equal(msg[47], 0);
  assert.equal(msg[55], 1);
  assert.equal(msg[56], 7);
});

test('mineClaimPow counts leading zero BITS, not bytes', async () => {
  const digest = async (buf) => {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(Buffer.from(buf)).digest().buffer;
  };
  const { powHash } = await mineClaimPow(8, digest);
  assert.equal(powHash[0], 0, 'first byte must be zero for 8 zero bits');
});

test('isSponsored reads has_sponsorship', async () => {
  const rpc = async () => ({ has_sponsorship: true });
  assert.equal(await isSponsored(rpc, 'ab'.repeat(32)), true);
});

test('isSponsored is false (not a throw) when the RPC errors', async () => {
  const rpc = async () => { throw new Error('node busy'); };
  assert.equal(await isSponsored(rpc, 'ab'.repeat(32)), false);
});

test('requestSponsorship throws no-unscoped-offer when only game offers exist', async () => {
  const rpc = async (m) => {
    if (m === 'get_sponsorship_status') return { has_sponsorship: false };
    if (m === 'list_sponsorship_offers') return { offers: [scoped('a1', 100)] };
    throw new Error(`unexpected ${m}`);
  };
  await assert.rejects(
    () => requestSponsorship({ rpc, sign: async () => 'ff', pubkeyHex: 'ab'.repeat(32) }),
    /no-unscoped-offer/
  );
});

test('requestSponsorship claims the unscoped offer and passes bit difficulty through', async () => {
  const calls = [];
  const rpc = async (m, p) => {
    calls.push([m, p]);
    if (m === 'get_sponsorship_status') return { has_sponsorship: false };
    if (m === 'list_sponsorship_offers') return { offers: [scoped('a1', 100), unscoped('b1', 7)] };
    if (m === 'claim_sponsorship_offer') return { ok: true };
    throw new Error(`unexpected ${m}`);
  };
  const digest = async (buf) => {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(Buffer.from(buf)).digest().buffer;
  };
  const out = await requestSponsorship({
    rpc, sign: async () => 'ee'.repeat(64), pubkeyHex: 'ab'.repeat(32),
    digest, now: () => 1_700_000_000_000,
  });
  assert.equal(out.offerId, 'b1');
  const claim = calls.find((c) => c[0] === 'claim_sponsorship_offer')[1];
  assert.equal(claim.offer_id, 'b1');
  assert.equal(claim.claimant_pubkey, 'ab'.repeat(32));
  assert.equal(claim.pow_difficulty, 8);
  assert.equal(claim.timestamp, 1_700_000_000);
  assert.equal(typeof claim.pow_nonce, 'number');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd surf-app && npm test`
Expected: FAIL — `Cannot find module '../web/sponsorship.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `surf-app/web/sponsorship.mjs`:

```js
// Surf D1 — the set does not transmit until a person vouches for you.
//
// Surf claims ONLY unscoped offers. The games' own onboarding claims
// space-scoped offers (reef's offer grants action inside reef and nowhere
// else); running that funnel for the phone's node identity gave it a
// patchwork of per-game grants and never an actual sponsorship — WIKI still
// read "not sponsored" while REEF and CHESS were both mid-claim. A scoped
// offer is therefore never eligible here, no matter how many slots it has.

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/**
 * Pick the offer Surf may claim: unscoped, with room, most slots first.
 * `space_scope` absent or null both mean "grants everywhere".
 */
export function selectSponsorOffer(offers) {
  const eligible = (offers ?? []).filter(
    (o) => !o.space_scope && (o.slots_remaining ?? 0) > 0
  );
  return eligible.reduce(
    (best, o) => (best && best.slots_remaining >= o.slots_remaining ? best : o),
    null
  ) ?? null;
}

/**
 * Mine a nonce where sha256(nonceSpace || nonce_le) has >= minZeroBits leading
 * zero BITS. The node counts bits; a byte-counting miner over-mines 8x and
 * looks like a hang. `digest` is injected so this is testable under node:test.
 */
export async function mineClaimPow(minZeroBits, digest) {
  const nonceSpace = new Uint8Array(32);
  crypto.getRandomValues(nonceSpace);
  let nonce = 0;
  while (nonce < 10_000_000) {
    const input = new Uint8Array(40);
    input.set(nonceSpace, 0);
    new DataView(input.buffer).setUint32(32, nonce >>> 0, true);
    const hash = new Uint8Array(await digest(input));
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) { zeroBits += 8; continue; }
      zeroBits += Math.clz32(byte) - 24;
      break;
    }
    if (zeroBits >= minZeroBits) return { nonce, nonceSpace, powHash: hash };
    nonce++;
    // Yield so the gate's UI keeps painting during the mine.
    if (nonce % 500 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('claim PoW exhausted');
}

/** offer_id(16) + claimant(32) + timestamp(8, big-endian) + pow_hash(32). */
export function buildClaimMessage(offerIdHex, claimantHex, timestamp, powHash) {
  const offerId = hexToBytes(offerIdHex);
  const claimant = hexToBytes(claimantHex);
  const msg = new Uint8Array(offerId.length + 32 + 8 + 32);
  let o = 0;
  msg.set(offerId, o); o += offerId.length;
  msg.set(claimant, o); o += 32;
  new DataView(msg.buffer, msg.byteOffset).setBigUint64(o, BigInt(timestamp), false); o += 8;
  msg.set(powHash, o);
  return msg;
}

/** True once the chain records a sponsorship for this identity. Never throws. */
export async function isSponsored(rpc, pubkeyHex) {
  try {
    const st = await rpc('get_sponsorship_status', { identity: pubkeyHex });
    return Boolean(st?.has_sponsorship ?? st?.is_sponsored);
  } catch {
    return false;
  }
}

/**
 * Claim an unscoped offer for this node identity. Resolves once the claim is
 * submitted — NOT once it is approved: a person still has to approve it, and
 * the caller polls `isSponsored` for that.
 *
 * @throws Error('no-unscoped-offer') when nothing unscoped has slots.
 */
export async function requestSponsorship({
  rpc, sign, pubkeyHex,
  digest = (buf) => crypto.subtle.digest('SHA-256', buf),
  now = () => Date.now(),
}) {
  const list = await rpc('list_sponsorship_offers', {}).catch(() => ({ offers: [] }));
  const pick = selectSponsorOffer(list?.offers ?? []);
  if (!pick) throw new Error('no-unscoped-offer');

  const minDifficulty = Math.max(pick.requirements?.min_pow_difficulty ?? 0, 1);
  const { nonce, nonceSpace, powHash } = await mineClaimPow(minDifficulty, digest);
  const timestamp = Math.floor(now() / 1000);
  const signature = await sign(
    bytesToHex(buildClaimMessage(pick.offer_id, pubkeyHex, timestamp, powHash))
  );
  if (!signature) throw new Error('signing the sponsorship request failed');

  await rpc('claim_sponsorship_offer', {
    offer_id: pick.offer_id,
    claimant_pubkey: pubkeyHex,
    application_text: null,
    pow_nonce: nonce,
    pow_difficulty: minDifficulty,
    pow_nonce_space: bytesToHex(nonceSpace),
    pow_hash: bytesToHex(powHash),
    signature,
    timestamp,
  });
  return { claimed: true, offerId: pick.offer_id };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd surf-app && npm test`
Expected: PASS, all `sponsorship.test.mjs` tests green, existing suites still green.

- [ ] **Step 5: Mutation-test the load-bearing test**

Temporarily change `selectSponsorOffer`'s filter from `!o.space_scope &&` to just `(o.slots_remaining ?? 0) > 0`. Run `npm test`.
Expected: `selectSponsorOffer never returns a space-scoped offer` and `returns null when every offer is space-scoped` both FAIL. **Revert the mutation.** If either test still passed, the test is vacuous — fix the test before continuing.

- [ ] **Step 6: Commit**

```bash
git add surf-app/web/sponsorship.mjs surf-app/test/sponsorship.test.mjs
git commit -m "feat(surf): unscoped-only sponsorship claim helpers"
```

---

### Task 2: The gate screen markup

**Files:**
- Modify: `surf-app/web/index.html:213-219` (insert after the `#node-dead` block)

**Interfaces:**
- Consumes: nothing.
- Produces: DOM ids `#sponsor-gate`, `#sponsor-body`, `#sponsor-addr`, `#sponsor-btn`, `#sponsor-status` for Task 3.

- [ ] **Step 1: Add the overlay markup**

Insert immediately after the `#node-dead` `</div>` in `surf-app/web/index.html`:

```html
  <div id="sponsor-gate" hidden>
    <div class="card">
      <h2>NO ONE HAS VOUCHED FOR THIS SET</h2>
      <p id="sponsor-body">
        Swimchain has no signups. Someone already on the network has to sponsor
        you before this set can transmit — that is a person, not a queue, and it
        is the whole membership model.
      </p>
      <p class="addr-label">Your set's address — give this to whoever sponsors you:</p>
      <code id="sponsor-addr"></code>
      <button id="sponsor-btn">REQUEST SPONSORSHIP</button>
      <p id="sponsor-status"></p>
    </div>
  </div>
```

- [ ] **Step 2: Add the styles**

In the same file's `<style>` block, next to the existing `#node-dead` rules:

```css
  #sponsor-gate {
    position: fixed; inset: 0; z-index: 40;
    display: grid; place-items: center;
    background: #06080b; color: #cfe8dd;
    font: 16px/1.5 ui-monospace, Menlo, Consolas, monospace;
    padding: 2rem;
  }
  #sponsor-gate .card { max-width: 34rem; text-align: center; }
  #sponsor-gate h2 { font-size: 1.1rem; letter-spacing: .12em; color: #8fd7bd; margin: 0 0 1rem; }
  #sponsor-gate p { margin: 0 0 1rem; }
  #sponsor-gate .addr-label { color: #7d9c93; font-size: .85rem; margin-bottom: .35rem; }
  #sponsor-addr {
    display: block; word-break: break-all; padding: .6rem .8rem; margin-bottom: 1.2rem;
    background: #0d1319; border: 1px solid #1e2d33; color: #cfe8dd; border-radius: 4px;
  }
  #sponsor-btn {
    background: #0d2b21; color: #8fd7bd; border: 1px solid #2f7f63;
    padding: .7rem 1.4rem; letter-spacing: .1em; border-radius: 3px; cursor: pointer;
    font: inherit;
  }
  #sponsor-btn[disabled] { opacity: .5; cursor: default; }
  #sponsor-status { min-height: 1.5em; margin-top: 1rem; color: #7d9c93; }
```

- [ ] **Step 3: Verify it renders**

Run: `cd surf-app && node -e "const h=require('fs').readFileSync('web/index.html','utf8'); for (const id of ['sponsor-gate','sponsor-body','sponsor-addr','sponsor-btn','sponsor-status']) if (!h.includes('id=\"'+id+'\"')) throw new Error('missing '+id); console.log('all gate ids present')"`
Expected: `all gate ids present`

- [ ] **Step 4: Commit**

```bash
git add surf-app/web/index.html
git commit -m "feat(surf): sponsorship gate screen markup"
```

---

### Task 3: Wire the gate into power-on

**Files:**
- Modify: `surf-app/web/shell.mjs` — import at `:15`, gate function near `showNodeDead` (`:552`), call site in `powerOn()` (`:819-838`)

**Interfaces:**
- Consumes: Task 1's `isSponsored`, `requestSponsorship`; Task 2's DOM ids.
- Produces: `sponsorGate(): Promise<boolean>` — resolves `true` when the identity is sponsored and the caller may proceed; resolves `false` when the gate is now on screen and owns the rest of this power-on.

- [ ] **Step 1: Add the import**

In `surf-app/web/shell.mjs`, after the `bootstrap.mjs` import at line 15:

```js
import { isSponsored, requestSponsorship } from './sponsorship.mjs';
```

- [ ] **Step 2: Add the gate implementation**

Insert after `showNodeDead`'s listener block (after line 564):

```js
// --- D1: the set does not transmit until a person vouches for you ----------
// Runs on EVERY power-on, before any channel work, and is deliberately not
// cached in localStorage the way `acquired` is: a sponsorship can lapse, and a
// set that quietly kept transmitting on a revoked one would be lying.
let sponsorPoll = null;

function showSponsorGate() {
  document.getElementById('acquire').hidden = true;
  staticCtl.stop();
  document.getElementById('sponsor-gate').hidden = false;
  document.getElementById('sponsor-addr').textContent = myAddress ?? myPk ?? '(node identity unavailable)';
}

function hideSponsorGate() {
  document.getElementById('sponsor-gate').hidden = true;
  if (sponsorPoll) { clearInterval(sponsorPoll); sponsorPoll = null; }
}

function sponsorStatus(text) {
  document.getElementById('sponsor-status').textContent = text;
}

// Poll until a person approves. 8s: the claim gossips to the sponsor's node
// and the Sponsor action still has to be mined, so this is minutes-scale, not
// seconds-scale — a tight poll would just hammer the node for no benefit.
function startSponsorPoll() {
  if (sponsorPoll) return;
  sponsorPoll = setInterval(async () => {
    if (await isSponsored(rpc, myPk)) {
      hideSponsorGate();
      sponsorStatus('');
      powerOn();
    }
  }, 8000);
}

document.getElementById('sponsor-btn').addEventListener('click', async () => {
  const btn = document.getElementById('sponsor-btn');
  btn.disabled = true;
  sponsorStatus('Proving this set is real…');
  try {
    await requestSponsorship({ rpc, sign, pubkeyHex: myPk });
    sponsorStatus('Request sent. A person has to approve it — this set will tune itself in when they do.');
    btn.hidden = true;
    startSponsorPoll();
  } catch (e) {
    btn.disabled = false;
    sponsorStatus(
      String(e?.message) === 'no-unscoped-offer'
        ? 'No open sponsorship right now. Ask someone already on the network to sponsor the address above directly.'
        : `Request failed: ${e?.message ?? e}`
    );
  }
});

/**
 * @returns true when the set may proceed to tune; false when the gate is up.
 */
async function sponsorGate() {
  if (await isSponsored(rpc, myPk)) { hideSponsorGate(); return true; }
  showSponsorGate();
  startSponsorPoll(); // a sponsor may act without them ever pressing the button
  return false;
}
```

- [ ] **Step 3: Capture the node address for the gate**

`myPk` is set when `rpcReady` resolves. Find that assignment in the boot section and add the address beside it. Locate it with:

Run: `cd surf-app && grep -n "myPk = " web/shell.mjs`

Add a module-level `let myAddress = null;` next to `let myPk = null;` (line 70), and set it from the same `get_identity_info` result that populates `myPk` (the RPC returns `{has_identity, public_key, address}`). If the boot code reads only `public_key`, extend it to also assign `myAddress = result.address ?? null;`.

- [ ] **Step 4: Gate `powerOn()`**

Replace `powerOn()`'s body (lines 819-838) so the gate runs before **both** paths — the fresh-boot path and the already-`acquired` path:

```js
function powerOn() {
  powered = true;
  document.getElementById('off-screen').hidden = true;
  const bloom = document.getElementById('bloom');
  bloom.hidden = false;
  bloom.classList.remove('blooming'); void bloom.offsetWidth; bloom.classList.add('blooming');
  setTimeout(() => { bloom.hidden = true; }, 750);
  staticCtl.start();
  // D1: nothing tunes until someone has vouched for this set. The gate needs
  // rpcReady (myPk/rpcAuth), so this whole tail is async; acquisitionBoot
  // awaits rpcReady itself, so its own contract is unchanged.
  (async () => {
    try {
      await rpcReady;
    } catch (e) {
      showNodeDead(String(e));
      return;
    }
    if (!(await sponsorGate())) return; // gate owns the screen now
    if (!acquired) { if (!acquiring) { acquiring = true; acquisitionBoot(); } return; }
    const stored = localStorage.getItem(LAST_CHANNEL_KEY);
    const target = deck.current ?? (byId.has(stored) ? stored : FEED_ID);
    const r = deck.tune(target);
    settle(target, r, null, 'power');
  })();
}
```

- [ ] **Step 5: Stop the poll on power-off**

In `powerOff()` (line 840), after `gate?.cancel();`, add:

```js
  if (sponsorPoll) { clearInterval(sponsorPoll); sponsorPoll = null; }
```

- [ ] **Step 6: Verify the wiring statically**

Run: `cd surf-app && node --input-type=module -e "import('./web/sponsorship.mjs').then(m=>{console.log('sponsorship.mjs exports:', Object.keys(m).join(','))})"`
Expected: exports listed, including `isSponsored,requestSponsorship`.

Run: `cd surf-app && npm test`
Expected: PASS — existing suites unaffected (shell.mjs itself has no unit test; it requires the Tauri runtime).

- [ ] **Step 7: Commit**

```bash
git add surf-app/web/shell.mjs
git commit -m "feat(surf): gate the whole set on a real sponsorship"
```

---

### Task 4: Stop the games claiming space-scoped offers in node mode

**Files:**
- Modify: `reef-client/src/App.tsx:290` (effect guard) and `:306` (dep array)
- Modify: `chess-client/src/App.tsx:112` (effect guard) and `:128` (dep array) — identical variable names to reef
- Modify: `chips-client/src/App.tsx:540-542` — chips has **no standalone sponsor effect**; its `host.sponsor(me)` call lives inside the once-per-load onboarding pipeline (`:535-576`), so the edit shape differs

**Interfaces:**
- Consumes: `mode` from `useGameIdentity()` — already destructured in all three (reef `:141`, chess `:68`, chips `:162`).
- Produces: no new exports.

- [ ] **Step 1: Guard reef's auto-sponsor effect**

In `reef-client/src/App.tsx`, the effect beginning at line 290 currently reads:

```tsx
    if (!rpc || !connected || !me || sponsored || sponsoringRef.current) return;
```

Replace with:

```tsx
    if (!rpc || !connected || !me || sponsored || sponsoringRef.current) return;
    // D1: in node mode the identity is the player's REAL phone identity, and
    // the set has already gated on a full unscoped sponsorship. Claiming
    // reef's space-scoped offer here would hand that identity a reef-only
    // grant (and burn a slot) on every Surf install — the exact patchwork the
    // Surf gate exists to prevent. Standalone browser play is unchanged.
    if (mode === 'node') {
      void (async () => {
        const st = await rpc
          .call<{ has_sponsorship?: boolean }>('get_sponsorship_status', {
            identity: me.publicKeyHex,
          })
          .catch(() => null);
        if (st?.has_sponsorship) setSponsored(true);
        else setSponsorPhase('This set is not sponsored yet — sponsorship is handled by Surf itself.');
      })();
      return;
    }
```

- [ ] **Step 2: Add `mode` to the effect's dependency array**

At line 306, change:

```tsx
  }, [rpc, connected, me, sponsored]);
```

to:

```tsx
  }, [rpc, connected, me, sponsored, mode]);
```

- [ ] **Step 3: Verify reef still type-checks and builds**

Run: `cd reef-client && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 4: Apply the same guard to chess**

`chess-client/src/App.tsx` uses the identical names to reef (`sponsored`, `setSponsored`, `setSponsorPhase`, `sponsoringRef`, `me`). At line 112, after:

```tsx
    if (!rpc || !connected || !me || sponsored || sponsoringRef.current) return;
```

insert:

```tsx
    // D1: see reef-client's identical guard. In node mode the identity is the
    // player's real phone identity and Surf has already gated on a full
    // unscoped sponsorship; claiming chess's space-scoped offer here would
    // hand it a chess-only grant and burn a slot on every Surf install.
    if (mode === 'node') {
      void (async () => {
        const st = await rpc
          .call<{ has_sponsorship?: boolean }>('get_sponsorship_status', {
            identity: me.publicKeyHex,
          })
          .catch(() => null);
        if (st?.has_sponsorship) setSponsored(true);
        else setSponsorPhase('This set is not sponsored yet — sponsorship is handled by Surf itself.');
      })();
      return;
    }
```

At line 128, change `}, [rpc, connected, me, sponsored]);` to `}, [rpc, connected, me, sponsored, mode]);`.

Run: `cd chess-client && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Apply the guard to chips (different shape)**

chips has no standalone sponsor effect — `host.sponsor(me)` (which calls `ensureSponsored` with `requiredSpaceId: CHIPS_SPACE`, `host.ts:328-333`) runs inside the once-per-load onboarding pipeline. In `chips-client/src/App.tsx`, replace lines 540-542:

```tsx
        trace('sponsor: asking for a seat');
        await host.sponsor(me);
        trace('sponsor: seated');
```

with:

```tsx
        // D1: in node mode this is the player's real phone identity and Surf
        // has already gated on a full unscoped sponsorship. host.sponsor()
        // claims the CHIPS-scoped offer, which would give that identity a
        // chips-only grant and burn a slot on every Surf install.
        if (mode === 'node') {
          const st = await host.rpc
            .call<{ has_sponsorship?: boolean }>('get_sponsorship_status', {
              identity: me.publicKeyHex,
            })
            .catch(() => null);
          if (!st?.has_sponsorship) {
            throw new Error('this set is not sponsored yet — Surf handles sponsorship');
          }
          trace('sponsor: node identity already sponsored');
        } else {
          trace('sponsor: asking for a seat');
          await host.sponsor(me);
          trace('sponsor: seated');
        }
```

Do **not** add `mode` to this effect's dependency array. It is guarded by `onboardRef` (runs once per page load) and already carries an `exhaustive-deps` disable; `me` is null until the identity resolves, so by the time the body runs `mode` has already settled to `'node'` or `'browser'` — adding it would be a no-op that muddies the existing once-only contract.

Run: `cd chips-client && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add reef-client/src/App.tsx chess-client/src/App.tsx chips-client/src/App.tsx
git commit -m "fix(games): never claim a space-scoped offer for the node identity"
```

---

### Task 5: Document the gate and the operator prerequisite

**Files:**
- Modify: `surf-app/README.md` (new section before "Accepted debt")

- [ ] **Step 1: Add the section**

```markdown
### Sponsorship gate (D1)

Surf shows a sponsorship screen instead of the dial until the phone's node
identity holds a **real, unscoped** sponsorship. There is no auto-onboarding:
a person already on the network has to sponsor the address the screen shows.

The gate runs on every power-on (after `rpcReady`, before any channel work)
and is deliberately not cached the way `surf.acquired` is — a sponsorship can
lapse, and a set that kept transmitting on a revoked one would be lying.

**Surf only ever claims offers with a null `space_scope`.** The games' own
onboarding (`ensureReefSponsored` and friends) claims *space-scoped* offers;
running that funnel for the phone identity gave it a reef-only grant, then a
chess-only grant, and never an actual sponsorship — WIKI read "not sponsored"
while REEF and CHESS were both mid-claim. reef/chess/chips therefore skip
their own auto-sponsor entirely when `mode === 'node'`; standalone browser
play is unchanged.

**Operator prerequisite:** a standing unscoped offer with real slots and a far
expiry must exist on mainnet, and somebody has to work its approval queue. As
of 2026-08-01 the only unscoped offer was probationary, manual, 1 slot,
expiring in a week — with nothing claimable the gate falls back to "ask
someone already on the network to sponsor this address directly", which is
honest but is not a funnel.
```

- [ ] **Step 2: Commit**

```bash
git add surf-app/README.md
git commit -m "docs(surf): the sponsorship gate and its operator prerequisite"
```

---

## Verification on the device

After all tasks, on the Pixel with a **fresh** install (`adb uninstall com.swimchain.surf` first, so the node mints a new unsponsored identity):

1. `cd surf-app && npm run build:channels && npm run tauri android build -- --target aarch64` (then the Dev-Mode copy + `gradlew.bat assembleArm64Release -x rustBuildArm64Release` — see "Release signing (C4)").
2. Launch. **Expected: the sponsorship screen, not a channel and not the dial.** Confirm a right-edge swipe does nothing.
3. Press REQUEST SPONSORSHIP. Expected: either "Request sent…" or the honest "No open sponsorship right now" fallback — never a silent failure.
4. Sponsor the shown address from another node (`sw sponsor direct <address>`).
5. Expected: within ~8s the gate clears itself and the set tunes to FEED with no further input.
