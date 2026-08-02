/**
 * What one boards pass will do — split into its cheap half and its expensive
 * half, as pure arithmetic so it can be tested without a browser.
 *
 * WHY THIS IS SPLIT AT ALL. A pass does two unrelated jobs:
 *
 *   HOSTING  — ask for every table by name. A name lookup, and the only reason
 *              anyone else's table stays alive on this node. Cheap, uncapped,
 *              and it must run on the very first pass.
 *   FOLDING  — load a table's replies and verify them, which costs one real
 *              Argon2id-8MiB hash per bank. Expensive, windowed, and it can
 *              wait.
 *
 * Measured on a Pixel, 2026-08-02: with no split, a first load pushed six
 * FOREIGN tables through the single verify worker before the player's own table
 * reached it — paying Argon2id hashes for a board panel that is closed by
 * default while the player stared at a game that would not start. Hosting was
 * never the cost; folding other people's boards ahead of the player's own was.
 */

export interface BoardsPassPlan {
  /** Every table, every pass. Never gated — this is the hosting contribution. */
  host: string[];
  /** The rotating window to fold on this pass. Empty until `foldReady`. */
  fold: string[];
  /** Where the window resumes next pass. Unchanged when nothing was folded. */
  nextCursor: number;
}

/**
 * @param tableIds  every table currently on the board, in board order
 * @param foldReady false until the player's own table has folded
 * @param cursor    where the rotating fold window left off
 * @param perPass   how many tables one pass may fold
 */
export function planBoardsPass(
  tableIds: readonly string[],
  foldReady: boolean,
  cursor: number,
  perPass: number,
): BoardsPassPlan {
  // Hosting is deliberately computed BEFORE any gate: a pass that folds nothing
  // still hosts everything. Gating this too would quietly drop this browser's
  // contribution to the network for as long as the player's own fold takes.
  const host = [...tableIds];

  if (!foldReady || tableIds.length === 0 || perPass <= 0) {
    // The cursor must NOT advance here. Advancing past a window we never folded
    // would permanently skip those tables — the boards would show holes that
    // only a reload could fill.
    return { host, fold: [], nextCursor: cursor };
  }

  const count = Math.min(perPass, tableIds.length);
  const start = ((cursor % tableIds.length) + tableIds.length) % tableIds.length;
  const fold: string[] = [];
  for (let k = 0; k < count; k++) fold.push(tableIds[(start + k) % tableIds.length]);

  return { host, fold, nextCursor: start + count };
}
