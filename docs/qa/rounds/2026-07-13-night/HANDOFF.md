# UX Study Handoff — operator-driven (NO arm backend)

You are continuing a Swimchain cross-client UX study. The deepconsole arm
fleet is **not available** — you operate every client yourself via swim-auto
(PC) and adb (phone), and you are the vision reviewer (Read the screenshots
you capture). This replaces the DAG/board dispatch in the
`frontend-user-study` skill with a flat, self-serve checklist.

Round 1 (this same night) already covered feed/forum/chat/search/wiki basics
and the sponsor loop — see `FINDINGS.md` in this folder. **Your job: the
Not-Covered surfaces below, plus re-verify the top open findings.** Don't
re-run what's already green; go where the coverage is thin.

## Environment (verify first, ~2 min)

- **Local genesis node** must be running (RPC `http://127.0.0.1:19736`, data
  dir `genesis-testnet`, cookie at `genesis-testnet/.cookie`, password
  `testpass123`). Check: `curl -s --user "__cookie__:$(cat genesis-testnet/.cookie)" -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"get_chain_stats","params":{},"id":1}' http://127.0.0.1:19736`. If down, start it:
  `SWIMCHAIN_DATA_DIR=genesis-testnet SWIMCHAIN_PASSWORD=testpass123 ./target/release/sw.exe --testnet node start --listen 0.0.0.0:19735 --connect 165.22.47.107:19735 --connect 167.71.241.252:19735` (background). It's the genesis identity `9ec9661d…` = your sponsor root.
- **Fleet** (for cross-node checks): seed 167.71.241.252, bot 165.22.47.107,
  client2 167.172.236.60. SSH key `~/.ssh/swimchain_seed_ed25519` (bot/client2
  need `-i`; seed via ssh config). Droplet RPC helper + a sponsorship poller
  live in the scratchpad from round 1 (`drpc.sh <seed|bot> <method> [json]`,
  `check-sponsorship.sh <pk>`); re-create if gone (trivial curl-over-ssh).
- **swim-auto** (PC clients): `node tools/app-automation/cli.js <cmd>`.
  - `open <feed|forum|chat|search|wiki>` = NODE mode (adopts genesis identity,
    can write). Add `--standalone` for browser mode (no node cookie → RPC
    401s; only use to reproduce M2).
  - `click "<selector>"`, `type "<sel>" "<text>"`, `press Enter`,
    `eval "<js>"`, `ui` (ARIA snapshot to find selectors), `screenshot`
    (prints PNG path — **Read it**; you are the only visual reviewer),
    `logs --errors`, `wait <ms>`.
  - After a node restart, `open` fresh (stale cookie → 300s auth lockout).
    Save shots to `docs/qa/rounds/<round>/shots/<surface>-<label>.png`.
- **Phone** (mobile app): adb at `~/AppData/Local/Android/Sdk/platform-tools/adb.exe`,
  device `46281FDJG001JN`. No WebView devtools in release → drive by
  `screencap` + `input tap x y` (screenshots are 1008×2244; the app is on the
  current CreateSpace-fix build). Watch outcomes in `logcat` (the node logs
  `[RPC] submit_* authorship FAILED …` with the exact preimage on any failure,
  and `Added POST action to block builder` on success).

## The checklist (each = adopt a lens, operate live, screenshot, Read, note friction)

Work top-down; items are independent unless noted. For each: drive the real
flow, capture a frame, Read it, write the finding (severity + repro + what a
non-technical "Mom" persona would feel).

1. **Private spaces (PC feed + forum + chat).** Create a private space; confirm
   the body/title encryption gate; generate an invite (`swiminv1:…`); redeem it
   from a second identity (use the phone or a `--standalone` second browser);
   post encrypted content; verify a non-member canNOT read it. Watch for
   plaintext leaks, kicked-member access, key-loss dead-ends. (PrivateSpace
   owner domain.)
2. **DMs (chat + feed).** New DM to another identity, send, verify delivery +
   that it's encrypted on the wire (check the content isn't plaintext via
   `list_space_posts` on a droplet). Decline/accept DM request flow.
3. **Invite-link onboarding, end to end (feed Sponsorship).** "Create Invite
   Link" (auto-approve) → open the link as a brand-new identity → confirm it
   becomes sponsored in ONE step with no manual approval. This is the "Mom
   metric" path. (Note: the min-PoW-floor client fix `282dc49e` must be in the
   built bundle — rebuild clients if testing the deployed site.)
4. **"Find a Sponsor" from the CLAIMANT's UI.** Round 1 only did the sponsor
   side + CLI claims. Drive an actual claimant browser: browse offers, submit a
   claim, watch it reach the sponsor, get approved, become sponsored. Time it.
5. **Offer cancel / reject.** Cancel an offer; reject a pending claim; confirm
   the claimant sees the outcome.
6. **Media attachments (PC).** Attach an image to a post from feed/forum;
   confirm upload, render, and that it syncs to a droplet. (Phone media works;
   PC untested.)
7. **Report / attest / blocklist.** Report a post; submit a spam attestation;
   check the blocklist manager UI. Watch for fail-open (does a "reported" post
   still show?) and flows that claim success without doing anything.
8. **Space rename UI.** Rename a space you own; confirm the new name resolves
   locally and on a droplet (reconciler path).
9. **Follow / unfollow → feed + wiki effect.** Follow a space; confirm it now
   appears in "Your Feed" and as a wiki namespace; unfollow; confirm it leaves.
10. **Settings depth + notifications (all clients).** Walk every settings
    panel; trigger a notification (e.g. someone replies to your post) and
    verify it lands.
11. **Saved Posts.** Save a post; confirm it appears under Saved.
12. **Desktop launcher apps.** `desktop-app/` bundle (built earlier: MSI at
    `desktop-app/src-tauri/target/release/bundle/`). Launch it; verify the
    launcher lists feed/chat/forum/search/wiki apps and each opens framed with
    node identity. (Packaging owner.)
13. **Reef + Chess gameplay.** swimchain.io/reef and /chess (or local
    reef-client/chess-client). Make a move; confirm the fold updates and the
    move is a real on-chain reply. (Reuses the chess `/rpc` proxy on the seed.)
14. **Phone parity re-check.** Repeat any PC finding above on the phone where
    the feature exists (private spaces, DMs, media, settings). The phone is the
    P0 surface.

## Re-verify these open findings (from round 1 FINDINGS.md)

- **M1 raw ids** — will still be everywhere until node-side name resolution
  ships. Don't re-file; just confirm scope if you touch a new surface.
- **M2 raw JSON-RPC error to user** — reproduce with `open feed --standalone`
  then click a space (401 dump).
- **M3 search misses synced content** — search a term only present in a
  phone/droplet-authored post; confirm it's absent from this node's index.
- **M4 display-name resolution inconsistent** — set a name, check it renders in
  chat/profile (yes) vs feed byline/search (no).
- **UX-1** chat channel-name placeholder trap, **UX-2** fake PoW progress/ETA,
  **UX-3** identity-load hang + auth-lockout, **wiki light-theme**, **forum
  white private-space input**.

## Gotchas (each cost time in round 1)

- **Node restart → stale-cookie hammering → 300s auth lockout.** After any node
  restart, `open <client>` fresh; if you see `-32017 Client locked out`, restart
  the node (clears the limiter) and reopen.
- **swim-auto `type` sometimes doesn't land** in React inputs — fall back to
  `eval` with the native value setter + `dispatchEvent(new Event('input',{bubbles:true}))`,
  then `press Enter`.
- **PoW is 60-130s** in-browser (Argon2id) for post/space/reaction — budget for
  it; the modal's "~0s" ETA is a lie (UX-2), not a hang.
- **Screenshots are gitignored** (root `.gitignore` `*.png`) — `git add -f` to
  commit study evidence.
- **The genesis identity is the sponsor root** — it has no SponsorshipStore
  record of its own; any sponsorship/CreateSpace validation must consult
  `is_in_hardcoded_genesis_list` (4 sites bitten this session). If you find a
  5th, that's the pattern.
- **Standalone (browser) mode has no node cookie** — most writes 401. Use NODE
  mode (`open <client>` without `--standalone`) for functional testing.

## Output

Append to a new `docs/qa/rounds/<your-round>/FINDINGS.md` in the same shape as
round 1: perf table (curl `-w %{time_total}`), design review from the pixels,
ranked findings (severity + repro), a **cross-round diff vs 2026-07-13-night**
(what closed, what's new), and the single biggest lever. `git add -f` the
shots. Fix trivial bugs you find inline (commit + push to main, testnet is
operator-owned, no PR needed) and note them; leave design decisions for the
operator.
