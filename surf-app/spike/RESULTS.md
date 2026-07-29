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
