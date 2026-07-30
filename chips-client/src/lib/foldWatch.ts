/**
 * THE FOLD MUST NOT GO BACKWARDS. When it does, say so at the moment it does.
 *
 * WHY THIS EXISTS. 2026-07-29, operator: "I definitely just lost upgrades..
 * more than once here. lost a fryer, lost queso angel upgrade. things are
 * whiplashing around."
 *
 * The ⚑ report could not touch this, and could not have. It is a snapshot: it
 * says what you own NOW. Nothing anywhere recorded that you owned a fryer a
 * moment ago, so an upgrade that appears and vanishes and reappears leaves
 * precisely no evidence — every snapshot taken during the whiplash is
 * individually plausible. You cannot photograph a flicker.
 *
 * So this watches successive folds and records the REGRESSIONS. Most of what
 * it checks is monotonic by construction and can therefore never legitimately
 * decrease:
 *
 *   - `lifetimeChips` counts every chip ever dipped. It is the strongest
 *     invariant in the game. If it drops, the fold was replayed over a SHORTER
 *     history than before — a dropped pending move, a reorg, a re-fetch that
 *     lost the tail — and that single number distinguishes "the projection
 *     snapped back" from every possible display bug.
 *   - `owned` and `charOwned` are append-only. An upgrade cannot be un-bought.
 *   - `broken` and `paidToBosses` only ever go up: the descent does not undo.
 *
 * `crumbs` is NOT monotonic (dipping raises it, buying lowers it) so a drop is
 * only suspicious when nothing was bought. That case is reported separately and
 * marked, rather than left out — a silent spend is the same complaint.
 *
 * PURE and dependency-free, like [[dipRing]] and [[errorRing]]: it runs on the
 * path where something is already wrong and must never be the thing that
 * breaks.
 */

/** Just the fields this needs, so it is not coupled to ChipsState's shape. */
export interface FoldFacts {
  crumbs: number;
  lifetimeChips: number;
  fryers: number;
  bowlCap: number;
  broken: number;
  paidToBosses: number;
  moves: number;
  owned: ReadonlySet<string>;
  charOwned: ReadonlySet<string>;
}

export interface FoldRegression {
  at: number;
  /** Which invariant broke. */
  field: string;
  /** Human-facing one-liner, already readable in a paste. */
  what: string;
  /** The values, so nobody has to take the sentence on trust. */
  from: number | string;
  to: number | string;
  /** Move count either side — a fold replayed over a shorter history is the
   *  single most diagnostic thing here, so it travels with every entry. */
  movesFrom: number;
  movesTo: number;
}

export const FOLD_RING_MAX = 30;

const ring: FoldRegression[] = [];

/** Members of `prev` that are missing from `next`. */
function lost(prev: ReadonlySet<string>, next: ReadonlySet<string>): string[] {
  const out: string[] = [];
  prev.forEach((k) => { if (!next.has(k)) out.push(k); });
  return out.sort();
}

/**
 * Compare two consecutive folds and record anything that went backwards.
 * Returns the regressions it found (also pushed to the ring) so a caller can
 * react — show a notice, refuse to render — without diffing again.
 *
 * Never throws: a watchdog that can throw turns one bug into two.
 */
export function watchFold(prev: FoldFacts | null, next: FoldFacts, at: number): FoldRegression[] {
  const found: FoldRegression[] = [];
  if (!prev) return found;
  try {
    const add = (field: string, what: string, from: number | string, to: number | string) => {
      found.push({ at, field, what, from, to, movesFrom: prev.moves, movesTo: next.moves });
    };

    // THE LOAD-BEARING ONE. Monotonic by definition; a drop means the history
    // itself got shorter.
    if (next.lifetimeChips < prev.lifetimeChips) {
      add('lifetimeChips', 'the fold replayed a SHORTER history — a move was dropped, not just mis-shown',
        prev.lifetimeChips, next.lifetimeChips);
    }

    // "lost a fryer", "lost queso angel", verbatim.
    for (const k of lost(prev.owned, next.owned)) {
      add('owned', `upgrade "${k}" was owned and now is not`, k, '(gone)');
    }
    for (const k of lost(prev.charOwned, next.charOwned)) {
      add('charOwned', `ability "${k}" was owned and now is not`, k, '(gone)');
    }
    if (next.fryers < prev.fryers) add('fryers', 'a fryer disappeared', prev.fryers, next.fryers);
    if (next.bowlCap < prev.bowlCap) add('bowlCap', 'the bowl got smaller', prev.bowlCap, next.bowlCap);

    // The descent does not undo.
    if (next.broken < prev.broken) add('broken', 'the descent went back up a band', prev.broken, next.broken);
    if (next.paidToBosses < prev.paidToBosses) {
      add('paidToBosses', 'damage paid to bosses was forgotten', prev.paidToBosses, next.paidToBosses);
    }

    // Crumbs legitimately fall when something is bought. Only a fall with no
    // new move behind it is a regression — but it IS one, and it is what "my
    // dip paid nothing" looks like from the counter's side.
    if (next.crumbs < prev.crumbs && next.moves <= prev.moves) {
      add('crumbs', 'crumbs fell with no new move to explain it', prev.crumbs, next.crumbs);
    }

    for (const r of found) {
      ring.push(r);
      if (ring.length > FOLD_RING_MAX) ring.splice(0, ring.length - FOLD_RING_MAX);
    }
  } catch {
    /* a watchdog may not be the thing that breaks */
  }
  return found;
}

/** A copy, oldest first. Callers may not mutate the ring. */
export function foldRegressions(): FoldRegression[] {
  return ring.slice();
}

export function clearFoldRing(): void {
  ring.length = 0;
}
