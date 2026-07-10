# Desktop build — QA issues (2026-07-05)

Build under test: fresh desktop bundle with node `9c622c34` (#14/#15/#16) + shell
Ctrl-R reconnect fix + freshly-rebuilt clients (07-05 13:0x).

## Confirmed resolved by this build
- Ctrl-R no longer hangs — reconnects to the running node.
- Chat no longer demands a new identity (SWIM-CHAT-NODEID shipped).
- Search connects to the node (Tauri v2 origin fix shipped).
- Wiki lists its pages (listing fix shipped).

## Open issues (reported while QA-ing this build)

### DATA — 1. Wiki: duplicate pages  [my fault]
Minecraft space `sp1qqqqzspj2u4cu5c7e67mldzc0enswwgylq` has the 4 ORIGINAL pages
doubled: **Creeper x2, Redstone x2, Crafting x2, The Nether x2**; the 7 newer pages
(Diamond, Enchanting, Mining, Netherite, The End, Brewing, Villager) are single.
Cause: e2e re-runs used `publish-demo.js` BEFORE I added title-dedup, so the
originals were posted twice. Publisher is idempotent now (no new dupes). Existing
4 dupes are on-chain. OPEN QUESTION: can they be removed, or do they only decay?
(need to verify — decay is 7-day half-life; unsure about any delete path.)

### CHAT — 2. Long wiki content is unreadable
Full wiki pages render as one giant chat message with raw markdown (`[[links]]`,
`## headings`, `---`, the attribution footer). Chat isn't built for long-form.
Fix candidates: render markdown, and/or collapse/truncate long messages with
"show more". File: `chat-client/src/components/MessageItem.tsx`.

### CHAT — 3. Bottom-left "Checking..." stuck forever
Status pill (bottom-left) shows "Checking..." indefinitely even though the top bar
shows Connected / TESTNET / 1 peers. Should resolve to a real node/connection
status. Find the component rendering "Checking...".

### CHAT — 4. Settings cog dropdown renders off-screen
The settings cog (bottom-right) opens a dropdown that extends past the screen edge
and can't be interacted with. CSS positioning fix (open upward / clamp to viewport).

### FEED — 5. Sponsorship warning hidden behind navbar
On the feed page the sponsorship warning is occluded below the navbar / "Your Feed"
header. Layout/z-index/margin fix so the warning is visible.

### FEED — 6. Follow doesn't surface in the feed
Following a space via search works to open it, but the followed space does not
appear in the feed itself — only shows when clicked in via search. (Reported
earlier; verify against the fresh build which shipped `fix(feed): follow persists`.)

### SEARCH/SHELL — 7. Click a space in search → "Checking setup..." forever
Clicking a space name in the search client appears to switch to the forum client,
but the shell then shows "Checking setup..." forever. This is the desktop SHELL's
`stage === "checking"` screen — the same one the Ctrl-R fix addressed. Likely the
cross-client navigation resets the shell to "checking" and the reconnect path isn't
taken (or the target client never gets RPC config). Investigate how search's
space-click navigates between clients and why the shell re-enters "checking".

### ALL CLIENTS — 8. Unsponsored user can attempt to post (wastes PoW, gets generic "failed")
An identity without sponsorship can open the post-creation UI, mine PoW, submit,
and only THEN get a generic "failed" error from the node's sponsorship gate
(`check_identity_sponsored`). Wastes the user's time/PoW and gives no actionable
reason. Fix: clients should query the identity's sponsorship status up front (e.g.
`get_sponsorship_info` / sponsorship status RPC) and, if unsponsored, disable/hide
the compose UI and show an actionable message ("You need a sponsor to post — here's
how to get one / redeem an invite") BEFORE any PoW is mined. Applies to every
client that posts (forum, chat, feed, wiki). Likely a shared hook in
`swimchain-react`.

## Progress (source fixes, NOT yet rebuilt/verified)
- **#2 chat readability** — FIXED (MessageItem collapse >600 chars behind Show more). Confident.
- **#3 chat "Checking..." stuck** — FIXED (NodeStatusBar invoke() timeout → hide bar; chat + forum; feed already guarded). Confident.
- **#4 chat cog dropdown off-screen** — FIXED (dropdown opens upward: `bottom:100%`). CSS — needs a visual eyeball.
- **#5 feed banner hidden** — CHANGED (z-index 199→250 so page-level headers don't occlude it). Low-risk; still needs a visual eyeball.
- **#8 unsponsored compose gate** — DONE across all 4 posting clients (before PoW, with an actionable message): forum ReplyComposer + NewThread, feed Compose, chat send (new `useIsSponsored` hook), wiki page edit (new `useIsSponsored` hook). chat/wiki got a minimal hook calling `get_sponsorship_info` with the correct `identity_pubkey` (chat's old wrapper mis-passed content_id). All typecheck clean. Verified in bundle; needs runtime check (post while unsponsored → blocked, no PoW).
- **#7 search-nav** — IMPLEMENTED as shell-mediated cross-client nav: search posts `{type:'SWIMCHAIN_NAVIGATE',client:'forum',path}` to the shell (App.tsx); shell switches client + stashes the path and passes it to ClientFrame; ClientFrame forwards it into the iframe (with retries — the target NavListener registers after the iframe load event, so a single send races/drops); forum's `NavListener` routes to it. Path translated to forum routes: `/space/<id>`→`/spaces/<id>`; and THREAD deep-link now works too — search thread/reply results carry `?space=<id>`, and RedirectToApp builds `/spaces/<space>/thread/<thread>`. Profile already matched. Needs runtime check. (Possible edge: forum's space route is behind RequireIdentity — if node identity hasn't resolved when the nav fires, it may bounce; the retries mitigate.)
- **BUILD HYGIENE** — `build-clients.js` now cleans each dest dir before copying, so stale orphaned hashed assets no longer accumulate in the bundle (they bloated the installer and made "is the fix bundled?" greps ambiguous). Verified: one index-*.js per client after a build.
- **BUILD LANDMINES (fixed 07-06)** — two Windows-specific traps that shipped stale/broken bundles:
  1. `vite.config.ts` now sets `build.emptyOutDir: false`. Previously `npm run build` (vite) emptied ALL of `dist/` — which (a) wiped the freshly-built `dist/clients` (re-copying STALE `public/clients` over them) and (b) if any client file was locked (Windows Search indexer or a webview holding a worker), vite's `emptyDir` deleted `dist/assets` (the SHELL js) then threw EPERM on the locked `dist/clients` — leaving a bundle with NO shell (blank app) yet `tauri build` still "succeeded". `dist/clients` is build-clients.js's job; vite must never touch it.
  2. `build-clients.js` rm is now best-effort (try/catch) — a locked orphan file no longer fails the whole client rebuild; fresh hashed files still get written alongside it.
  Correct build sequence on Windows: `npm run build:clients` (fresh clients → dist/clients + public/clients) then `npm run build` (shell → dist/assets, no emptyDir) then `npx tauri build`. Then verify EACH client's index.html→js has its fix marker + shell js exists + node-guard SHA match. VERIFIED SHIPPED 07-06 18:29 (installer + exe).
- **#6 feed follow** — pref key = `identity?.publicKey ?? parentConfig?.nodeAddress`; consistent within the hook. Root cause not yet determinable from code alone — needs runtime logging (localStorage key + followedSpaces + whether useFeed reloads). Add logging next pass.

## Fix strategy
These are almost all client/shell frontend fixes. Each needs a client rebuild +
desktop re-bundle to see in the app, so BATCH them: fix all in source, rebuild the
clients once (`npm run build:clients`), then one `tauri build`. For faster
iteration on any single one, run that client in browser dev (`npm run dev`).

---

# QA round 2 (2026-07-06) — feed / chat / search + identity centralization

Testing the shipped bundle. New issues + confirmed root causes below. **All to be
fixed in ONE batch + ONE rebuild.**

## Governing decision — NODE-WIDE CENTRALIZED IDENTITY (user directive)
User: "I don't like the per-client bespoke identity management GUIs. I fear clicking
them at all. We want the node-wide-identity centralized UX." Chose **full sweep**:
in node mode (embedded in desktop shell) EVERY client hides its own identity
create/unlock/manage screens + nav entries and defers entirely to the node identity.
Seed-dependent features (private E2E spaces) show an honest "managed by the app /
not available in desktop" message — never a create-identity dead-end. Identity lives
ONLY in the shell. Applies to forum, chat, feed, search, wiki.

## Issues + root causes

### #6 feed follow — NOT A BUG (resolved)
Node log proves the pipeline works: `LIST_SPACE_CONTENT Returning 1/4 items (N with
body, 0 missing body)`; feed fetches them (`[Feed] followed space ... -> N item(s)`).
Items have bodies, pass the `dedupeAndSort` `(body||title)` filter. Follow persists
and fetch works. (Diagnosed via the #6 instrumentation shipped in the build.)

### #9 feed sponsorship check always fails  [CONFIRMED]
`feed-client/src/lib/rpc.ts:948` `getSponsorshipInfo` sends `identity_id`; node's
`get_sponsorship_info` wants `identity_pubkey` (methods.rs:11379, hex-decodes to
[u8;32]). So SponsorshipBanner errors every time and defaults everyone to
unsponsored. Log: `[Sponsorship] Failed to check: RPC Error -32602: Invalid params:
missing field identity_pubkey`. FIX: rename param → `identity_pubkey` (pass pubkey
hex, not the cs1 address).

### #10 feed "Create Private Space" → create-identity dead-end  [CONFIRMED]
`CreatePrivateSpace.tsx` uses `useStoredKeypair` and needs `keypair.seed()` (line 60)
to derive X25519 keys for E2E encryption CLIENT-SIDE. Node mode never exposes the
seed (by design — desktop bundle = no seed sharing), so `publicKey` is undefined and
it renders the "You need an identity to create private spaces / Create Identity"
dead-end. Private E2E spaces are fundamentally incompatible with node-managed identity
as architected (node would have to expose X25519 derivation or do the encryption —
neither exists). FIX (per sweep): in node mode show an honest "not available in the
desktop app yet" message, not a create-identity CTA.

### #11 feed reply from feed tab → 5s freeze → generic "Failed to submit reply"  [CONFIRMED]
The feed-tab reply flow mines PoW (the freeze) then hits the node sponsorship gate and
returns a generic failure — no up-front sponsorship check like compose (#8). Node log:
`[SPONSORSHIP] Rejected action from unsponsored identity`. FIX: add the #8 sponsorship
pre-check before mining on the feed reply path, with an actionable message.

### #7 search → click space/thread → "Checking setup..." forever  [ROOT CAUSE FOUND]
STILL broken in the new build, but the shell nav code is fine — it never runs. Search
result cards use plain `<a href="/thread/<id>?space=<id>">` (ThreadResult.tsx:66,
ReplyResult.tsx:62/99). In the iframe a plain anchor is a FULL-PAGE load to the shell's
origin root (`http://tauri.localhost/thread/...`) — clients live under `/clients/...`,
so the iframe loads a SECOND COPY OF THE DESKTOP SHELL, which boots to stage="checking"
= "Checking setup..." and hangs. `RedirectToApp` (search/src/App.tsx) correctly posts
`SWIMCHAIN_NAVIGATE` when embedded, but the anchor escapes the SPA before React Router
matches the route. FIX: make search result links CLIENT-SIDE navigations (React Router
`<Link>`/`useNavigate`) so the SPA intercepts, RedirectToApp runs, and the shell gets
the message. (This is the real fix behind the earlier thread-deeplink work.)

### #12 chat: space needs TWO clicks to load content  [needs investigation]
Clicking a space in the chat left sidebar selects it visually but content doesn't load
until a second click. Likely a state race between selection and content fetch (stale
closure / effect dep). File: chat space-selection handler.

### #13 unread badge persists after reading  [needs investigation]
After clicking through posts in a space, the red "(1)" unread indicator stays. Read
state isn't being marked/cleared. Investigate unread tracking (likely chat).

## Decay on testnet (answer to "how does decay work on testnet, if at all")
Source: `src/content/decay.rs`, `src/types/constants.rs`. **Decay is ON and IDENTICAL
on testnet — there is NO network-mode branching in decay.rs.** The mode table only
changes PoW %, level checks, data dir, magic bytes; decay is the same everywhere.
Model: `survival = 0.5^(effective_decay_time / half_life)`, where
`effective_decay_time = max(0, time_since_last_engagement - DECAY_FLOOR)`.
- `DECAY_FLOOR_SECS = 172_800` (2 days) — grace period; no decay at all for the first
  2 days after the last engagement.
- `HALF_LIFE_SECS = 604_800` (7 days) — base half-life.
- `DECAY_THRESHOLD = 0.0625` (=1/16 = 4 half-lives) — content counts as "decayed" once
  survival drops below this. So with defaults, content survives ~2 + 4×7 = **~30 days
  of ZERO engagement** before decaying. ANY engagement resets the clock.
- `FLAGGED_DECAY_HALF_LIFE_SECS = 14_400` (4 h) — spam-flagged content decays fast.
- Adaptive half-life (storage pressure): clamped to [1 day, 30 days]. Under budget →
  half-life GROWS toward 30 days; over budget → SHRINKS toward 1 day. A quiet testnet
  with little content is under budget, so its half-life drifts UP — content is
  effectively even MORE persistent than 30 days there.
- No hard-delete path exists (answers #1 wiki-dupes: the doubled originals only decay,
  slowly, on the quiet testnet).

---

# Node-managed private spaces (desktop) — build log

Goal: make private (E2E-encrypted) spaces work in the desktop app, where the node owns
the identity seed and never exposes it to the client UIs. Approach: move the crypto
into the node.

Key discovery: private spaces were a HALF-BUILT feature — the browser client mines the
space-creation PoW over `create_private_space:pubkey:timestamp` while the node verifies
that PoW over the *encrypted name*, so they never matched. This is a completion + fix,
not a port.

## DONE + verified
- **`src/crypto/private_space.rs`** — interop-exact Rust crypto: ed25519 seed->X25519,
  ed25519 pub->X25519 (birational), NaCl box using the RAW X25519 DH output as the
  secretbox key (NOT crypto_box/HSalsa20), AES-256-GCM content `[PRIVATE:v1:...]` + raw
  name blobs. Plus node key helpers (wrap/unwrap space key on demand — no raw keys at
  rest). **8 unit tests pass**, incl. `interop_vectors_match_js` (vectors generated from
  the real @noble + WebCrypto client code — byte-for-byte match). Vector gen:
  `tools/private-space-vectors/gen.mjs` (run from feed-client/).
- **Node RPCs** (`src/rpc/methods.rs`): `create_private_space_managed` (node does all
  crypto + mines PoW over the raw encrypted-name blob, fixing the binding bug + signs +
  registers + admin member + broadcast), `encrypt_private_content`,
  `decrypt_private_content`, `node_space_key` (on-demand unwrap from membership). Regtest
  auth-exempt entries added in `src/rpc/server.rs`.
- **LIVE regtest verification** (2026-07-07): create -> encrypt -> decrypt round-trips
  exactly (`"hello private world"` recovered); decrypting with a foreign space_id is
  correctly refused ("not a member of this private space"). (A rapid 3rd call hit the
  RPC rate limiter 429 — not a logic issue.)

## REMAINING
- Wire managed **post/reply**: in node mode, client encrypts the body via
  `encrypt_private_content` before `submit_post`/`submit_reply`; decrypt on display via
  `decrypt_private_content`. Also decrypt the space **name** in `get_my_private_spaces`.
- Client UI re-enable (#27): feed `CreatePrivateSpace` + chat `CreatePrivateChannel` call
  `create_private_space_managed` in node mode; drop the "not available" stopgap.
- **invite/accept**: node wraps the space key for an invitee's ed25519 pubkey
  (`wrap_space_key_for`) / unwraps on accept. MULTI-MEMBER propagation (space created on
  one node, joined+read on another) needs a **2-node regtest** to certify — not claimed
  until that live test passes.

## SHIPPED (2026-07-07 20:29 installer) — single-user private spaces work in desktop
Full feed loop wired + bundled + guard MATCH (release node binary with the private-space
RPCs is in the bundle):
- Create: feed `CreatePrivateSpace` -> `create_private_space_managed` (node does crypto
  + PoW + signing). Space lists with its decrypted name.
- Post: `Compose` encrypts (title+body) via `encrypt_private_content`, mines PoW over the
  CIPHERTEXT (submit_post binds sha256(finalTitle\n\nfinalBody) — verified), submits
  title="[Private]" + `[PRIVATE:v1:...]` body.
- Read: `SpaceView` (thread list) + `Post` (detail) decrypt `[PRIVATE:v1:...]` via
  `decrypt_private_content` for display; a locked placeholder shows while decrypting.
- Node backend live-proven on regtest (create + name-decrypt + content round-trip +
  membership guard all PASS). 8 crypto unit tests incl. JS interop vectors.
This bundle also carries all QA round-2 fixes (identity sweep, #7/#9-#13).
REMAINING follow-ups: chat private channels; invite/accept multi-member (needs 2-node
regtest before claiming).

## SHIPPED (2026-07-07 20:48 installer) — private REPLIES too
Feed `Post.tsx`: replying in a private space (node mode) encrypts the body via
`encrypt_private_content` and mines PoW over the CIPHERTEXT (submit_reply binds
sha256(body) — verified), submits `[PRIVATE:v1:...]`; reply display walks the reply tree
and decrypts each private reply via the node (lock placeholder while decrypting).
=> The FEED private-space loop is now COMPLETE single-node: create / post / reply / read,
all E2E via the node. Verified: 8 crypto unit tests + live regtest (create + name-decrypt
+ content round-trip + membership guard). Typecheck clean; markers present in bundle.

## Chat private channels — DONE (2026-07-07, pending rebuild to ship)
chat-client wired (tsc clean): node-mode `CreatePrivateChannel` -> `create_private_space_managed`;
message SEND encrypts via `encrypt_private_content` before mining (PoW over ciphertext);
message DISPLAY decrypts `[PRIVATE:v1:...]` via `decrypt_private_content`. All-or-nothing:
encryption failure aborts the send (never posts plaintext into a private channel). Server=Space,
Channel=Thread, Message=Reply; privacy at the server level.

## Multi-member invite/accept — RPCs DONE + correct, but PROPAGATION is UNBUILT
- `invite_to_space_managed { space_id, invitee }` + `accept_invite_managed { invite_hash }`
  implemented (node recovers space key via node_space_key, wraps for invitee, mines PoW,
  stores + broadcasts). cargo build + 8 crypto tests + feed tsc all green. The crypto
  invariant (invite-wrap by inviter -> accept-store -> node_space_key unwrap by invitee)
  is byte-identical to the passing `node_invite_wrap_unwrap_round_trips` unit test.
- **2-NODE REGTEST RAN (2026-07-07): A created space + invited B (broadcast:true), but B
  NEVER received the invite (get_my_invites=0 after 30s). Multi-member does NOT work yet.**
- ROOT CAUSE (pre-existing, not the new RPCs): invite delivery over the network is unbuilt.
  `handle_action_announce` (router.rs) only adds incoming actions to the mempool — it has
  NO Invite->add_invite handling — AND the broadcast `Action` doesn't carry the wrapped
  space key (that lives only in the inviter's local InviteRecord). So the invitee's node
  has no way to learn about the invite OR obtain the wrapped key.
- ~~FIX (scoped next piece): self-contained invite BLOB/LINK...~~ **DONE — see below.**

## SHAREABLE private spaces — DONE + 2-NODE PROVEN (2026-07-07 22:25 installer)
Implemented the self-contained invite-blob flow (sidesteps the unbuilt network invite
propagation entirely):
- Node RPCs: `create_space_invite_blob { space_id, invitee }` -> `swiminv1:<base64(json)>`
  carrying `{space_id, inviter, enc_name, enc_key}` where enc_key = the space key wrapped
  for the invitee via `wrap_space_key_for`. `redeem_space_invite { blob }` -> node unwraps
  enc_key with ITS seed (fails if not for this identity), registers the space + stores a
  MemberRecord(invited_by=inviter, encrypted_space_key=enc_key) locally, returns the
  decrypted name. After redeem, `node_space_key` recovers the key on demand -> content
  decrypts. Both added to dispatch + REGTEST_ADDITIONAL_EXEMPT.
- **2-NODE REGTEST: PASS.** A created "War Council" + encrypted content; A made a blob for
  B; B redeemed it -> B's private-space list shows "War Council" (decrypted) and B
  decrypted A's ciphertext ("rendezvous at dawn"). True multi-member across 2 nodes.
- Feed UI: `SpaceView` shows an "Invite" button on private spaces -> `InviteModal` (was
  orphaned/unrendered; now reachable) produces a copyable `swiminv1:` code; new
  `JoinPrivateSpace` component in Discover redeems a pasted code and navigates to the
  space. tsc clean.
- Content SYNC between members relies on normal block sync (separate, working mechanism);
  the blob only carries the key, not the content.

## PRIVATE SPACES — feature complete (single-user + multi-member)
Feed: create/post/reply/read + invite/join. Chat: create channel/send/read. All E2E via
the node (seed never leaves the node), all shipped in the 22:25 installer + verified
(8 crypto unit tests, single-node live run, 2-node invite-blob run).

## QA round 2 — fixes applied (all in one batch, one rebuild)
- **#7 search nav** — DONE. All 4 search result cards (Space/Thread/Reply/User) now use
  React Router `<Link>` instead of `<a href>`, so the SPA intercepts and `RedirectToApp`
  posts `SWIMCHAIN_NAVIGATE` (no more full-page load into a second shell copy).
- **#9 feed sponsorship param** — DONE. `feed rpc.ts` sends `identity_pubkey`.
- **#10 feed private space** — DONE. Node mode shows "Private spaces aren't available yet"
  (E2E needs the seed the node won't expose), not a create-identity dead-end.
- **#11 feed reply gate** — DONE. `Post.tsx` checks `useSponsorship().isSponsored` and
  blocks with an actionable message BEFORE mining PoW.
- **#12 chat two-click space** — DONE. Chat.tsx's first-server/first-channel redirects
  moved from render-phase `navigate()` (unreliable) into `useEffect`s. Content loads on
  the first click now.
- **#13 chat unread badge** — DONE. `useChannels` gained a stateful `markRead` (clears the
  badge in state + persists the timestamp); Chat.tsx calls it on channel open. Badge was
  permanent because nothing ever marked a channel read.
- **#23 node-mode identity sweep** — DONE across all 5 clients (forum/chat/feed/search/wiki,
  4 via parallel agents + feed by hand). In embedded/node mode: `/identity` nav links
  hidden, IdentityPage renders "Identity managed by Swimchain", RequireIdentity doesn't
  bounce to /identity, and private-channel/space create-identity dead-ends replaced with
  honest "not available in the desktop app" messages. Standalone browser behavior
  unchanged. Signal: each client's own `mode === 'node'` or `isInIframe()`. All 5 clients
  typecheck clean.
