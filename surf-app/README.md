# Surf

Surf is a channel-surfing entry point to Swimchain: a Tauri v2 Android app
that runs a **mainnet** node in-process (the same `NodeManager`/foreground-
service model as `mobile-app`) and shows it to you as a deck of full-screen
channels — FEED, WIKI, REEF today — that you flip between like a TV, each one
a live baked client talking straight to your own node. There is no home
screen and no login: power on and you're either watching a channel or
watching honest static while the set finds its first signal. Full design
intent, the channel deck model, the acquisition/seam/power state machine,
and the phase roadmap (A/B/C/D) live in the spec:
`docs/superpowers/specs/2026-07-28-surf-channel-app-design.md` (rev 3). The
A1 slice implemented here is spec §5 A1, plus the parts of
§2.1/§2.2/§2.3/§3.1/§3.2/§3.7/§6/§7/§8 that bind it — see
`docs/superpowers/plans/2026-07-29-surf-a1-the-set.md` for the full
implementation plan this README is the tail end of.

**Mainnet warning:** Surf hardcodes mainnet (no testnet/regtest mode). FEED
and WIKI are live clients — anything you type into them (a post, a wiki
edit) is a real, signed action under your node's own identity the moment you
submit it. There is no sandbox.

## A1 status

A1's milestone — **flip between live channels on a Pixel** — was achieved.
On a Pixel 8 Pro: first launch shows bloom → first-signal acquisition static
(identity proof-of-work + first mainnet sync happening underneath, no
empty-state card at any point) → FEED reveals with real mainnet content →
strip-swipe flips live to WIKI, then REEF, OSD burning on every flip, warm
flips landing at ~54ms → power-off leaves the node running under the
foreground service ("Still broadcasting." is literally true) → killing the
renderer (`adb shell am crash`) and relaunching restores the last channel as
a warm power-on. Full evidence (screenshots, HUD readouts, `dumpsys`
output) is in
`.superpowers/sdd/2026-07-29-surf-a1-the-set/task-5-report.md`; the CSP
binding check that Task 1 deferred was closed out there too. Commits:
`f06c1fec` (Android glue) and `21754cc3` (the CSP `ws://` fix below).

What A1 does **not** do: no dial/registry/capability tokens/purpose-scoped
signing (Phase D); no config-handover hardening or client source changes,
no release signing/size gates/sourcemap stripping/store distribution
(Phase C); no dwell-engage, flare, `get_space_health`, Chart, Interference,
Night Swim (Phase B); no desktop build (Phase E); no node-side background
fetch while the app is closed; no keystore passphrase wrapping (the Android
data dir is app-private, which is what §1 requires for v1); no new
consensus or node-side RPC work.

## Decisions on record (verbatim from the plan's "Decisions on record for A1")

- **D1 — No RPC proxy in the app.** The node's RPC layer serves CORS
  (`src/rpc/server.rs:774-810`: `Access-Control-Allow-Origin: *`,
  `Authorization` in allowed headers, OPTIONS preflight with 86400 max-age),
  which is how the shipped mobile app already works. Channels fetch
  `http://127.0.0.1:9736` directly with the cookie auth from the config
  handover. *(This corrects the A0 plan's "verified fact" that the RPC has
  no CORS — that grep missed the typed-constant header construction. The
  spike's proxy remains justified by its other two purposes: one-origin
  renderer measurement and dev-cookie custody.)*
- **D2 — Fixed default mainnet ports (9735/9736), no port scan.** §2.1
  mandates mobile-app's model unchanged; ports are that model. Bind failure
  (e.g. the old Swimchain mobile app running on the same phone) surfaces as
  the §6 node-failure state — full-screen static, diegetic line, details
  toggle — never a crash. README warns: stop/uninstall the old app when
  testing Surf on the same device. *(Not theoretical — this exact collision
  happened during Task 5's own device testing; see the port-conflict warning
  in the build recipe below.)*
- **D3 — Identity model copied verbatim, including `identity.pass`.** §1
  explicitly accepts filesystem-level protection on Android app-private
  storage for v1. First-launch identity PoW (difficulty 20) runs during the
  §3.1 acquisition static — the wait is diegetic.
- **D4 — Real CSP.** §2.2: `mobile-app`'s `"csp": null` is not inherited.
  The shell ships `default-src 'self'; frame-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:9736 http://localhost:9736; font-src 'self' data:`.
  Channels are same-origin baked, so `frame-src 'self'` is sufficient and no
  remote origin ever loads.

  **Two amendments landed on top of this baseline during implementation**
  (both live in `src-tauri/tauri.conf.json`'s `csp` and `devCsp` today, and
  both are load-bearing — remove either and a channel silently breaks):
  1. **`'wasm-unsafe-eval'` added to `script-src`** (Task 4). All three baked
     channels genuinely instantiate WebAssembly — feed and reef directly
     (Ed25519/PoW bindings via `swimchain-wasm`), wiki transitively through
     `@swimchain/frontend`'s content-action PoW — confirmed by grepping the
     **built** JS, not the source, which is the only way wiki's transitive
     dependency showed up at all. Without this, WASM instantiation throws
     under CSP.
  2. **`ws://127.0.0.1:9736 ws://localhost:9736` added to `connect-src`**
     (Task 5, on-device). The baseline above only listed the `http://`
     forms. On the real Android WebView, an `http:` connect-src source does
     **not** cover a `ws:` connection to the same host:port — verified by
     direct CSP-violation-log measurement, not assumed from the spec text.
     FEED's real-time "N new posts" pill (`useNodeEvents` → a WebSocket to
     the node's `/ws`) was silently dead until this was added; WIKI and REEF
     don't use that path so they were unaffected and the gap went unnoticed
     until Task 5's device pass specifically went looking at the CSP
     violation log.

  The current, live `connect-src` (both `csp` and `devCsp`) is therefore:
  `connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:9736 http://localhost:9736 ws://127.0.0.1:9736 ws://localhost:9736`,
  and `script-src` is `'self' 'wasm-unsafe-eval'`.
- **D5 — The flip strip stays for A1.** Native full-surface gesture
  arbitration (vertical dial swipe vs channels' own scrolling) is real
  design work the spec assigns nowhere before B; the A0 strip (56px right
  edge, wheel on desktop) is proven and ships in A1. Documented as accepted
  debt in the README.
- **D6 — Instrumentation ships, hidden.** measure.mjs + HUD stay (keys
  `m`/`r`/`e`, invisible corners) — A1's device verification includes
  re-running the G2 background check on the **real WebView**, the explicit
  obligation RESULTS.md carries. *(Still pending — see "Open items" below.)*
- **D7 — A1 ends at a debug arm64 APK sideloaded on the Pixel.** Release
  signing/size gates are Phase C. The Dev-Mode gradle workaround from
  `mobile-app/README.md:40-81` is the documented build path.
- **D8 — External opens are https-only, checked in Rust.** §2.2: mobile-app's
  unchecked opener is not inherited. Surf's `open_external` command validates
  `^https://` before `opener().open_url`; the shell's message handler
  additionally requires `event.source` to be the current channel's frame
  (exact-origin, foreground-only).

## Build recipe

### Desktop dev (fastest loop for shell/RPC work)

```bash
cd surf-app
npm install
npm run tauri dev
```

Opens a 420×900 window titled "Surf" running the shell against a real
in-process mainnet node on the default ports (P2P 9735, RPC 9736). Useful
devtools console checks (via `window.__TAURI__.core.invoke`):

```js
await window.__TAURI__.core.invoke('get_rpc_endpoint')   // "http://127.0.0.1:9736"
await window.__TAURI__.core.invoke('get_rpc_auth')       // "Basic ..." once the node is up
await window.__TAURI__.core.invoke('node_status')        // { running, address, error }
```

**Dev-mode CSP does not bind on WebView2** (Task 1 finding, confirmed twice
— once on the baseline `csp` key, again after adding `devCsp` explicitly:
no `Content-Security-Policy` response header, no `meta` tag, `eval()`
succeeds, no `securitypolicyviolation` events ever fire). This is specific
to Tauri's dev-mode local asset server on this platform
(`frontendDist`-only, no `devUrl`) — the bundled/Android build uses a
different code path (the custom-protocol asset handler) where CSP injection
is real and was confirmed live on the Pixel (see D4). **Do not use desktop
dev to sanity-check CSP behavior** — it will look permissive no matter what
the config says. Also: without baked channels (see next section), power-on
gets as far as the acquisition static and then can't reveal FEED — that's
expected, not a bug, until you've run the channel bake at least once.

**Port-conflict / same-machine note:** the node autostarts on mainnet's
fixed default ports (9735/9736), no scan (D2). If another mainnet node is
already running on this machine — the CLI, `desktop-app`, another `surf-app`
instance, or the launcher — `tauri dev` will fail to bind and the shell
correctly shows the §6 node-dead card ("THE SET CANNOT REACH THE WATER")
rather than hanging. Stop the other node first.

### Channel bake — run before any APK build

```bash
cd surf-app
npm run build:channels
```

Runs `scripts/build-channels.cjs`, which builds `feed-client`, `wiki-client`,
and `reef-client` fresh into `surf-app/web/channels/<id>/` (gitignored,
rebuilt every time — not incremental) with asset URLs rooted at
`/channels/<id>/`, and then **verifies its own output**: it fails loudly
(non-zero exit) if reef's bundle doesn't contain the loopback endpoint
`127.0.0.1:9736`, or if it contains the production gateway
`swimchain.io/rpc` (reef's `.env.production` pins the mainnet gateway, and
process env only wins for as long as this script remembers to set
`VITE_RPC_ENDPOINT` — this check exists specifically so that mistake can
never ship silently). If `node_modules` is missing for a client it runs
`npm install` first (not `npm ci` — `package-lock.json` is gitignored
repo-wide). **The APK bundles whatever is in `web/channels/` at build time
— always run this before `tauri android build`, including after any client
source change**, or you'll sideload stale channels with no error telling
you so.

### Android — Dev-Mode workaround (no Windows Developer Mode / no symlink privilege)

First time only:

```bash
cd surf-app
npm run tauri android init
```

This generates `gen/android` for `com.swimchain.surf`. (The tracked overlay
— `NodeForegroundService.kt`, `MainActivity.kt` customizations, manifest
FGS/permission entries, `network_security_config.xml` scoped to
`127.0.0.1`/`localhost` — is already committed; you only need `init` if
`gen/android` doesn't exist yet or you're regenerating it from scratch.)

Every build:

```powershell
# Android Studio's bundled JBR, not whatever `java` resolves to on PATH —
# a newer JDK breaks gradle/buildSrc.
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

cd surf-app
npm run build:channels          # bake BEFORE the APK build — web/ is the frontendDist
npm run tauri android build -- --debug --target aarch64
```

On a machine without Windows Developer Mode enabled, this cross-compiles the
Rust lib successfully (a genuinely long build the first time — budget
~20 minutes cold) and then dies at the very last pre-gradle step:

```
failed to build Android app: Failed to create a symbolic link from
...libsurf_app_lib.so to ...jniLibs/arm64-v8a\libsurf_app_lib.so
(file clobbering enabled): Creation symbolic link is not allowed for this system.
```

Finish it by hand — a plain copy is byte-identical to what gradle would
package from the symlink:

```powershell
Copy-Item src-tauri\target\aarch64-linux-android\debug\libsurf_app_lib.so `
  src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a\ -Force
Copy-Item src-tauri\tauri.conf.json `
  src-tauri\gen\android\app\src\main\assets\tauri.conf.json -Force
cd src-tauri\gen\android
.\gradlew.bat assembleArm64Debug -x rustBuildArm64Debug
```

(`assembleArm64Debug` and the `arm64`/`debug` output path below were
verified against the actual generated `build.gradle.kts` in Task 5, not
assumed from mobile-app's x86_64 recipe — Surf targets `aarch64`/`arm64`,
mobile-app's documented recipe targets `x86_64`, the task names differ
accordingly.) If Developer Mode *is* enabled, the plain
`npm run tauri android build -- --debug --target aarch64` completes on its
own and the manual copy/gradle steps aren't needed — use whichever
completes.

APK lands at:
```
surf-app/src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk
```

Install and launch:
```powershell
adb install -r surf-app\src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk
adb shell am start -n com.swimchain.surf/.MainActivity
```

**CSP is baked at Rust compile time, not asset-copy time.** If you change
`tauri.conf.json`'s `csp`/`devCsp` strings, copying the updated file into
`gen/android/app/src/main/assets/tauri.conf.json` and reinstalling is
**not enough** — the old CSP string is still what the compiled binary
enforces. You must rerun the full `tauri android build` (or at minimum the
Rust rebuild step) after any CSP edit. This bit Task 5 directly: the
`ws://` amendment above required a second full rebuild before it actually
took effect on-device, confirmed only by testing against a freshly
relaunched process with a fresh devtools socket (an `adb install -r` +
relaunch alone can bring an existing task to the foreground without proving
you're looking at the new binary — check for a new PID).

**Port-conflict warning, same device:** if an earlier prototype
(`com.swimchain.mobile`, the existing sideloaded mobile app) is already
running its own foreground-service node on this phone, Surf's node — same
fixed mainnet P2P port 9735, no offset — fails to bind and you'll see the
§6 "THE SET CANNOT REACH THE WATER" card with `failed to bind to
0.0.0.0:9735: ... Address already in use`. This is D2 working as designed,
not a Surf bug. **Force-stop (or uninstall) `com.swimchain.mobile` — and
any other Swimchain app already holding the node ports — before testing
Surf on the same device.**

**Patience note:** on a genuinely first launch (no prior identity, no prior
sync), the acquisition static covers both the identity proof-of-work
(difficulty 20 — this alone can take real wall-clock time on a phone CPU)
and the first mainnet sync reaching enough of the bootstrap feed spaces to
retrieve actual post bodies (not just chain-indexed metadata — see D-notes
in `shell.mjs`'s `localItemCount`). The static's flecks visibly respond to
live peer/height data throughout, so it's never a frozen screen, but don't
expect FEED to reveal in the first few seconds on a cold identity — this is
honest §3.1 behavior, not a hang.

## Controls

| Input | Action |
|---|---|
| vertical swipe on the right-edge flip strip | flip channel (touch) |
| **long-press the flip strip, 800ms** | **power toggle — the only touch power control** (no on-screen power button exists) |
| mouse wheel over the flip strip | flip channel (desktop) |
| `ArrowUp` / `ArrowDown` | flip channel (keyboard) |
| `p` | power toggle (keyboard) |
| `m`, or tap the invisible 44px bottom-left corner | toggle the HUD |
| `r` | reset the HUD's drift gauge |
| `e`, or tap the invisible 44px bottom-right corner | export `surf-spike-results.json`-style measurement data |
| tap anywhere while off | power back on |

The flip strip is a 56px-wide, otherwise-invisible zone on the right edge —
touching or scrolling inside a channel itself never flips. Flips are
disabled until the set has acquired its first signal (`acquired` in
`localStorage`); before that, only power toggling does anything.

## Accepted debt

| Item | Phase |
|---|---|
| Native full-surface gesture arbitration (vs. the strip-only flip/swipe model, D5) | B |
| Surf's own icon (currently `mobile-app`'s icons, copied wholesale as a placeholder) | C |
| `SWIMCHAIN_CHANNEL_READY` message support in the clients themselves (today, readiness is detected only via the same-origin DOM-peek fallback in `handover.mjs` — no shipped client posts the message; `watchReadiness` is already forward-compatible with it) | C |
| Config-handover hardening (§2.4 — origin/signature hardening beyond the current exact-origin `postMessage`; no client source changes in A1) | C |
| Release signing, APK size gate, sourcemap stripping, store distribution (A1 ships a debug APK only) | C |
| The dial: channel registry, capability tokens, purpose-scoped signing | D |
| `get_space_health` integration, dead-air/flare/dwell-engage mechanics, Chart, Interference, Night Swim | B |
| Node-side follow-and-fetch while the app is fully closed (§2.3 names this a separate, unscheduled work item — liveness today only happens while the app/foreground-service is actually running the tuner driver) | named, unscheduled |

### Open items (not yet closed, need follow-up before calling A1 fully done)

- **G2 60-minute WebView background soak** (RESULTS.md's obligation, D6) —
  deliberately **not run** in Task 5; scheduling is with the operator. The
  PID-based sampling method (find the renderer via `dumpsys activity
  processes com.swimchain.surf`'s isolated-UID-matched `sandboxed_processN`
  entry, then loop `dumpsys meminfo <pid>`) is documented and ready in the
  Task 5 brief; results should land as a `## A1 addendum — G2 on the real
  WebView` section in `surf-app/spike/RESULTS.md`, which has not been
  touched yet.
- **Long-press power-toggle movement slop** — Task 3's review flagged the
  gesture as having zero slop tolerance (any finger drift during the 800ms
  hold cancels it, since `touchmove` unconditionally clears the timer).
  Task 5 attempted to confirm/refute this on the Pixel but was interrupted
  when the physical device (shared with a concurrent session) was reclaimed
  mid-check. Still open — either confirm it's fine as-is or add a small
  (~10px) movement threshold before treating this as settled.
