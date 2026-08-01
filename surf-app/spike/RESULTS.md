# Surf A0 — measurement results (2026-07-29)

Device: Pixel 8 Pro, Android 16, 12 GB. Chrome 150 (UA `Chrome/150.0.0.0 Mobile`).
Node: regtest, fresh chain (height 0, 0 peers — isolated; content-light DOMs, noted in caveats). Single renderer confirmed: yes — one `com.android.chrome:sandboxed_process0` (PID 29070) for the entire S1–S5 session; other `sandboxed_process` entries on the device belonged to other apps' WebViews.
Run driven via adb (input choreography script + 30s `dumpsys meminfo` sampler); stage boundaries reconstructed from the driver's fixed sleep structure (S1 14:21, S2 14:23, S3 14:25, S4 14:28:45, S5 14:40:50, S6 14:47:50 EDT).

## Gates (warmSize=3, lineup feed+forum+wiki+chat+reef, warm incl. REEF)

| Gate | Pass condition | Measured | Verdict |
|---|---|---|---|
| G1 foreground survival | S4: 15-min flip soak, zero renderer deaths | 127 flips (1 power + 86 cold + 40 warm) over ~24 min; renderer PID 29070 unchanged start→S6; no "Aw, Snap", no reload (HUD uptime continuous); signalLostCount 0 | **PASS** |
| G2 background survival | S6/S7: 60-min background, no reload on return | Backgrounded 14:47:50→15:55 (~67 min), screen on. Harsher than protocol: mid-soak, Chrome itself was foregrounded for other browsing (a fifth tab at ~511 MB PSS + four new sibling renderers), so the spike tab rode out the hour as a background tab behind an active session. Renderer PID 29070 never died — compacted from ~105 MB to 45 MB in the cached band. On tab return: **no reload** — HUD uptime continuous at **94.7 min**, full flip dataset intact (warm n40 / cold n86), all three channels resumed at ~58 raf/s; one-time thaw cost of 5 longtasks / 374ms per channel realm. (HUD driftMax read ~21 min after return — that is the frozen-tab timer gap on thaw, expected; G4's number is the S5-scoped one per its definition.) | **PASS** |
| G3 warm flip | median <= 300ms over >= 20 warm flips (p95 recorded). Audit `warmViaCounts` in the export — if more than a handful of warm samples are `via=dom-peek-backstop`, the median under-reports paint on a contended device; treat it as suspect and investigate before ruling N=3. | n=40, median **67.8ms**, p95 74.9ms, max 80.5ms. `warmViaCounts: { dom-peek: 40 }` — **zero** backstop-settled samples; median is clean | **PASS** (4.4× under gate) |
| G4 event-loop health | S5: occluded REEF raf/s > 0 AND shell driftMax < 250ms **measured over the S5 idle window only (drift gauge reset at S5 start)** | REEF occluded at **60 raf/s** (all three warm channels at 60/s); driftMaxMs **30.9** over the S5 window | **PASS** |

## Numbers

- PSS @ 1 / 2 / 3 warm: **65 / 77 / 96 MB** (steady-state; ~12–19 MB marginal per warm channel)
- PSS peak during S4: **114 MB** (avg 103); S5 idle steady at 102.5 MB, no growth trend; trend during S6: compacted to **45 MB** in the cached band under active memory pressure (five new sibling renderers incl. one at ~511 MB), renderer alive throughout
- Warm flips: n=40, median=67.8ms, p95=74.9ms. Cold: n=86, median=120.5ms, p95=173.6ms, max=196.3ms vs 2s gate.
- Longtasks per channel over S4: **0** in every sampled channel realm all session (0ms total); renderer JS heap 9.5 MB at S5 export.
- signalLostCount (export payload, cumulative over the run — every SIGNAL LOST is a sample the warm/cold stats silently dropped): **0**

## Verdict

(apply the Decision rule below before filling this in)

**N = 3.** All four gates passed *measured* — the G2-deferral branch of the decision rule was never needed. G1: 127 flips over ~24 minutes on one unbroken renderer. G3: warm median 67.8ms against a 300ms gate, with the via-audit clean (40/40 dom-peek, zero backstop rescues). G4: occluded game at full 60 raf/s while the shell drifted 30.9ms over the idle window. G2: survived ~67 minutes backgrounded — including active foreground Chrome use with a ~511 MB sibling tab, a harsher condition than the protocol demanded — compacted but alive, and resumed without reload at 94.7 minutes of continuous uptime. The three-warm-channel deck (including one game) fits a single Android renderer with roughly two orders of magnitude of headroom on this device.
R3 ceiling for §8: **114 MB** (S4 peak, content-light regtest floor — see caveats; re-baseline against a mainnet node in A1 before treating it as a hard budget).

## Caveats

the spike measures Chrome-for-Android, not the Android System WebView an APK will embed. Same Blink/V8 engine, same single-renderer condition for same-site frames — but process-kill priorities differ, and the difference is **one-sided**: a backgrounded Chrome tab's renderer is more kill-exposed than a foreground app's WebView renderer, **and strictly more kill-exposed than the backgrounded Surf APK's too** — the spec's `NodeForegroundService` (§2.1/§3.7) holds the app process at foreground-service priority, and WebView's default renderer-priority policy (`RENDERER_PRIORITY_IMPORTANT`, not waived when invisible) binds the renderer to it, while a home-buttoned Chrome and its renderer drop to the cached band. Therefore: **a G2 pass transfers to the APK; a G2 fail may be a Chrome-only artifact** and never by itself decides N (see the decision rule). This is inference from documented Android/Chromium behavior, not measurement — it gets re-verified on the real WebView in A1, and RESULTS.md must say so.

Observed this run:
- **Content-light DOMs:** the regtest chain was empty (height 0, no peers), so feed/forum/wiki/chat rendered empty states — lighter than content-stuffed sessions. The PSS staircase (65/77/96 MB) is therefore a floor, not a ceiling; REEF's canvas load is content-independent and ran at full rate throughout. A mainnet-pointed re-run would firm up the ceiling; the ~11.9 GB device headroom above the 114 MB peak leaves enormous margin either way.
- Warm flips measured here are same-session remounts of small apps; the 67.8ms median has a built-in +[0,50]ms dom-peek poll-granularity overstatement (conservative direction, per the caveat in the plan).
- The input choreography drifted by one flip somewhere in S4 (86 cold recorded vs 85 designed), so the S5 idle trio was {reef, feed, forum} with FORUM current rather than FEED — gate-irrelevant (REEF warm underneath either way).
- Screen held on via `svc power stayon usb` for the whole run, including S6, per protocol.

## Decision rule (fixed in advance so the verdict can't be argued into shape after the fact)

- **N=3** iff G1–G4 all pass.
- **G2-only exception:** if G2 alone fails (G1/G3/G4 pass), record **N=3 provisional, G2 deferred** — the proxy-honesty caveat above makes a G2 fail potentially a Chrome-only artifact (backgrounded Chrome sits in the cached kill band; the APK's `NodeForegroundService` does not). Re-run S6/S7 on the real WebView in A1 and let *that* result bind. Do **not** set warmSize 2 on a G2-only failure.
- Any of G1/G3/G4 fails → set `warmSize: 2` in `channels.json`, re-run S1→S7, and record the same table for N=2. **N=2** iff its G1/G3/G4 pass (G2 treated the same way as above).
- The "single-renderer deck assumption is broken" verdict requires a **G1 failure at warmSize 2** — never G2 alone. If that happens, stop and take the numbers to the operator (the spec has no N=1 fallback; that's a §2.2 design conversation, not an implementer's call).

## A1/B device pass — G2 on real WebView + long-press (2026-07-31)

Device: Pixel 8 Pro (husky), Android 17 / SDK 37, density 360 (2.25x), physical
resolution 1008x2244 (`adb shell wm size`, matches screencap exactly). WebView
provider `com.google.android.webview` versionName 150.0.7871.181. Branch
`feat/surf-c-fleet` (A1 + B + C1), built fresh for this pass.

### Build

`npm run build:channels` succeeded and self-verified (loopback endpoint
present, no mainnet-gateway leak, `engage.worker.js` bundled 44.5 KiB with
`argon2id` present). `npm run tauri android build -- --debug --target
aarch64`: Rust cross-compile finished in **1m52s** (an incremental
`target/aarch64-linux-android` cache already existed in this worktree from a
prior build — not a cold ~20-minute build), then hit the documented symlink
failure exactly as this README predicts. The manual workaround (copy
`libsurf_app_lib.so` + `tauri.conf.json` into `gen/android`, then `gradlew.bat
assembleArm64Debug -x rustBuildArm64Debug`) completed in 30s. No deviation
from the documented recipe was needed. APK sha256
`330e524eae934116ce2f1e71937a929ed037e062555c8a68bdff234a2e074c7e`.

### Install + smoke

Force-stopped `com.swimchain.mobile` (confirmed via `netstat` that it — not
surf — was holding 9735/9736: LISTEN/ESTABLISHED before the stop, TIME_WAIT
after) and `com.swimchain.surf`, then `adb install -r` succeeded. On launch
the node bound `0.0.0.0:9735` + `127.0.0.1:9736` within ~8s and connected to
known mainnet peers. Acquisition reached a live FEED with real mainnet
content (sponsorship-gate banner correctly shown for an unsponsored
identity). Tooling note: `cmd /c "..."` from this session's Bash tool mangled
nested double-quoted paths (MSYS rewrites `/c`); worked around with a tiny
`screencap.bat` helper invoked as `cmd //c screencap.bat out.png`, same
double-slash escape convention as `taskkill //F`.

### Long-press power check (A1's deferred movement-slop item)

Strip: right-edge 56 CSS px -> ~126 physical px at this density -> x in
[882,1008]; x=970 used throughout.

1. **Still hold, 800-900ms, ON->OFF**
   (`input touchscreen swipe 970 1100 970 1100 900`): CRT collapse, green
   lantern dot, "Still broadcasting." **PASS.** Node PID and bound ports were
   unchanged across the toggle — "Still broadcasting" held up under direct
   PID inspection, not just the on-screen claim.
2. **Jitter within slop, ON->OFF** (~7-8px drift over 900ms:
   `swipe 970 1100 975 1106 900`, hypot(5,6)=7.8px < `LONG_PRESS_SLOP_PX`=10):
   toggled OFF correctly. **Jitter within the 10px slop does NOT cancel the
   press — this is the real-hardware confirmation A1's open item asked for.**
3. **Negative control, excess jitter, ON->OFF** (~28px drift:
   `swipe 970 1100 990 1120 900`, hypot(20,20)=28.3px > 10px): did **not**
   toggle; screen stayed on FEED. Confirms the slop boundary is real and
   direction-correct on a real WebView with simulated finger jitter, not
   "any touch on the strip toggles regardless of movement."
4. **Incidental finding, OFF->ON via a long stationary hold on the strip:**
   did not reliably fire across two attempts (screen stayed on the collapsed
   "Still broadcasting" state through the follow-up screenshot). Root cause
   in source, not a regression of the slop fix: `#off-screen` is
   `position:absolute; inset:0; z-index:8000` — it covers the *entire*
   screen (including the strip's z-index:6500 zone) while powered off, and
   its only listener is a plain `click` (`shell.mjs:948`), so the strip's own
   touchstart/touchmove/touchend long-press logic never runs while off. A
   plain `adb shell input tap` (a quick tap, not a long hold) powered it back
   on immediately every time, confirming the README's documented "tap
   anywhere while off" path works. Apparent cause: a genuinely stationary
   ~900ms hold seems to get intercepted by the WebView's own native
   long-press/context-gesture recognition before it synthesizes a `click` on
   release. Not in scope of the 10px-slop fix (that fix only touches the ON
   state's strip handlers) — noted here since it's a real on-device
   behavior, and the OFF->ON recovery affordance is "tap anywhere," not
   "long-press the strip," which the README already gets right.

**Verdict: long-press-to-power-off, with movement-slop tolerance, is
confirmed reliable on the real panel.**

### G2 60-minute WebView background soak (the A0/A1 standing obligation)

Renderer discovery matched the brief exactly:
`adb shell dumpsys activity processes com.swimchain.surf` lists an isolated
`ProcessRecord` whose package is `com.google.android.webview:sandboxed_process0:...`
(NOT `com.swimchain.surf`) bound via a `ServiceRecord` back to the app — its
PID is the renderer. A `dumpsys meminfo <pid>` line
`TOTAL    <pss>    <priv-dirty>  ...` (older-format regex, same one
`meminfo-sampler.ps1` already falls back to) gives TOTAL PSS.

**Attempt 1 — invalidated by an explicit human dismissal, not OS memory
pressure.** Backgrounded via Home at 22:30:58 EDT (main PID 12786, renderer
PID 12851, both confirmed alive going in). `adb logcat -d -b all` shows both
processes still alive and untouched until 22:33:56, when a `TO_FRONT`
transition tagged `debugName = QuickstepLaunch` brings the Surf task into
Overview, immediately followed by `wm_finish_activity ... app-request` at
22:33:58 and `ActivityManager: Process com.swimchain.surf (pid 12786) has
died: fg +50 FGS` / `am_foreground_service_stop ... STOP_SERVICE` /
`notification_canceled` at 22:33:59 — a textbook recents-swipe dismissal,
which force-stops a foreground service by Android design regardless of
`NodeForegroundService`. This is a human closing the app from the task
switcher, not evidence about natural backgrounding survival; the sampler
correctly reported `NO MATCH` for the renderer PID starting at the very next
60s tick (22:34:22), confirming the sampling method itself is accurate.

**Incidental corroborating evidence.** Separately, main PID 12786 was
observed alive and unchanged both before and after an *uncontrolled* ~54-minute
window earlier in this same pass, during which the device left adb range
entirely (physically reclaimed by its actual owner — confirmed via `dumpsys
window` showing Messenger/Chrome in the foreground, and later `adb devices`
returning empty even after `kill-server`/`start-server`). That single process
instance's total lifetime — original launch through the 22:33:59 recents-kill
above — spanned roughly 87 minutes, the large majority of it backgrounded and
never touched by me, ending only when a human explicitly swiped it away. Not
a controlled measurement (no PSS trend was sampled during the adb-disconnected
stretch), but consistent with the formal result below.

**Attempt 2 — clean, complete, 60+ minutes.** Relaunched (cold process
restart; main PID 8347, renderer PID 8399), re-warmed FEED -> WIKI -> REEF,
backgrounded via Home at **22:44:48 EDT**. Sampled both PIDs' TOTAL PSS every
~60s via a bash loop around `adb shell dumpsys meminfo <pid>` (same metric
`meminfo-sampler.ps1` reads, ported off-device since this Windows session
runs a Bash tool rather than PowerShell natively). Returned to foreground at
**23:45:29 EDT** — **60m 41s** backgrounded, screen left to sleep naturally
(a realistic soak, not held on).

| | Renderer (PID 8399) | Main app (PID 8347, hosts the in-process node) |
|---|---|---|
| Foreground, just before backgrounding | 105.5 MB | 412.6 MB |
| ~1 min after backgrounding | 82.0 MB | 218.9 MB |
| Steady mid-soak plateau (~t+10 to t+35 min) | ~64-76 MB, slowly stepping down | ~213-221 MB, flat |
| Final sample, t=60 min | **42.0 MB** | **184.3 MB** |
| Foreground again, post-restore | 92.9 MB | 387.4 MB |

PID continuity: **both PIDs identical** at the start and end of the
60-minute window (confirmed via `dumpsys activity processes
com.swimchain.surf` immediately before backgrounding and immediately after
`am start` brought the task back — the log line read "Warning: Activity not
started, its current task has been brought to the front", i.e. a resume of
the existing task, not a fresh launch). Zero `NO MATCH`/dead samples across
61 consecutive samples. Ports 9735/9736 stayed bound (`LISTEN`) the entire
time — the node itself never stopped.

**Restore behavior: warm power-on, not a cold reload.** REEF came back on
the exact same "Setting up your access..." retry state it was in before
backgrounding (not the landing "Play" card, not a fresh boot/bloom). Flipping
to WIKI and FEED showed both fully intact — FEED's live WebSocket "N new
posts" pill (`useNodeEvents` -> `/ws`) was still live and surfaced a real new
post after the flip, meaning even the real-time network path survived the
hour, not just the static DOM.

**G2 verdict: SURVIVED.** A full, clean, PID-verified 60-minute background
window on the real Android System WebView (not the A0 Chrome-tab proxy),
with a healthy compaction trend (renderer -60%, main process -55% from
foreground peak, no growth/leak signature) and a warm, not cold, restore.
This closes the standing A0/A1 G2 obligation. The one invalidated attempt
(explicit recents-swipe kill) is a reminder that a foreground service is
only proof against *OS* background-priority kills, never against a user
explicitly closing the app from Overview — expected Android behavior, not a
Surf defect.

### Caveats

- **Device sharing was real, not hypothetical, this pass.** The phone is the
  operator's own daily device. Twice during setup it was reclaimed for
  genuine personal use (Messenger/Chrome/SMS, confirmed via non-invasive
  `dumpsys window` focus polling — screenshots showing personal content were
  deleted immediately and not further acted on), once escalating to a full
  physical USB disconnect (~54 min) and once to an explicit recents-swipe
  that killed the first G2 attempt (see above). Budget real wall-clock slack
  for this on a shared device — the technical portions of this pass (build,
  install, long-press, the clean G2 run) totaled under 90 minutes; total
  session time was much longer purely from waiting out device contention.
- REEF's on-chain game-key registration ("Waiting for approval...") never
  completed for this unsponsored identity in either attempt — expected,
  matches the FEED/WIKI sponsorship-gate banners also shown throughout. This
  did not block G2: "warm" only required the channel mounted/settled, not
  gameplay, and REEF held its exact registration-retry state across the full
  60-minute background window same as the other two channels.
