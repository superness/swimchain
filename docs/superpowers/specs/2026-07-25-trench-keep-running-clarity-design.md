# The Trench: "Keep it burning" clarity pass — design

**Date:** 2026-07-25
**Status:** Approved (operator, 2026-07-25)
**Problem:** Players found a claim, close the game, check back tomorrow, and find
nothing happened (or things decayed). The core loop — your lantern burns only
while The Trench is running, and brightness drives yield and decay — is never
stated plainly. Worse, the final onboarding card actively teaches the wrong
behavior: "Come back tomorrow."

## Why players miss it today

- Beat 6 (last Guided Descent card, `App.tsx`): "That's the game: farms grow
  while you're lit. Come back tomorrow." — instructs close-and-check-tomorrow.
- Beat 3: "Your lantern pulses on its own" — no mention that it only pulses
  while the game runs.
- The one honest sentence ("Burns while the game runs") lives in the optional
  How-to-Play panel and the coach card only.
- The lantern HUD shows session uptime only as a hover tooltip.
- The Tauri shell kills the node the instant the window closes — silently.

The stakes: LIT needs 25 heartbeats over the trailing 7 days at max 6/day
(≈14h/day running). Opening the app briefly once a day yields ~7/week — below
even DIM (8). DARK means 4× structure decay and ¼ farm yield.

## Scope (approved): copy fixes + the two teaching moments

No engine changes, no Rust changes, no new run modes (tray mode explicitly
deferred). Everything ships in the trench-client UI; reaches players via the
next TheTrench.exe build.

### 1. Copy fixes

- **Beat 3** → "Your lantern pulses while The Trench is running — each pulse
  feeds your brightness. Close the game, and the pulsing stops."
- **Beat 6** → "That's the game: farms grow while you're lit — and your lantern
  burns only while The Trench runs. Leave it running; check in tomorrow."
- **Coach card `lantern`** (fallback for descent-skippers) → "Your lantern
  burns only while the game runs. Close it and the light goes out — brighter
  lantern, faster farms."
- **How-to-Play** "Your lantern" card gains one bolded line: "Only burns while
  the game is open."

All copy stays diegetic (spec §4 diegetic-first rule); numbers keep
interpolating engine constants.

### 2. HUD honesty (Homestead lantern panel)

Session uptime moves out of the hover `title` into a visible line:
"burning 2h 14m — goes dark when the game closes." Always on screen, fine-print
sized, no modal.

### 3. Quit warning (teaching moment #1)

Frontend-only interception of window close under Tauri:
`window.__TAURI__` global (already the codebase idiom — see `nodeRpc.ts`'s
documented gotcha about NOT importing `@tauri-apps/api`), via
`onCloseRequested` + `preventDefault()`. The existing Rust `Destroyed` handler
still stops the node when we `destroy()` — no Rust code changes. One config
addition: the shell currently ships NO capability file (`gen/schemas/
capabilities.json` is `{}`), so the webview lacks the `core:event`/
`core:window` permissions the JS close-interception APIs need — add
`src-tauri/capabilities/default.json` granting `core:default` +
`core:window:allow-destroy`. If the permission plumbing ever fails, the
degradation is graceful: close proceeds uninterceped, exactly as today.

- Shown only when the player has a claim; otherwise close proceeds untouched.
- In-game overlay in the existing `.overlay`/`.help-panel` idiom:
  "Your lantern goes dark while The Trench is closed — structures decay 4× and
  farms slow to a quarter. **[Stay lit]** [Quit anyway]".
- Non-Tauri (dev browser): no hook; everything else works unchanged.

### 4. Away recap / dark-login reminder (teaching moment #2)

When `ownState` first loads, show a one-shot recap card if EITHER trigger
fires (operator addition 2026-07-25: "user logs in and they are dark because
they have been offline — remind them"):

- the newest accepted heartbeat is ≥24h old ("away" recap), OR
- the projected brightness at login is **DARK** (dark-login reminder, even if
  the absence was shorter than 24h).

Card content: days away (0 for same-day), current brightness tier, trailing
7-day beat count toward LIT, any **new ruins** ("The abyss took your kelp
farm"), damaged structures' health, and the recovery line ("Leave The Trench
running to climb back to LIT").

- Suppressed while the Guided Descent is active.
- Shown at most once per UTC day (localStorage stamp, `trench-recap-day`);
  storage-less browsers degrade to once-per-session like every existing hint.
- Derivation is a pure module `ui/src/lib/awayRecap.ts`:
  `(ClaimState, nowMs) → RecapFacts | null` — unit-tested with the tsx suite
  next to `trenchEngine.test.ts`. New-ruin detection compares fold state
  against a localStorage set of already-mourned ruin indices.

## Files touched

`App.tsx`, `Homestead.tsx`, `CoachCard.tsx`, `HowToPlay.tsx`, `styles.css`,
new `lib/awayRecap.ts` + tests. Nothing under `src-tauri/` or `src/`.

## Testing

- `awayRecap.ts` pure derivations: unit tests (tsx runner, engine-test idiom).
- Quit-warning gating (`claim ↔ no claim`, Tauri ↔ browser): pure predicate
  unit-tested; interception path verified manually in the built exe.
- Copy + HUD + overlays: screenshot-verified in the running app
  (production-value bar).

## Deferred

- Minimize-to-tray "keep burning in background" (fixes the incentive, not just
  the messaging) — separate release-sized effort.
- Website/how-to-play page parity for the same copy.
