# The Trench "Keep It Burning" Clarity Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it unmistakable that a Trench player's lantern burns — and their homestead produces value — only while the game is running, via copy fixes, a visible HUD uptime line, a quit-time warning, and an away/dark-login recap card.

**Architecture:** All changes live in `trench-client/ui` plus one Tauri capability JSON. A new pure module `lib/awayRecap.ts` (derivation + localStorage gating, mirroring `onboarding.ts`'s shape) feeds a new `RecapCard.tsx` overlay; a new tiny `lib/tauriWindow.ts` wraps the `window.__TAURI__` close-interception global (the codebase idiom — never import `@tauri-apps/api`, see `nodeRpc.ts:128-165`); `App.tsx` wires both and hosts the quit-prompt overlay; copy edits land in `App.tsx`, `CoachCard.tsx`, `HowToPlay.tsx`, `Homestead.tsx`.

**Tech Stack:** React 18 + Vite + TypeScript (strict), tsx test runner (`check()` harness, hand-computed expectations — see `trenchEngine.test.ts` header), Tauri v2 shell.

**Spec:** `docs/superpowers/specs/2026-07-25-trench-keep-running-clarity-design.md`

## Global Constraints

- Diegetic-first copy: game language only, no protocol vocabulary; every number interpolated from engine constants, never a literal (`4×` must come from `DECAY_DARK / DECAY_LIT`).
- All displayed quantities are half-units: display via `half()` (`(n % 2 === 0 ? String(n / 2) : (n / 2).toFixed(1))`).
- localStorage access is always try/catch-wrapped; corrupt/absent → "skip, never nag"; storage-less → once-per-session in-memory fallback (the `onboarding.ts` `sessionFallback` shape).
- Tests compute expectations independently of the code under test (hand arithmetic in comments), print `ok/FAIL` lines, and set `process.exitCode` — the `trenchEngine.test.ts` idiom.
- No engine (`trenchEngine.ts`) changes; no Rust code changes (one new capability JSON is allowed).
- Work happens on branch `feat/trench-keep-lit`; conventional-commit messages.

---

### Task 1: `awayRecap.ts` pure derivation + tests

**Files:**
- Create: `trench-client/ui/src/lib/awayRecap.ts`
- Create: `trench-client/ui/src/lib/awayRecap.test.ts`
- Modify: `trench-client/ui/package.json` (test script runs both suites)

**Interfaces:**
- Consumes: `trenchEngine.ts` exports — `foldClaim`, `project`, `utcDay`, `brightnessOn`, `INTEGRITY_MAX`, types `ClaimState`, `Brightness`, `StructureKind`.
- Produces (Task 2 relies on these exact names):
  ```ts
  export const AWAY_MIN_MS: number; // 24h in ms
  export interface RecapFacts {
    daysAway: number; // utcDay(now) - utcDay(last accepted heartbeat); 0 = same day
    brightness: Brightness; // projected at nowMs
    hbWeek: number; // accepted heartbeats over trailing 7 UTC days incl. today
    newRuins: Array<{ idx: number; kind: StructureKind }>; // ruined && not mourned
    damaged: Array<{ idx: number; kind: StructureKind; integrity: number }>; // alive, < INTEGRITY_MAX
  }
  export function deriveAwayRecap(state: ClaimState, nowMs: number, mourned: ReadonlySet<number>): RecapFacts | null;
  export function hasSeenRecapToday(nowMs: number): boolean;
  export function markRecapSeen(nowMs: number): void;
  export function loadMournedRuins(): Set<number>;
  export function saveMournedRuins(s: ReadonlySet<number>): void;
  ```

- [ ] **Step 1: Write the failing test**

`trench-client/ui/src/lib/awayRecap.test.ts` — same harness shape as `trenchEngine.test.ts` (its `check`/`r`/`hb` helpers copied locally; run with `npx tsx src/lib/awayRecap.test.ts`):

```ts
/**
 * awayRecap — executable rule spec. Run with: npx tsx src/lib/awayRecap.test.ts
 * Expectations are hand-computed (arithmetic in comments), never derived by
 * re-invoking the code under test.
 */
import { foldClaim, utcDay, type ReplyLike, type ClaimHeader } from './trenchEngine';
import { AWAY_MIN_MS, deriveAwayRecap } from './awayRecap';

const DAY = 86_400_000;
let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  }
}
const r = (body: string | null, ms: number, cid: string, author = 'A'): ReplyLike => ({
  author_id: author, body, content_id: cid, created_at: ms, block_height: 10,
});
const hb = (n: number, day: number, tag = 'hb'): ReplyLike[] =>
  Array.from({ length: n }, (_, i) => r('heartbeat', day * DAY + i * 1000, `${tag}_${day}_${i}`));
const H: ClaimHeader = { v: 1, kind: 'trench-claim', name: 'home', x: 0, y: 0 };
const NONE: ReadonlySet<number> = new Set();

// ── 1) no accepted heartbeat ever -> null (fresh claim; the descent teaches) ──
{
  const s = foldClaim('c1', 'A', '', H, [r('build farm', 100 * DAY, 'b1')]);
  check('no heartbeat ever -> null', deriveAwayRecap(s, 100 * DAY + 1000, NONE) === null);
}

// ── 2) recently beating and LIT -> null ──
// Days 100..106: 6 hb/day = 42 in the trailing week >= LIT_MIN(25) -> LIT.
// now = 12h after the last beat (< AWAY_MIN_MS) -> no recap.
{
  const replies = [100, 101, 102, 103, 104, 105, 106].flatMap((d) => hb(6, d));
  const s = foldClaim('c2', 'A', '', H, replies);
  const now = 106 * DAY + 12 * 3_600_000;
  check('recent + LIT -> null', deriveAwayRecap(s, now, NONE) === null);
}

// ── 3) away 3 days -> facts; daysAway from utcDay math ──
// Beats: 6/day on days 100..106 (LIT), then silence; now = day 109 + 1h.
// daysAway = 109 - 106 = 3. Trailing week at 109 covers 103..109 -> 4 beat-days * 6 = 24 -> DIM (>=8, <25).
{
  const replies = [100, 101, 102, 103, 104, 105, 106].flatMap((d) => hb(6, d));
  const s = foldClaim('c3', 'A', '', H, replies);
  const now = 109 * DAY + 3_600_000;
  const f = deriveAwayRecap(s, now, NONE);
  check('away 3d -> facts', f !== null);
  check('away 3d -> daysAway 3', f?.daysAway === 3, f?.daysAway);
  check('away 3d -> hbWeek 24', f?.hbWeek === 24, f?.hbWeek);
  check('away 3d -> DIM', f?.brightness === 'DIM', f?.brightness);
}

// ── 4) DARK at login with absence < 24h -> facts (operator's dark-login reminder) ──
// One beat on day 100 only -> trailing week at day 100 has 1 beat < DIM_MIN(8) -> DARK.
// now = day 100 + 20h (< AWAY_MIN_MS after the beat) -> still triggers, daysAway 0.
{
  const s = foldClaim('c4', 'A', '', H, hb(1, 100));
  const now = 100 * DAY + 20 * 3_600_000;
  const f = deriveAwayRecap(s, now, NONE);
  check('dark login < 24h -> facts', f !== null);
  check('dark login -> daysAway 0', f?.daysAway === 0, f?.daysAway);
  check('dark login -> DARK', f?.brightness === 'DARK', f?.brightness);
}

// ── 5) damage + new-ruin detection, projected to now, respecting mourned ──
// Day 100: 6 hb + build farm (idx 0) + build beacon (idx 1). Then silence until day 109.
// Fold banks nothing after day 100 (lastDay=100, integrity 20/20 both).
// project(now=day 109): banks days 101..109 (9 days).
//   Brightness per banked day (trailing-7 window of 6 beats on day 100 only):
//   days 101..106 contain day 100 in window -> 6 beats < 8 -> DARK; 107..109 -> 0 -> DARK.
//   9 DARK days * DECAY_DARK(4) = 36 decay -> both structures: 20 - 36 -> ruined at 0.
// mourned = {1} -> only idx 0 is a NEW ruin.
{
  const d = 100 * DAY;
  const replies = [
    ...hb(6, 100),
    r('build farm', d + 50_000, 'bf'),
    r('build beacon', d + 60_000, 'bb'),
  ];
  const s = foldClaim('c5', 'A', '', H, replies);
  const now = 109 * DAY + 1000;
  const f = deriveAwayRecap(s, now, new Set([1]));
  check('ruin projection -> facts', f !== null);
  check('ruin projection -> newRuins only unmourned idx 0',
    f?.newRuins.length === 1 && f?.newRuins[0].idx === 0 && f?.newRuins[0].kind === 'farm',
    f?.newRuins);
  check('ruin projection -> nothing alive left damaged', f?.damaged.length === 0, f?.damaged);
}

// ── 6) partial decay lands in `damaged` with projected integrity ──
// Day 100: 6 hb + build farm. now = day 103 + 1h -> banks 101..103 = 3 DARK days.
// integrity 20 - 3*4 = 8 (alive). daysAway = 3 -> away trigger fires.
{
  const replies = [...hb(6, 100), r('build farm', 100 * DAY + 50_000, 'bf2')];
  const s = foldClaim('c6', 'A', '', H, replies);
  const f = deriveAwayRecap(s, 103 * DAY + 3_600_000, NONE);
  check('partial decay -> damaged has farm at 8', f?.damaged.length === 1 && f?.damaged[0].integrity === 8, f?.damaged);
  check('partial decay -> no new ruins', f?.newRuins.length === 0, f?.newRuins);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd trench-client/ui && npx tsx src/lib/awayRecap.test.ts`
Expected: FAIL to even load — `Cannot find module './awayRecap'`.

- [ ] **Step 3: Write the implementation**

`trench-client/ui/src/lib/awayRecap.ts`:

```ts
/**
 * Away recap / dark-login reminder — pure derivation + localStorage gating for
 * the "while you were gone" card (spec: docs/superpowers/specs/
 * 2026-07-25-trench-keep-running-clarity-design.md §4).
 *
 * The card fires when ownState first loads and EITHER the newest accepted
 * heartbeat is >= AWAY_MIN_MS old, OR the projected brightness at login is
 * DARK (the operator's "they log in dark — remind them" case, which a pure
 * absence threshold would miss for players who pop in briefly every day).
 *
 * Persistence mirrors onboarding.ts: try/catch around every localStorage
 * touch; a storage-less browser degrades to once-per-session via a
 * module-level fallback, never to "nag every load".
 */
import {
  INTEGRITY_MAX,
  brightnessOn,
  project,
  utcDay,
  type Brightness,
  type ClaimState,
  type StructureKind,
} from './trenchEngine';

export const AWAY_MIN_MS = 24 * 60 * 60 * 1000;

export interface RecapFacts {
  daysAway: number;
  brightness: Brightness;
  hbWeek: number;
  newRuins: Array<{ idx: number; kind: StructureKind }>;
  damaged: Array<{ idx: number; kind: StructureKind; integrity: number }>;
}

export function deriveAwayRecap(
  state: ClaimState,
  nowMs: number,
  mourned: ReadonlySet<number>
): RecapFacts | null {
  let lastHbMs = -Infinity;
  for (const m of state.moves) {
    if (m.op === 'heartbeat' && m.outcome === 'ok' && m.ms > lastHbMs) lastHbMs = m.ms;
  }
  if (lastHbMs === -Infinity) return null; // never beat — a brand-new claim; the descent teaches

  const view = project(state, nowMs);
  const away = nowMs - lastHbMs;
  if (away < AWAY_MIN_MS && view.brightness !== 'DARK') return null;

  const today = utcDay(nowMs);
  let hbWeek = 0;
  for (let d = today - 6; d <= today; d++) hbWeek += state.heartbeatDays.get(d) ?? 0;

  const newRuins: RecapFacts['newRuins'] = [];
  const damaged: RecapFacts['damaged'] = [];
  view.structures.forEach((s, idx) => {
    if (s.ruined) {
      if (!mourned.has(idx)) newRuins.push({ idx, kind: s.kind });
    } else if (s.integrity < INTEGRITY_MAX) {
      damaged.push({ idx, kind: s.kind, integrity: s.integrity });
    }
  });

  return { daysAway: today - utcDay(lastHbMs), brightness: view.brightness, hbWeek, newRuins, damaged };
}

// ── Persistence (App.tsx wiring uses these; not exercised by the pure tests) ──

const RECAP_DAY_KEY = 'trench-recap-day';
const MOURNED_KEY = 'trench-mourned-ruins';

// Storage-less fallback: once per session, not never (onboarding.ts's shape).
let sessionRecapDay: number | null = null;

export function hasSeenRecapToday(nowMs: number): boolean {
  const today = utcDay(nowMs);
  try {
    return localStorage.getItem(RECAP_DAY_KEY) === String(today);
  } catch {
    return sessionRecapDay === today;
  }
}

export function markRecapSeen(nowMs: number): void {
  sessionRecapDay = utcDay(nowMs);
  try {
    localStorage.setItem(RECAP_DAY_KEY, String(utcDay(nowMs)));
  } catch {
    /* storage-less — sessionRecapDay carries it for this session */
  }
}

export function loadMournedRuins(): Set<number> {
  try {
    const raw = localStorage.getItem(MOURNED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n) => Number.isInteger(n)));
  } catch {
    return new Set(); // corrupt/storage-less: worst case a ruin is mourned twice
  }
}

export function saveMournedRuins(s: ReadonlySet<number>): void {
  try {
    localStorage.setItem(MOURNED_KEY, JSON.stringify([...s].sort((a, b) => a - b)));
  } catch {
    /* storage unavailable — the ruin may be mourned again next visit */
  }
}
```

Note: `brightnessOn` ends up unused if `project()` already returns brightness — drop the import if so (it does; keep the import list minimal or `tsc -b` will fail on `noUnusedLocals` if enabled — check `tsconfig`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd trench-client/ui && npx tsx src/lib/awayRecap.test.ts`
Expected: every line `ok`, final `ALL PASS`, exit 0.

- [ ] **Step 5: Chain both suites in `npm test`**

In `trench-client/ui/package.json` change:

```json
"test": "tsx src/lib/trenchEngine.test.ts && tsx src/lib/awayRecap.test.ts"
```

Run: `cd trench-client/ui && npm test` → both suites `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add trench-client/ui/src/lib/awayRecap.ts trench-client/ui/src/lib/awayRecap.test.ts trench-client/ui/package.json
git commit -m "feat(trench): away-recap/dark-login derivation (pure, tested)"
```

---

### Task 2: RecapCard overlay + App wiring

**Files:**
- Create: `trench-client/ui/src/RecapCard.tsx`
- Modify: `trench-client/ui/src/App.tsx` (state + first-load effect + render)
- Modify: `trench-client/ui/src/styles.css` (small `.recap-*` additions)

**Interfaces:**
- Consumes: everything Task 1 produced; `half()` (local copy — the `HowToPlay.tsx`/codebase idiom is per-file one-liners); engine constants `LIT_MIN`, `INTEGRITY_MAX`.
- Produces: `export function RecapCard({ facts, onDismiss }: { facts: RecapFacts; onDismiss: () => void })`.

- [ ] **Step 1: Write `RecapCard.tsx`**

Follows `HowToPlay.tsx`'s overlay shape (Escape + backdrop close both call `onDismiss` — dismissal must always stamp the day/mourned sets, so there is exactly one dismiss path):

```tsx
import { useEffect } from 'react';
import { INTEGRITY_MAX, LIT_MIN, type StructureKind } from './lib/trenchEngine';
import type { RecapFacts } from './lib/awayRecap';

const half = (n: number): string => (n % 2 === 0 ? String(n / 2) : (n / 2).toFixed(1));

const KIND_NAME: Record<StructureKind, string> = {
  farm: 'kelp farm',
  storehouse: 'storehouse',
  beacon: 'beacon',
};

/** "While you were gone" homecoming card (spec §4): what the darkness cost,
 *  and how to climb back. Rendered as a full overlay — it's a session-start
 *  moment, not an in-play coach mark. */
export function RecapCard({ facts, onDismiss }: { facts: RecapFacts; onDismiss: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const gone = facts.daysAway >= 1;
  return (
    <div className="overlay" onClick={onDismiss}>
      <div className="help-panel recap-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{gone ? '🏮 While you were gone' : '🏮 Your lantern is dark'}</h2>
        <p>
          {gone
            ? `${facts.daysAway} ${facts.daysAway === 1 ? 'day' : 'days'} in the dark — your lantern burns only while The Trench runs.`
            : 'It burns only while The Trench runs — and it went out.'}
        </p>
        {(facts.newRuins.length > 0 || facts.damaged.length > 0) && (
          <ul className="recap-list">
            {facts.newRuins.map((ru) => (
              <li key={`r${ru.idx}`} className="recap-ruin">
                The abyss took your {KIND_NAME[ru.kind]}.
              </li>
            ))}
            {facts.damaged.map((d) => (
              <li key={`d${d.idx}`}>
                {KIND_NAME[d.kind]} — {half(d.integrity)} of {half(INTEGRITY_MAX)} health
              </li>
            ))}
          </ul>
        )}
        <p className="fine">
          {facts.hbWeek} of {LIT_MIN} beats this week. Leave The Trench running to climb back to LIT.
        </p>
        <button className="btn primary" onClick={onDismiss}>
          Light it again
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

Imports: `import { RecapCard } from './RecapCard';` and `import { deriveAwayRecap, hasSeenRecapToday, markRecapSeen, loadMournedRuins, saveMournedRuins, type RecapFacts } from './lib/awayRecap';`

State + effect (near the existing `ownStateEverLoadedRef` block, which is the established "fire once when ownState first loads" idiom):

```tsx
const [recap, setRecap] = useState<RecapFacts | null>(null);
const recapCheckedRef = useRef(false);
useEffect(() => {
  if (!ownState || recapCheckedRef.current) return;
  recapCheckedRef.current = true; // one consideration per app session, on the FIRST fold —
  // later polls include the heartbeat this very session just posted, which would mask the absence.
  if (inDescent) return; // the descent owns the screen (and fresh claims have nothing to recap)
  const now = Date.now();
  if (hasSeenRecapToday(now)) return;
  const facts = deriveAwayRecap(ownState, now, loadMournedRuins());
  if (facts) setRecap(facts);
}, [ownState, inDescent]);

const dismissRecap = useCallback(() => {
  if (!recap) return;
  markRecapSeen(Date.now());
  if (recap.newRuins.length > 0) {
    const mourned = loadMournedRuins();
    for (const ru of recap.newRuins) mourned.add(ru.idx);
    saveMournedRuins(mourned);
  }
  setRecap(null);
}, [recap]);
```

Render — in the main (`ownState && view`) return, next to the existing `{showHelp && <HowToPlay …/>}` at the bottom:

```tsx
{recap && <RecapCard facts={recap} onDismiss={dismissRecap} />}
```

Ordering note: `inDescent` must already be defined above the effect (it is — the beat machine resolves early in the component); keep the effect below it.

- [ ] **Step 3: styles.css additions**

Next to the `.help-panel` block (`styles.css:637-650`):

```css
.recap-panel { max-width: 460px; }
.recap-list { margin: 8px 0; padding-left: 18px; }
.recap-list li { font-size: 14px; line-height: 1.55; margin: 4px 0; }
.recap-list .recap-ruin { color: var(--warn, #e0a458); }
```

(If the stylesheet has no `--warn` variable, reuse whatever warn/danger color `.banner.warn` uses — read it before writing.)

- [ ] **Step 4: Type-check + tests**

Run: `cd trench-client/ui && npx tsc -b --force && npm test`
Expected: clean build, both suites `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add trench-client/ui/src/RecapCard.tsx trench-client/ui/src/App.tsx trench-client/ui/src/styles.css
git commit -m "feat(trench): 'while you were gone' recap + dark-login reminder card"
```

---

### Task 3: Quit warning under Tauri

**Files:**
- Create: `trench-client/ui/src/lib/tauriWindow.ts`
- Create: `trench-client/src-tauri/capabilities/default.json`
- Modify: `trench-client/ui/src/App.tsx` (interception effect + quit-prompt overlay)
- Modify: `trench-client/ui/src/styles.css` (`.quit-actions` row)

**Interfaces:**
- Consumes: `myClaim` state in App.tsx (already exists); engine constants `DECAY_DARK`, `DECAY_LIT`, `YIELD_LIT`, `YIELD_DARK` (already imported in App.tsx — verify, add if missing).
- Produces:
  ```ts
  // lib/tauriWindow.ts
  export function interceptClose(shouldIntercept: () => boolean, onIntercept: () => void): void;
  export function destroyWindow(): void; // fires Rust's Destroyed handler -> node stops
  ```

- [ ] **Step 1: Capability file**

`trench-client/src-tauri/capabilities/default.json` (the shell currently ships NO capability file — the generated `gen/schemas/capabilities.json` is `{}` — so the webview has no `core:event`/`core:window` permissions; without this, `onCloseRequested` registration fails and the close proceeds exactly as today):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Core window/event access for the quit warning (close interception + destroy).",
  "windows": ["*"],
  "permissions": ["core:default", "core:window:allow-destroy"]
}
```

- [ ] **Step 2: Write `lib/tauriWindow.ts`**

```ts
/**
 * Close-interception via the Tauri v2 GLOBAL (`window.__TAURI__`, injected by
 * `withGlobalTauri: true`) — never a bare `@tauri-apps/api` import, which is
 * not in this package's deps and breaks the Vite build (the documented trap
 * in nodeRpc.ts:128-165).
 *
 * Tauri's JS `onCloseRequested` contract: registering ANY close-requested
 * listener makes the runtime defer the close to JS — after the handler runs,
 * the window is destroyed unless `preventDefault()` was called. So the
 * handler below either prevents (and hands control to the quit prompt) or
 * does nothing (and the runtime destroys, firing Rust's Destroyed handler,
 * which stops the node). In a plain browser (dev), both exports are no-ops.
 */

interface CloseRequestedEvent {
  preventDefault(): void;
}
interface TauriWindowHandle {
  onCloseRequested(handler: (e: CloseRequestedEvent) => void): Promise<() => void>;
  destroy(): Promise<void>;
}

function currentWindow(): TauriWindowHandle | null {
  const w = window as {
    __TAURI__?: { window?: { getCurrentWindow?: () => TauriWindowHandle } };
  };
  try {
    return w.__TAURI__?.window?.getCurrentWindow?.() ?? null;
  } catch {
    return null;
  }
}

export function interceptClose(shouldIntercept: () => boolean, onIntercept: () => void): void {
  const win = currentWindow();
  if (!win) return;
  void win
    .onCloseRequested((e) => {
      if (shouldIntercept()) {
        e.preventDefault();
        onIntercept();
      }
    })
    .catch(() => {
      /* permission denied or API absent — close behaves exactly as before */
    });
}

export function destroyWindow(): void {
  const win = currentWindow();
  if (!win) return;
  void win.destroy().catch(() => {
    /* nothing to do — worst case the window simply stays open */
  });
}
```

- [ ] **Step 3: Wire into `App.tsx`**

```tsx
import { interceptClose, destroyWindow } from './lib/tauriWindow';
```

State + refs + mount effect (register ONCE; consult refs so the handler sees live state):

```tsx
const [quitPrompt, setQuitPrompt] = useState(false);
const myClaimRef = useRef(myClaim);
myClaimRef.current = myClaim;
const quitPromptRef = useRef(false);
quitPromptRef.current = quitPrompt;
useEffect(() => {
  interceptClose(
    () => myClaimRef.current !== null, // nothing staked -> close untouched
    () => {
      if (!quitPromptRef.current) setQuitPrompt(true);
    }
  );
}, []);
```

(Check `myClaim`'s actual null-shape first — if it's `undefined` when absent, gate with `!= null`.)

Quit-prompt overlay, rendered in BOTH the founding-screen return and the main return (a founding-in-progress player also has `myClaim === null` → not intercepted, so main return only is fine — confirm `myClaim` truly implies past founding; it does: it's the own claim entry). Place next to `{showHelp && …}` in the main return:

```tsx
{quitPrompt && (
  <div className="overlay" onClick={() => setQuitPrompt(false)}>
    <div className="help-panel recap-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <h2>Quit The Trench?</h2>
      <p>
        Your lantern goes dark while the game is closed — structures wear{' '}
        <strong>{DECAY_DARK / DECAY_LIT}× faster</strong> and farms grow{' '}
        <strong>{YIELD_LIT / YIELD_DARK}× slower</strong>.
      </p>
      <div className="quit-actions">
        <button className="btn primary" onClick={() => setQuitPrompt(false)}>
          Stay lit
        </button>
        <button className="btn" onClick={destroyWindow}>
          Quit anyway
        </button>
      </div>
    </div>
  </div>
)}
```

Verify `DECAY_DARK`, `DECAY_LIT`, `YIELD_LIT`, `YIELD_DARK` are in App.tsx's existing `trenchEngine` import list; add any that are missing. Escape-to-dismiss: reuse the same pattern as RecapCard ONLY if trivially wired; "Stay lit" + backdrop click suffice.

- [ ] **Step 4: styles.css**

```css
.quit-actions { display: flex; gap: 10px; margin-top: 16px; }
.quit-actions .btn { margin-top: 0; }
```

- [ ] **Step 5: Type-check + tests + commit**

Run: `cd trench-client/ui && npx tsc -b --force && npm test` → clean + `ALL PASS`.

```bash
git add trench-client/ui/src/lib/tauriWindow.ts trench-client/src-tauri/capabilities/default.json trench-client/ui/src/App.tsx trench-client/ui/src/styles.css
git commit -m "feat(trench): quit warning — your lantern goes dark when the game closes"
```

---

### Task 4: Copy fixes + HUD uptime line

**Files:**
- Modify: `trench-client/ui/src/App.tsx` (descent beats 3 and 6, `descentCardProps`)
- Modify: `trench-client/ui/src/CoachCard.tsx` (lantern copy)
- Modify: `trench-client/ui/src/HowToPlay.tsx` (lantern card)
- Modify: `trench-client/ui/src/Homestead.tsx` (visible uptime line)

**Interfaces:** none — copy and one JSX line only.

- [ ] **Step 1: App.tsx beat copy**

Beat 3 (`descentCardProps`, currently `'Your lantern pulses on its own — each pulse feeds your brightness.'`):

```ts
lines: ['Your lantern pulses while The Trench is running — each pulse feeds your brightness.', 'Close the game, and the pulsing stops.'],
```

Beat 6 (currently `"That's the game: farms grow while you're lit. Come back tomorrow."`):

```ts
lines: ["That's the game: farms grow while you're lit — and your lantern burns only while The Trench runs.", 'Leave it running; check in tomorrow.'],
```

(`DescentCard` already takes `lines: string[]` — multi-line is supported; beat 7 uses two lines.)

- [ ] **Step 2: CoachCard.tsx lantern copy**

Replace the `lantern` entry:

```tsx
lantern: (
  <>
    Your lantern burns <strong>only while the game runs</strong>. Close it and the light goes
    out — brighter lantern, faster farms.
  </>
),
```

- [ ] **Step 3: HowToPlay.tsx lantern card**

Replace `<p>Burns while the game runs — up to <strong>{HB_CAP_PER_DAY} beats a day</strong>.</p>` with:

```tsx
<p>
  <strong>Only burns while the game is open.</strong> Up to{' '}
  <strong>{HB_CAP_PER_DAY} beats a day</strong> while it runs.
</p>
```

- [ ] **Step 4: Homestead.tsx visible uptime**

The lantern panel currently hides uptime in a tooltip (`title={`burning ${formatUptime(now - sessionStartMs)}`}` on the beats line, `Homestead.tsx:249-251`). Change to:

```tsx
<div className="fine">
  beats {hbToday}/{HB_CAP_PER_DAY} today
</div>
<div className="fine">
  burning {formatUptime(now - sessionStartMs)} — dark when the game closes
</div>
```

(Drop the `title` attr — the line is now visible. `formatUptime` and `sessionStartMs` already exist in this component.)

- [ ] **Step 5: Type-check + tests + commit**

Run: `cd trench-client/ui && npx tsc -b --force && npm test` → clean + `ALL PASS`.

```bash
git add trench-client/ui/src/App.tsx trench-client/ui/src/CoachCard.tsx trench-client/ui/src/HowToPlay.tsx trench-client/ui/src/Homestead.tsx
git commit -m "fix(trench): stop teaching close-and-check-tomorrow — lantern-runs-only-while-open copy pass"
```

---

### Task 5: Build + visual verification

**Files:** none new (temporary local hacks are reverted, never committed).

- [ ] **Step 1: Production build**

Run: `cd trench-client/ui && npm run build`
Expected: `tsc -b` + `vite build` succeed.

- [ ] **Step 2: Screenshot pass (production-value bar — UI is verified by looking at it)**

Serve the app (vite dev or `vite preview`) and screenshot with browser automation:
1. **HowToPlay panel** — new lantern card line visible.
2. **RecapCard + quit prompt** — these need staged state: temporarily (UNCOMMITTED) force `const [recap, setRecap] = useState<RecapFacts | null>({ daysAway: 3, brightness: 'DARK', hbWeek: 6, newRuins: [{ idx: 0, kind: 'farm' }], damaged: [{ idx: 1, kind: 'storehouse', integrity: 8 }] })` and `useState(true)` for `quitPrompt`, screenshot both overlays, then `git checkout -- src/App.tsx`-style revert of ONLY that hack (verify `git diff` is clean of it afterward). The full app requires a running node to reach the play screen; the overlays render on the founding screen too if the forced state is placed there — if a node is needed anyway, use a local regtest node (`cargo run -- --regtest node start --listen 127.0.0.1:29735` + `scripts/regtest-smoke.ts` env shape) — whatever gets pixels fastest.
3. **Lantern panel uptime line** — needs a claim on a regtest node (smoke script founds one); if that's slow, careful visual inspection of the JSX + a screenshot of the founding screen is the fallback — but say so honestly in the report.
4. Confirm descent beats 3/6 copy by grep of the built bundle: `grep -c "Come back tomorrow" dist/assets/*.js` must be 0; `grep -c "Leave it running" dist/assets/*.js` must be ≥1.

- [ ] **Step 3: Tauri interception smoke (best-effort)**

If a Windows Tauri dev build is practical in-session: `cd trench-client && npm run dev` (needs `src-tauri/binaries/sw.exe`, already present), then close the window with a claim present → quit prompt must appear; "Quit anyway" must exit and stop the sidecar. If the dev build is impractical (toolchain/time), state that the interception path is verified by code-reading + capability file only and flag it for the release smoke.

- [ ] **Step 4: Final full-repo checks + commit any stragglers**

Run: `cd trench-client/ui && npm test && npx tsc -b --force`
`git status` — working tree must contain no leftover verification hacks.

---

## Self-review notes

- Spec §1 copy → Task 4; §2 HUD → Task 4 Step 4; §3 quit warning → Task 3; §4 recap/dark-login → Tasks 1-2; capability addendum → Task 3 Step 1; testing section → Task 1 (pure), Task 5 (visual/build). Deferred items (tray mode, website parity) intentionally absent.
- Names cross-checked: `RecapFacts`/`deriveAwayRecap`/`loadMournedRuins`/`saveMournedRuins`/`hasSeenRecapToday`/`markRecapSeen` (Task 1 ⇄ Task 2), `interceptClose`/`destroyWindow` (Task 3 internal).
- Known judgment calls an implementer may hit: `--warn` CSS variable existence (read `.banner.warn` first); `myClaim` null-vs-undefined gate; `noUnusedLocals` on the trimmed import list.
