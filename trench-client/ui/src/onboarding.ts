/**
 * The Guided Descent — pure step-machine + helpers for The Trench's staged,
 * camera-directed onboarding (designer spec §6, `.superpowers/sdd/trench-ux-
 * designer-spec.md`). This module owns NO React state and touches NO chain
 * plumbing — it's persistence + pure derivations only, mirroring the
 * `hasSeenCoach`/`markCoachSeen` shape CoachCard.tsx already uses. App.tsx
 * drives the actual beats from real state transitions and calls back in here
 * to persist progress and compute pure helpers (suggested founding spot,
 * nearest eligible expedition target).
 *
 * ── Persistence (spec's binding rule) ───────────────────────────────────────
 * `localStorage['trench-descent']` holds either the highest COMPLETED beat
 * (a number, 0 meaning "descent started but no beat finished yet" — never
 * actually written, since nothing calls `setDescentProgress(0)`) or the
 * literal string `'done'` once the descent finishes OR is skipped. A corrupt
 * stored value degrades to `'done'` (skip, never nag — same shape as
 * `hasSeenCoach`'s corrupt/absent handling). A storage-less browser (every
 * localStorage call throws) instead gets an in-memory, module-level fallback
 * that behaves identically for the lifetime of this page load — "once per
 * session" rather than "never", which is the one place this module's
 * degrade-shape differs from CoachCard's "storage-less → skip forever".
 */

import { CLAIM_MIN_SPACING, chebyshev, expeditionRange, utcDay, type ClaimState, type MapClaim } from './lib/trenchEngine';

export type DescentBeat = 1 | 2 | 3 | 4 | 5 | 6;

/** `number` = highest completed beat (1-6); `'done'` = finished or skipped. */
export type DescentProgress = number | 'done';

const STORAGE_KEY = 'trench-descent';
const BEAT7_STORAGE_KEY = 'trench-descent-beat7';

// Storage-less fallback: lives only as long as this page/tab does — "once per
// session," never persisted, never nags on a later visit once storage really
// is available again.
let sessionFallback: DescentProgress | null = null;

function readStoredProgress(): DescentProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    if (raw === 'done') return 'done';
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 6) return 'done'; // corrupt → done, skip & never nag
    return n;
  } catch {
    return null; // storage-less — caller falls back to the in-memory session value
  }
}

/** Current descent progress: real storage when available, else the
 *  in-memory session fallback. `0` means "never started, storage says
 *  nothing, no session fallback yet either" — a fresh player. */
export function getDescentProgress(): DescentProgress {
  const stored = readStoredProgress();
  if (stored !== null) return stored;
  if (sessionFallback !== null) return sessionFallback;
  return 0;
}

/** Persists progress. Always updates the in-memory session fallback (so a
 *  storage failure mid-session — quota, a private-mode toggle — doesn't
 *  regress the running descent), then best-effort writes through to
 *  localStorage. */
export function setDescentProgress(p: DescentProgress): void {
  sessionFallback = p;
  try {
    localStorage.setItem(STORAGE_KEY, String(p));
  } catch {
    /* storage-less — sessionFallback (set above) carries it for this session */
  }
}

/**
 * Resolves the persisted progress against REAL chain state — chain state
 * wins (spec's binding rule): a claim that already exists means beats 1-2
 * are moot regardless of what's stored (an existing player from before this
 * feature shipped, or a stale/corrupt store); a structure that already
 * exists means beat 5 is moot. Returns `'done'` if the descent shouldn't run
 * at all. Callers pass `hasStructure` only once `hasClaim` implies ownState
 * has actually loaded (see App.tsx's gating).
 */
export function resolveDescentBeat(stored: DescentProgress, hasClaim: boolean, hasStructure: boolean): DescentBeat | 'done' {
  if (stored === 'done') return 'done';
  let beat = (typeof stored === 'number' ? stored : 0) + 1;
  if (hasClaim && beat <= 2) beat = 3;
  if (hasStructure && beat === 5) beat = 6;
  if (beat > 6) return 'done';
  return beat as DescentBeat;
}

// ── Beat 7 (gated later sequence) — its own one-time flag, independent of
//    the main 1-6 progress track; corrupt/absent/storage-less all degrade to
//    "already seen" (skip, never nag), matching CoachCard's own shape, since
//    beat 7 IS a coach-card replacement, not a sequential step. ────────────
export function hasSeenBeat7(): boolean {
  try {
    return localStorage.getItem(BEAT7_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markBeat7Seen(): void {
  try {
    localStorage.setItem(BEAT7_STORAGE_KEY, '1');
  } catch {
    /* storage unavailable — beat 7 may fire again next visit, same as CoachCard */
  }
}

// ── Beat 1: suggested founding spot ─────────────────────────────────────────

/**
 * Expanding-ring ("spiral") search for the nearest open ground to `(centerX,
 * centerY)` that's at least `CLAIM_MIN_SPACING` (Chebyshev) from every
 * existing claim — per the designer spec's "game pre-picks open ground near
 * the claim centroid" beat-1 direction. Walks Chebyshev rings outward from
 * the (rounded) center so the first hit really is the nearest valid cell,
 * capped at a generous radius so a pathological map can never hang the UI.
 */
export function findSuggestedSpot(
  existing: ReadonlyArray<{ x: number; y: number }>,
  centerX: number,
  centerY: number
): { x: number; y: number } {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const isValid = (x: number, y: number): boolean => existing.every((c) => chebyshev(c.x, c.y, x, y) >= CLAIM_MIN_SPACING);
  if (isValid(cx, cy)) return { x: cx, y: cy };
  const MAX_RADIUS = 500;
  for (let r = 1; r <= MAX_RADIUS; r++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (isValid(x, cy - r)) return { x, y: cy - r };
      if (isValid(x, cy + r)) return { x, y: cy + r };
    }
    for (let y = cy - r + 1; y <= cy + r - 1; y++) {
      if (isValid(cx - r, y)) return { x: cx - r, y };
      if (isValid(cx + r, y)) return { x: cx + r, y };
    }
  }
  return { x: cx, y: cy }; // unreachable in practice — defensive fallback only
}

/** Centroid of every accepted claim, or the origin for a genuinely empty map. */
export function claimsCentroid(claims: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } {
  if (claims.length === 0) return { x: 0, y: 0 };
  const cx = claims.reduce((s, c) => s + c.x, 0) / claims.length;
  const cy = claims.reduce((s, c) => s + c.y, 0) / claims.length;
  return { x: cx, y: cy };
}

// ── Beat 7: nearest eligible expedition target ──────────────────────────────

/** Mirrors App.tsx's own `targetPrefix` (expedition target dedup key) —
 *  duplicated rather than imported/exported across the App/onboarding
 *  boundary, the same tradeoff this codebase already makes for `half()`/
 *  `prefersReducedMotion`-shaped one-liners. */
function targetPrefix(claimId: string): string {
  const colon = claimId.indexOf(':');
  const hashPart = colon >= 0 ? claimId.slice(colon + 1) : claimId;
  return hashPart.slice(0, 16);
}

/**
 * The nearest OTHER accepted claim that's currently a genuinely eligible
 * expedition target (in range, not visited today, not the own claim) — beat
 * 7's target. `null` when none qualify (the trigger effect in App.tsx simply
 * doesn't fire in that case).
 */
export function findNearestEligibleClaim(ownState: ClaimState, claims: ReadonlyArray<MapClaim>): MapClaim | null {
  const range = expeditionRange(ownState);
  const today = utcDay(Date.now());
  let best: MapClaim | null = null;
  let bestDist = Infinity;
  for (const c of claims) {
    if (c.claimId === ownState.claimId) continue;
    const dist = chebyshev(ownState.header.x, ownState.header.y, c.header.x, c.header.y);
    if (dist > range) continue;
    if (ownState.expeditionDays.get(targetPrefix(c.claimId)) === today) continue;
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}
