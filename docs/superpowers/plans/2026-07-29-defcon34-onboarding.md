# DEF CON 34 Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-tier DEF CON 34 (Aug 6–9, 2026) onboarding on mainnet: full-node users claim a **global** sponsorship via `sw sponsor claim --application "<CODE>"`; browser users get a **space-scoped** grant to the `@defcon34` space through a new `/defcon` page — both auto-approved by a keeper on a dedicated, sacrificial "gate" droplet that checks a shared code.

**Architecture:** No Rust changes. A fresh `defcon34` identity (genesis-direct-sponsored, burnable subtree) on a new droplet publishes two manual offers (global + space-scoped, `application_required`, `min_pow_difficulty=8`, `expires_days=1`, re-minted as they fill). A Node keeper (`tools/defcon-gate/`, swim-bot pattern) polls every ~5s, approves claims whose `application_text` matches the gate code, rejects mismatches, and enforces total/hourly caps and a hard end time. A new `defcon-client` Vite app serves `/defcon` (pitch, node-first CTA with the live offer id, browser join via the shared `ensureSponsored`, minimal wall for the space).

**Tech Stack:** Node ESM `.mjs` (keeper, no deps except `hash-wasm` for the mint script), TypeScript/React/Vite (`defcon-client`), `@swimchain/react` (`ensureSponsored`, rpc, action-pow), systemd, nginx.

## Global Constraints

- **Zero Rust changes.** The whole feature is scripts + one web client. (`sw sponsor approve` is broken for scoped offers — CLI signs without scope, `src/cli/commands/sponsor.rs:826-831` — which is why the keeper signs via `sign_message` itself. Do not "fix" the CLI in this plan.)
- **`min_pow_difficulty` MUST be exactly 8** on both offers: it is the RPC floor (`MIN_OFFER_POW_DIFFICULTY_BITS=8`, `src/sponsorship/types.rs:1396`) AND the fixed amount `sw sponsor claim` mines (`src/cli/commands/sponsor.rs:757` mines 1 zero byte = 8 bits, never more). Anything higher breaks every attendee CLI claim.
- **The real gate code is NEVER committed.** Repo/docs/tests use the placeholder `TEST-CODE-1234`. The real code exists only in the droplet's systemd `Environment=` line, chosen at go-live.
- **Genesis seed never leaves the operator's machine.** The one genesis action (direct-sponsoring `defcon34`) is an operator runbook step, not a script.
- **Offer end time:** keeper `END_AT=2026-08-10T07:00:00Z` (midnight Pacific after the con's last day). Offers themselves use `expires_days=1` as a coarse backstop — the keeper is the fine-grained deadline.
- Branch: cut `feat/defcon34-gate` off `origin/main` at execution start (fresh-branch rule; the spec commit `e45d011d` on `feat/the-shoal-shallows-edge` gets cherry-picked onto it first).
- Client bundles deploy ONLY via `scripts/deploy-web-clients.sh` (baked-endpoint verification). Conventional commits.
- Browser claim PoW is WebCrypto SHA-256 leading zero **bits** (cheap); action PoW for posting is Argon2id via `hash-wasm` and MUST run in a Worker (`hash-wasm` event-loop starvation: an await-hash loop on the main thread never yields).

## Facts reference (verified 2026-07-29, cite before re-deriving)

| Fact | Where |
|---|---|
| `can_sponsor_basic` = status+penalty only; fresh sponsor can sponsor immediately | `src/sponsorship/types.rs:257-267` |
| One sponsorship per identity; scoped grant can never be upgraded (2nd Sponsor = no-op, scope never cleared) | `src/sponsorship/storage.rs:23-35`, `src/node/router/router.rs:5236-5286` |
| Offer-creation sig preimage: `"swimchain-sponsor-offer:"‖sponsor(32)‖slots(1)‖offer_type(1)‖expires_days(4 BE)‖min_pow(1)‖app_required(1)‖timestamp(8 BE)`; `space_scope`/`auto_approve` NOT signed | `src/sponsorship/types.rs:1490-1510`; JS impl `tools/swim-bot/game-offer-keeper.mjs:92-105` |
| Approval sig preimage: `claimant(32)‖timestamp(8 BE)` and, **iff the offer is scoped**, `‖ scope bytes` exactly as `Action::sponsor_sig_message` builds them | `src/blocks/action.rs:648-660`, `src/rpc/methods.rs:18141-18166` |
| Reject sig preimage: `claimant(32)‖timestamp(8 BE)` (identical to unscoped approve — see Task 3 replay note) | `src/rpc/methods.rs:18309-18311` |
| Claim sig preimage (browser): `offer_id(16)‖claimant(32)‖timestamp(8 BE)‖pow_hash(32)` | `swimchain-react/src/lib/ensureSponsored.ts:104-122` |
| Claim PoW: `sha256(nonce_space(32)‖nonce_le)`, leading zero bits ≥ offer min | `src/rpc/methods.rs:17726-17765` |
| Mainnet claim RPC always returns `"pending"` for manual offers; keeper approves after | `src/rpc/methods.rs:17877-17879` |
| Sponsor-side pending-claims view = `get_sponsorship_offer{offer_id, caller_pubkey=sponsor}` (localhost only; correctly NOT proxy-allowlisted) | `src/rpc/methods.rs:17104-17122` |
| Browser polls `get_sponsorship_status` (public/allowlisted); `get_my_claim_status` is auth-gated — do not use | `src/rpc/server.rs:468-501` |
| Proxy allowlist already has every method the page needs (`list_sponsorship_offers`, `claim_sponsorship_offer`, `get_sponsorship_status`, `list_space_posts`, `submit_post`, `submit_reply`, `get_replies`, `resolve_space_name`, `get_content`) | `web-gateway/rpc-proxy/rpc-allowlist-proxy.mjs:11-17` |
| Space-creation PoW preimage is `sha256(name)` — NOT the `space:`-prefixed scheme in `@swimchain/react` | `shoal-client/scripts/mint-water.ts:110-112` |
| Keeper RPC auth: HTTP Basic `__cookie__:<cookie>`, re-read cookie file on every call | `tools/swim-bot/game-offer-keeper.mjs:72-85` |
| Node-side signing for bots: `sign_message` RPC (auth-gated), identity via `get_identity_info` | `tools/swim-bot/game-offer-keeper.mjs:113,130` |
| Sponsored-offer selection in browser filters `auto_approve` + scope + preferred sponsor, picks most slots | `swimchain-react/src/lib/ensureSponsored.ts:157-195` |
| `Probationary` offer type is cosmetic on the claim path (chain-apply hardcodes `probationary:false`) — containment is subtree+caps+expiry, never probation | `src/node/router/router.rs:5258-5259` |

---

### Task 1: Branch setup

**Files:** none (git only)

- [ ] **Step 1:** From `C:\github\swimchain`: `git fetch origin` then create the work branch and bring the spec over:

```bash
git checkout -b feat/defcon34-gate origin/main
git cherry-pick e45d011d   # docs(defcon): design spec
```

- [ ] **Step 2:** Verify: `git log --oneline -2` shows the cherry-picked spec commit on top of origin/main. `git status` clean (untracked build logs/apks in the tree are pre-existing; ignore them).

---

### Task 2: `ensureSponsored` options (shared browser claim path)

**Files:**
- Modify: `swimchain-react/src/lib/ensureSponsored.ts`
- Test: `swimchain-react/src/lib/ensureSponsored.test.ts` (create; check `swimchain-react/package.json` for the test runner — if there is no `test` script, add `vitest` as a devDependency and `"test": "vitest run"`, matching how `shoal-client` runs `seaChoice.test.ts`)

**Interfaces:**
- Consumes: existing `ensureSponsored(opts)` and its internal offer-selection helpers (`scopeOk`, `mostSlots` at `ensureSponsored.ts:157-195`).
- Produces (Task 5 relies on these exact names): three new optional fields on the existing options object —
  - `applicationText?: string` — sent as `application_text` in `claim_sponsorship_offer` (today hardcoded `null` at `:205-215`).
  - `allowManualOffers?: boolean` (default `false`) — when `true`, offers with `auto_approve === false` are eligible (today filtered out).
  - `requireExactScope?: boolean` (default `false`) — when `true`, only offers whose `space_scope` equals the passed space id are eligible (today `scopeOk` also accepts global offers; the defcon page must NOT let browsers drain the global tier's slots).
- All three default to today's behavior — reef/chess/chips/trench callers are untouched.

- [ ] **Step 1:** Extract the offer-selection logic into an exported pure function so it is testable (it currently lives inline in `ensureSponsored`):

```ts
export interface OfferSelectionOpts {
  spaceIdHex?: string;
  preferredSponsorHex?: string;
  strictPreferred?: boolean;
  allowManualOffers?: boolean;
  requireExactScope?: boolean;
}

/** Pure: pick the offer a claimant should claim, or null. Extracted for tests. */
export function selectClaimableOffer(
  offers: OfferSummary[],
  opts: OfferSelectionOpts,
): OfferSummary | null { /* moved body of the :157-195 logic, with the two new predicates */ }
```

The two new predicates, exactly: an offer passes the auto-approve filter iff `offer.auto_approve || opts.allowManualOffers`; an offer passes the scope filter iff `opts.requireExactScope ? offer.space_scope === opts.spaceIdHex : scopeOk(offer, opts.spaceIdHex)`. Keep the existing preferred-sponsor tiering and `mostSlots` tie-break unchanged.

- [ ] **Step 2: Write failing tests** in `ensureSponsored.test.ts` — build minimal `OfferSummary` literals (only the fields selection reads: `offer_id`, `sponsor_pubkey`, `auto_approve`, `space_scope`, `slots_remaining`, `requirements`):

```ts
import { describe, it, expect } from 'vitest';
import { selectClaimableOffer } from './ensureSponsored';

const base = { offer_id: 'aa'.repeat(16), sponsor_pubkey: '11'.repeat(32),
  slots_remaining: 5, requirements: { min_pow_difficulty: 8, application_required: true } };

describe('selectClaimableOffer defcon options', () => {
  it('default behavior still excludes manual offers', () => {
    expect(selectClaimableOffer([{ ...base, auto_approve: false, space_scope: null }], {}))
      .toBeNull();
  });
  it('allowManualOffers admits a manual offer', () => {
    const o = { ...base, auto_approve: false, space_scope: null };
    expect(selectClaimableOffer([o], { allowManualOffers: true })).toBe(o);
  });
  it('requireExactScope rejects a GLOBAL offer even though scopeOk would accept it', () => {
    const global = { ...base, auto_approve: false, space_scope: null };
    const scoped = { ...base, offer_id: 'bb'.repeat(16), auto_approve: false, space_scope: 'cc'.repeat(16) };
    const picked = selectClaimableOffer([global, scoped],
      { allowManualOffers: true, requireExactScope: true, spaceIdHex: 'cc'.repeat(16) });
    expect(picked?.offer_id).toBe('bb'.repeat(16));
  });
  it('requireExactScope with no matching scoped offer yields null (never falls back to global)', () => {
    const global = { ...base, auto_approve: false, space_scope: null };
    expect(selectClaimableOffer([global],
      { allowManualOffers: true, requireExactScope: true, spaceIdHex: 'cc'.repeat(16) })).toBeNull();
  });
});
```

- [ ] **Step 3:** Run `npm test` in `swimchain-react/` — expect FAIL (`selectClaimableOffer` not exported).
- [ ] **Step 4:** Implement the extraction + predicates. Thread `applicationText` into the claim params: `application_text: opts.applicationText ?? null` at the `:205-215` call.
- [ ] **Step 5:** Run `npm test` — PASS. **Mutation-check:** temporarily invert the `requireExactScope` predicate and confirm tests 3 and 4 fail; revert. (This repo ships vacuous tests constantly — prove these aren't.)
- [ ] **Step 6:** Confirm no caller broke: `grep -rn "ensureSponsored(" reef-client/src chess-client/src chips-client/src trench-client/ui/src shoal-client/src` — all existing call sites pass no new options and compile (`npm run build` in `swimchain-react/`).
- [ ] **Step 7: Commit** — `feat(react): opt-in manual-offer + exact-scope + application_text support in ensureSponsored`

---

### Task 3: Gate logic (pure) with tests

**Files:**
- Create: `tools/defcon-gate/gate-logic.mjs`
- Test: `tools/defcon-gate/gate-logic.test.mjs` (runner: `node --test tools/defcon-gate/`)

**Interfaces:**
- Produces (Task 4 imports exactly these):
  - `codeMatches(applicationText, gateCode) -> boolean` — trim + case-insensitive equality; empty/undefined never match.
  - `gateDecision({ applicationText, gateCode, nowMs, endAtMs, totalApproved, approvedAtMs, totalCap, hourlyCap }) -> { action: 'approve'|'reject'|'skip', reason: string }` — `reject` only for a bad code; caps and end-time produce `skip` (claim stays pending; a later tick may approve when the hourly window frees).
  - `offerPlan({ myOffers, tierScopeHex, nowSec, endAtSec, totalApproved, totalCap }) -> { needNew: boolean, reason: string }` — one tier per call; `myOffers` are that tier's offers; needNew iff no offer has `slots_remaining > 0 && expires_at > nowSec`, and not ended, and cap not reached.
  - `hourlyCount(approvedAtMs, nowMs) -> number` — entries within the trailing 3_600_000 ms.

- [ ] **Step 1: Write failing tests** (`node:test`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeMatches, gateDecision, offerPlan, hourlyCount } from './gate-logic.mjs';

test('codeMatches: trim + case-insensitive; empty never matches', () => {
  assert.equal(codeMatches('  test-code-1234 ', 'TEST-CODE-1234'), true);
  assert.equal(codeMatches('TEST-CODE-1234', 'TEST-CODE-1234'), true);
  assert.equal(codeMatches('wrong', 'TEST-CODE-1234'), false);
  assert.equal(codeMatches('', 'TEST-CODE-1234'), false);
  assert.equal(codeMatches(undefined, 'TEST-CODE-1234'), false);
  assert.equal(codeMatches('TEST-CODE-1234', ''), false); // unset gate code fails closed
});

const baseArgs = { gateCode: 'TEST-CODE-1234', nowMs: 1_000_000_000,
  endAtMs: 2_000_000_000, totalApproved: 0, approvedAtMs: [], totalCap: 500, hourlyCap: 60 };

test('gateDecision approves a good code under caps', () => {
  assert.deepEqual(gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234' }),
    { action: 'approve', reason: 'ok' });
});
test('gateDecision rejects a bad code', () => {
  assert.equal(gateDecision({ ...baseArgs, applicationText: 'nope' }).action, 'reject');
});
test('gateDecision skips (not rejects) at total cap', () => {
  const d = gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234', totalApproved: 500 });
  assert.deepEqual([d.action, d.reason], ['skip', 'total-cap']);
});
test('gateDecision skips at hourly cap using the trailing window', () => {
  const approvedAtMs = Array.from({ length: 60 }, (_, i) => baseArgs.nowMs - i * 1000);
  const d = gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234', approvedAtMs });
  assert.deepEqual([d.action, d.reason], ['skip', 'hourly-cap']);
});
test('hourly window slides: old approvals free the cap', () => {
  const approvedAtMs = Array.from({ length: 60 }, () => baseArgs.nowMs - 3_700_000);
  assert.equal(hourlyCount(approvedAtMs, baseArgs.nowMs), 0);
  assert.equal(gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234', approvedAtMs }).action, 'approve');
});
test('gateDecision skips everything after END_AT even with a good code', () => {
  const d = gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234', nowMs: 3_000_000_000 });
  assert.deepEqual([d.action, d.reason], ['skip', 'ended']);
});

test('offerPlan wants a new offer only when the tier has no live capacity', () => {
  const live = { slots_remaining: 3, expires_at: 2_000_000 };
  const full = { slots_remaining: 0, expires_at: 2_000_000 };
  const expired = { slots_remaining: 10, expires_at: 900 };
  const args = { tierScopeHex: null, nowSec: 1_000, endAtSec: 2_000_000, totalApproved: 0, totalCap: 500 };
  assert.equal(offerPlan({ ...args, myOffers: [live] }).needNew, false);
  assert.equal(offerPlan({ ...args, myOffers: [full, expired] }).needNew, true);
  assert.equal(offerPlan({ ...args, myOffers: [] }).needNew, true);
  assert.equal(offerPlan({ ...args, myOffers: [], totalApproved: 500 }).needNew, false); // cap reached
  assert.equal(offerPlan({ ...args, myOffers: [], nowSec: 3_000_000 }).needNew, false);  // ended
});
```

- [ ] **Step 2:** `node --test tools/defcon-gate/` — FAIL (module missing).
- [ ] **Step 3:** Implement `gate-logic.mjs` — pure functions, no I/O, no imports. `gateDecision` order: ended → bad code (reject) → total cap → hourly cap → approve. (Order matters: a bad-code claim after END_AT must NOT be rejected — after the end the keeper signs nothing at all.)
- [ ] **Step 4:** `node --test tools/defcon-gate/` — PASS. Mutation-check: swap the decision order so bad-code is checked before `ended`, confirm the last test fails; revert.
- [ ] **Step 5: Commit** — `feat(defcon-gate): pure gate decision logic with tests`

---

### Task 4: Keeper daemon + systemd unit

**Files:**
- Create: `tools/defcon-gate/defcon-gate.mjs`
- Create: `tools/defcon-gate/deploy/defcon-gate-mainnet.service`
- Modify: none

**Interfaces:**
- Consumes: `gate-logic.mjs` exports (Task 3); node RPC: `get_identity_info`, `sign_message`, `list_sponsorship_offers`, `get_sponsorship_offer`, `create_sponsorship_offer`, `approve_sponsorship_claim`, `reject_sponsorship_claim`, `cancel_sponsorship_offer`, `get_sponsorship_info`.
- Produces: a long-running daemon; state file JSON `{ totalApproved: number, approvedAtMs: number[], canceledAtEnd: boolean }`.

**Env (all config; document in the file header):** `RPC_URL` (required), `COOKIE_FILE` (required), `GATE_CODE` (required), `END_AT` (required, ISO8601), `DEFCON_SPACE_HEX` (required — the scoped tier's space id, hex), `TOTAL_CAP=500`, `HOURLY_CAP=60`, `OFFER_SLOTS=10`, `OFFER_EXPIRES_DAYS=1`, `MIN_POW=8`, `POLL_MS=5000`, `STATE_FILE=./defcon-gate-state.json`, `ONCE=`, `DRY_RUN=`, `PAUSED=`.

- [ ] **Step 1:** Write `defcon-gate.mjs` following `tools/swim-bot/game-offer-keeper.mjs` exactly for: env-block-with-exit(2), per-call cookie re-read `rpc()` helper (`Basic __cookie__:<cookie>`), `log()` with timestamps, never-exit-on-transient-error loop. Core tick:

```js
async function tick(state) {
  if (process.env.PAUSED) { log('paused'); return; }
  const nowMs = Date.now(); const nowSec = Math.floor(nowMs / 1000);
  const me = await rpc('get_identity_info', {});             // { public_key, ... }
  const mine = await myOffers(me.public_key);                // list_sponsorship_offers → filter sponsor
  const ended = nowMs >= END_AT_MS;

  if (ended && !state.canceledAtEnd) { await cancelAll(mine); state.canceledAtEnd = true; saveState(state); }

  for (const tier of [{ scope: null }, { scope: DEFCON_SPACE_HEX }]) {
    const tierOffers = mine.filter(o => normScope(o.space_scope) === tier.scope);
    const plan = offerPlan({ myOffers: tierOffers, tierScopeHex: tier.scope, nowSec,
      endAtSec: END_AT_MS / 1000, totalApproved: state.totalApproved, totalCap: TOTAL_CAP });
    if (plan.needNew && !process.env.DRY_RUN) await createOffer(me.public_key, tier.scope);

    for (const offer of tierOffers.filter(o => o.expires_at > nowSec)) {
      const detail = await rpc('get_sponsorship_offer', { offer_id: offer.offer_id, caller_pubkey: me.public_key });
      for (const claim of detail.pending_claims ?? []) {
        const d = gateDecision({ applicationText: claim.application_text, gateCode: GATE_CODE,
          nowMs, endAtMs: END_AT_MS, totalApproved: state.totalApproved,
          approvedAtMs: state.approvedAtMs, totalCap: TOTAL_CAP, hourlyCap: HOURLY_CAP });
        log(`claim ${claim.claimant_pubkey.slice(0,8)} on ${offer.offer_id.slice(0,8)} -> ${d.action} (${d.reason})`);
        if (process.env.DRY_RUN) continue;
        if (d.action === 'approve') { await approveClaim(offer, claim, me.public_key); state.totalApproved++; state.approvedAtMs.push(nowMs); saveState(state); }
        else if (d.action === 'reject') await rejectClaim(offer, claim, me.public_key);
      }
    }
  }
}
```

- [ ] **Step 2:** Signing helpers — all through the node's `sign_message` RPC (hex message in, signature out), byte layouts from the Facts table:
  - `createOffer(sponsorHex, scopeHexOrNull)`: preimage `"swimchain-sponsor-offer:"` bytes ‖ sponsor(32) ‖ OFFER_SLOTS(1) ‖ 0x01 (probationary) ‖ OFFER_EXPIRES_DAYS(4 BE) ‖ MIN_POW(1) ‖ 0x01 (app_required) ‖ timestamp(8 BE). Copy the exact builder from `game-offer-keeper.mjs:92-105`. Then `create_sponsorship_offer` with `{ sponsor_pubkey, slots, offer_type: 'probationary', expires_days, min_pow_difficulty: 8, application_required: true, auto_approve: false, space_scope: scopeHexOrNull, signature, timestamp }`. (`space_scope` is not in the preimage — same signature works for both tiers.)
  - `approveClaim(offer, claim, sponsorHex)`: preimage claimant(32) ‖ timestamp(8 BE), **and append the scope bytes iff `offer.space_scope` is set** — read `Action::sponsor_sig_message` (`src/blocks/action.rs:648-660`) during implementation and match its scope encoding byte-for-byte (length included; do not assume 16 vs 32 until read). Then `approve_sponsorship_claim { offer_id, claimant_pubkey, sponsor_pubkey, signature, timestamp }`.
  - `rejectClaim`: preimage claimant(32) ‖ timestamp(8 BE) → `reject_sponsorship_claim`. **Replay note (comment in code):** for an UNSCOPED offer this preimage is byte-identical to approve (`methods.rs:18309`), so a leaked reject signature doubles as an approve signature. The signature only ever travels keeper→localhost node; verify during implementation that `reject_sponsorship_claim` does not gossip the signature (grep the handler); if it does, drop rejects on the global tier and let mismatches stay pending instead.
- [ ] **Step 3:** State handling: `loadState`/`saveState` as in `meme-bot.mjs:143-149` but **atomic** — write `STATE_FILE + '.tmp'` then `renameSync`. Trim `approvedAtMs` to the trailing 2h on save.
- [ ] **Step 4:** Manual smoke against a local regtest node (`cargo run -- --regtest node start --listen 127.0.0.1:29735` or `scripts/node-manager.sh`): run with `ONCE=1 DRY_RUN=1` and confirm it lists offers, logs decisions, writes no state. (Full E2E is Task 8.)
- [ ] **Step 5:** Write `deploy/defcon-gate-mainnet.service` modeled on `tools/swim-bot/deploy/game-offer-keeper-mainnet.service` including the scp recipe comment header: `Type=simple`, `WorkingDirectory=/opt/defcon-gate`, every env above as `Environment=` (GATE_CODE left as `Environment=GATE_CODE=SET-AT-GO-LIVE`), `Restart=always`, `RestartSec=5`, `MemoryMax=200M`, `NoNewPrivileges=true`, `PartOf=swimchain-mainnet.service`, `WantedBy=multi-user.target`.
- [ ] **Step 6: Commit** — `feat(defcon-gate): claim-approval keeper daemon + systemd unit`

---

### Task 5: Space mint one-shot

**Files:**
- Create: `tools/defcon-gate/mint-space.mjs`

**Interfaces:**
- Consumes: node RPC `get_info`, `get_identity_info`, `sign_message`, `create_space`, `get_content`, `submit_post`; Argon2id action PoW via `hash-wasm` (copy the mining from `tools/swim-bot/activity-bot.mjs` — it already mines action PoW correctly per network profile).
- Produces: prints `DEFCON_SPACE_HEX=<hex>` and the `sp1…` bech32 on success — the value Tasks 4/6/7 configure. Space display name constant: `DEFCON 34`; seed post title `Report your findings`, body `Broke something? Post it here. This space and everything in it was minted for DEF CON 34.`

- [ ] **Step 1:** Write `mint-space.mjs` following `shoal-client/scripts/mint-water.ts`'s shape (env `RPC_URL` + `COOKIE_FILE`; node identity via `get_identity_info`; **space PoW preimage is `sha256(name)`** — mirror `mint-water.ts:103-122`, not the `space:`-prefixed helper): mint space idempotently (`create_space` returns the existing id for a duplicate name), then seed post idempotently (derive/check via `get_content` before `submit_post`), then verify by reading back `list_space_posts` and asserting the seed post is present. Exit non-zero on any mismatch. Requires the node's identity to be sponsored (it will be: defcon34, granted in the runbook before minting).
- [ ] **Step 2:** Run against local regtest: mint, run again, confirm second run is a no-op with exit 0 and both runs print the same space id.
- [ ] **Step 3: Commit** — `feat(defcon-gate): idempotent @defcon34 space + seed-post mint`

---

### Task 6: `defcon-client` — scaffold and join flow

**Files:**
- Create: `defcon-client/` (scaffold: copy `chips-client/`'s Vite config/package shape — it is the smallest hosted client; workspace deps `@swimchain/react`, `@swimchain/core`)
- Create: `defcon-client/.env.production`:

```
VITE_RPC_ENDPOINT=https://swimchain.io/rpc
VITE_DEFCON_SPONSOR=<defcon34 pubkey hex — placeholder 00…00 until Task 10 mints it>
VITE_DEFCON_SPACE=<space id hex — placeholder until Task 10>
```

- Create: `defcon-client/src/App.tsx`, `defcon-client/src/lib/join.ts`
- Test: `defcon-client/src/lib/join.test.ts`

**Interfaces:**
- Consumes: `selectClaimableOffer` + `ensureSponsored` with `{ applicationText, allowManualOffers: true, requireExactScope: true, preferredSponsorHex: VITE_DEFCON_SPONSOR, strictPreferred: true, spaceIdHex: VITE_DEFCON_SPACE }` (Task 2); keypair/localStorage pattern from `reef-client/src/App.tsx:581-590` + `useStoredIdentity` (`swimchain-react/src/hooks/useStoredIdentity.ts`, key `'swimchain-identity'`); signature RPC auth via `setSignatureAuth` (`swimchain-react/src/lib/rpc.ts:218`).
- Produces: page sections Task 7 extends — `<Hero/>`, `<RunANode/>`, `<BrowserJoin/>`, `<Wall/>` (Wall stubbed here, built in Task 7).

Page structure (single page, website design tokens copied from `website/index.html:4-20` `:root` block for visual continuity — `--ink #071E26`, `--surface #0C2A33`, `--foam #E8F1EF`, `--heat #FF9E5E`, `--shallow #6ED3C2`, Palatino serif stack):

1. **Hero:** "Swimchain — a social protocol with no servers to seize. Every node is the network. Come break it." Plus one honest line: *reporting what you break is the con game; the space below is where findings go.*
2. **`<RunANode/>` (primary CTA):** downloads + copy-paste block. Fetches `list_sponsorship_offers`, runs `selectClaimableOffer` with `{ allowManualOffers: true, preferredSponsorHex, strictPreferred: true }` and **no** scope options (the global tier = the offer with `space_scope == null`), and renders the live offer id into the command block:

```
# 1. get a node        (downloads: /download)
# 2. create your identity (mines identity PoW — takes a few minutes)
sw identity create
# 3. claim your sponsorship — full network access
sw sponsor claim <LIVE_OFFER_ID> --application "<THE CODE FROM YOUR STICKER>"
```

   plus the copy: *"Browser accounts are sandboxed to the DEF CON space, permanently — the protocol has no upgrade path by design. Run a node and you get an unrestricted identity."*
3. **`<BrowserJoin/>`:** code input → on submit: generate keypair if none stored (exact `reef-client/src/App.tsx:581-590` pattern incl. `kp.free()`), `setSignatureAuth`, then `ensureSponsored` with the options above and `applicationText` = the typed code. Status line per phase (checking → mining → claiming → waiting for the gatekeeper → in). On success reveal `<Wall/>`. If not sponsored after 90s: *"The gatekeeper didn't wave you through — check the code and try again."* (keeper rejects bad-code claims, so a retry re-claims cleanly). Include a small "download your key" link (serializes the `'swimchain-identity'` localStorage JSON as a file download) with the caption *"your key, your identity — browser storage is not a vault."*

- [ ] **Step 1:** Scaffold the client; `npm install`; `npm run dev` renders the hero.
- [ ] **Step 2: Failing test** for the one pure piece, global-tier offer pick (`join.ts` exports `pickGlobalOffer(offers, sponsorHex)` wrapping `selectClaimableOffer`): given a scoped + a global offer from the sponsor, it returns the global one; given only scoped, `null`.

```ts
import { describe, it, expect } from 'vitest';
import { pickGlobalOffer } from './join';
const base = { offer_id: 'aa'.repeat(16), sponsor_pubkey: '11'.repeat(32), auto_approve: false,
  slots_remaining: 5, requirements: { min_pow_difficulty: 8, application_required: true } };
describe('pickGlobalOffer', () => {
  it('picks the unscoped offer, never the scoped one', () => {
    const scoped = { ...base, offer_id: 'bb'.repeat(16), space_scope: 'cc'.repeat(16) };
    const global = { ...base, space_scope: null };
    expect(pickGlobalOffer([scoped, global], '11'.repeat(32))?.offer_id).toBe('aa'.repeat(16));
    expect(pickGlobalOffer([scoped], '11'.repeat(32))).toBeNull();
  });
});
```

- [ ] **Step 3:** Run test — FAIL; implement `join.ts` (`pickGlobalOffer` = `selectClaimableOffer(offers, { preferredSponsorHex, strictPreferred: true, allowManualOffers: true })` then reject any result with a `space_scope`); PASS.
- [ ] **Step 4:** Implement the three sections against a local regtest node (`.env.development` pointing at it). Verify by hand in the browser: code entry → sponsored (run the Task 4 keeper with `GATE_CODE=TEST-CODE-1234` locally) → "you're in".
- [ ] **Step 5:** 390px-width audit (F12 device emulation, NOT window resize): no horizontal overflow — the command `<pre>` blocks must sit in an `overflow-x:auto` container (`minmax(0,1fr)` if inside a grid; this exact regression is commit `ad54d031`).
- [ ] **Step 6: Commit** — `feat(defcon-client): /defcon landing with node-first CTA and browser join`

---

### Task 7: `defcon-client` — the wall

**Files:**
- Create: `defcon-client/src/Wall.tsx`, `defcon-client/src/lib/pow.worker.ts` (copy `reef-client/src/lib/pow.worker.ts` verbatim — Argon2id action PoW off-thread; the main thread must never await hash loops)
- Modify: `defcon-client/src/App.tsx` (mount Wall when sponsored)

**Interfaces:**
- Consumes: proxy-allowlisted RPC only: `list_space_posts`, `get_replies`, `submit_post`, `submit_reply`, `get_reactions` (param shapes: crib the exact call sites from `feed-client/src/` — it is the reference consumer of these methods); action PoW via the worker + `swimchain-react/src/lib/action-pow.ts`; identity/sign from `useStoredKeypair()`.
- Produces: a deliberately minimal wall for `VITE_DEFCON_SPACE`: post list (newest first, poll every 10s), post composer, expandable replies with reply composer. No reactions UI, no media, no editing — YAGNI; the point is that browser attendees can write somewhere.

- [ ] **Step 1:** Implement `Wall.tsx`: `list_space_posts { space_id, limit: 50 }` on mount + 10s interval; composer → mine action PoW in the worker (progress text: "mining Argon2id — this is the protocol's spam price, not your machine being slow") → `submit_post` → optimistic prepend; per-post "replies" toggle → `get_replies` → reply composer → `submit_reply`.
- [ ] **Step 2:** Manual regtest verification: post from browser identity A, see it from a second browser profile with identity B; reply round-trips; a post from the `sw` CLI into the space appears on the wall within one poll.
- [ ] **Step 3:** Mobile 390px audit of the wall (fresh-profile state included: empty wall shows the seed post).
- [ ] **Step 4: Commit** — `feat(defcon-client): minimal @defcon34 wall (posts + replies)`

---

### Task 8: Deploy plumbing

**Files:**
- Modify: `scripts/deploy-web-clients.sh` — add `defcon` to the `SPEC` map (`:26-30`): build dir `defcon-client`, target `/var/www/defcon`, required markers: `swimchain.io/rpc`, the `VITE_DEFCON_SPONSOR` hex, the `VITE_DEFCON_SPACE` hex. (Markers are placeholders until Task 10 fills `.env.production`; the script's grep gate is exactly what catches a forgotten fill — leave it strict.)
- Modify: `scripts/bvt.sh:94` — add `/defcon/` to the B1 path list.
- Create: `web-gateway/deploy/nginx-defcon-location.conf` (precedent: `nginx-browse-location.conf`):

```nginx
# /defcon — DEF CON 34 onboarding client (defcon-client). Paste into
# /etc/nginx/sites-enabled/swimchain.io ABOVE the catch-all "location /".
location /defcon {
    alias /var/www/defcon;
    try_files $uri $uri/ /defcon/index.html;
}
```

- [ ] **Step 1:** Make the three edits. `bash -n scripts/deploy-web-clients.sh scripts/bvt.sh` passes.
- [ ] **Step 2:** `npm run build` in `defcon-client/` with dev placeholders; run the deploy script's verification stage in dry form (build + marker grep only — do NOT rsync) to prove the marker gate trips on placeholder values, i.e. deployment before Task 10 is impossible by construction.
- [ ] **Step 3: Commit** — `feat(deploy): register defcon client in deploy + BVT + nginx snippet`

---

### Task 9: Regtest end-to-end rehearsal (scripted)

**Files:**
- Create: `tools/defcon-gate/rehearse-regtest.sh` — the repeatable local drill, using `scripts/node-manager.sh` for a 2-node regtest.

**Interfaces:** consumes everything above; produces a pass/fail transcript. This is the proof the signature byte-layouts are right — unit tests can't verify against the Rust verifier, this can.

- [ ] **Step 1:** Script the drill (set -e; every step asserts on RPC output via `jq`):
  1. Start 2-node regtest (node A = "gate", node B = "attendee").
  2. On A: create identity, self-establish as sponsor (regtest bypasses level checks; use `sw sponsor genesis-claim` on regtest or direct-register — whichever `scripts/node-manager.sh` fixtures already use; read that script first).
  3. Run `mint-space.mjs` against A; capture `DEFCON_SPACE_HEX`; run again; assert idempotent.
  4. Start `defcon-gate.mjs` against A with `GATE_CODE=TEST-CODE-1234`, `TOTAL_CAP=3`, `HOURLY_CAP=2`, `END_AT` = +1h.
  5. On B: `sw identity create`, then `sw sponsor claim <global-offer-id> --application "TEST-CODE-1234"` → poll `get_sponsorship_info` on B until `is_sponsored=true` (≤60s). **Global tier proven.**
  6. Browser-tier claim via raw RPC to A (curl, constructing the claim exactly as `ensureSponsored` does — or drive it through the Task 6 page manually the first time): scoped offer id, good code → sponsored, and `get_sponsorship_info` shows the scope. **Scoped approval signature proven against the Rust verifier.**
  7. Bad-code claim → assert the claim disappears (rejected) and the identity is NOT sponsored; re-claim with the good code → sponsored. **Reject + retry proven.**
  8. Fourth good-code claim → stays pending (`TOTAL_CAP=3`). **Caps proven fail-closed.**
  9. Kill the keeper mid-run, restart it → state file counters survive; a pending claim from step 8 is still only `skip`ped. **Restart safety proven.**
- [ ] **Step 2:** Run it clean end-to-end. Fix what breaks (expected suspects: scope byte encoding in the approval preimage, offer-sync timing for B's claim — if B rejects the claim because it hasn't synced the offer, add a bounded retry loop to the script and a note to the runbook that attendees may need to wait ~a minute after node start).
- [ ] **Step 3: Commit** — `test(defcon-gate): scripted regtest end-to-end rehearsal`

---

### Task 10: Ops runbook

**Files:**
- Create: `tools/defcon-gate/README.md` — the complete operator runbook. Sections, each a literal checklist with the exact commands:
  1. **Provision** the gate droplet (new, smallest tier, dedicated; nothing else runs there). Install the Linux `sw` (WSL build per the existing build-paths workflow), mainnet node systemd unit, firewall: P2P open, RPC bound to localhost only.
  2. **Mint `defcon34`** on the gate node (`sw identity create`), record pubkey + address; **on the operator machine**, unvault the mainnet genesis seed and `sw sponsor direct <defcon34-address>`; verify on the gate node `get_sponsorship_info` → `is_sponsored:true` (arrives with block formation — if the chain is idle, drive one action; chain+mempool is reality, but this record is written at block apply).
  3. **Mint the space** (`mint-space.mjs`), record `DEFCON_SPACE_HEX` + bech32.
  4. **Fill real values**: `defcon-client/.env.production` (sponsor hex, space hex) → commit; keeper unit `Environment=` lines; **pick the real gate code** (format `WORD-####`, not guessable, never committed).
  5. **Deploy**: keeper (scp recipe from the unit header) with `DRY_RUN=1 ONCE=1` first; clients via `scripts/deploy-web-clients.sh defcon`; nginx snippet on gateway + seed; browse-allowlist drop-in addition for the space (optional, makes it visible at `/browse`); `scripts/bvt.sh` green including `/defcon/`.
  6. **Testnet dress rehearsal** (same steps against testnet, testnet genesis from `GENESIS_IDENTITY.md`) and a **mainnet rehearsal** with a secret test code + `TOTAL_CAP=5`, including one claim from a real phone browser, before raising caps for the con.
  7. **Go-live** (Wed Aug 5): set real code, `TOTAL_CAP=500`, `HOURLY_CAP=60`, `END_AT=2026-08-10T07:00:00Z`, restart keeper, BVT, post the announcement.
  8. **Kill switches**, fastest first: `PAUSED=1` + restart (seconds); `systemctl stop defcon-gate` (fail-closed); cancel offers (`ONCE=1` mode after END_AT logic, or manual `cancel_sponsorship_offer`); **subtree revocation** from the operator machine via genesis — rehearse the exact penalty/revocation command on testnet during the dress rehearsal and paste the verified command here (SPEC_11; do not go live without having executed it once).
  9. **During-con watch**: `journalctl -fu defcon-gate` (every decision is one line), fleet health, and the state-file counters; what "hourly-cap pause" looks like and when to raise it.
- [ ] **Step 1:** Write it. Every command literal; no step may say "configure X" without the incantation.
- [ ] **Step 2: Commit** — `docs(defcon-gate): operator runbook — provision, rehearse, go-live, kill switches`

---

## Self-review notes (done at write time)

- **Spec coverage:** two tiers (Tasks 4/6), keeper + caps + code (3/4), space (5), landing page incl. node-first copy + key download (6), wall (7), relay/allowlist (verified: no proxy changes needed — recorded in Facts), deploy + BVT (8), rehearsals + kill switches + droplet + genesis grant (9/10). Spec's "config file on droplet" became systemd `Environment=` lines — same live-editability, matches every existing tool; spec's "probationary containment" corrected per Facts (cosmetic — containment is subtree/caps/expiry).
- **Known accepted risk (record in README §8):** the shared code + allowlisted `claim_sponsorship_offer` means anyone on the internet with the leaked code can claim the GLOBAL tier through the proxy without running a node — the tiering is a funnel, not a security boundary. Caps + END_AT + the burnable subtree are the boundary.
- **Type consistency:** `selectClaimableOffer`/`OfferSelectionOpts` (Task 2) are the names Tasks 6 uses; `gateDecision`/`offerPlan`/`codeMatches`/`hourlyCount` (Task 3) are the names Task 4 imports; `DEFCON_SPACE_HEX` naming consistent across 4/5/9/10.
