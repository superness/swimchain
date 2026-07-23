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
