# Surf C — Finish the Fleet (C2b bake games + C4 release signing + C5 cutover)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Complete the last three Surf C sub-phases, per the operator's decisions (2026-08-01): **C2b** bake chess + chips onto the channel dial; **C4** a dedicated release keystore + gradle signing wiring; **C5** full cutover making Surf the Android product.

**Autonomy split (important):** C2b + C4-gradle-wiring are fully autonomous and land now. **C5's user-facing steps + any actual signed release are GATED on the operator's keystore** (repointing the live download link before a signed Surf release exists would 404 users) — this plan STAGES C5 (version bump + drafted copy) but does NOT repoint the live link or claim a release; that final cutover happens once the keystore + signed release exist.

**Tech Stack:** Vite client bakes (`build-channels.cjs`); Tauri v2 Android gradle (`gen/android/app/build.gradle.kts`); the website static pages.

**Worktree:** `C:\github\swimchain\.claude\worktrees\mobile-app`, branch `docs/surf-c-decision-sheet` (fresh off origin/main). Rename/rebranch if desired; check PR state before first push.

## Verified facts (recon 2026-08-01, file:line)

| Fact | Where |
|---|---|
| **mobile-app is MAINNET** (not testnet) — same network as Surf; C5 has NO network migration | `mobile-app/src-tauri/src/lib.rs:10` |
| channels.json per-channel fields = `id`, `number`, `name`, `spaces[]` (+ feed's `spacesNote`); NO path/health/warmSize per-channel. reef = `{id:"reef",number:50,name:"REEF",spaces:[]}` — a game channel is just `spaces:[]` | `surf-app/web/channels.json:2-16` |
| `spaces:[]` ⇒ UNMETERED: no get_space_health, no dead-air card, excluded from Chart ("NO TELEMETRY"), dwell skipped — exactly how reef avoids dead-air. Mirror it for chess/chips. | `deadair.mjs:39-41,49-53`, `shell.mjs:164,478-481,589` |
| Deck is built straight from channels.json (`new Deck(cfg.channels.map(c=>c.id), cfg.warmSize)`); no hardcoded channel list; feed MUST stay first (`FEED_ID=cfg.channels[0].id`). warmSize 3 is fine for 5 channels (2 cold-mount on flip). | `shell.mjs:22-24,36,375` |
| build-channels.cjs `CHANNELS` = feed/wiki/reef; builds via `vite build --base=/channels/<id>/ --outDir <OUT>/<id> --emptyOutDir`, deletes stale vite.config.js first, verifies base-rooted assets + NO .map + NO sourceMappingURL; reef-only grep: loopback present, gateway absent | `build-channels.cjs:15-19,55,64-101` |
| **chess dials `VITE_RPC_ENDPOINT`; chips dials `VITE_CHIPS_RPC` (DIFFERENT var).** Both `.env.production` pin `https://swimchain.io/rpc` — the bake MUST override to loopback per-client. chips `host.ts:290-293` THROWS at startup if `VITE_CHIPS_RPC` or `VITE_CHIPS_SPACE` empty. | chess `main.tsx:12`, chips `host.ts:46-48,290-293`, `chess-client/.env.production:2`, `chips-client/.env.production:19-20` |
| Other baked vars can stay from .env.production (Surf=mainnet matches): chess `VITE_CHESS_SPACE`/`VITE_GAME_SPONSOR`; chips `VITE_CHIPS_SPACE`/`VITE_GAME_SPONSOR` | chess `.env.production:3,6`, chips `.env.production:20` + `host.ts:47-48` |
| chess/chips build with `tsc -b && vite build`, hardcode `base:'/chess/'`/`'/chips/'` (CLI --base overrides), `sourcemap:false` (C3), gitignored vite.config.js — identical to reef, proven to bake | chess/chips `vite.config.ts:6,17/37`, `package.json:9` |
| CSP already covers chess/chips: `script-src 'self' 'wasm-unsafe-eval'` (both use hash-wasm) + loopback connect-src; NEITHER uses WebSocket. NO CSP change needed. | `surf-app/src-tauri/tauri.conf.json:20-21` |
| chess embedded (node) shows a real attract state: lobby-over-Ocean ("No open games. Start one…"), NOT an empty board until a game is opened. chips shows its bowl/kitchen. Both use `useGameIdentity` node mode. | chess `App.tsx:31-42,68,365-443,444`; chips `App.tsx:162` |
| **C4: release buildType has NO signingConfig → release APK is UNSIGNED**; no signingConfigs block anywhere in the repo. gen/android is COMMITTED (tracked), not regenerated on normal builds — edits to build.gradle.kts persist. | `gen/android/app/build.gradle.kts:39-46`; `git ls-files surf-app/src-tauri/gen/android` |
| C4 secret convention already scaffolded: `gen/android/.gitignore:15-17` ignores `local.properties`, `key.properties`, `keystore.properties`. The .kts already reads `tauri.properties` via `java.util.Properties` — copy that idiom for a release signingConfig reading a gitignored `keystore.properties` with `System.getenv` fallback for CI. mobile-app has NO pattern to copy (greenfield). | `gen/android/.gitignore:15-17`, `build.gradle.kts:1-14` |
| C4 build: drop `--debug` (`npm run tauri android build --target aarch64`) hits the release buildType (minify+proguard). Debug path is the Dev-Mode workaround (README:273-341). | `surf-app/README.md:106-109,273-341,402` |
| **C5: website download-android.html:172 points to `mobile-v0.1.10-alpha` APK on GitHub Releases** (com.swimchain.mobile, 17.6MB, SHA in meta:177-179). download.html Android card :162-174. Both are public sideload (no store). | `website/download-android.html:172,177-182`, `website/download.html:162-174` |
| C5 deltas: pkg ids differ (com.swimchain.surf vs .mobile → side-by-side install, users migrate = fresh install); both bind 9735/9736 (force-stop mobile before surf); surf version 0.1.0 needs a public bump; surf uses mobile-app's ICONS as placeholder (needs its own before public); surf README cites mobile-app build recipe | `tauri.conf.json` each; `surf-app/README.md:355-363,399,109`; surf `tauri.conf.json:6` |

## Global Constraints

- **C2b bake correctness:** chess/chips entries mirror reef (`spaces:[]`, unique `number`, feed stays index 0). In build-channels.cjs, override the RIGHT endpoint var per client (chess `VITE_RPC_ENDPOINT`, chips `VITE_CHIPS_RPC`) to the loopback `RPC`, and extend the anti-leak grep to BOTH (loopback present, `swimchain.io/rpc` ABSENT) — chips also needs `VITE_CHIPS_SPACE` present (from .env.production) or it throws. Verify each baked channel: base-rooted, NO `.map`, NO `sourceMappingURL`, loopback endpoint, no gateway leak. See [[verify-client-bundle-endpoints]].
- **No CSP change, no shell change** (deck reads channels.json). Confirm the shell surfaces 5 channels and flips to chess/chips.
- **C4 NEVER commits a secret.** The keystore file + passwords stay out of git; `build.gradle.kts` reads a gitignored `keystore.properties` (already in .gitignore) with a `System.getenv` fallback for CI. Provide a committed `keystore.properties.example` template + build docs. The signingConfig must be wired so a release build WITH the properties signs, and WITHOUT them **fails clearly OR falls back to unsigned without breaking the debug build** (pick and document; do not silently produce a broken release). Do NOT generate the real keystore (operator holds it).
- **C5 is STAGED, not shipped:** bump the surf version for a public release; DRAFT the new download-android copy (channel/deck model) in the branch. Do NOT repoint the live download link to a nonexistent artifact, do NOT fabricate a release URL/SHA/tag, do NOT claim a release exists. The actual build+sign+upload+repoint is a final operator-gated step (needs C4's keystore). A real Surf icon is design work — flag it, don't fabricate.
- **Commits:** conventional + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; never push to a merged branch; check PR state first.

## Tasks

### Task 1: C2b — bake chess + chips as Surf channels
**Files:** `surf-app/web/channels.json`, `surf-app/scripts/build-channels.cjs`
- [ ] **Step 1: channels.json** — add `{"id":"chess","number":<n>,"name":"CHESS","spaces":[]}` and `{"id":"chips","number":<n>,"name":"CHIPS","spaces":[]}` after reef (pick numbers, e.g. chess 60, chips 70; feed stays index 0). 
- [ ] **Step 2: build-channels.cjs** — add two `CHANNELS` rows: `{id:'chess',dir:'chess-client',env:{VITE_RPC_ENDPOINT:RPC}}` and `{id:'chips',dir:'chips-client',env:{VITE_CHIPS_RPC:RPC}}`. Extend the reef-style anti-leak grep (currently reef-only) to run for chess AND chips too (loopback present, `swimchain.io/rpc` absent) — generalize it to any channel whose env sets an RPC var. Confirm chips's `VITE_CHIPS_SPACE` comes through from `.env.production` (don't override it) so `host.ts:290-293` doesn't throw.
- [ ] **Step 3: verify the bake** — `cd surf-app && npm install && npm run build:channels`. Confirm: `web/channels/{chess,chips}/` exist, assets rooted at `/channels/chess|chips/`, NO `.map`, no `sourceMappingURL` trailer, the loopback endpoint is baked (grep each channel's JS for `127.0.0.1:9736` present + `swimchain.io/rpc` absent). feed/wiki/reef still bake fine. Report the built sizes.
- [ ] **Step 4: deck check** — confirm the shell would surface 5 channels (channels.json drives the deck; no shell edit). Reason through / drive: 5 entries, warmSize 3, feed index 0, chess/chips unmetered (no dead-air/Chart telemetry — mirrors reef). Note chess's idle = lobby-over-Ocean, chips = bowl/kitchen (real attract states, per recon) — no empty-board dead air.
- [ ] **Step 5: commit** — `feat(surf): bake chess + chips onto the channel dial (C2b)`.

### Task 2: C4 — release signingConfig wiring (no secret committed)
**Files:** `surf-app/src-tauri/gen/android/app/build.gradle.kts`, `surf-app/src-tauri/gen/android/keystore.properties.example` (NEW), `surf-app/README.md` (build docs)
- [ ] **Step 1: signingConfig** — in the committed `build.gradle.kts`, add a `signingConfigs { create("release") { ... } }` that reads a gitignored `keystore.properties` (keys: `storeFile`, `storePassword`, `keyAlias`, `keyPassword`) if present, else `System.getenv("SURF_KEYSTORE_FILE"|"SURF_KEYSTORE_PASSWORD"|"SURF_KEY_ALIAS"|"SURF_KEY_PASSWORD")` for CI. Wire `release { signingConfig = signingConfigs.getByName("release") }`. Mirror the existing `java.util.Properties` idiom used for `tauri.properties` (`build.gradle.kts:1-14`).
- [ ] **Step 2: absent-secret behavior** — when NEITHER keystore.properties NOR the env vars are present, the release signingConfig must NOT break the DEBUG build (debug uses AGP's default) and must fail the RELEASE build with a CLEAR message (not silently emit an unsigned APK that looks shippable). Document the chosen behavior in a code comment.
- [ ] **Step 3: template + docs** — add `keystore.properties.example` (the 4 keys, placeholder values, a comment: never commit the real one; same key signs every update; store in the vault). Update `surf-app/README.md`: a "Release signing (C4)" section — the `keytool` generation command (RSA 4096, PKCS12, validity 10000), where to put keystore.properties (gitignored, next to build.gradle.kts), the 4 env vars for CI, and the release build command (`npm run tauri android build --target aarch64`).
- [ ] **Step 4: verify wiring (without the real keystore)** — generate a THROWAWAY test keystore in the scratchpad (NOT committed, NOT the operator's), point a temp keystore.properties at it, and confirm a release gradle config resolves the signingConfig (e.g. `gradlew :app:validateSigningRelease` or a dry `assembleRelease` far enough to prove signing is wired — if a full release build is too heavy in this env, at minimum confirm the gradle config evaluates without error via `gradlew tasks`/a config check, and that the debug build is unaffected). Delete the throwaway keystore. Document exactly what was verified vs left to the operator's real-keystore build.
- [ ] **Step 5: confirm no secret staged** — `git status` shows only build.gradle.kts + keystore.properties.example + README; NO `.jks`/`keystore.properties`/`.keystore` staged. `git check-ignore keystore.properties` confirms it's ignored.
- [ ] **Step 6: commit** — `feat(surf): release signing wiring — gradle signingConfig from gitignored keystore.properties (C4)`.

### Task 3: C5 — stage the cutover (version bump + drafted copy; live link NOT repointed)
**Files:** `surf-app/src-tauri/tauri.conf.json` (version), `website/download-android.html` (drafted copy — see constraint), `docs/` (a C5 cutover checklist)
- [ ] **Step 1: version bump** — set surf `tauri.conf.json` version to a public alpha (e.g. `0.1.0` → `0.2.0-alpha` or match the operator's scheme; pick a sensible bump and note it). This is the version the first signed release will carry.
- [ ] **Step 2: DRAFT the download copy** — update `website/download-android.html`'s COPY to describe Surf's channel/deck model (replacing the mobile-app full-node-in-pocket framing) — BUT leave the actual download URL/version/size/SHA (line 172, meta 177-182) pointing at the current mobile artifact OR clearly TODO-marked, since repointing to a nonexistent Surf release would 404. Prefer: keep the live link unchanged, add a clearly-commented `<!-- C5 TODO: repoint to signed Surf release once C4 keystore lands: URL/tag/size/SHA -->` block with the exact fields to fill. Do NOT claim a Surf release exists.
- [ ] **Step 3: cutover checklist** — write `docs/superpowers/specs/2026-08-01-surf-c5-cutover-checklist.md`: the ordered final steps (operator generates keystore → drop keystore.properties → `npm run build:channels` → release build → upload APK to a `surf-vX` GitHub Release → fill the download-android URL/tag/size/SHA → flip download.html Android card copy → note Surf icon still placeholder → force-stop-mobile caveat). This is the runbook for the gated finish.
- [ ] **Step 4: commit** — `chore(surf): stage C5 cutover — version bump, drafted download copy, cutover runbook (release-gated)`.

### Task 4: Integration gate
- [ ] **Step 1:** `npm run build:channels` bakes all 5 channels mapless + loopback-only (re-verify chess/chips). 
- [ ] **Step 2:** C4 gradle config evaluates (debug build unaffected; release signingConfig wired; no secret staged; keystore.properties gitignored).
- [ ] **Step 3:** C5 staging is honest — live download link NOT pointing at a nonexistent artifact; the cutover checklist captures the gated steps.
- [ ] **Step 4: report** — the 5-channel dial, the bake receipts (chess/chips mapless+loopback), the C4 wiring + what's operator-gated (real keystore + signed build), the C5 staged state + runbook, and the surf-icon debt.

## What this plan does NOT do
- **No real keystore generation** (operator holds it); **no actual signed release build** (needs the keystore); **no live download-link repoint** (needs the uploaded release) — all in the C5 runbook, operator-gated.
- No Surf app icon (design asset — flagged); no Play Store (sideload via GitHub Releases, as today).
- No mobile-app deletion (deprecate via the website + runbook; the repo stays).

## Self-review notes
- The load-bearing C2b gotcha: chips uses `VITE_CHIPS_RPC` (not `VITE_RPC_ENDPOINT`) and throws if it or `VITE_CHIPS_SPACE` is empty — Task 1 sets the right var and verifies no gateway leak per-channel (the reef anti-leak grep, generalized).
- C4's whole point is signing WITHOUT leaking a secret: gitignored keystore.properties + env fallback, template + docs, verified with a throwaway key. The real key is the operator's.
- C5 is deliberately staged: the one thing that must NOT happen is repointing users to a 404. The runbook makes the gated finish a clean checklist for when the keystore lands.
