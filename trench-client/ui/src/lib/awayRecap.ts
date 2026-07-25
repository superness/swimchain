/**
 * Away recap / dark-login reminder — pure derivation + localStorage gating for
 * the "while you were gone" card (spec: docs/superpowers/specs/
 * 2026-07-25-trench-keep-running-clarity-design.md §4).
 *
 * The card fires when ownState first loads and EITHER the newest accepted
 * heartbeat is >= AWAY_MIN_MS old, OR the projected brightness at login is
 * DARK (the "they log in dark — remind them" case, which a pure absence
 * threshold would miss for players who pop in briefly every day).
 *
 * Persistence mirrors onboarding.ts: try/catch around every localStorage
 * touch; a storage-less browser degrades to once-per-session via a
 * module-level fallback, never to "nag every load".
 */
import {
  INTEGRITY_MAX,
  project,
  utcDay,
  type Brightness,
  type ClaimState,
  type StructureKind,
} from './trenchEngine';

export const AWAY_MIN_MS = 24 * 60 * 60 * 1000;

export interface RecapFacts {
  /** utcDay(now) - utcDay(last accepted heartbeat); 0 = same UTC day. */
  daysAway: number;
  /** Projected brightness at nowMs. */
  brightness: Brightness;
  /** Accepted heartbeats over the trailing 7 UTC days including today. */
  hbWeek: number;
  /** Ruined in the projection and not yet mourned (structure indices are
   *  build-order stable — ruins stay in place — so a bare index is a
   *  durable identity). */
  newRuins: Array<{ idx: number; kind: StructureKind }>;
  /** Alive but below full integrity in the projection. */
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

  return {
    daysAway: today - utcDay(lastHbMs),
    brightness: view.brightness,
    hbWeek,
    newRuins,
    damaged,
  };
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
    /* storage-less — sessionRecapDay (set above) carries it for this session */
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
