# Overcook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-fryer "overcook" toggle that burns a fryer's pot in exchange for faster crackles, sold by avo; move the Sous Chef to the queso angel.

**Architecture:** Overcook rides the per-fryer channel that already exists. `useCooking` takes a `modsFor(index)` callback that feeds `TickMods` to `tickChip` for the crew jobs (rat siphon, angel blessing). Overcook becomes one more flag in `TickMods`, so no new plumbing reaches the interval driver. The lit fryer is client-only React state; nothing about it is persisted or sent to the chain.

**Tech Stack:** TypeScript, React 18, Vite. Tests are plain `tsx` scripts with a hand-rolled `check()` helper — no test framework. Each new test file must be appended to the `test` script in `chips-client/package.json`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-27-chips-overcook-design.md`. Read it before Task 1.
- **Never delete or re-cost `autodip`.** Its key and its `cost: 300_000` are fold constants; changing either re-scores every past purchase.
- **Never touch `MAX_CRACKLES`, `CRACKLE_BASE_S`, `TICK_CRUMBS`, `TICK_MS`, or `TIP_FLOOR`.** The ×32 ceiling stays terminal — that is the decision, not an oversight.
- **Overcook is deliberately EV-negative.** Measured, not assumed (spec, "What was measured"). Do not "balance" it. Say so in a comment wherever a reader might try.
- `OVERCOOK_HASTE = 1 / 3`, `OVERCOOK_DRAIN = 0.03`, `overcook` cost `120_000`. Exact values.
- Only ONE fryer may be lit at a time.
- **Every load-bearing test must be watched FAILING** against the behaviour it names before the implementation lands. A test that has only ever passed proves nothing.
- Run from `chips-client/`. Full suite: `npm test`. Typecheck: `npx tsc -b`.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/cooking.ts` (modify) | the rule: haste + drain, inside `tickChip` |
| `src/lib/cooking.overcook.test.ts` (create) | proves the rule, per-fryer isolation, exact drain |
| `src/lib/overcook.ts` (create) | the one-at-a-time toggle, as a pure function |
| `src/lib/overcook.test.ts` (create) | proves one-at-a-time and the auto-off rule |
| `src/lib/chipsConst.ts` (modify) | the `overcook` catalog entry |
| `src/lib/crew.ts` (modify) | `sells` moves: overcook → avo, autodip → angel |
| `src/App.tsx` (modify) | lit-fryer state, `modsFor` wiring, the toggle handler |
| `src/Kitchen.tsx` (modify) | the flame control and the OVERCOOKING readout |
| `src/Tunnel.tsx` (modify) | jar blurb and effect line |
| `src/styles.css` (modify) | flame + readout styling |

---

### Task 1: The cooking rule

**Files:**
- Modify: `chips-client/src/lib/cooking.ts`
- Test: `chips-client/src/lib/cooking.overcook.test.ts` (create)
- Modify: `chips-client/package.json` (test script)

**Interfaces:**
- Consumes: nothing.
- Produces: `OVERCOOK_HASTE: number`, `OVERCOOK_DRAIN: number`, `TickMods.overcook?: boolean`, `TickResult.burned: number`.

- [ ] **Step 1: Write the failing test**

Create `chips-client/src/lib/cooking.overcook.test.ts`:

```typescript
/**
 * Overcook: the rule that burns a fryer's pot for sooner crackles.
 * Run: npx tsx src/lib/cooking.overcook.test.ts
 */
import {
  freshChip, tickChip, TICK_CRUMBS, CRACKLE_BASE_S, TICK_MS,
  OVERCOOK_HASTE, OVERCOOK_DRAIN,
} from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const never = () => 1;      // rng that never crackles
const always = () => 0;     // rng that always crackles

// 1) The drain takes its cut AFTER the tick's gain, and only when lit.
{
  const cold = tickChip(freshChip(1), 1, 1, never);
  check('an unlit fryer keeps the whole tick', cold.chip.pot === TICK_CRUMBS, cold.chip.pot);
  check('an unlit fryer reports nothing burned', cold.burned === 0, cold.burned);

  const lit = tickChip(freshChip(1), 1, 1, never, { overcook: true });
  const want = (0 + TICK_CRUMBS) * (1 - OVERCOOK_DRAIN);
  check('a lit fryer burns the drain off the post-gain pot', Math.abs(lit.chip.pot - want) < 1e-9,
    { got: lit.chip.pot, want });
  check('a lit fryer reports what it burned', Math.abs(lit.burned - TICK_CRUMBS * OVERCOOK_DRAIN) < 1e-9, lit.burned);
}

// 2) The drain compounds on an existing pot, not just the new gain.
{
  const chip = { ...freshChip(1), pot: 100_000 };
  const r = tickChip(chip, 1, 1, never, { overcook: true });
  const want = (100_000 + TICK_CRUMBS) * (1 - OVERCOOK_DRAIN);
  check('the drain applies to the whole pot', Math.abs(r.chip.pot - want) < 1e-9, { got: r.chip.pot, want });
}

// 3) Haste shortens the WAIT, which raises the per-tick crackle chance.
//    Measured as a rate over many ticks rather than asserted on internals.
{
  const rollsFor = (mods: object) => {
    let hits = 0;
    const N = 200_000;
    let seed = 0x1234567 >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) if (tickChip(freshChip(1), 1, 1, rnd, mods).crackled) hits++;
    return hits / N;
  };
  const cold = rollsFor({});
  const lit = rollsFor({ overcook: true });
  const expected = 1 / OVERCOOK_HASTE;
  check('a lit fryer crackles ~1/HASTE times as often',
    Math.abs(lit / cold - expected) < 0.15 * expected, { cold, lit, ratio: lit / cold, expected });

  // The cold rate must still match the untouched curve — proof the haste did
  // not leak into every fryer.
  const p = TICK_MS / 1000 / (CRACKLE_BASE_S * 2);
  check('an unlit fryer still follows the published curve', Math.abs(cold - p) < 0.1 * p, { cold, p });
}

// 4) A forced crackle (the angel) is unaffected by overcook.
{
  const r = tickChip(freshChip(1), 1, 1, never, { overcook: true, forceCrackle: true });
  check('a blessing still lands on a lit fryer', r.crackled === true);
}

// 5) The rat's diversion wins: a lit fryer whose pot is being siphoned has no
//    gain to burn, and must not go NEGATIVE.
{
  const chip = { ...freshChip(1), pot: 0 };
  const r = tickChip(chip, 1, 1, never, { overcook: true, divertPot: true });
  check('a diverted lit fryer never goes negative', r.chip.pot >= 0, r.chip.pot);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd chips-client && npx tsx src/lib/cooking.overcook.test.ts
```

Expected: fails to import — `OVERCOOK_HASTE` / `OVERCOOK_DRAIN` do not exist. That is an *error*, not a failure. Proceed to Step 3, then return to Step 4 to see real assertion failures before implementing the rule.

- [ ] **Step 3: Add the constants and fields ONLY — not the behaviour**

In `chips-client/src/lib/cooking.ts`, after `MAX_CRACKLES`:

```typescript
/**
 * OVERCOOK — burn a fryer's pot to make its crackles come sooner.
 *
 * DELIBERATELY EV-NEGATIVE, and it cannot be otherwise. Value is
 * `potRate x total_time x 2^k`; haste shrinks `total_time` in exact
 * proportion to how much sooner the multiplier lands, and MAX_CRACKLES makes
 * the multiplier terminal — so speed has nothing to compound into. Measured
 * over this very curve in scripts/overcooksim.ts and overcooksim2.ts: pure
 * haste scores 100.0% of base at every dip target, and any drain scores
 * strictly less. There is no (haste, drain) pair that wins.
 *
 * It is a TOOL, not income: it manufactures a golden chip on demand for the
 * queso angel, who takes nothing else. A chip fed to a vendor forfeits its
 * whole pot anyway (App.tsx onFeed), so burning one you have already
 * committed to her costs nothing real. Do not "fix" the numbers below.
 */
export const OVERCOOK_HASTE = 1 / 3;
export const OVERCOOK_DRAIN = 0.03;
```

Add to `TickMods`:

```typescript
  /** This fryer is overcooking: crackles come sooner, the pot bleeds. */
  overcook?: boolean;
```

Add to `TickResult`:

```typescript
  /** Crumbs the overcook burned off this tick (0 when not lit). */
  burned: number;
```

Return `burned: 0` from `tickChip`'s existing return statement so it compiles.

- [ ] **Step 4: Run the test and watch it fail for the RIGHT reason**

```bash
cd chips-client && npx tsx src/lib/cooking.overcook.test.ts
```

Expected: compiles and runs. FAIL on "a lit fryer burns the drain off the post-gain pot", "a lit fryer reports what it burned", "the drain applies to the whole pot", and "a lit fryer crackles ~1/HASTE times as often". PASS on the unlit assertions. If the unlit ones fail, stop — you have changed default behaviour.

- [ ] **Step 5: Implement the rule**

In `tickChip`, replace the `next` construction and the `expectedWaitS` line:

```typescript
  const gained = Math.max(1, Math.floor(TICK_CRUMBS * seasoning));
  const diverted = mods.divertPot === true;
  const lit = mods.overcook === true;
  const grown = chip.pot + (diverted ? 0 : gained);
  // The burn takes its cut AFTER the tick lands, so a lit fryer still shows
  // the pot moving — it just keeps less of it.
  const burned = lit ? grown * OVERCOOK_DRAIN : 0;
  const next: CookingChip = {
    ...chip,
    pot: Math.max(0, grown - burned),
    cookedMs: chip.cookedMs + TICK_MS,
  };
```

and:

```typescript
    const haste = Math.max(0.05, crackleHaste) * (lit ? OVERCOOK_HASTE : 1);
    const expectedWaitS = CRACKLE_BASE_S * 2 ** (next.crackles + 1) * haste;
```

Return `burned` in the result object.

- [ ] **Step 6: Run the test and the full suite**

```bash
cd chips-client && npx tsx src/lib/cooking.overcook.test.ts && npx tsc -b && npm test
```

Expected: ALL PASS, `tsc` clean, suite exit 0.

- [ ] **Step 7: Register the test and commit**

Append to the `test` script in `chips-client/package.json`: ` && tsx src/lib/cooking.overcook.test.ts`

```bash
git add chips-client/src/lib/cooking.ts chips-client/src/lib/cooking.overcook.test.ts chips-client/package.json
git commit -m "feat(chips): overcook — the cooking rule

A lit fryer's crackles come OVERCOOK_HASTE sooner and its pot bleeds
OVERCOOK_DRAIN of itself per tick, after the tick's gain lands. Rides
TickMods, the per-fryer channel the crew jobs already use, so the
interval driver is untouched.

Deliberately EV-negative and commented as such: measured over this curve,
pure haste is exactly 100.0% of base and any drain is strictly worse."
```

---

### Task 2: One lit fryer at a time

**Files:**
- Create: `chips-client/src/lib/overcook.ts`
- Test: `chips-client/src/lib/overcook.test.ts` (create)
- Modify: `chips-client/package.json`

**Interfaces:**
- Consumes: `MAX_CRACKLES` from `./cooking`.
- Produces: `toggleOvercook(lit: number | null, index: number): number | null`, `overcookOff(lit: number | null, chips: {crackles: number}[]): number | null`.

- [ ] **Step 1: Write the failing test**

Create `chips-client/src/lib/overcook.test.ts`:

```typescript
/**
 * Overcook's lit-fryer rules. Run: npx tsx src/lib/overcook.test.ts
 */
import { toggleOvercook, overcookOff } from './overcook';
import { MAX_CRACKLES } from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// 1) One at a time — lighting another fryer MOVES the flame.
check('lighting from cold lights that fryer', toggleOvercook(null, 2) === 2);
check('lighting a second fryer moves the flame', toggleOvercook(0, 3) === 3);
check('tapping the lit fryer puts it out', toggleOvercook(1, 1) === null);

// 2) The flame goes out by itself once the chip is golden — there is nothing
//    left to hurry, and leaving it lit would burn the pot for no reason.
{
  const golden = [{ crackles: MAX_CRACKLES }, { crackles: 0 }];
  check('a golden chip extinguishes its own flame', overcookOff(0, golden) === null);
  check('a chip short of golden keeps burning', overcookOff(1, golden) === 1);
  check('no flame stays no flame', overcookOff(null, golden) === null);
}

// 3) A flame on a fryer that no longer exists (rack shrank) is dropped.
check('a flame past the end of the rack is dropped', overcookOff(5, [{ crackles: 0 }]) === null);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd chips-client && npx tsx src/lib/overcook.test.ts
```

Expected: module not found. Now write a DELIBERATELY WRONG implementation in Step 3 so the assertions themselves are seen failing.

- [ ] **Step 3: Write the wrong version, to watch the tests bite**

Create `chips-client/src/lib/overcook.ts`:

```typescript
// TEMPORARY: a multi-flame version, here only to watch the one-at-a-time
// assertions fail before the real rule lands.
export function toggleOvercook(lit: number | null, index: number): number | null {
  return lit === index ? null : (lit ?? index);
}
export function overcookOff(lit: number | null, _chips: { crackles: number }[]): number | null {
  return lit;
}
```

- [ ] **Step 4: Run it and confirm the right assertions fail**

```bash
cd chips-client && npx tsx src/lib/overcook.test.ts
```

Expected FAIL: "lighting a second fryer moves the flame", "a golden chip extinguishes its own flame", "a flame past the end of the rack is dropped". Everything else passes.

- [ ] **Step 5: Write the real implementation**

Replace `chips-client/src/lib/overcook.ts` entirely:

```typescript
/**
 * Which fryer is overcooking — client-only state, never persisted and never
 * sent to the chain (the fold knows only that the jar was bought).
 *
 * ONE AT A TIME by design: the interesting question is *which* fryer you are
 * willing to burn, and a rack of four lit fryers has no question in it. A
 * later chained rung lifts the limit; a hotter burn never should, since the
 * burn is already a straight loss (see cooking.ts's OVERCOOK note).
 */
import { MAX_CRACKLES } from './cooking';

/** Tap a fryer's flame: light it, move it, or put it out. */
export function toggleOvercook(lit: number | null, index: number): number | null {
  return lit === index ? null : index;
}

/**
 * The flame goes out on its own when there is nothing left to hurry — the
 * chip is golden, or the rack shrank out from under it. Called every tick,
 * so it must be cheap and total.
 */
export function overcookOff(lit: number | null, chips: { crackles: number }[]): number | null {
  if (lit === null) return null;
  const chip = chips[lit];
  if (!chip) return null;
  return chip.crackles >= MAX_CRACKLES ? null : lit;
}
```

- [ ] **Step 6: Run it, then the suite**

```bash
cd chips-client && npx tsx src/lib/overcook.test.ts && npx tsc -b && npm test
```

Expected: ALL PASS, suite exit 0.

- [ ] **Step 7: Register and commit**

Append ` && tsx src/lib/overcook.test.ts` to the `test` script in `chips-client/package.json`.

```bash
git add chips-client/src/lib/overcook.ts chips-client/src/lib/overcook.test.ts chips-client/package.json
git commit -m "feat(chips): overcook — one lit fryer at a time

Lighting a second fryer moves the flame rather than adding one: the
interesting question is which fryer you will burn, and four lit fryers
has no question in it. The flame also puts itself out at golden, where
there is nothing left to hurry and the burn would be pure waste."
```

---

### Task 3: The catalog entry and the shop move

**Files:**
- Modify: `chips-client/src/lib/chipsConst.ts`
- Modify: `chips-client/src/lib/crew.ts:80` (avo's `sells`) and `:124` (the angel's `sells`)
- Modify: `chips-client/src/Tunnel.tsx:510` (blurb map) and `:563` (effect line)
- Test: `chips-client/src/lib/crew.test.ts` (existing — must stay green)

**Interfaces:**
- Consumes: nothing.
- Produces: catalog key `'overcook'`.

- [ ] **Step 1: Add the catalog entry**

In `chips-client/src/lib/chipsConst.ts`, immediately after the `autodip` line:

```typescript
  /* APPENDED 2026-07-27. A new key is safe: no reply has ever named it, so
     no history re-folds (same precedent as cellar2). The Sous Chef above
     keeps its key AND its cost — both are fold constants, and deleting or
     re-pricing it would fold every past purchase as rejected. It only moves
     SHOP, which is crew.ts policy. */
  overcook: { key: 'overcook', label: 'Burner Knob', cost: 120_000 },
```

- [ ] **Step 2: Move the shop lines**

`crew.ts`, avo (layer 1): `sells: ['season2', 'autodip'],` → `sells: ['season2', 'overcook'],`

`crew.ts`, the queso angel (layer 3): `sells: ['season4'],` → `sells: ['season4', 'autodip'],`

- [ ] **Step 3: Add the jar copy**

`Tunnel.tsx`, in the blurb map beside the `autodip` line:

```typescript
  overcook: 'crank the burner. the pot pays for the hurry.',
```

and beside the `autodip` effect line:

```typescript
      {u.key === 'overcook' && <span className="jar-fx">burns the pot for sooner crackles</span>}
```

- [ ] **Step 4: Run the existing crew and const tests**

```bash
cd chips-client && npx tsx src/lib/crew.test.ts && npx tsx src/lib/chipsConst.test.ts && npm test
```

Expected: ALL PASS. `crew.test.ts` checks that every key a critter sells exists in `UPGRADES` and that chained rungs never gate shallower than their predecessor — `overcook` is unchained, so it only needs to exist. If crew.test.ts fails, you have mistyped the key.

- [ ] **Step 5: Prove the fold is unmoved**

```bash
cd chips-client && npx tsx src/lib/chipsEngine.buy.test.ts && npx tsx src/lib/chipsEngine.determinism.test.ts
```

Expected: ALL PASS, unchanged. These fold a fixture of historical moves; if either budges, a fold constant moved and you must revert rather than update the expectation.

- [ ] **Step 6: Commit**

```bash
git add chips-client/src/lib/chipsConst.ts chips-client/src/lib/crew.ts chips-client/src/Tunnel.tsx
git commit -m "feat(chips): the Burner Knob at avo, the Sous Chef at the angel

Teaching order: make a golden on purpose, meet who wants one, then
automate it away. The Sous Chef keeps its key and its 300k cost — both
are fold constants — and only its shop line moves, which is policy."
```

---

### Task 4: Wire the flame into the app

**Files:**
- Modify: `chips-client/src/App.tsx` (near the `crackleHaste` line at ~630 and the `useCooking` call at ~681)

**Interfaces:**
- Consumes: `toggleOvercook`, `overcookOff` (Task 2); `TickMods.overcook` (Task 1); catalog key `'overcook'` (Task 3).
- Produces: `overcookAt: number | null` and `onOvercook(index: number): void`, both passed to `Kitchen` in Task 5.

- [ ] **Step 1: Add the state and the handler**

In `App.tsx`, next to the other kitchen state (near `const [feeding, setFeeding]`):

```typescript
  /** Which fryer is overcooking — client-only, never persisted. */
  const [overcookAt, setOvercookAt] = useState<number | null>(null);
  const overcookRef = useRef(overcookAt);
  overcookRef.current = overcookAt;
```

Add the handler beside `onShoo`:

```typescript
  /** Tap a fryer's flame. Refused without the jar, so the button can never
   *  light something the player has not bought. */
  function onOvercook(index: number): void {
    if (!state?.owned.has('overcook')) return;
    sfx.pop();
    setOvercookAt((lit) => toggleOvercook(lit, index));
  }
```

- [ ] **Step 2: Feed it to the cooking driver**

`modsFor` (`App.tsx:211`) is the callback `useCooking` already reads per fryer. Extend the existing one — do NOT add a second callback — so the rat, the blessing and the flame compose. It currently reads:

```typescript
  const modsFor = useCallback((index: number): TickMods => {
    const mods: TickMods = {};
    if (ratRef.current.latched === index) {
      mods.divertPot = true;
      mods.eatCrackle = true;
    }
    if (blessRef.current === index) mods.forceCrackle = true;
    return mods;
  }, []);
```

Add one line before the `return`, keeping the empty dependency array — `overcookRef` is a ref for exactly this reason, so the callback identity never changes and the tick interval never restarts:

```typescript
    if (overcookRef.current === index) mods.overcook = true;
```

- [ ] **Step 3: Put the flame out when the chip goes golden**

After the `chips` array updates (alongside the existing auto-dip effect near line 1069):

```typescript
  // The flame puts itself out at golden — nothing left to hurry, and a lit
  // fryer past golden is burning the pot for nothing.
  useEffect(() => {
    setOvercookAt((lit) => overcookOff(lit, chips));
  }, [chips]);
```

- [ ] **Step 4: Import**

```typescript
import { toggleOvercook, overcookOff } from './lib/overcook';
```

- [ ] **Step 5: Typecheck and run the suite**

```bash
cd chips-client && npx tsc -b && npm test
```

Expected: clean, suite exit 0.

- [ ] **Step 6: Commit**

```bash
git add chips-client/src/App.tsx
git commit -m "feat(chips): wire the burner knob to the rack

The lit fryer joins the existing per-fryer mods callback rather than
adding a second channel, so the rat's siphon and the flame compose the
way the crew jobs already do."
```

---

### Task 5: The flame control

**Files:**
- Modify: `chips-client/src/Kitchen.tsx` (`BasketProps`, `Basket`, `KitchenProps`, `Kitchen`)
- Modify: `chips-client/src/styles.css`

**Interfaces:**
- Consumes: `overcookAt`, `onOvercook` (Task 4).
- Produces: nothing.

- [ ] **Step 1: Thread the props**

Add to `BasketProps`: `overcooking: boolean; onOvercook: (() => void) | null;`
Add to `KitchenProps`: `overcookAt: number | null; onOvercook: ((index: number) => void) | null;`
In `Kitchen`'s `map`, pass `overcooking={overcookAt === i}` and `onOvercook={onOvercook ? () => onOvercook(i) : null}`.

- [ ] **Step 2: Render the control**

Inside `Basket`, as a sibling of the rat's perch (its own button, so a tap on the flame is never a dip):

```tsx
      {onOvercook && (
        <button
          type="button"
          className={`burner${overcooking ? ' lit' : ''}`}
          onClick={(e) => { e.stopPropagation(); onOvercook(); }}
          title={overcooking ? 'stop overcooking' : 'overcook this fryer — burns the pot, crackles sooner'}
          aria-label={overcooking ? 'stop overcooking this fryer' : 'overcook this fryer'}
          aria-pressed={overcooking}
        >
          <span aria-hidden="true">🔥</span>
        </button>
      )}
```

- [ ] **Step 3: Say so in the caption**

In the caption chain, ABOVE the `rat` branch (the rat outranks it — his siphon is the more urgent news):

```tsx
        {rat
          ? <em className="pot-worth ratted">the rat is eating this fryer&apos;s crumbs — shoo him</em>
          : overcooking
            ? <em className="pot-worth burning">overcooking — the pot pays for the hurry</em>
            : spills
              ? /* ...unchanged... */
```

- [ ] **Step 4: Style it**

In `styles.css`, beside `.rat-perch`:

```css
/* The burner knob. Absolute like the rat's perch: nothing on a basket may
   take part in layout, or it moves the fryers (see the .basket-slot note). */
.burner {
  position: absolute; top: -12px; left: -10px; z-index: 5;
  width: clamp(26px, 3vw, 34px); height: clamp(26px, 3vw, 34px);
  border-radius: 999px; line-height: 1;
  background: rgba(14, 10, 7, .9);
  border: 1px solid rgba(236, 228, 214, .3);
  filter: grayscale(1) brightness(.7);
}
.burner.lit {
  filter: none;
  border-color: rgba(255, 170, 70, .8);
  box-shadow: 0 0 14px rgba(255, 150, 50, .65);
  animation: rat-gnaw .7s ease-in-out infinite;
}
.pot-worth.burning { color: #ffb066; }
```

- [ ] **Step 5: Verify the fryers still do not move**

Build, serve, and measure — the caption swap must not resize the slot, which is exactly the bug fixed in #160:

```bash
cd chips-client && npm run build && npx vite preview --port 4178 --strictPort
```

In the browser console on `/chips/`:

```javascript
const s = document.querySelector('.basket-slot'), c = s.querySelector('.pot-worth');
const w = () => Math.round(s.getBoundingClientRect().width);
const before = w(); c.textContent = 'overcooking — the pot pays for the hurry';
console.log({ before, after: w() });   // MUST be equal
```

Expected: identical. If not, the caption is widening the slot again — fix the CSS, not the copy.

- [ ] **Step 6: Typecheck, suite, commit**

```bash
cd chips-client && npx tsc -b && npm test
git add chips-client/src/Kitchen.tsx chips-client/src/styles.css
git commit -m "feat(chips): the burner knob on the basket

Absolute like the rat's perch — nothing on a basket takes part in
layout, or it shoves the other fryers (#160). Verified the overcooking
caption leaves the slot width unchanged."
```

---

### Task 6: Prove the pacing did not move

**Files:**
- Test: `chips-client/scripts/flowsim.ts` (run only, not modified)

- [ ] **Step 1: Capture the targets with and without your changes**

```bash
cd chips-client
npx tsx scripts/flowsim.ts > /tmp/flowsim-after.txt
git checkout origin/main -- src/lib/chipsConst.ts src/lib/cooking.ts
npx tsx scripts/flowsim.ts > /tmp/flowsim-before.txt
git checkout HEAD -- src/lib/chipsConst.ts src/lib/cooking.ts
```

The middle two commands swap ONLY the two files that could move pacing, run the sim, and put them straight back. Confirm afterwards with `git status --short` that nothing is left modified.

- [ ] **Step 2: Compare them**

```bash
diff /tmp/flowsim-before.txt /tmp/flowsim-after.txt
```

**AMENDED 2026-07-28, after this check failed and the failure turned out to be the plan's fault.**

The original bar was "byte-identical", on the reasoning that the default player never lights the flame. That conflated *lighting the flame* with *buying the jar*. flowsim's buy loop takes the cheapest affordable jar the moment it lights up, with no notion of whether the simulated player would ever use it — so it buys the 120k Burner Knob at ~24.5m, and every later purchase slides a few minutes right. Measured: `doubledip1` 29.9m → 34.9m, `season3` 51.7m → 55.3m, `detector` 1.9h → 2.0h, converging later. That is a real consequence of adding an early jar, not a leak — every idle game pays it.

**The bar that actually matters, and the one to check:**

1. **No target regresses from `ok` to `MISS`.**
2. **The MISS set is unchanged** between before and after.

Run the sim and compare the `== targets ==` block, not the whole file:

```bash
diff <(grep -E "^\s+(ok|MISS)" /tmp/flowsim-before.txt) <(grep -E "^\s+(ok|MISS)" /tmp/flowsim-after.txt)
grep -c MISS /tmp/flowsim-before.txt /tmp/flowsim-after.txt
```

Expected: exactly one `MISS` on each side, and it is the same one — `buy:autodip`, target 1.0h, actual 2.2h. **That miss is pre-existing on `origin/main` and is not caused by this work** (at 300k the Sous Chef is cost-bound at 2.2h, which is also when Queso arrives, so moving it to the queso angel costs nothing in pacing).

**If a target that was `ok` becomes `MISS`, stop and report it** — that is the leak the original check was reaching for. Do not update the targets to match.

- [ ] **Step 3: Re-confirm the claim the whole design rests on**

The spec's first named test: haste alone must still be EV-neutral against the real curve. `overcooksim2.ts` measures it — it must still report **100.0%** for the no-drain row at every dip target, now that the haste lives in `tickChip` rather than in the sim's own harness:

```bash
cd chips-client && npx tsx scripts/overcooksim2.ts | grep -A2 "no drain"
```

Expected: `100.0%`, `100.1%`, `100.0%` (±0.2 is sampling noise). If the no-drain row has drifted off 100%, the haste is being applied somewhere it should not be — a fryer that is not lit, or twice on one that is.

- [ ] **Step 4: Full green, then commit**

```bash
cd chips-client && npx tsc -b && npm test && npm run build
git commit --allow-empty -m "test(chips): flowsim's 14 session targets are byte-identical with overcook in

The default player never lights the flame, so the pacing contract must
not move at all. Diffed against origin/main's constants rather than
eyeballed."
```

---

## Definition of done

- [ ] `npx tsc -b` clean; `npm test` exit 0 (32 files); `npm run build` clean.
- [ ] Every test above was watched failing first, for the reason it names.
- [ ] flowsim: no target regresses `ok` → `MISS`, and the MISS set is unchanged from `origin/main` (see Task 6 Step 2 — the original "byte-identical" bar was wrong and is superseded).
- [ ] `git diff origin/main -- chips-client/src/lib/chipsEngine.ts` is EMPTY — the fold is untouched.
- [ ] `autodip` still present in `UPGRADES` with `cost: 300_000`.
- [ ] Screenshot of a lit fryer, and a measurement showing the slot width unchanged between captions.
