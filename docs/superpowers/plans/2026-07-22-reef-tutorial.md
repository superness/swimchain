# Reef First-Run Tutorial + Plain-First Copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-time /reef visitor knows within 30 seconds that this is a game, what to click first, and why — via a coach-mark tutorial on the live board plus plain-first copy.

**Architecture:** A pure tutorial step machine (`src/tutorial.ts`, localStorage-persisted per browser) drives small dismissible coach-mark cards rendered inline next to the element they explain. Steps advance on real game events (cells the player owns), never timers. The bottom text-wall moves into a "?" reference panel; ambient copy states every mechanic plainly the first time it appears.

**Tech Stack:** React 18 + TypeScript + Vite (reef-client). Tests are plain `tsx`-run assert scripts (project convention — no vitest). `reefEngine.ts` fold/rules are **untouched**.

**Spec:** `docs/superpowers/specs/2026-07-22-reef-tutorial-design.md`

## Global Constraints

- Player-facing verb for the `contest` intent is **strike** everywhere; internal names unchanged.
- Player-facing word for `vitality` is **health**; numbers unchanged (`{v}/{MAX_VITALITY}`).
- Tutorial cards NEVER block input — no fullscreen modal for steps; clicking the board is how the player advances.
- Persistence key `reef-tutorial`, per browser (not per identity). Corrupt/unknown stored state → treated as complete. Storage-less → in-memory (once per session).
- Every rule number in copy comes from engine constants (`COST_GROW`=2, `COST_CONTEST`=3, `CONTEST_DAMAGE`=2, `TEND_CAP`=4, `EPOCH_MOVES`=8, `REGEN_BASE`=2, `MAX_BUDGET`=14, `SEASON_EPOCHS`=5, `MAX_VITALITY`=6) — never hardcoded literals.
- Engine facts the copy must not contradict: tend restores health to FULL; strike does −2 health and at ≤0 the striker captures the cell at 1 health; at season end the score tally resets but coral persists; the first coral (`seed`) can go anywhere, later growth must be adjacent.
- All work in `reef-client/`. Working branch: current (`launch-polish-and-fixes`). Conventional commits.

---

### Task 1: Tutorial step machine (pure logic + tests)

**Files:**
- Create: `reef-client/src/tutorial.ts`
- Create: `reef-client/src/tutorial.test.ts`
- Modify: `reef-client/package.json` (test script)

**Interfaces:**
- Consumes: nothing (pure module; no DOM, no engine imports).
- Produces (used by Task 2):
  - `type TutorialStep = 'plant' | 'grow' | 'tide' | 'done'`
  - `type TutorialCardKind = 'plant' | 'grow' | 'tide' | 'strike'`
  - `interface TutorialState { step: TutorialStep; acked: boolean; strikeTipSeen: boolean }`
  - `interface TutorialSnapshot { myCells: number; contestVisible: boolean }`
  - `initialTutorial(): TutorialState`
  - `advance(t: TutorialState, snap: TutorialSnapshot): TutorialState` — event-driven step advancement (returns the SAME object if nothing changed)
  - `ack(t: TutorialState): TutorialState` — "Got it": hides current card; on `tide` completes the tutorial
  - `skip(t: TutorialState): TutorialState` — ends everything incl. the strike tip
  - `dismissStrikeTip(t: TutorialState): TutorialState`
  - `visibleCard(t: TutorialState, snap: TutorialSnapshot): TutorialCardKind | null`
  - `parseTutorial(raw: string | null): TutorialState` (pure; exported for tests)
  - `loadTutorial(): TutorialState` / `saveTutorial(t: TutorialState): void`

- [ ] **Step 1: Write the failing test**

Create `reef-client/src/tutorial.test.ts`:

```ts
/**
 * Tutorial step machine tests (pure logic — no DOM).
 * Run with: npx tsx src/tutorial.test.ts
 */
import {
  initialTutorial,
  advance,
  ack,
  skip,
  dismissStrikeTip,
  visibleCard,
  parseTutorial,
} from './tutorial';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  }
}

const snap = (myCells: number, contestVisible = false) => ({ myCells, contestVisible });

// ── fresh state: plant card shows
{
  const t = initialTutorial();
  check('fresh: step is plant', t.step === 'plant', t);
  check('fresh: plant card visible', visibleCard(t, snap(0)) === 'plant');
}

// ── planting advances plant → grow
{
  const t = advance(initialTutorial(), snap(1));
  check('plant→grow on first cell', t.step === 'grow', t);
  check('grow card visible', visibleCard(t, snap(1)) === 'grow');
}

// ── second cell advances grow → tide
{
  const t = advance(advance(initialTutorial(), snap(1)), snap(2));
  check('grow→tide on second cell', t.step === 'tide', t);
}

// ── chained advancement: 0 → 2 cells in a single call
{
  const t = advance(initialTutorial(), snap(2));
  check('chained: plant→tide in one advance', t.step === 'tide', t);
}

// ── no-change advance returns the same object (App uses identity to skip saves)
{
  const t = initialTutorial();
  check('idle advance is identity', advance(t, snap(0)) === t);
}

// ── ack hides the current card; the step still advances on its event
{
  const t = ack(initialTutorial());
  check('ack on plant keeps step', t.step === 'plant', t);
  check('ack on plant hides card', visibleCard(t, snap(0)) === null);
  const t2 = advance(t, snap(1));
  check('acked plant still advances', t2.step === 'grow', t2);
  check('new step re-shows a card', visibleCard(t2, snap(1)) === 'grow');
}

// ── ack on tide completes the tutorial
{
  const t = ack(advance(initialTutorial(), snap(2)));
  check('ack on tide → done', t.step === 'done', t);
  check('done: no card', visibleCard(t, snap(2)) === null);
}

// ── skip ends everything, including the strike tip
{
  const t = skip(initialTutorial());
  check('skip → done', t.step === 'done', t);
  check('skip: no strike tip ever', visibleCard(t, snap(5, true)) === null);
}

// ── strike tip: appears on the first contest opportunity, exactly once
{
  const done = ack(advance(initialTutorial(), snap(2)));
  check('no strike tip without opportunity', visibleCard(done, snap(2, false)) === null);
  check('strike tip on first opportunity', visibleCard(done, snap(2, true)) === 'strike');
  const seen = dismissStrikeTip(done);
  check('strike tip never returns', visibleCard(seen, snap(2, true)) === null);
}

// ── strike tip mid-tutorial: only when the step card is acked (step card outranks it)
{
  const t = advance(initialTutorial(), snap(1)); // step grow, card showing
  check('step card outranks strike tip', visibleCard(t, snap(1, true)) === 'grow');
  const t2 = ack(t);
  check('acked step lets strike tip show', visibleCard(t2, snap(1, true)) === 'strike');
}

// ── persistence parsing
{
  check('parse null → fresh', parseTutorial(null).step === 'plant');
  const round = parseTutorial(JSON.stringify(ack(advance(initialTutorial(), snap(1)))));
  check('parse roundtrip keeps step+ack', round.step === 'grow' && round.acked === true, round);
  const corrupt = parseTutorial('not json{');
  check('corrupt → done', corrupt.step === 'done', corrupt);
  check('corrupt → strike tip suppressed', corrupt.strikeTipSeen === true, corrupt);
  const badStep = parseTutorial(JSON.stringify({ step: 'zebra' }));
  check('unknown step → done', badStep.step === 'done', badStep);
}

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exitCode = failures ? 1 : 0;
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `reef-client/`): `npx tsx src/tutorial.test.ts`
Expected: FAIL — `Cannot find module './tutorial'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `reef-client/src/tutorial.ts`:

```ts
/**
 * First-run tutorial state machine (pure — no DOM, no React, no engine).
 * Steps advance on REAL game events (cells the player owns), never timers:
 *   plant → grow → tide → done, plus a one-time contextual 'strike' tip.
 * "Got it" hides the current card (the step still advances on its event);
 * on the final event-less 'tide' step it completes the tutorial. "Skip
 * tutorial" ends everything, including the strike tip.
 * Persisted per BROWSER (localStorage) — teaching is per-human, not per
 * identity. Corrupt/unknown stored state degrades to done so a returning
 * player can never be trapped back in step 1; storage-less contexts fall
 * back to in-memory (tutorial shows once per session).
 */
export type TutorialStep = 'plant' | 'grow' | 'tide' | 'done';
export type TutorialCardKind = 'plant' | 'grow' | 'tide' | 'strike';

export interface TutorialState {
  step: TutorialStep;
  /** The CURRENT step's card was dismissed with "Got it" (hidden until the step advances). */
  acked: boolean;
  strikeTipSeen: boolean;
}

export interface TutorialSnapshot {
  /** Living coral cells the player owns in the current fold state. */
  myCells: number;
  /** True when striking an enemy cell is currently possible (adjacency + budget). */
  contestVisible: boolean;
}

export const initialTutorial = (): TutorialState => ({
  step: 'plant',
  acked: false,
  strikeTipSeen: false,
});

const completed = (): TutorialState => ({ step: 'done', acked: false, strikeTipSeen: true });

export function advance(t: TutorialState, snap: TutorialSnapshot): TutorialState {
  let step = t.step;
  if (step === 'plant' && snap.myCells >= 1) step = 'grow';
  if (step === 'grow' && snap.myCells >= 2) step = 'tide';
  return step === t.step ? t : { ...t, step, acked: false };
}

export function ack(t: TutorialState): TutorialState {
  if (t.step === 'done') return t;
  if (t.step === 'tide') return { ...t, step: 'done', acked: false };
  return t.acked ? t : { ...t, acked: true };
}

export function skip(t: TutorialState): TutorialState {
  return { ...t, step: 'done', acked: false, strikeTipSeen: true };
}

export function dismissStrikeTip(t: TutorialState): TutorialState {
  return t.strikeTipSeen ? t : { ...t, strikeTipSeen: true };
}

export function visibleCard(t: TutorialState, snap: TutorialSnapshot): TutorialCardKind | null {
  if (t.step !== 'done' && !t.acked) return t.step;
  if (!t.strikeTipSeen && snap.contestVisible) return 'strike';
  return null;
}

// ── persistence ──────────────────────────────────────────────────────────────
const KEY = 'reef-tutorial';
const STEPS: readonly TutorialStep[] = ['plant', 'grow', 'tide', 'done'];
let mem: TutorialState | null = null; // storage-less fallback (private browsing)

export function parseTutorial(raw: string | null): TutorialState {
  if (raw === null) return initialTutorial();
  try {
    const p = JSON.parse(raw) as Partial<TutorialState> | null;
    if (p && typeof p === 'object' && STEPS.includes(p.step as TutorialStep)) {
      return { step: p.step as TutorialStep, acked: !!p.acked, strikeTipSeen: !!p.strikeTipSeen };
    }
  } catch {
    /* not JSON */
  }
  return completed(); // never trap a returning player in step 1
}

export function loadTutorial(): TutorialState {
  try {
    return parseTutorial(localStorage.getItem(KEY));
  } catch {
    return mem ?? initialTutorial();
  }
}

export function saveTutorial(t: TutorialState): void {
  mem = t;
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable — mem keeps it for this session */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `reef-client/`): `npx tsx src/tutorial.test.ts`
Expected: every line `  ok  …`, final line `all ok`, exit code 0.

- [ ] **Step 5: Add the test to the npm test script**

In `reef-client/package.json`, change:

```json
    "test": "tsx src/lib/reefEngine.tie.test.ts"
```

to:

```json
    "test": "tsx src/lib/reefEngine.tie.test.ts && tsx src/tutorial.test.ts"
```

Run: `npm test` (from `reef-client/`). Expected: both suites pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add reef-client/src/tutorial.ts reef-client/src/tutorial.test.ts reef-client/package.json
git commit -m "feat(reef): first-run tutorial step machine (pure, tested)"
```

---

### Task 2: Coach-mark UI — TutorialCard, App wiring, tile pulsing, CSS

**Files:**
- Create: `reef-client/src/TutorialCard.tsx`
- Modify: `reef-client/src/App.tsx`
- Modify: `reef-client/src/Reef.tsx`
- Modify: `reef-client/src/styles.css` (append)

**Interfaces:**
- Consumes (Task 1): everything listed in Task 1's Produces block.
- Consumes (engine, already exported): `COST_GROW`, `COST_CONTEST`, `CONTEST_DAMAGE`, `EPOCH_MOVES`, `myBudget`.
- Produces: `TutorialCard({ kind: TutorialCardKind; onGotIt: () => void; onSkip: (() => void) | null })` component; `Reef` gains prop `highlightSeeds: boolean`.

- [ ] **Step 1: Create the TutorialCard component**

Create `reef-client/src/TutorialCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { TutorialCardKind } from './tutorial';
import { COST_GROW, COST_CONTEST, CONTEST_DAMAGE, EPOCH_MOVES } from './lib/reefEngine';

// Plain-first teaching copy: every mechanic in plain words, flavor terms
// introduced in bold at the moment they're earned (see design spec §2).
const COPY: Record<TutorialCardKind, ReactNode> = {
  plant: (
    <>
      <strong>Welcome to The Reef 🪸</strong> — a territory game: grow a coral reef, keep it
      alive, outlast your rivals. <strong>Click any open square</strong> to plant your first
      coral.
    </>
  ),
  grow: (
    <>
      That coral is yours — permanently. It cost <strong>{COST_GROW} energy</strong> (the bar
      below). Grow by clicking squares <strong>next to</strong> your coral (−{COST_GROW} each).
    </>
  ),
  tide: (
    <>
      Every <strong>{EPOCH_MOVES} moves</strong> — counting everyone's — the{' '}
      <strong>tide</strong> turns (meter below): all coral shrinks a little and your energy
      refills. Click your own coral to <strong>tend</strong> it — free, restores full health.
    </>
  ),
  strike: (
    <>
      Enemy coral on your border? Click it to <strong>strike</strong> (−{COST_CONTEST} energy,
      −{CONTEST_DAMAGE} to its health). Break it, then take the square.
    </>
  ),
};

/** A small inline coach-mark card, rendered next to the element it explains.
 *  Never a modal — the board stays fully clickable; clicking IS how you advance. */
export function TutorialCard({
  kind,
  onGotIt,
  onSkip,
}: {
  kind: TutorialCardKind;
  onGotIt: () => void;
  onSkip: (() => void) | null;
}) {
  return (
    <div className={`tut-card tut-${kind}`} role="note">
      <div className="tut-body">{COPY[kind]}</div>
      <div className="tut-actions">
        <button className="btn primary" onClick={onGotIt}>Got it</button>
        {onSkip && <button className="link fine" onClick={onSkip}>Skip tutorial</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire state + snapshot + advancement into App.tsx**

All hooks go BEFORE the early returns at `if (idLoading)` — hooks rules.

(a) Add imports after the existing `./lib/reefEngine` import block (which already imports `myBudget` and `COST_CONTEST`):

```tsx
import { TutorialCard } from './TutorialCard';
import {
  advance as tutAdvance,
  ack as tutAck,
  skip as tutSkip,
  dismissStrikeTip,
  visibleCard,
  loadTutorial,
  saveTutorial,
  type TutorialState,
  type TutorialSnapshot,
} from './tutorial';
```

(b) Add state, right after the sponsorship state block (`const sponsoringRef = useRef(false);`):

```tsx
  // First-run tutorial: coach-marks on the live board (see src/tutorial.ts).
  const [tutorial, setTutorial] = useState<TutorialState>(() => loadTutorial());
  const applyTutorial = useCallback((fn: (t: TutorialState) => TutorialState) => {
    setTutorial((t) => {
      const next = fn(t);
      if (next !== t) saveTutorial(next);
      return next;
    });
  }, []);
```

(c) Add the snapshot + advancement, right after the "Auto-dismiss a notice" effect:

```tsx
  // Tutorial snapshot, derived from chain state: how many cells are mine, and
  // whether striking an enemy is currently possible (adjacency + budget).
  const tutSnap: TutorialSnapshot = useMemo(() => {
    if (!state || !publicKeyHex) return { myCells: 0, contestVisible: false };
    const mine = (o: string) => o === publicKeyHex || o === address;
    const myKeys = new Set<string>();
    for (const [k, c] of state.cells) if (mine(c.owner)) myKeys.add(k);
    let contestVisible = false;
    if (myKeys.size > 0 && myBudget(state, publicKeyHex, address ?? '') >= COST_CONTEST) {
      outer: for (const [k, c] of state.cells) {
        if (mine(c.owner)) continue;
        const [x, y] = k.split(',').map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (myKeys.has(`${x + dx},${y + dy}`)) {
            contestVisible = true;
            break outer;
          }
        }
      }
    }
    return { myCells: myKeys.size, contestVisible };
  }, [state, publicKeyHex, address]);

  // Steps advance on real events (the snapshot), never timers.
  useEffect(() => {
    applyTutorial((t) => tutAdvance(t, tutSnap));
  }, [tutSnap, applyTutorial]);
```

- [ ] **Step 3: Render the cards in App.tsx**

(a) In the render body, right after `const myCareer = …`:

```tsx
  // Which coach-mark to show. Hidden while a move is in flight or the tide
  // report is up — a card would flicker or mislead mid-ceremony.
  const tutCard = openId && view && !tideReport && !mining ? visibleCard(tutorial, tutSnap) : null;
```

(b) Lobby nudge — inside the `<section className="lobby">`, right after the `.lobby-head` div:

```tsx
          {tutorial.step !== 'done' && regions.length > 0 && (
            <p className="muted">Pick a reef below to dive in — or found your own. Everyone in a reef shares the same water.</p>
          )}
```

(c) Plant/strike cards render directly ABOVE the board. Insert immediately before `<Reef` (after the champion-banner block):

```tsx
            {(tutCard === 'plant' || tutCard === 'strike') && (
              <TutorialCard
                kind={tutCard}
                onGotIt={() => applyTutorial(tutCard === 'strike' ? dismissStrikeTip : tutAck)}
                onSkip={tutCard === 'plant' ? () => applyTutorial(tutSkip) : null}
              />
            )}
```

(d) Pass the pulse prop to the board — add to the `<Reef … />` element:

```tsx
              highlightSeeds={tutCard === 'plant'}
```

(e) Grow card anchors at the energy bar — insert immediately AFTER the `</div>` closing `<div className="budget">`:

```tsx
              {tutCard === 'grow' && (
                <TutorialCard kind="grow" onGotIt={() => applyTutorial(tutAck)} onSkip={() => applyTutorial(tutSkip)} />
              )}
```

(f) Tide card anchors at the tide meter — insert immediately AFTER the `</div>` closing `<div className={`tide-meter…`}>`:

```tsx
              {tutCard === 'tide' && (
                <TutorialCard kind="tide" onGotIt={() => applyTutorial(tutAck)} onSkip={() => applyTutorial(tutSkip)} />
              )}
```

- [ ] **Step 4: Tile pulsing in Reef.tsx**

(a) Add to the `Props` interface:

```tsx
  /** Pulse every plantable tile (tutorial step 1: "click any open square"). */
  highlightSeeds: boolean;
```

(b) Add `highlightSeeds` to the destructured props of `Reef`.

(c) In the cell render loop, right after `if (intent) cls += \` ${intent.kind}\` + (actionable ? ' act' : ' broke');` add:

```tsx
        if (highlightSeeds && intent?.kind === 'seed' && actionable) cls += ' tut-pulse';
```

- [ ] **Step 5: Append coach-mark CSS to styles.css**

```css
/* ── first-run tutorial coach-marks ─────────────────────────────────────────── */
.tut-card {
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: 6px;
  border: 1px solid var(--shallow);
  background: rgba(110, 211, 194, 0.08);
  font-size: 14px;
  line-height: 1.45;
  animation: tut-in 0.35s ease-out;
}
@keyframes tut-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
.tut-actions { display: flex; gap: 14px; align-items: center; margin-top: 10px; }
.tut-actions .btn { padding: 4px 14px; font-size: 13px; }
.cell.tut-pulse { animation: tut-pulse 1.6s ease-in-out infinite; }
@keyframes tut-pulse {
  0%, 100% { box-shadow: inset 0 0 0 1px rgba(110, 211, 194, 0.25); }
  50% { box-shadow: inset 0 0 0 3px rgba(110, 211, 194, 0.7); }
}
```

- [ ] **Step 6: Typecheck + tests**

Run (from `reef-client/`): `npm run build`
Expected: `tsc -b` and `vite build` both succeed, no TS errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add reef-client/src/TutorialCard.tsx reef-client/src/App.tsx reef-client/src/Reef.tsx reef-client/src/styles.css
git commit -m "feat(reef): coach-mark tutorial cards on the live board"
```

---

### Task 3: Landing screen + ambient plain-first copy

**Files:**
- Modify: `reef-client/src/App.tsx` (landing block, season line, costs line)
- Modify: `reef-client/src/Reef.tsx` (tooltips: strike label, health word)

**Interfaces:**
- Consumes: nothing new. Pure copy edits; no signatures change.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Landing screen says "game" first, button says "Play"**

In `App.tsx`, in the `if (!hasIdentity || !me)` block, replace:

```tsx
        <p className="muted">
          A slow, shared world on Swimchain. Grow coral; tend it or it recedes. No server runs
          it — the chain is the world, and no one can take it down.
        </p>
        <button className="btn primary" onClick={newIdentity}>Create an identity</button>
        <p className="fine">Your keypair is generated and stored locally in this browser. It never leaves your device.</p>
```

with:

```tsx
        <p className="muted">
          A territory game: grow a coral reef, keep it alive, outlast your rivals. No server
          runs it — the reef lives on the Swimchain network, and no one can take it down.
        </p>
        <button className="btn primary" onClick={newIdentity}>Play</button>
        <p className="fine">Playing creates a game key stored only in this browser — no account, no email.</p>
```

- [ ] **Step 2: "the reckoning" → plain season countdown**

In `App.tsx`, in the `.season` div, replace:

```tsx
                <strong>Season {view.season}</strong> · {view.epochsLeftInSeason} tide{view.epochsLeftInSeason === 1 ? '' : 's'} to the reckoning
```

with:

```tsx
                <strong>Season {view.season}</strong> · ends in {view.epochsLeftInSeason} tide{view.epochsLeftInSeason === 1 ? '' : 's'}
```

- [ ] **Step 3: Costs line — "contest" → "strike", plainer regen clause**

In `App.tsx`, replace:

```tsx
                <span className="fine costs">grow −{COST_GROW} · contest −{COST_CONTEST} · tend free ({view.params.tendCap}/tide) · each tide restores {REGEN_BASE} + 1 per 2 coral you hold</span>
```

with:

```tsx
                <span className="fine costs">grow −{COST_GROW} · strike −{COST_CONTEST} · tend free ({view.params.tendCap}/tide) · the tide refills {REGEN_BASE} + 1 per 2 coral you hold</span>
```

- [ ] **Step 4: Tooltips in Reef.tsx — "strike" and "health"**

(a) Replace (in the `base` tooltip string):

```tsx
          ? `(${x},${y}) ${isMe(cell.owner) ? 'yours' : 'coral'} · vitality ${cell.vitality}/${MAX_VITALITY}` +
```

with:

```tsx
          ? `(${x},${y}) ${isMe(cell.owner) ? 'yours' : 'coral'} · health ${cell.vitality}/${MAX_VITALITY}` +
```

(b) Replace:

```tsx
          note = ` — ${intent.kind} (${price}${blocked})`;
```

with:

```tsx
          const kindLabel = intent.kind === 'contest' ? 'strike' : intent.kind;
          note = ` — ${kindLabel} (${price}${blocked})`;
```

- [ ] **Step 5: Typecheck**

Run (from `reef-client/`): `npm run build` — Expected: success.

- [ ] **Step 6: Commit**

```bash
git add reef-client/src/App.tsx reef-client/src/Reef.tsx
git commit -m "feat(reef): plain-first landing and ambient copy (Play, strike, health, season countdown)"
```

---

### Task 4: "?" How-to-play panel + bottom hint replacement

**Files:**
- Create: `reef-client/src/HowToPlay.tsx`
- Modify: `reef-client/src/App.tsx` (game-bar button, panel render, bottom hints)
- Modify: `reef-client/src/styles.css` (append)

**Interfaces:**
- Consumes (engine, already exported): `COST_GROW`, `COST_CONTEST`, `CONTEST_DAMAGE`, `EPOCH_MOVES`, `TEND_CAP`, `REGEN_BASE`, `MAX_BUDGET`, `SEASON_EPOCHS`, `MAX_VITALITY`.
- Produces: `HowToPlay({ onClose: () => void })` component.

- [ ] **Step 1: Create the panel component**

Create `reef-client/src/HowToPlay.tsx`:

```tsx
import { useEffect } from 'react';
import {
  COST_GROW,
  COST_CONTEST,
  CONTEST_DAMAGE,
  EPOCH_MOVES,
  TEND_CAP,
  REGEN_BASE,
  MAX_BUDGET,
  SEASON_EPOCHS,
  MAX_VITALITY,
} from './lib/reefEngine';

/** The full plain-first reference — the old bottom text-wall's content, taught
 *  in order (plain rules first, lore last). Re-entry point for skipped tutorials. */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="help-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>How to play 🪸</h2>
        <p>
          The Reef is a territory game: grow a coral reef, keep it alive, outlast your rivals.
          Everyone plays on the same shared board.
        </p>
        <h3>Your three moves</h3>
        <ul>
          <li>
            <strong>Grow</strong> (−{COST_GROW} energy): click open water beside your reef. Your
            very first coral can go anywhere.
          </li>
          <li>
            <strong>Tend</strong> (free, {TEND_CAP} per tide): click your own coral to restore it
            to full health.
          </li>
          <li>
            <strong>Strike</strong> (−{COST_CONTEST} energy): click enemy coral on your border —
            it loses {CONTEST_DAMAGE} health. Break it, then take the square.
          </li>
        </ul>
        <h3>The tide</h3>
        <p>
          Every {EPOCH_MOVES} moves — counting everyone's — the tide turns: all coral loses 1
          health, and your energy refills by {REGEN_BASE} + 1 for every 2 coral you hold (max{' '}
          {MAX_BUDGET}). Coral starts at {MAX_VITALITY} health and dies at 0 — shrinking coral is
          telling you it needs tending.
        </p>
        <h3>Scoring</h3>
        <p>
          Each tide you bank points equal to your coral's total health. After {SEASON_EPOCHS}{' '}
          tides the season ends: most points takes the crown, tallies reset, and your coral
          carries on into the new season.
        </p>
        <h3>Reading the board</h3>
        <ul>
          <li>Coral shrinks as its health drops.</li>
          <li>Your own reef has a bright ring.</li>
          <li>A pulsing square dies next tide — tend it.</li>
        </ul>
        <p className="fine">
          You score the vitality you keep alive each tide — sprawl you can't tend just feeds the
          current. Every coral you grow is provably, only ever yours: the reef lives on the
          Swimchain network, not on anyone's server, and no one can take it down.
        </p>
        <button className="btn primary" onClick={onClose} autoFocus>
          Back to the reef
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the "?" button and panel into App.tsx**

(a) Add import next to the `TutorialCard` import:

```tsx
import { HowToPlay } from './HowToPlay';
```

(b) Add state next to the tutorial state (before the early returns):

```tsx
  const [showHelp, setShowHelp] = useState(false);
```

(c) In the `.game-bar` div, add between the `← reefs` button and the copy-invite button:

```tsx
              <button className="link" onClick={() => setShowHelp(true)}>? how to play</button>
```

(d) Render the panel — add just before the `{mining?.active && !mining.cell && (` overlay block:

```tsx
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
```

- [ ] **Step 3: Replace the bottom text-wall with two short lines**

In `App.tsx`, replace:

```tsx
              <div className="fine hint">
                Click open water by your coral to <strong>grow</strong>, your own to <strong>tend</strong>, an enemy border to <strong>contest</strong>.
                You score the vitality you keep alive each tide — sprawl you can't tend just feeds the current. Every coral you grow is provably, only ever yours.
              </div>
              <div className="fine viskey">
                Coral <strong>shrinks as it fades</strong> · your reef has a <span className="k-mine">bright ring</span> ·
                a <span className="k-warn">warning ring</span> means it recedes within two tides · a <span className="k-warn">pulsing</span> cell is gone next tide — tend it.
              </div>
```

with:

```tsx
              <div className="fine hint">
                <strong>grow</strong>: click open water beside your reef · <strong>tend</strong> (free): click your own coral ·{' '}
                <strong>strike</strong>: click enemy coral on your border
              </div>
              <div className="fine viskey">
                Coral shrinks as its health drops · your reef has the <span className="k-mine">bright ring</span> ·
                a <span className="k-warn">pulsing</span> square dies next tide — tend it.
              </div>
```

- [ ] **Step 4: Append panel CSS to styles.css**

```css
/* ── "?" how-to-play panel ──────────────────────────────────────────────────── */
.help-panel {
  max-width: 560px;
  max-height: 82vh;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 20px 22px;
}
.help-panel h2 { margin: 0 0 6px; }
.help-panel h3 { margin: 16px 0 4px; font-size: 15px; color: var(--shallow); }
.help-panel p, .help-panel li { font-size: 14px; line-height: 1.5; }
.help-panel ul { padding-left: 20px; margin: 6px 0; }
.help-panel .btn { margin-top: 14px; }
```

- [ ] **Step 5: Typecheck**

Run (from `reef-client/`): `npm run build` — Expected: success.

- [ ] **Step 6: Commit**

```bash
git add reef-client/src/HowToPlay.tsx reef-client/src/App.tsx reef-client/src/styles.css
git commit -m "feat(reef): '?' how-to-play reference panel replaces the bottom text-wall"
```

---

### Task 5: TideReport — scoring taught in the first-tide lesson

**Files:**
- Modify: `reef-client/src/App.tsx` (TideReport component at the bottom of the file)

**Interfaces:**
- Consumes: `SEASON_EPOCHS` (already imported in App.tsx).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Extend the one-time lesson with the scoring rule**

In the `TideReport` component's `tr-lesson` block, replace:

```tsx
              <strong>Your reef is your engine.</strong> Every tide restores{' '}
              <strong>{REGEN_BASE} energy + 1 for every 2 living coral</strong> you hold. Grow
              a bigger reef and tend it well — it rides every tide harder: more energy, more
              growth, more points banked.
```

with:

```tsx
              <strong>Your reef is your engine.</strong> Every tide restores{' '}
              <strong>{REGEN_BASE} energy + 1 for every 2 living coral</strong> you hold, and
              banks <strong>points equal to your coral's total health</strong>. Grow a bigger
              reef and tend it well — most points after {SEASON_EPOCHS} tides wins the season.
```

- [ ] **Step 2: Plain word in the points stat**

In the same component, replace:

```tsx
            <span className="tr-sub">vitality you kept alive this tide</span>
```

with:

```tsx
            <span className="tr-sub">coral health you kept alive this tide</span>
```

- [ ] **Step 3: Typecheck + tests**

Run (from `reef-client/`): `npm run build` then `npm test` — Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add reef-client/src/App.tsx
git commit -m "feat(reef): first tide report teaches scoring plainly"
```

---

### Task 6: Verification — build, BVT, deploy

**Files:** none created; verification + deploy only.

- [ ] **Step 1: Full check**

From `reef-client/`: `npm test && npm run lint && npm run build`
Expected: tests pass; lint clean (or no NEW warnings vs. `git stash`-baseline if the repo has pre-existing ones); build succeeds.

- [ ] **Step 2: Manual BVT as a brand-new player**

Start the dev server (`npm run dev` from `reef-client/`, node RPC running per usual dev setup). In a fresh incognito window (or after `localStorage.clear()` in devtools):

1. Landing: first sentence says "territory game"; button says **Play**; fine print mentions no account/email.
2. Click Play → auto-sponsor flow → lobby. With the tutorial active a "Pick a reef below to dive in" line shows above the list.
3. Enter a reef: **plant card** shows above the board; open squares pulse. Board remains clickable.
4. Plant a coral → card changes to **grow card** anchored at the energy bar; pulse stops.
5. Grow a second cell → **tide card** appears at the tide meter. "Got it" → tutorial done, no cards.
6. "? how to play" in the game bar opens the panel; Esc and click-outside both close it.
7. Bottom of board shows only the two short reminder lines; season line reads "ends in N tides"; costs line says "strike".
8. Reload the page → no tutorial cards re-fire (localStorage `reef-tutorial` is `{"step":"done",…}`).
9. In devtools: `localStorage.setItem('reef-tutorial', 'garbage')` → reload → no cards (corrupt degrades to done).
10. `localStorage.removeItem('reef-tutorial')` → reload → plant card returns (fresh-player path), then "Skip tutorial" ends everything.

- [ ] **Step 3: Deploy**

Use the **deploy-web-clients skill** (wraps `scripts/deploy-web-clients.sh`) to ship reef-client to swimchain.io — it enforces the baked-env verification (never deploy a Vite bundle without grep-verifying baked values).

- [ ] **Step 4: Post-deploy smoke**

Open https://swimchain.io/reef in a fresh incognito window: landing copy is the new one; a fresh identity reaches the plant card.

---

## Self-Review (completed)

- **Spec coverage:** §1 landing → Task 3; §2 tutorial table (plant/grow/tide/strike) → Tasks 1–2; §2 scoring step → Task 5; §3 "?" panel + bottom-line replacement → Task 4; §4 ambient plain-first (reckoning, costs, strike naming) → Task 3; error handling (corrupt→done, storage-less, non-blocking) → Task 1 + Global Constraints; testing → Tasks 1 & 6.
- **Placeholders:** none — every step has full code or an exact command.
- **Type consistency:** `TutorialState { step, acked, strikeTipSeen }` and function names (`advance`, `ack`, `skip`, `dismissStrikeTip`, `visibleCard`, `parseTutorial`, `loadTutorial`, `saveTutorial`) match across Tasks 1, 2, and 4; `highlightSeeds` matches between App and Reef; all engine constants used are exported by `reefEngine.ts` (verified against source).
