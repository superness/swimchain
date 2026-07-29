# Surf A0 — browser spike

This is the A0 phase of Surf (spec `docs/superpowers/specs/2026-07-28-surf-channel-app-design.md`,
§5): the deck — iframes, LRU warm set, config handover, power-on/off, flip
feel, the honest static shader — as a plain web page pointed at an existing
dev node, with **no** APK/Tauri/`surf-app` scaffold beyond this `spike/`
directory. Its job is to measure, before a single line of Android code is
written, whether a 3-warm-channel deck (feed + forum + wiki + chat + reef,
one of them a game) survives on a real phone: renderer memory, flip-to-paint
latency, and event-loop health while occluded. Those numbers decide N (3 vs
2 warm channels) for everything downstream. See `RESULTS.md` for the
protocol's output and the decision rule.

## Prerequisites

- **Node 20+** on the PC (the spike server and its test suite are
  zero-dependency ESM, `node --test`).
- **A dev node** — the release `sw`/`sw.exe` binary (`cargo build --release`
  if it doesn't exist yet) able to run `--regtest` (or `--testnet`) with
  `node start`.
- **`adb`**, for the Android leg. It may not be on `PATH` — if `Get-Command
  adb` fails, check the Android SDK's platform-tools directory, e.g.
  `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`. Use the same
  USB-debuggable phone that sideloads the `v0.1.7` alpha APKs.

## Run book (PC side)

1. **Start a dev node.** From the repo root:
   ```powershell
   target\release\sw.exe --regtest --data-dir C:\tmp\surf-spike-node node start --listen 127.0.0.1:29735
   ```
   RPC listens on P2P port + 1 (`29736` for the port above). The node logs a
   line like `Generated RPC auth cookie: <path>` — **note that exact path**;
   the actual data directory gets the mode suffix appended (`-regtest` here),
   so don't guess the cookie path, read it off the log.

2. **Build the five `dist-spike` bundles** (one-time per client, ~minutes;
   `--base` matches the server's `/channels/<id>/` mount so absolute asset
   URLs resolve):
   ```powershell
   # package-lock.json is gitignored repo-wide -> `npm ci` has no lockfile and
   # hard-errors (EUSAGE); use `npm install`. wiki-client is pnpm-managed
   # (tracked pnpm-lock.yaml) — prefer `npx pnpm install --frozen-lockfile`
   # there; `npm install` is an acceptable fallback if pnpm is unavailable or
   # the lockfile has drifted (this has happened in practice).
   # If any install hangs on puppeteer: $env:PUPPETEER_SKIP_DOWNLOAD='1'
   cd feed-client;  npm install; npx vite build --base=/channels/feed/  --outDir dist-spike; cd ..
   cd forum-client; npm install; npx vite build --base=/channels/forum/ --outDir dist-spike; cd ..
   cd wiki-client;  npx pnpm install --frozen-lockfile; npx vite build --base=/channels/wiki/ --outDir dist-spike; cd ..
   cd chat-client;  npm install; npx vite build --base=/channels/chat/  --outDir dist-spike; cd ..
   cd reef-client;  npm install
   $env:VITE_RPC_ENDPOINT = 'http://localhost:8080/rpc'
   npx vite build --base=/channels/reef/ --outDir dist-spike
   Remove-Item Env:VITE_RPC_ENDPOINT
   cd ..
   ```
   **reef rebuild trap:** `reef-client/.env.production` pins
   `VITE_RPC_ENDPOINT=https://swimchain.io/rpc` (the mainnet gateway).
   Process env only outranks the `.env` file for as long as you remember to
   set it — **any later reef rebuild in a fresh shell that skips
   `$env:VITE_RPC_ENDPOINT` silently bakes the production gateway**, reef
   bypasses the spike proxy entirely, and every game-channel measurement
   (S3–S5) is invalid with no visible error. Re-grep after **every** reef
   rebuild, not just the first:
   ```powershell
   Select-String -Path *-client\dist-spike\index.html -Pattern '/channels/' | Select-Object -First 10
   Select-String -Path reef-client\dist-spike\assets\*.js -Pattern 'localhost:8080/rpc' -List
   ```

3. **Start the spike server**, pointed at the node's cookie and RPC port from
   step 1 (usage per `server.mjs`'s own CLI guard):
   ```
   usage: node server.mjs --cookie=<data_dir>/.cookie [--rpc=http://127.0.0.1:29736] [--port=8080] [--node-address=cs1...]
   ```
   e.g.:
   ```powershell
   node surf-app/spike/server.mjs --cookie=C:\tmp\surf-spike-node-regtest\.cookie --rpc=http://127.0.0.1:29736 --port=8080
   ```
   Ports 8080 / 29735 / 29736 are defaults, not guarantees — this machine
   regularly runs other dev servers and nodes concurrently (other sessions,
   other clients' dev servers); if a port is taken, pick a free one for
   `--port`/`--listen` and use that everywhere below (including the phone's
   `adb reverse` target in the Android protocol).

4. **Open the page.** Desktop: `http://localhost:8080`. Android: see the
   protocol below.

### Controls

| Input | Action |
|---|---|
| ArrowUp / ArrowDown | flip channel (desktop) |
| vertical swipe, right-edge strip | flip channel (touch) |
| `p` | power toggle |
| `m` or tap invisible bottom-left 44px corner | toggle HUD |
| `r` | reset the drift gauge (stage-scoped; used by G4) |
| `e` or tap invisible bottom-right 44px corner | export `surf-spike-results.json` |
| tap the off-screen (powered off) | power back on |

Shell keys are registered on the shell window **and** on every mounted
frame's window, so they keep working after you click inside a channel.

Full test suite: `node --test "surf-app/spike/*.test.mjs"` — run before every
commit; seconds to complete.

## Android measurement protocol (condensed — full detail + rationale in the
plan's Task 7 brief)

1. **Connect:**
   ```powershell
   adb devices                                  # phone listed, authorized
   adb reverse tcp:8080 tcp:8080                # phone's localhost:8080 -> PC's server
   adb shell am force-stop com.android.chrome   # fresh Chrome, no stray renderers
   ```
   `adb reverse` + a `127.0.0.1`-bound server means nothing is exposed on the
   LAN; the phone opens `http://localhost:8080` as its own local origin,
   which passes the clients' origin allowlist. Open Chrome on the phone to
   that URL and close every other tab (each extra tab is another renderer
   polluting the measurement).

2. **Confirm single-renderer:**
   ```powershell
   adb shell ps -A -o PID,NAME | Select-String sandboxed
   ```
   Expect exactly **one** `com.android.chrome:sandboxed_process...` — all
   channels are same-site, so even partial site isolation keeps them in one
   renderer (the WebView-equivalent condition). If more than one persists,
   record all renderer PIDs and sum their PSS in the next step (a valid,
   slightly-overstated upper bound).

3. **Sample throughout.** In a second terminal:
   ```powershell
   .\meminfo-sampler.ps1                      # defaults: com.android.chrome, 30s, meminfo.csv
   # .\meminfo-sampler.ps1 -IntervalSec 60 -OutCsv soak.csv
   ```
   Leave it running for the whole protocol below. **Verify one sample
   manually first**: `adb shell dumpsys meminfo <renderer pid>` yourself and
   confirm the sampler's number matches the `TOTAL PSS` line — `dumpsys`
   output format varies by Android version; if the regex grabs the wrong
   figure, fix it before trusting the soak, and note the Android version in
   `RESULTS.md`.

4. **Run the stages**, phone in hand, timestamps noted at each boundary:

   | Stage | Do | Record |
   |---|---|---|
   | S1 baseline | power-on lands on FEED; settle 2 min | PSS @ 1 warm |
   | S2 | flip to FORUM; settle 2 min | PSS @ 2 warm |
   | S3 | flip to REEF; play it 3 min (board animating) | PSS @ 3 warm incl. game |
   | S4 flip soak | 15 min realistic flipping across all 5 channels (LRU evictions included), scrolling feed, opening a thread, playing reef. Include ≥25 direction-reversal flips inside the current warm trio (bounce the last two channels — monotone dial cycling at warmSize 3 over 5 channels is *always* cold; G3 needs ≥20 warm samples) | PSS trend; HUD warm/cold stats; any "Aw, Snap"/reload |
   | S5 idle | tap-reset the drift gauge first (`r`, via a paired Bluetooth keyboard or `adb shell input text r`), then sit on FEED 5 min, REEF warm underneath | HUD: reef `raf/s` > 0 while occluded; driftMax over S5 only |
   | **S5-export** | before backgrounding anything: tap the invisible bottom-right corner → `surf-spike-results.json` lands in Downloads; `adb pull /sdcard/Download/surf-spike-results.json`. Photograph/screenshot the HUD too | the JSON + HUD capture (all metrics live in renderer memory — if S6 kills the renderer, this export is the only record of S1–S5) |
   | S6 background soak | home button; screen on; Chrome backgrounded **60 min** (sampler keeps logging) | renderer alive? PSS under pressure |
   | S7 return | reopen Chrome | page survived (HUD uptime continuous) or reloaded (uptime reset)? |

   If the page survived S7, export once more for the post-soak numbers; if
   it reloaded, the S5-export is the dataset and S7 records the death.

5. **Write `RESULTS.md`** against the gates, fill every cell — no blank
   verdicts.

## Decision rule (fixed in advance) and RESULTS.md

Full gate table, numbers, and verdict live in `RESULTS.md`. Summary of the
rule that binds N (see `RESULTS.md` for the complete version with the
G2-exception rationale):

- **N=3** iff G1–G4 all pass.
- **G2-only exception:** if G2 alone fails (G1/G3/G4 pass), record **N=3
  provisional, G2 deferred** — a backgrounded-Chrome-tab kill is not
  evidence against the APK, whose foreground service holds the renderer at
  a higher priority (see `RESULTS.md`'s proxy-honesty caveat). Re-verify on
  real WebView in A1.
- Any of G1/G3/G4 fails → set `warmSize: 2` in `channels.json`, re-run
  S1→S7, record the same table for N=2.
- A G1 failure **at warmSize 2** means the single-renderer deck assumption
  itself is broken — stop and take the numbers to the operator; the spec has
  no N=1 fallback (that's a §2.2 design conversation, not an implementer's
  call).

## Mainnet warning

The default target for this spike is a **regtest** node. If you point the
server at a **mainnet** node instead, the channel UIs (feed, forum, wiki,
chat) are live clients that can post real, signed actions under the node's
own identity — there is no sandbox once you type into a form. Read-only
flipping (browsing, scrolling, playing reef) is fine against a mainnet
pointed run; **do not type into any form** (post composer, chat input, wiki
edit box, etc.) while the spike is pointed at a mainnet node.
