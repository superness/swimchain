# Investigation Sheet: post images missing on some nodes (media_refs)

**For:** Fable (fresh investigator)
**Date:** 2026-07-23
**Author of this sheet:** prior session (got frustrated, over-theorized — do NOT trust my conclusions below, only the receipts).

> The operator's position, which must anchor everything: **images have worked
> cross-node for a long time. The protocol is NOT fundamentally broken.** Any
> theory that implies "images can't sync" is wrong on its face. Treat the
> anomalies below as a *specific* gap for *specific* posts/nodes, not a systemic
> defect — until data proves otherwise.

---

## Symptom (what the operator actually observes)

- On their **phone** (`com.swimchain.mobile`): the post titled **"Welcome"** shows
  its image; the post titled **"First"** does **not** show its image.
- On their **PC** (chat client, node mode): both First and Welcome show images
  (this was a *client display* bug earlier tonight — now FIXED, see below).

That's it. Everything else below is investigation, not symptom.

---

## CONFIRMED facts (with receipts — reproduce these before trusting them)

### Environment
- **PC node RPC:** `http://127.0.0.1:9736` (mainnet). Auth = HTTP Basic
  `base64(__cookie__:<cookie>)`, cookie file: `C:/Users/super/AppData/Roaming/swimchain/.cookie`.
- **Gateway node RPC:** `https://swimchain.io/rpc` (reads need no auth).
- **Seed node:** also reachable through the gateway; returned same as gateway below.
- **Phone:** adb = `C:/Users/super/AppData/Local/Android/Sdk/platform-tools/adb.exe`,
  device `46281FDJG001JN`, package `com.swimchain.mobile`. It is a **RELEASE**
  build → NOT debuggable → no `run-as`, no webview console in logcat, cannot read
  its cookie or query its node RPC. (Node logs DO appear in logcat under tag
  `RustStdoutStderr`.)

### The two posts
- **First** — `content_id sha256:75db139e06cb19c5e67ca69c5382161f726ff792d2d296e5ad1f72037f4b9fe2`
  - space `sp1qqqsqrug2lxh0f6a3lxhj5wenm0qkf4vcm` (Swimchain 101), author `cs1qqyapas5…` (operator)
  - media: hash `9aef833d1efc1c4f97c68ed1e4c4e600867770bae1fbeac5f8d6a6a2d18e04ae`, image/jpeg, **75472 bytes**
- **Welcome** — `content_id sha256:2d7a4e42434dcd1287e8dbce1f1af07d6082eb8d4a45e6d8e0ecb778a64a4be2`
  - same space, same author
  - media: hash `e7a7d452bc1b62909248b8d56872d82740f9b79f66bf8d3027adaaa470cf21e2`, image/png, **24027 bytes**

### F1 — PC node has both blobs and both media_refs
`get_media` on the PC returns real bytes: First = 100642 b64 chars, Welcome = 32046.
`get_content` on the PC returns `media_refs` **populated** for both.

### F2 — Gateway returns EMPTY media_refs for EVERY post (RED HERRING — do not chase)
`get_content` on the gateway returns `media_refs:[]` for First AND Welcome; and
`list_space_posts` for Swimchain 101 shows **all 14 posts** with `media_refs:[]`
(0 populated). This is NOT a general protocol defect: **the gateway is the browse
*showcase* node.** It obtains showcased content via the showcase-keeper driver
(`request_content` → content-sync → **body only**), so it never ingests the
Actions and therefore has no media_refs for anything. The gateway is not a
representative peer. IGNORE it for this bug. (I wasted time treating this as the
smoking gun — don't repeat that.)

### F3 — Phone issues NO fetch for First's image blob
Captured `adb logcat --pid=<app>` while the operator opened First on the phone:
- Active `[CONTENT-SYNC]` WHO_HAS/GET/DATA_CONTENT traffic, but only for small
  **123-byte** items (`eccfbab9…`, `5b1cf621…` — these are NOT the 75KB image).
- **Zero** log lines mentioning `9aef833d` (First's image hash). The phone never
  requested First's image blob.

### F4 — Relevant code locations (verified by reading, 2026-07-23)
- `src/rpc/methods.rs:2087-2088` — post content hash: `content_hash = sha256(format!("{}\n\n{}", title, body))` → **text only; media_refs NOT hashed in.**
- `src/blocks/validation.rs` (`validate_action_signature`, ~line 359) — signed preimage = `content_hash(32) || timestamp_LE(8) || private(1)`. media_refs are **not** in the signature preimage.
- `src/blocks/action.rs:24-25` — the 466-byte Action **wire encoding** DOES include `media_ref_count` + `media_refs` (148 bytes). So the serialized Action carries media_refs even though the signature doesn't cover them.
- `src/content/retrieval.rs:824` (`on_get`) — CONTENT-SYNC serve path returns `blob_store.get_unchecked(content_hash)` = **body bytes only** (no media_refs).
- `src/rpc/methods.rs:2795-2836` (`get_media`) — on a local blob miss, marks wanted + broadcasts WHO_HAS + polls 5s. Commit `f7b44786` (2026-07-11); **IS** an ancestor of the deployed APK commit `76e859d9`, so the phone's node has this self-heal.
- `[BLOB-GOSSIP] Action from peer … has N missing blobs - sending WHO_HAS`
  (`src/node/router/router.rs`) — proves that when a node receives an **Action**
  carrying media_refs, it detects the missing blob and fetches it. So the action
  path DOES propagate media_refs (observed live in the phone log for OTHER content).

### F5 — Chat client display bug (the operator's original complaint) is FIXED
Uncommitted changes in `chat-client/` (deployed into installed
`C:/Users/super/AppData/Local/Swimchain/apps/chat/chat-app.exe`):
- `components/MessageItem.tsx` — was hardcoding `message.reactions=[]`; now calls
  existing `useReactions(message.id)` and renders + refetches after adding one.
- `hooks/useMessages.ts` — root post now included when it has media (was gated on
  text only); added `[useMessages]` diagnostic console log.
- `components/ImageGallery.tsx` — added `[ImageGallery]` diagnostic console logs.
- `components/ChannelSidebar.tsx` — bottom "You" now resolves the real
  identity/profile (name + avatar); added a persistent "+ new post" button in the
  server header (previously the only create-channel entry point was hidden once a
  space had ≥1 post).
- Build/deploy of a single bespoke app exe: see memory `project_bespoke_app_exe_build`.
These are **uncommitted** — land on a branch off origin/main + PR.

---

## Reconciled working theory (fits ALL data, including "images work forever")

Two propagation paths carry different things:
- **Live action/block gossip** → full Action (466 bytes, includes media_refs) →
  receiver's `ContentItem.media_refs` is populated → image renders. **This is the
  normal path, and it works — hence images have worked cross-node "forever."**
- **Content-sync back-fill** (WHO_HAS/GET/DATA_CONTENT; `on_get` serves
  `blob_store.get(content_hash)` = **body text only**; `on_data` stores the body,
  `content_id` derived from the body not the ContentItem) → media_refs NOT carried.

So the failure is NARROW and specific: **a node that MISSED a post's live action
gossip and later back-fills only its body via content-sync ends up with empty
media_refs → no image.** Fresh posts (caught live) keep images; older posts a node
back-fills after the fact can lose them. This is consistent with:
- Phone: Welcome (fresh, ~10 min) has image; First (older, ~6.7h, back-filled) does not.
- Gateway: showcase node, back-fills everything via content-sync → all empty.
- "Images work forever": the live path is fine; only the back-fill case drops refs.

**Still not 100% proven** because the phone's copy of First could not be queried
(release build). To prove: reproduce with two local nodes (author + a node that
receives ONLY the body via content-sync, not the action) and check
`get_content(...).media_refs` on the second node. That repro is fully local — no
phone, no debug APK — and should be the next step.

---

## OPEN QUESTIONS (answer these, in order)

1. **Is F2 specific to First/Welcome, or general?**  ← MOST IMPORTANT, DO FIRST.
   Query the gateway `get_content` for a *known-good* image post (one the operator
   confirms renders cross-node). If its `media_refs` are **populated** → the sync
   path works and First/Welcome are a specific/narrow gap. If **empty** → the
   gateway's `get_content` never returns media_refs (maybe it fetched body-only
   via `request_content`, or its get_content reads from a store it doesn't
   populate). This single test decides which direction to go.

2. **Where does `get_content` READ media_refs from?** Trace `get_content` in
   `src/rpc/methods.rs`. Content store? Action/block store? If it reads from the
   action store and remote nodes only have the body (via content-sync), that
   explains F2 without any protocol defect — it's just "that node doesn't have the
   action yet." Confirm which store, and whether the gateway has First's *action*.

3. **How were First/Welcome posted, and did the gossiped Action carry media_refs?**
   If they were posted via a path that stored media_refs locally but emitted an
   Action without them, remote nodes would never get them — a write-side bug, not
   a sync bug. Compare against a known-good image post's Action.

4. **Why did the phone not WHO_HAS for `9aef833d` (F3)?** Two branches:
   (a) the phone's copy of First has empty media_refs → client has no hash to
   request (consistent with F2); or (b) the phone had the blob already and the
   client didn't render. Can't query the phone's node directly (release build) —
   but if Q1/Q2 show remote nodes legitimately lack the action, (a) is the answer.

---

## Tooling notes / traps

- Recursive `grep`/`find` under `mobile-app/src-tauri/gen/android` or the repo root
  TIMES OUT (huge build dirs). Use targeted paths / the Grep tool with globs.
- Building a **debuggable APK on this Windows box is blocked** by two unrelated
  issues — don't sink time here unless you must:
  1. `tauri android build` symlinks the `.so` into `jniLibs` → "Creation symbolic
     link is not allowed for this system" (needs Windows Developer Mode).
  2. Running gradle directly fails: `:buildSrc` config error "> 25.0.2".
  A remote fleet node (gateway) already reproduces F2 without the phone — prefer
  that.
- The 361MB debug `.so` was copied to
  `mobile-app/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a/` during the
  failed build attempt; harmless, can delete.

## Relevant memory files
- `project_media_refs_sync_gap` (contains my — possibly wrong — theory; read
  critically)
- `project_content_getting_requires_driver` (DESIGN LAW: nodes fetch on demand;
  keeping content alive needs a driver)
- `project_bespoke_app_exe_build` (how to rebuild/deploy one client exe)
