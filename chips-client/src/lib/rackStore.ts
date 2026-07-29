/**
 * THE RACK SURVIVES A RELOAD.
 *
 * A chip's pot lived only in React state, so a refresh, a crash, a power cut
 * or a phone reclaiming the tab destroyed it — all of it, silently. That is
 * ruinous for the strategy the game is actually built around: holding is
 * worth exactly as much as cycling (measured 0.09% apart), so the right play
 * is to never dip until you have to, and the right play was a gamble against
 * your own browser. Worst for the player doing it best, and worst on mobile,
 * where the OS kills backgrounded tabs as a matter of routine.
 *
 * NOT OFFLINE PROGRESS. The rack is restored exactly as it was left — same
 * pot, same crackles, same cooked time. Nothing accrues while you are away
 * (`chipsConst`: "a game with no offline progress"), and nothing is lost
 * either. The cook clock is a bare `setInterval` with no catch-up, which is
 * what makes that true rather than something this file has to enforce.
 *
 * Pure and storage-agnostic: `readRack`/`writeRack` take the store, so the
 * rules are testable without a browser.
 */
import type { CookingChip } from './cooking';

/** Bumped only if the stored shape changes; a mismatch is dropped, not
 *  migrated — a wrong pot is worse than a missing one. */
export const RACK_V = 1;
const KEY = 'chips.rack.v1';

export interface StoredRack {
  v: number;
  /** The rack belongs to ONE table and ONE identity. Restoring another
   *  table's pots onto yours would invent crumbs from nowhere. */
  tableId: string;
  author: string;
  chips: CookingChip[];
}

export interface RackStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const looksLikeChip = (c: unknown): c is CookingChip => {
  if (typeof c !== 'object' || c === null) return false;
  const o = c as Record<string, unknown>;
  return typeof o.ms === 'number' && Number.isFinite(o.ms)
    && typeof o.pot === 'number' && Number.isFinite(o.pot) && o.pot >= 0
    && typeof o.crackles === 'number' && Number.isInteger(o.crackles) && o.crackles >= 0
    && typeof o.cookedMs === 'number' && Number.isFinite(o.cookedMs) && o.cookedMs >= 0;
};

/**
 * The rack as last left, or null. Returns null rather than throwing on ANY
 * doubt — a rack is a convenience, and a corrupt row must never be able to
 * stop the shop opening.
 */
export function readRack(store: RackStore, tableId: string, author: string): CookingChip[] | null {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<StoredRack>;
    if (d.v !== RACK_V) return null;
    // Belongs to somebody else, or another table: not ours to restore.
    if (d.tableId !== tableId) return null;
    if (typeof d.author !== 'string' || d.author.toLowerCase() !== author.toLowerCase()) return null;
    if (!Array.isArray(d.chips) || !d.chips.every(looksLikeChip)) return null;
    return d.chips.map((c) => ({ ms: c.ms, pot: c.pot, crackles: c.crackles, cookedMs: c.cookedMs }));
  } catch {
    return null;
  }
}

/** Save the rack. Never throws — private mode and full quotas are normal. */
export function writeRack(store: RackStore, tableId: string, author: string, chips: readonly CookingChip[]): void {
  try {
    const payload: StoredRack = { v: RACK_V, tableId, author, chips: [...chips] };
    store.setItem(KEY, JSON.stringify(payload));
  } catch { /* private mode, quota — the rack is a convenience */ }
}

export function clearRack(store: RackStore): void {
  try { store.removeItem(KEY); } catch { /* as above */ }
}
