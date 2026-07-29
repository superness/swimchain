# Surf A0 — measurement results (YYYY-MM-DD)

Device: <model>, Android <version>, <RAM> GB. Chrome <version>.
Node: <mode, height, peer count during run>. Single renderer confirmed: <yes/no (pids)>.

## Gates (warmSize=3, lineup feed+forum+wiki+chat+reef, warm incl. REEF)

| Gate | Pass condition | Measured | Verdict |
|---|---|---|---|
| G1 foreground survival | S4: 15-min flip soak, zero renderer deaths | | |
| G2 background survival | S6/S7: 60-min background, no reload on return | | |
| G3 warm flip | median <= 300ms over >= 20 warm flips (p95 recorded). Audit `warmViaCounts` in the export — if more than a handful of warm samples are `via=dom-peek-backstop`, the median under-reports paint on a contended device; treat it as suspect and investigate before ruling N=3. | | |
| G4 event-loop health | S5: occluded REEF raf/s > 0 AND shell driftMax < 250ms **measured over the S5 idle window only (drift gauge reset at S5 start)** | | |

## Numbers

- PSS @ 1 / 2 / 3 warm: ___ / ___ / ___ MB (steady-state)
- PSS peak during S4: ___ MB; trend during S6: ___
- Warm flips: n=___, median=___ms, p95=___ms. Cold: median=___ms vs 2s gate.
- Longtasks per channel over S4: ___
- signalLostCount (export payload, cumulative over the run — every SIGNAL LOST is a sample the warm/cold stats silently dropped): ___

## Verdict

(apply the Decision rule below before filling this in)

**N = ___.** <One paragraph: which gates carried the decision.>
R3 ceiling for §8: ___ MB (or R2 = ___ MB if N=2).

## Caveats

the spike measures Chrome-for-Android, not the Android System WebView an APK will embed. Same Blink/V8 engine, same single-renderer condition for same-site frames — but process-kill priorities differ, and the difference is **one-sided**: a backgrounded Chrome tab's renderer is more kill-exposed than a foreground app's WebView renderer, **and strictly more kill-exposed than the backgrounded Surf APK's too** — the spec's `NodeForegroundService` (§2.1/§3.7) holds the app process at foreground-service priority, and WebView's default renderer-priority policy (`RENDERER_PRIORITY_IMPORTANT`, not waived when invisible) binds the renderer to it, while a home-buttoned Chrome and its renderer drop to the cached band. Therefore: **a G2 pass transfers to the APK; a G2 fail may be a Chrome-only artifact** and never by itself decides N (see the decision rule). This is inference from documented Android/Chromium behavior, not measurement — it gets re-verified on the real WebView in A1, and RESULTS.md must say so.

<Anything observed during the run goes here, appended after the paragraph above.>

## Decision rule (fixed in advance so the verdict can't be argued into shape after the fact)

- **N=3** iff G1–G4 all pass.
- **G2-only exception:** if G2 alone fails (G1/G3/G4 pass), record **N=3 provisional, G2 deferred** — the proxy-honesty caveat above makes a G2 fail potentially a Chrome-only artifact (backgrounded Chrome sits in the cached kill band; the APK's `NodeForegroundService` does not). Re-run S6/S7 on the real WebView in A1 and let *that* result bind. Do **not** set warmSize 2 on a G2-only failure.
- Any of G1/G3/G4 fails → set `warmSize: 2` in `channels.json`, re-run S1→S7, and record the same table for N=2. **N=2** iff its G1/G3/G4 pass (G2 treated the same way as above).
- The "single-renderer deck assumption is broken" verdict requires a **G1 failure at warmSize 2** — never G2 alone. If that happens, stop and take the numbers to the operator (the spec has no N=1 fallback; that's a §2.2 design conversation, not an implementer's call).
