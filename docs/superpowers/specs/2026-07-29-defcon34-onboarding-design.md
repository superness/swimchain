# DEFCON 34 Onboarding — Design

**Date:** 2026-07-29 · **Status:** Draft for review · **Target:** live before DEF CON 34 (believed Aug 6–9, 2026 — verify)

## Goal

Make Swimchain joinable by DEF CON 34 attendees on **mainnet**, with automated approvals,
time-boxed to the con. The funnel pushes attendees toward **running a full node**; a browser
path exists but is deliberately the smaller experience. Getting attacked is an accepted —
even desired — outcome; containment comes from the sponsorship tree, not from pretending
we can verify attendance.

## Two-tier funnel

| Tier | How they join | What they get |
|------|---------------|---------------|
| **Full node (primary)** | Run `sw`, create identity, `sw sponsor claim <offer-id> --application "<CODE>"` from their own node | **Global** (scope-less) probationary identity — post anywhere, full network access |
| **Browser (easy path)** | swimchain.io/defcon one-click join via the gateway relay | **Space-scoped** grant to the `@defcon34` space only — participate in that space from browser clients |

The privilege gradient is the influence mechanism: full access is the reward for running a
real node. Both tiers gate on the same shared code, distributed physically at the con
(stickers/talk). The code is a speed bump against drive-by internet bots, not attendance
verification — it will leak and that's fine. Use a non-guessable phrase (e.g.
`SHALLOWS-8291`), **not** literal "DEFCON34".

Existing mainnet invariants are untouched: both offers are manual (`auto_approve=false`),
which mainnet allows for any sponsor; the scope-less tier is approved by an external keeper,
not by the in-node auto-approve sweep. The browser tier keeps the
"unattended-approval-requires-space-scope" spirit intact since its grant is space-scoped.

## Topology

- **Gate droplet (new, dedicated, sacrificial):** stock mainnet `sw` node holding only the
  fresh `defcon34` sponsor key. No other services besides the keeper. If compromised, burn it.
- **`defcon34` identity:** minted fresh; direct-sponsored from the vaulted mainnet genesis
  **on the operator's machine** — the genesis seed never touches the droplet.
- **`@defcon34` space:** minted by `defcon34` (idempotent mint script, same pattern as the
  Shoal space mint).
- **Two standing offers** from `defcon34`, both: Probationary, `application_required=true`,
  `min_pow_difficulty` = a few zero **bits** (mines in seconds in browser WASM; remember the
  bits-not-bytes 8× trap), `expires_at` = Sunday night con close, 10 slots each
  (non-game-sponsor mainnet cap), keeper re-mints as they fill.
  - **GLOBAL offer:** `space_scope = None`.
  - **SPACE offer:** `space_scope = @defcon34`.

## Gate keeper (`tools/defcon-gate/`)

Systemd service on the gate droplet, same shape as swim-bot. Every ~5s against localhost RPC:

1. List pending claims on both current offers.
2. Approve claims whose `application_text` matches the code (trim, case-insensitive);
   leave others pending (they age out with the offer).
3. Re-mint an offer when its 10 slots fill, until the total cap.

Config file on the droplet — live-editable, restart to apply, no rebuilds:
- `code` — the shared code
- `total_cap` — max identities across both tiers (default **500**)
- `hourly_cap` — max approvals/hour (default **60**); exceeding it pauses approvals and logs loudly
- `paused` — hard stop flag

Every decision is logged; a state file tracks counters across restarts. **Fail-closed:**
keeper down ⇒ no new joins, network otherwise unaffected.

## Landing page (`swimchain.io/defcon`)

Static page on the gateway nginx. Content, in order:

1. Pitch: P2P social protocol, no servers, content decays, PoW to post — **come break it**,
   and where to report what you find (a thread in `@defcon34`).
2. **Primary CTA — run a node:** binary downloads + copy-paste bootstrap
   (`--connect` to fleet seed), identity create, claim command with code placeholder.
3. **Secondary — browser join:** code entry + one click. Keypair generated in browser,
   claim PoW mined in WASM, claim submitted via the gateway `/rpc` relay (proxy allowlist:
   fetch current offer by sponsor, submit claim, poll claim status — N2 pattern), then
   straight into `@defcon34` via the browse/feed clients (same-origin localStorage carries
   the identity). Offer a "download your key" escape hatch so a browser user can graduate
   to a node later.

## Containment & kill switches

- **Subtree:** every DEFCON identity is a child of `defcon34`; one penalty action from
  genesis (SPEC_11 propagation) cuts off the entire cohort.
- **Fail-closed keeper**, offer expiry Sunday night, total + hourly caps, per-claim PoW,
  shared code.
- **Probationary status** on all grants.
- **RPC surface:** browsers only reach the gateway relay's allowlisted methods; the gate
  droplet's RPC is not publicly exposed beyond what the relay forwards. Attendee browsers
  never touch the seed (accept-loop lesson from 2026-07-29).
- **Persistence is intentional:** identities live on after the con — growth is the goal.
  Only *new joins* stop when the offers expire.
- The network's own immune system (spam attestation, 7-day/4-hour decay, blocklists) is
  part of the experiment — that's what we're inviting attendees to test.

## Ops & testing

1. **Testnet dress rehearsal** first: same topology end-to-end (gate node, keeper, page
   pointed at testnet) — node claim path and browser claim path both exercised.
2. **Mainnet rehearsal** with a secret test code before the con; verify with a real
   phone browser (device emulation is not mobile).
3. **During the con:** keeper log tail + fleet health watch.
4. **Timeline:** build this week; rehearsals by ~Aug 3–4; live before doors open Aug 6.

## Open items (resolve during planning)

1. Can the freshly-sponsored `defcon34` identity create offers/sponsor immediately, or do
   probation/maturity rules block it? (Fallback — game-sponsor designation — needs a
   rebuild; avoid if possible.)
2. Can one identity hold both a scoped and a global sponsorship (browser → node upgrade
   path), or does graduating mean a new identity?
3. Exact DEF CON 34 dates (believed Aug 6–9, 2026) → offer `expires_at`.
4. Concrete `min_pow_difficulty` value that mines in ~seconds in browser WASM.
5. Which proxy-allowlist entries the gateway needs for the browser claim path (N2 reuse).
6. How a fresh attendee node discovers the offer: gossip propagation vs printing the
   offer-id on the landing page (page should print it regardless — deterministic beats
   eventual).
