# Swimchain UX Study — 2026-07-14 morning (round 2: the Not-Covered surfaces)

**Method:** operator-driven (no arm backend), per
`docs/qa/rounds/2026-07-13-night/HANDOFF.md`. One operator (Claude) drove the
five PC clients via swim-auto (node mode against the local genesis node), two
fresh-identity nodes (`qa2`, `qa3`) for second/third-party flows, the phone
(46281FDJG001JN) via adb, the deployed swimchain.io reef/chess pages, and the
desktop launcher exe. All screenshots in `./shots/` were visually reviewed.

**Coverage this round (the round-1 "Not covered" list):** private spaces
end-to-end ✅ · DMs end-to-end ✅ (2 bugs found + fixed) · invite-link
onboarding ✅ (1 bug fixed, 1 architectural gap found) · claimant-side Find a
Sponsor ✅ · offer cancel/reject ✅ · PC media ✅ · report/attest/blocklist ✅ ·
space rename ✅ (feature gap) · follow→feed/wiki ✅ · settings+notifications ✅ ·
Saved Posts ✅ · desktop launcher ◐ (launch+unlock only; operator was using the
machine, no input injection) · reef+chess ✅ · phone parity ✅.
Not done: qa2's DM *UI* re-read after the fork heal (node-layer verified),
invite redeem *on* the phone (couldn't extract the phone pubkey
non-intrusively), full desktop-launcher walkthrough.

---

## Headline

Round 1 said "the plumbing is healthy, the presentation is rough." Round 2's
deeper surfaces flip that: **three flagship flows were functionally broken at
the plumbing level** — DMs (unreachable UI + a protocol-rule violation),
invite-link creation (dead in node mode), and invite auto-approval (never
happens across nodes). Two of the three are **fixed and verified this round**;
the third needs a design decision. The encryption layer itself is solid: every
private byte we checked on the wire, on two droplets, and in the search index
was ciphertext.

## Performance (measured)

| Path | Time | Verdict |
|---|---|---|
| Local RPC (stats/spaces/identity) | 1.0–4.2 ms | ✅ |
| Seed droplet RPC (on-box) | 0.4–0.9 ms | ✅ |
| Client bundle load (local shell) | 2–3 ms | ✅ |
| swimchain.io page load | 251 ms | ✅ |
| DM request cross-node (qa2 → genesis) | < 10 s | ✅ |
| Private message PC → seed (incl. block) | ≤ ~60 s | ✅ |
| Claim approve → sponsored on claimant node | **62 s** | ✅ (matches round 1's ≤64 s) |
| Media blob PC → seed | < 4 min (poll granularity) | ✅ |
| Phone private post accepted by in-process node | seconds (native PoW) | ✅ |

One consensus note: a **1-block fork at height 52** (two blocks, same parent)
appeared during the DM test; qa2 sat on the minority side for a few minutes and
then **reorged onto the majority chain on its own**. Tip-level fork healing
works post-F10.

## Fixes shipped this round (committed to main)

1. **chat: DM conversations were unreachable — dead code.**
   `/channels/@me/:spaceId` had no route; it fell through to the generic Chat
   page ("Pick a conversation…"). `DmConversation.tsx` was never mounted
   anywhere. Added the route (`chat-client/src/App.tsx`). This means **DMs had
   never been drivable end-to-end in the UI before this round.**
2. **chat: DM channel creation violated the Phase-1 private-space rule.** It
   submitted a top-level post with plaintext title `messages`, which the node
   now rejects (`private-space posts must not carry a plaintext title`), so the
   conversation thread could never be created — with an infinite silent retry
   loop. Fixed to encrypt the channel marker into the body with an empty title
   (`DmConversation.tsx`). Full DM loop then verified: request qa2→genesis,
   accept, message send, `[PRIVATE:v1:]` on both nodes + seed, cross-node sync.
3. **feed: "Create Invite Link" was dead in node mode.** It used the
   browser-only `useStoredKeypair().sign` (null in node mode → "Failed to sign
   the invite"), while CreateOfferModal correctly uses the unified
   `useFeedIdentity().sign`. Switched it over (`CreateInviteLinkModal.tsx`).
   Invite links now mint from the desktop/node identity.

## Ranked findings

### Critical

**C1 — Invite-link onboarding is one-step only if the invitee shares the
sponsor's node.** `claim_sponsorship_offer` auto-approves **only inside the
claim RPC on the node that holds the sponsor identity**
(`src/rpc/methods.rs` ~16980). A real invitee claims on *their* node; the claim
gossips to the sponsor (verified: it arrives and is stored) — but the router's
receive path (`handle_sponsorship_claim`) never auto-approves, and no worker
sweeps pending claims on auto-approve offers. The claim sits pending until the
sponsor manually approves — exactly what invite links promise to eliminate.
Observed live: qa3 claimed the auto-approve invite offer; nothing happened
until I approved by hand. **Fix direction:** sponsor-side auto-approval when a
claim for an own auto-approve offer is stored (router needs a signer handle —
it only has `identity_pubkey` today — or a small periodic task holding the
keypair). Design call for the operator; everything else in the funnel now
works (landing page → app → claim UI → 62 s to sponsored).

### Major (new)

**N1 — PC feed cannot post into private spaces at all.** Compose ignores
`?space=` and its dropdown only lists public spaces, so the private space
page's "New Post"/"Create Thread" buttons are dead ends. **The phone client
has this solved** — its compose has a "Private spaces" section with decrypted
names, and a phone private post (encrypted title included) round-trips
perfectly. The PC feed bundle lags the mobile code. Port it back.
Shot: `private-compose-no-space-option.png` vs `phone-private-compose.png`.

**N2 — The Reef and Chess are unplayable for a genuinely new visitor.** The
pages mint a browser identity, but every move then fails with a verbatim
`RPC Error -32015: Identity is not sponsored…` banner, and the pages offer no
sponsorship/invite path. (After I sponsored the identity out-of-band, reef
seeding, the fold/leaderboard, chess game creation, and `1. e4` all worked —
gameplay itself is fine.) Bonus bug: **"Create an identity" succeeds but the
UI never transitions** — the landing page just sits there until a manual
reload. A new visitor would conclude the game is broken twice over.
Shots: `reef-move.png` (error), `reef-coral-placed.png`, `chess-move.png`.

**N3 — Sponsorship offer state never re-gossips.** Canceling an offer on the
sponsor's node does not propagate (qa3 still lists the canceled offer as
claimable ~1 h later), and slot counts on remote nodes are stale (offer shows
2/2 remotely while the sponsor sees 1/2). Claimants can claim dead or full
offers and wait forever. Related race: **approved claims resurrect as pending**
on the sponsor (claimant re-broadcasts every 30 s until it learns it's
sponsored; approval deletes the stored claim, so the re-receive stores it
again as new) — I watched the invite claim reappear as "Pending claims: 1"
after approving it, where a second Approve would double-sponsor. And the
claimant's own `get_my_claim_status` still says `has_pending_claim:true`
after being sponsored — the local record is never resolved.

**N4 — Follows, saved posts, and DM lists are per-client localStorage, not
node state.** Following a space in feed does nothing for wiki ("Follow spaces
on your node to see them as wiki namespaces" can never come true — wiki also
has no follow UI of its own, so wiki namespaces are unreachable in the desktop
bundle). The chat DM list key (`swimchain-chat-dms`) isn't namespaced by
identity, so on a shared browser profile one identity's DM list leaks into
another's UI (observed with qa2/genesis). Saved posts have the same
portability problem. Needs a node-side prefs/follow store (RPC exists for
nothing of this today).

### Major (re-verified from round 1)

- **M1 raw identifiers — still open, now confirmed on phone too.** Phone
  follow list shows raw `sp1…`; phone + PC post bylines show the zero-padded
  `in 0100003b…000000` / `in 044cb043…000000` form. New instances: the
  private-space *detail header* shows raw hex even for members holding the key
  (Discover list and chat rail decrypt the same name fine); forum's Private
  tab shows two identical "Private Space 1" fallback labels (no decryption)
  and links them to `/chat/…` routes that don't belong to forum.
- **M2 raw JSON-RPC error — reproduced verbatim** (standalone feed → open
  space → `HTTP 401: Unauthorized - {"jsonrpc":…}`).
  Shot: `feed-standalone-space.png`.
- **M3 search index — still open, sharper repro:** today's synced third-party
  content (the chess post, present in every node's feed) is absent from
  genesis search; an older synced phone post now *does* appear (probably a
  one-off manual rebuild). The index still doesn't ingest newly-synced
  content. New: **private ciphertext is indexed** — searching "PRIVATE"
  returns `[PRIVATE:v1:…]` bodies as noise results; private envelopes should
  be excluded.
- **M4 display-name resolution — still inconsistent, new map:** feed *card*
  now resolves "Genesis Prime" (improvement), feed *post detail* doesn't;
  chat does; the standalone identity page says "No display name set" for the
  same identity; fresh nodes (qa2/qa3) see raw hex for everyone — names don't
  propagate to new nodes.

### UX / polish (new)

- **Report succeeds silently.** ROOT-CAUSED + FIXED 2026-07-14 afternoon
  (commit 5ec7f931): the report WRITE 401'd — `submit_spam_attestation` /
  `get_spam_status` were not in the node's `AUTH_EXEMPT_METHODS`, though they
  carry a self-verifying signature + PoW exactly like the sponsorship writes
  that are exempt. The modal itself has proper mining/success/error states;
  it just never got a success because the call was rejected. (My original
  "silent, no state change" read was right about the symptom, wrong that the
  attestation reached the node — it did in round 2 via CLI, not via the UI.)
- **Feed's "Manage Blocklist" settings button** — RETRACTED (stale-bundle
  false positive). The button has a handler and opens a working Blocklist
  Manager modal in the current build; verified live 2026-07-14 afternoon.
- **DM sender gets zero feedback** ("No DMs yet" persists, no pending badge),
  and the DM sidebar entry flickers in/out around accept (poll/render race).
- **Space create/invite asks for a raw 64-hex public key** while the DM modal
  takes a `cs1…` address — inconsistent identity-input norms; neither is
  Mom-friendly. (The claimant page's "Your public key + Copy" is the right
  pattern to reuse.)
- **Game/app JSON posts render raw in feeds** — the chess game shows as
  `{"v":1,"kind":"chess",…}` in the phone feed. App-namespaced content should
  be summarized or hidden.
- **Feed semantics differ per surface:** phone "Your Feed" is global-recent;
  PC "Your Feed" is followed-only (empty for a fresh profile). Same name, two
  meanings.
- **Settings coverage is wildly uneven:** forum (rich: ordering, storage
  slider, passphrase, shortcuts, blocklist, node debug) > chat > feed (has a
  dead button) > search/wiki (none at all).
- **No notification system exists on any PC client** beyond chat unread badges
  and transient toasts — "someone replied to your post" lands nowhere.
- **Desktop launcher:** launches, unlock screen renders (per-network identity,
  Testnet picker), but content is right-clipped/uncentered at 1215 px width.
  Full walkthrough deferred (operator was actively using the machine; driving
  a native window needs focus-stealing input injection).
- **Space rename is a phantom feature:** `rename_space` RPC exists node-side,
  no client exposes it, and driving it raw requires client-mined PoW — i.e.
  unreachable by users.
- Round-1 leftovers confirmed as-is: wiki is still light-themed among four
  dark clients; forum's "Join a private space" input is still a white box on
  dark (`forum-private-tab.png`); UX-2's fake mining ETA phrasing unchanged.

### What works (verified this round — don't regress)

Private spaces end-to-end (create instant in node mode, invite mint, redeem by
second identity, encrypted post via chat, member decrypt on the other node,
ciphertext-only on non-member droplets, per-identity key isolation, keys are
node-side so membership crosses clients); DM full loop after the two fixes;
invite-link mint + the excellent `/i/#` landing page (invite carried into
download link + `swimchain://` deep link + honest SmartScreen copy); claimant
browse/claim UI with "Your public key + Copy"; sponsor claims view,
approve (62 s to sponsored), reject, cancel (local); PC media attach → render
→ droplet sync → phone render; spam attestations; chat+forum blocklist
managers; saved posts; follow→feed immediate; unfollow immediate; reef + chess
gameplay once sponsored; phone private spaces incl. encrypted titles; 1-block
fork self-heal.

## Cross-round diff vs 2026-07-13-night

| Item | Round 1 | This round |
|---|---|---|
| M1 raw ids | open, all 5 PC clients | **still open + phone + private-space surfaces** |
| M2 raw 401 | open | **still open** (reproduced verbatim) |
| M3 search index | confirmed | **still open**, sharper repro; + private ciphertext indexed |
| M4 name resolution | inconsistent | **still open**; feed cards improved, fresh nodes worse |
| DMs | not covered | **was unshippable (2 bugs) → fixed + verified e2e** |
| Invite links | not covered | **creation fixed; cross-node auto-approve missing (C1)** |
| Claimant claim UI | not covered | **works**, 62 s to sponsored |
| Offer cancel/reject | not covered | **works locally; never propagates (N3)** |
| Private spaces | not covered | **crypto solid e2e; PC feed can't post (N1)** |
| PC media | not covered | **works incl. droplet + phone render** |
| Reef/chess | not covered | **gameplay works; new-visitor funnel broken (N2)** |
| Wiki namespaces | not covered | **unreachable by design gap (N4)** |
| F6 formation stall | not seen | not seen; 1-block fork self-healed |

**Biggest single lever (unchanged in spirit, sharper in scope):** finish the
invite funnel — C1 (sponsor-side auto-approve of gossiped claims) is the one
missing hop in an otherwise-working "Mom" path, and N2 (games' unsponsored
dead-end) is the same root cause wearing a costume: **new identities have no
self-serve way to become postable.** Solve those two and every public surface
(games, invite links, downloads) starts converting. Second lever: port the
phone's private-space compose to the PC feed bundle (N1) — the mobile code
already does it right.

## Session gotchas for the next round (additions to the handoff list)

- swim-auto `click` auto-dismisses `window.confirm()` → confirm-gated actions
  (Cancel Offer) silently no-op. Stub `window.confirm=()=>true` via `eval`
  first.
- `goto <path>` re-opens the shell but the SPA ignores the `route=` param —
  deep-link by `eval` `history.pushState` + `popstate`, or click through.
  Git Bash also mangles leading-`/` args (`MSYS_NO_PATHCONV=1`).
- Rebuilding a client is not enough — the daemon serves
  `desktop-app/dist/clients`, so run `swim-auto clients build` after any
  client change, and reopen twice if index.html was cached.
- `fresh` nodes are single-slot (fixed ports 19745/6): stop one before minting
  the next (`fresh stop <name>`), identities/data survive.
- External pages (swimchain.io) can be driven only after `stop` +
  `goto <url>` into an empty session (`client:null`); the shell-frame
  selectors don't exist there.
- `get_my_private_spaces` deliberately hides DM + profile spaces — query
  `get_space_members` to check DM membership; `get_sponsorship_offer` shows
  `pending_claims` only with `caller_pubkey=<sponsor>`.
- The genesis node currently logs nowhere obvious (`node-genesis.log` and
  `.daemon-pids/genesis-local.log` are stale) — use the seed's
  `journalctl -u swimchain.service` for receive-side protocol questions.
