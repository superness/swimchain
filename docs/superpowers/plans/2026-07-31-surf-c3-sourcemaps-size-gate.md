# Surf C3 — Sourcemap Exclusion + CI Bundle-Size Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stop shipping source maps to production (they leak readable source and bloat bundles — the spec notes ~17MB of maps across the dists, incl. a 2.45MB feed map baked into the surf APK), and add a CI gate that keeps them out and catches bundle bloat.

**Two parts:** (1) set `build.sourcemap: false` on every client Vite build (14 clients) — handling the tracked-`.js`-shadows-`.ts` drift trap, the surf bake, and the 4 clients that commit dist+maps; (2) a CI gate that fails on any reintroduced `sourcemap:true`, any tracked `*.map` under a client `dist/`, and a per-bundle gzipped size budget on the bundles CI can actually see.

**Tech Stack:** Vite/TypeScript client builds; GitHub Actions (`.github/workflows/ci.yml`); the size-check pattern from `wasm.yml`.

**Worktree:** `C:\github\swimchain\.claude\worktrees\mobile-app`, branch `feat/surf-c3-sourcemaps` (fresh off origin/main; C1+C2a already merged). Check PR state before first push.

**Spec:** `docs/superpowers/specs/2026-07-28-surf-channel-app-design.md` (§ around :206-208 — the maps-in-APK problem). Surf phase **C3**; C4/C5/C2b are separate operator decisions.

## Verified facts (recon 2026-07-31, file:line)

| Fact | Where |
|---|---|
| Vite's `build.sourcemap` defaults to false — a client leaks maps ONLY if it explicitly sets `true` | Vite docs |
| **14 clients set `sourcemap:true`.** The 2 Tauri shells (mobile-app, desktop-app) have no build block → already fine. surf-app has no vite config of its own. | per-client vite configs |
| **DRIFT TRAP — 7 clients have BOTH tracked `vite.config.js` AND `vite.config.ts`, both set true; Vite loads `.js` FIRST, so editing only `.ts` is a silent no-op.** analytics `.ts:17`/`.js:16`, archiver `.ts:17`/`.js:16`, bridge `.ts:17`/`.js:16`, chat `.ts:21`/`.js:20`, feed `.ts:21`/`.js:20`, forum `.ts:21`/`.js:20`, search `.ts:21`/`.js:20` | those files |
| 5 clients have a GITIGNORED `.js` (a `tsc -b` artifact) + tracked `.ts` — editing `.ts` propagates via `tsc -b`: reef `.ts:17`, chess `.ts:17`, chips `.ts:37`, wiki `.ts:30`, trench-client/ui `.ts:43` | those files + each `.gitignore` |
| 2 clients: single tracked `.ts`, no `.js`: shoal `.ts:24`, defcon `.ts:35` | those files |
| **4 clients COMMIT dist+maps** (no `.gitignore`): chat, feed, forum, search → **13 tracked `*.js.map`** (`git ls-files '*-client/dist/assets/*.js.map'`); fix must rebuild + recommit dist and drop those maps. Other clients gitignore dist. | `git ls-files` |
| **surf bake trap:** `surf-app/scripts/build-channels.cjs:52-58` runs `vite build` DIRECTLY (no `tsc -b`), so it uses the ON-DISK `.js`: feed's tracked `.js` must be fixed; reef/wiki's gitignored `.js` must be regenerated (via `tsc -b`) before the bake, or the map still embeds. | `build-channels.cjs:52-58`, `:18` |
| Nothing depends on maps: no sentry/bugsnag/source-map-upload anywhere; `scripts/deploy-web-clients.sh:99` tars the whole dist (maps leak as a side effect, not required). Removing is a pure config change. | grep; deploy script |
| Build script everywhere: `"build": "tsc -b && vite build"` | package.json |
| **CI today:** `.github/workflows/ci.yml` `clients` matrix = **chips-client ONLY** (`ci.yml:68`), steps `npm ci`→`tsc -b`→`npm test` (typecheck+test, NOT size). Triggers push `["**"]`, PR `[main,master]` (`:3-7`). | ci.yml |
| **Size-gate template = `wasm.yml:45-71`**: `GZIP_SIZE=$(gzip -c "$F" \| wc -c)`, `exit 1` if over `BUNDLE_SIZE_LIMIT`. | wasm.yml:19-20,45-71 |
| **Building all clients in CI is fragile:** `package-lock.json` gitignored repo-wide (`.gitignore:38`), un-ignored ONLY for chips (`:44`) → `npm ci` works for chips only; search+wiki are **pnpm**; the rest need `npm install` (no lock). No stored per-client size baseline exists. | .gitignore; lockfiles |
| Current committed/on-disk `dist/assets` JS (raw): feed 660KB, forum 600KB, chat 464KB, wiki 364KB, shoal 272KB, search 248KB (maps ~4-5× the JS). gzip ≈ 30-35% of raw. | `du -k` |
| Precedent that shipped state is mapless: `shoal-client/src/ui/shippedStyles.test.ts:118` builds with `sourcemap:false`. | that test |

## Global Constraints

- **Every one of the 14 clients must actually stop emitting maps** — verified by a real build producing NO `.map` in `dist/assets`, not just by a config grep. The drift trap (Group A) means editing `.ts` alone is insufficient for 7 clients.
- **Group A (tracked `.js`+`.ts`): DELETE the tracked `vite.config.js` and add it to that client's `.gitignore`** (matching the Group B pattern, so the trap cannot recur), AND set `sourcemap:false` in the `.ts`. Before deleting, confirm `tsc -b` regenerates the `.js` from the `.ts` (so the build still has a `.js` for vite to load). If a client's `tsc -b` does NOT regenerate it, fall back to editing BOTH files to `false` and leave the `.js` tracked (note it). Either way, a post-fix build must emit no map.
- **surf bake must ship mapless:** after fixing feed/wiki/reef, run `surf-app/scripts/build-channels.cjs` (or its `npm run build:channels`) and confirm no `.map` lands in `surf-app/web/channels/*/assets/` and the baked JS shrank. This is the headline win (the 2.45MB feed map leaves the APK).
- **The 4 committed-dist clients (chat/feed/forum/search): rebuild dist and recommit** — the 13 tracked `*.js.map` must be `git rm`'d (gone from the tree), and the rebuilt `dist/assets/*.js` must have no `//# sourceMappingURL` trailer. Re-set `VITE_RPC_ENDPOINT`/`.env.production` per the deploy gotcha if a rebuild would otherwise bake a dev endpoint — but a size/map fix shouldn't change baked endpoints; verify the committed bundle's endpoint is unchanged (grep) so we don't accidentally repoint a shipped client. See [[verify-client-bundle-endpoints]].
- **CI gate must be non-vacuous:** it must FAIL when a `sourcemap:true` is reintroduced OR a `*.map` is committed under a client `dist/`, and the size budget must FAIL when a bundle exceeds it — each proven by a mutation (temporarily reintroduce the condition, see the gate go red, revert).
- **Do NOT try to build all 14 clients in CI** (no locks, mixed npm/pnpm — fragile). The size budget covers the bundles CI can see WITHOUT a fragile from-scratch fleet build: the 4 committed-dist clients (read the committed `dist/assets/*.js`) + chips (already built in CI). Note explicitly what's not size-gated and why.
- **pnpm clients:** search + wiki use pnpm (`pnpm-lock.yaml`); any build step for them uses `pnpm install`/`pnpm build`, not npm.
- **Commits:** conventional + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; never push to a merged branch.

## File structure

```
<each of 14 clients>/vite.config.ts        MODIFY sourcemap:true → false
analytics|archiver|bridge|chat|feed|forum|search /vite.config.js   DELETE (tracked) + add to .gitignore
  (fallback: MODIFY to false if tsc -b doesn't regenerate it)
chat|feed|forum|search /dist/**            REBUILD + recommit (git rm the 13 *.js.map)
surf-app/web/channels/**                   REBUILD via build-channels (verify mapless)
.github/workflows/ci.yml                   ADD a sourcemap/map lint job + size-budget step
scripts/check-bundle-sizes.sh (or inline)  NEW — the gate logic (grep configs, no tracked maps, gzip budget)
```

---

## Tasks

### Task 1: Sourcemap OFF — Group A (the 7 tracked-`.js` drift-trap clients)

**Files:** `analytics-client`, `archiver-client`, `bridge-client`, `chat-client`, `feed-client`, `forum-client`, `search-client` — each `vite.config.ts` (set false) + `vite.config.js` (delete, gitignore) and `.gitignore`.

- [ ] **Step 1: For each of the 7** — set `build.sourcemap: false` in `vite.config.ts`. Then determine the `.js`: run `cd <client> && npx tsc -b` (or `pnpm` for none here — all 7 are npm) and check whether it regenerates `vite.config.js` from the `.ts`. 
  - If YES → `git rm vite.config.js` and add `vite.config.js` to that client's `.gitignore` (create/append). The `.ts` is now authoritative and the trap is gone.
  - If NO (tsc doesn't emit it) → keep the `.js` tracked but set `sourcemap:false` in it too (edit both). Record which clients took which path.
- [ ] **Step 2: Prove no map emits** — for at least chat + feed + forum + search (the committed-dist ones) and one of analytics/archiver/bridge: `npm install` then `npm run build`, and confirm `dist/assets/` contains NO `*.map` and the `index-*.js` has no `//# sourceMappingURL=` trailer (`tail -c 200 dist/assets/index-*.js | grep sourceMappingURL` → empty). (analytics/archiver/bridge may not build cleanly without deps — if `npm install` fails for one, note it and rely on the config proof + the fact vite default is false.)
- [ ] **Step 3: Commit** — `fix(clients): stop emitting sourcemaps in prod builds — group A (remove shadowing vite.config.js)`. (Committed-dist rebuild is Task 3; here just the config.)

---

### Task 2: Sourcemap OFF — Groups B & C + the surf bake

**Files:** reef, chess, chips, wiki, trench-client/ui, shoal, defcon — each `vite.config.ts` (false). Plus `surf-app` bake verification.

- [ ] **Step 1: set `sourcemap:false`** in each `.ts` (reef `:17`, chess `:17`, chips `:37`, wiki `:30`, trench-client/ui `:43`, shoal `:24`, defcon `:35`). These `.js` are gitignored artifacts (or absent) — do not commit them.
- [ ] **Step 2: regenerate the gitignored `.js` for the surf-baked ones** — for reef and wiki, run `cd <client> && npx tsc -b` so the on-disk `vite.config.js` reflects `false` (the surf bake reads the `.js` directly). wiki is **pnpm** (`pnpm install` first if needed); reef is npm.
- [ ] **Step 3: verify the surf bake is mapless (the headline)** — `cd surf-app && npm install && npm run build:channels` (or `node scripts/build-channels.cjs`). Confirm `surf-app/web/channels/{feed,wiki,reef}/assets/` contains NO `*.map`, the baked `index-*.js` has no `sourceMappingURL` trailer, and the baked JS is materially smaller (feed loses ~2.45MB). If `build:channels` needs env (`VITE_RPC_ENDPOINT=127.0.0.1:9736`) confirm it still bakes+grep-verifies the loopback endpoint (don't regress the endpoint). Note: `surf-app/web/channels/**` — is it tracked? If tracked, recommit; if gitignored, it's build output.
- [ ] **Step 4: per-client build proof** — for chips (npm, in CI) + reef (npm) + wiki (pnpm): build and confirm no `.map` in `dist/assets`. chess/shoal/defcon/trench: config proof + a build where feasible.
- [ ] **Step 5: Commit** — `fix(clients,surf): stop emitting sourcemaps — groups B/C + surf bake mapless`.

---

### Task 3: Rebuild + de-map the 4 committed-dist clients (chat/feed/forum/search)

**Files:** `chat-client/dist/**`, `feed-client/dist/**`, `forum-client/dist/**`, `search-client/dist/**` (search is **pnpm**).

- [ ] **Step 1: identify the 13 tracked maps** — `git ls-files '*-client/dist/assets/*.js.map'` (expect 13: chat 3, feed 4, forum 4, search 2).
- [ ] **Step 2: rebuild each** with the now-mapless config (Task 1 already set these 4). npm for chat/feed/forum, **pnpm for search**. Use the SAME baked env the committed bundle already has — grep the OLD committed `dist/assets/index-*.js` for its `VITE_RPC_ENDPOINT`/gateway value FIRST, set `.env.production` to match, rebuild, and re-grep the new bundle to confirm the endpoint is UNCHANGED (never silently repoint a shipped client — [[verify-client-bundle-endpoints]]). If the endpoint can't be preserved, STOP and report.
- [ ] **Step 3: `git rm` the maps + stage the rebuilt dist** — the 13 `*.js.map` must be deleted from the tree; the new `dist/assets/index-*.{js,css}` (new hashes) staged; old hashed assets removed. Confirm `git status` shows the maps deleted and no `*.map` remains tracked (`git ls-files '*/dist/*.map'` for client dirs → empty).
- [ ] **Step 4: Commit** — `chore(clients): rebuild chat/feed/forum/search dist without sourcemaps (drop 13 tracked .js.map)`.

---

### Task 4: CI gate — no sourcemaps, no tracked maps, size budget

**Files:** `scripts/check-bundle-sizes.sh` (NEW), `.github/workflows/ci.yml` (MODIFY).

- [ ] **Step 1: write `scripts/check-bundle-sizes.sh`** (bash, runs in CI) that FAILS (exit 1) on any of:
  1. **sourcemap reintroduction** — any tracked `**/vite.config.{ts,js}` under a client dir contains `sourcemap: true` (grep; ignore commented lines). 
  2. **tracked maps** — `git ls-files` matches any `*-client/dist/**/*.map` or other client `dist/**/*.map` (should be zero after Task 3).
  3. **size budget** — for each bundle CI can see WITHOUT a fleet build: the committed `chat|feed|forum|search /dist/assets/index-*.js`, assert `gzip -c … | wc -c` < a per-client budget. Set each budget ~20-30% above the current gzipped size (compute current sizes and bake them in with a comment showing the headroom). Use the `wasm.yml:45-71` gzip pattern.
  Print each check's result; exit 1 with a clear message on the first failure.
- [ ] **Step 2: wire into ci.yml** — add a job (or a step in `clients`) that runs `bash scripts/check-bundle-sizes.sh` on push/PR. It needs no `npm install` (it reads tracked files + greps configs) — keep it fast and dependency-free so it can gate ALL clients, not just the buildable ones.
- [ ] **Step 3: extend chips's existing CI job with a size assertion** — chips already builds in CI (`ci.yml:68` matrix, npm ci → tsc -b → test). After its build, add a gzipped-size assertion on `chips-client/dist/assets/index-*.js` (wasm.yml pattern, chips-specific budget). This is the one from-scratch-built client, so it gets a true post-build size gate.
- [ ] **Step 4: mutation-prove the gate is non-vacuous** — (a) temporarily set a vite config back to `sourcemap:true` → `check-bundle-sizes.sh` exits 1 on check #1; revert. (b) temporarily `git add -f` a dummy `feed-client/dist/assets/x.js.map` → exits 1 on check #2; revert. (c) temporarily lower a size budget below current → exits 1 on check #3; revert. Record all three. A gate that passes with the bug present is a defect.
- [ ] **Step 5: Commit** — `ci: gate sourcemaps, tracked maps, and client bundle size`.

---

### Task 5: Integration gate

**Files:** none — verification.

- [ ] **Step 1: fleet map sweep** — after Tasks 1-3, grep every tracked vite config: zero `sourcemap: true` (uncommented). `git ls-files` for client `dist/**/*.map`: zero. Record the list of 14 configs now false.
- [ ] **Step 2: representative builds green + mapless** — build chips (npm), reef (npm), wiki (pnpm), search (pnpm), and the surf bake; each `dist/assets` (and `surf-app/web/channels/*`) has no `.map`. Confirm no build broke from the config change.
- [ ] **Step 3: surf APK win quantified** — report the baked feed/wiki/reef JS+map size before vs after (the ~2.45MB feed map gone), i.e. the APK shrink.
- [ ] **Step 4: endpoints unchanged** — for the 4 rebuilt committed-dist clients, confirm the new committed bundle's baked RPC endpoint matches the old one (grep receipts). [[verify-client-bundle-endpoints]]
- [ ] **Step 5: gate runs clean on the fixed tree** — `bash scripts/check-bundle-sizes.sh` exits 0 now; and the three mutations from Task 4 Step 4 are the proof it isn't vacuous.
- [ ] **Step 6: report** — sizes before/after, the 14 configs, the 13 maps removed, the gate's three mutation proofs, the surf-APK shrink, endpoint receipts, and what is NOT size-gated (analytics/archiver/bridge/reef/chess/shoal/defcon/trench — not built in CI, no committed dist) and why.

---

## What C3 explicitly does NOT do

- **No fleet-wide CI build** of all 14 clients (fragile: no locks, mixed npm/pnpm). Size budget covers only bundles CI can see (committed dist + chips).
- **No library dist changes** (swimchain-react/frontend/js tsc maps — those are lib `.d.ts.map`/`.js.map`, not client bundle leaks; out of scope, note only).
- **No C4/C5/C2b** (operator decisions); no client redeploys (follow-up — the fixed bundles reach users only on next deploy, [[client-fix-distribution-gap]]).

## Self-review notes

- The load-bearing trap is Group A: 7 clients where a tracked `vite.config.js` shadows the `.ts`. The plan deletes the `.js` (aligning with Group B) so the trap can't recur, with an edit-both fallback. Every fix is proven by a real build emitting no map, not a config grep alone.
- The surf bake reads on-disk `.js` without `tsc -b`, so feed (tracked `.js`) and reef/wiki (regenerated `.js`) are the ones that actually change the APK — Task 2 Step 3 verifies the headline win directly.
- The CI gate is deliberately dependency-free (reads tracked files) so it protects ALL clients cheaply, plus a real post-build size assertion on chips (the only CI-built client). Non-vacuousness is mutation-proven (three mutations).
- Endpoint safety on the committed-dist rebuild is explicit (grep old→match→rebuild→grep new) so a size fix never silently repoints a shipped client.
