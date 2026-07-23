# Reef First-Run Tutorial + Plain-First Copy — Design

**Date:** 2026-07-22
**Status:** Approved
**Motivation:** Real first-time-visitor feedback: the /reef page never says it's a game, and the
bottom-of-board instructions are jargon soup ("vitality", "tide", "tend", "contest", "reckoning" —
six invented terms, none defined). The player bounced.

## Success criterion

Someone who has never heard of Swimchain knows within 30 seconds that this is a game, what to
click first, and why — without reading a wall of text.

## Scope

All changes are in `reef-client/` (plus deploy). `reefEngine.ts` fold/rules are untouched.

### 1. Landing screen (no-identity state, `App.tsx`)

- First sentence says *game*: "🪸 **The Reef** — a territory game. Grow a coral reef, keep it
  alive, outlast your rivals."
- Button text changes **"Create an identity" → "Play"**. Identity creation happens behind it.
- Fine print keeps the honest detail: "Playing creates a game key stored only in this browser —
  no account, no email."
- One retained line of world-flavor is fine after the plain sentence (e.g. "No server runs it —
  the chain is the world"), but never before it.

### 2. Guided tutorial — coach-marks on the live board

Small cards anchored near the element they explain. Never a fullscreen modal: clicking the board
is how the player advances. Steps fire on **real game events**:

| Step | Trigger | Teaches |
|------|---------|---------|
| 1 Plant | board visible, player owns 0 cells | "Click any open square to plant your first coral." Plantable tiles pulse gently. |
| 2 Grow | player's first cell exists in view state | "That's yours — permanently. It cost 2 energy ↓. Grow by clicking squares **next to** your coral." Anchored at the energy pips. |
| 3 Tide | player owns ≥ 2 cells | "Every 8 moves the **tide** turns: all coral shrinks a little and your energy refills. Click your own coral to **tend** it — free, restores its health." Anchored at the tide meter. |
| 4 Scoring | first TideReport shown | One plain line added to the existing report lesson: "Each tide you bank points equal to your coral's total health. Most points when the season ends (5 tides) wins." |
| Contextual: Strike | first time a `contest` intent is affordable/visible for this player | "Enemy coral on your border? Click it to strike (−3 energy). Break it, then take the square." One-time tip. |

- Every card has **Got it** and **Skip tutorial** (skip ends all future steps, including the
  contextual strike tip).
- Progress persists in localStorage **per browser** (`reef-tutorial`), not per identity —
  teaching is per-human. Storage-less contexts (private browsing) fall back to in-memory: tutorial
  shows once per session.
- Tutorial never blocks input; cards are informational and dismissible.

### 3. Bottom text-wall replaced by a "?" reference panel

- New persistent **"?" button** in the game bar opens a compact "How to play" panel — the full
  plain-first reference (goal, the three clicks, energy costs, tide, seasons, visual key).
  Also the re-entry point if the tutorial was skipped.
- Under the board, only two short lines remain:
  - "**grow**: click open water beside your reef · **tend** (free): click your own coral ·
    **strike**: click enemy coral on your border"
  - "Coral shrinks as its health drops — a pulsing square dies next tide unless you tend it."
- The current two-sentence lore paragraph ("vitality you keep alive… feeds the current…") moves
  into the "?" panel, *after* the plain rules.

### 4. Ambient copy goes plain-first

- "N tides to the reckoning" → "season ends in N tides".
- Costs line stays but reads plainly: "grow −2 · strike −3 · tend free (4/tide)".
- Flavor vocabulary (tide, tend, reckoning) remains everywhere *after* the tutorial/panel has
  defined it; every mechanic is stated in plain words at the moment it is first taught.
- Naming note: player-facing verb for `contest` is **strike** (the notice copy already says
  "You struck the coral…"); internal intent names unchanged.

## Mechanics

- New `reef-client/src/tutorial.ts`: a pure step machine — `advance(step, snapshot) → step` where
  the snapshot is derived from existing App state (my cell count, first-report flag, contest
  intent available). Unit-testable without DOM.
- A `TutorialCard` component renders the current step's card, positioned via an anchor prop
  (board / energy pips / tide meter).
- App.tsx drives it from state it already computes each poll; no engine or RPC changes.
- Tile pulsing for step 1 reuses the existing intent classification (`intentAt` returns `seed`
  for every open tile when the player owns nothing).

## Error handling

- localStorage unavailable → in-memory fallback (same pattern as tide-ack).
- Tutorial state corrupt/unknown → treat as complete (never trap a returning player in step 1).
- Cards never gate actions; a player who ignores them entirely can play the whole game.

## Testing

- Unit tests for the step machine (each trigger, skip, corrupt-state fallback).
- Manual BVT in a fresh browser profile: landing → Play → steps 1–4 → "?" panel; plus a
  second visit confirming nothing re-fires.
- Deploy via `scripts/deploy-web-clients.sh` (bundle-endpoint verification per project rule).
