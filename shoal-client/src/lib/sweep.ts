/**
 * The sweep — the moment the whole game's verdict is delivered.
 *
 * Timeline, from spec 2.12:
 *   T+0        hush begins; the client refunds the player's action timer
 *   T+0..LOCK  commit window; your position still counts; one action guaranteed
 *   T+LOCK     INPUT LOCK; nothing after this counts. Network slack.
 *   T+LOCK..H  dread; you cannot act, you watch it come
 *   T+HUSH     resolution, against locked inputs only
 *
 * Resolution binds only on locked input because two clients holding different
 * input sets otherwise compute different answers whenever the top candidates
 * are close — and in a bunched school they are always close. "The shark ate
 * the wrong fish" is the most trust-destroying bug this game can have.
 */
import { isExposed, type Body } from './shelter';
import { HUSH_MS, LOCK_MS, MAX_TAKE, TENSION_TRIGGER } from './shoalConst';

export type HushPhase = 'calm' | 'commit' | 'dread';

/** Where in the hush we are. `hushStartMs` of -1 means no hush is running. */
export function hushPhase(hushStartMs: number, nowMs: number): HushPhase {
  if (hushStartMs < 0) return 'calm';
  const elapsed = nowMs - hushStartMs;
  if (elapsed < 0 || elapsed >= HUSH_MS) return 'calm';
  return elapsed < LOCK_MS ? 'commit' : 'dread';
}

/** True on the tick a new hush begins. A hush never interrupts a hush. */
export function shouldStartHush(tension: number, hushStartMs: number): boolean {
  return hushStartMs < 0 && tension >= TENSION_TRIGGER;
}

/** True on the single tick the sweep resolves. */
export function isResolveTick(hushStartMs: number, nowMs: number, tickMs: number): boolean {
  if (hushStartMs < 0) return false;
  const elapsed = nowMs - hushStartMs;
  return elapsed >= HUSH_MS && elapsed < HUSH_MS + tickMs;
}

/**
 * Who the sweep takes, from LOCKED positions only.
 *
 * Absolute threshold, not maximum: every candidate must independently be
 * exposed, so a tight school loses nobody and a loose one may lose up to
 * MAX_TAKE. Ordering is total — preferred target, then descending size, then
 * ascending id — so every client returns the identical list.
 */
export function selectTaken(locked: readonly Body[], preferred: string | null): string[] {
  const candidates = locked.filter((b) => isExposed(b, locked));
  candidates.sort((a, b) => {
    const ap = a.id === preferred ? 1 : 0;
    const bp = b.id === preferred ? 1 : 0;
    if (ap !== bp) return bp - ap;
    if (a.size !== b.size) return b.size - a.size;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return candidates.slice(0, MAX_TAKE).map((b) => b.id);
}
