/**
 * The opening tour's PRESENTATION: quest banner, ✓ beat, spotlight ring.
 * All rules live in lib/tutorial.ts (pure, tested); this file owns React,
 * DOM measuring, and the persisted pointer.
 *
 * The pointer is LATCHED AND FORWARD-ONLY (`chips.tutorial.v1` stores it,
 * 'done' when finished): the active step's live condition is checked each
 * render, and passing it runs a GUARANTEED beat — the banner holds a ✓ with
 * a chime for ~1.6s before the next quest slides in (the review saw four
 * invisible text-swap transitions; the beat is now a state the machine
 * cannot skip). It never evaluates conditions for steps that aren't active,
 * so nothing completes during the connect wait and nothing ever un-completes.
 *
 * Ring modes (lib/tutorial.ts): invite = pulsing + arrow ("touch this"),
 * hold = calm glow, no arrow ("watch, don't touch" — quests 1 and 4),
 * wait = dimmed ("this is where you're headed, not yet affordable").
 */
import { useEffect, useRef, useState } from 'react';
import type { ChipsState } from './lib/chipsEngine';
import type { CookingChip } from './lib/cooking';
import { TUTORIAL_STEPS, initialPointer, type TutorialHighlight } from './lib/tutorial';
import { sfx } from './lib/sound';

const KEY = 'chips.tutorial.v1';

function readStored(): number | 'done' | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === null) return null;
    if (v === 'done') return 'done';
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch { return null; }
}
function store(v: number | 'done'): void {
  try { localStorage.setItem(KEY, String(v)); } catch { /* private mode */ }
}

function targetRect(h: TutorialHighlight): DOMRect | null {
  if (h === 'basket') return document.querySelector('.rack .basket')?.getBoundingClientRect() ?? null;
  if (h === 'crew') {
    // The dog first — he is the first vendor and the tutorial's voice. Fall
    // back to whoever is wearing a price tag, then to the row itself.
    return (document.querySelector('.critter-scoop')
      ?? document.querySelector('.critter:has(.critter-deal)')
      ?? document.querySelector('.crew-row'))?.getBoundingClientRect() ?? null;
  }
  return null;
}

export function Tutorial({ state, chips }: { state: ChipsState; chips: CookingChip[] }) {
  // The latched pointer. Initialized ONCE per mount from storage, floored by
  // the durable fast-forward — a stored mid-tour pointer survives reloads,
  // and a veteran table starts past the end without a single frame shown.
  const [pointer, setPointer] = useState<number | 'done'>(() => {
    const stored = readStored();
    if (stored === 'done') return 'done';
    const floor = initialPointer(state);
    if (floor >= TUTORIAL_STEPS.length) { store('done'); return 'done'; }
    return Math.max(stored ?? 0, floor);
  });
  const [celebrating, setCelebrating] = useState(false);
  const [ring, setRing] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const timer = useRef<number | null>(null);

  const step = pointer !== 'done' ? TUTORIAL_STEPS[pointer] : null;

  // Watch ONLY the active step's condition; on pass, run the beat, then
  // advance the latch. The pointer never moves any other way.
  useEffect(() => {
    if (!step || celebrating) return;
    if (!step.isDone(state, chips)) return;
    setCelebrating(true);
    sfx.pop();
    sfx.gain(false, 0.15);
    timer.current = window.setTimeout(() => {
      setCelebrating(false);
      setPointer((p) => {
        if (p === 'done') return p;
        const next = p + 1;
        if (next >= TUTORIAL_STEPS.length) { store('done'); return 'done'; }
        store(next);
        return next;
      });
    }, 1600);
  }, [state, chips, step, celebrating]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // The spotlight follows its target (the rack reflows; the shelf's
  // affordable jar changes) — remeasured on a slow poll.
  useEffect(() => {
    if (!step || step.highlight === null || celebrating) { setRing(null); return; }
    const measure = () => {
      const r = targetRect(step.highlight);
      setRing(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
    };
    measure();
    const iv = window.setInterval(measure, 500);
    return () => window.clearInterval(iv);
  }, [step, celebrating]);

  if (!step) return null;
  const mode = step.ringMode(state, chips);

  return (
    <>
      {ring && (
        <div
          className={`tut-ring ${mode}`}
          aria-hidden="true"
          style={{ left: ring.x - 10, top: ring.y - 10, width: ring.w + 20, height: ring.h + 20 }}
        >
          {mode === 'invite' && <span className="tut-arrow">▼</span>}
        </div>
      )}
      <div className={`tut-banner${celebrating ? ' tut-done' : ''}`} role="status">
        <span className="tut-step">{(pointer as number) + 1}/{TUTORIAL_STEPS.length}</span>
        <span className="tut-body">
          <strong>{celebrating ? '✓ ' + step.title : step.title}</strong>
          {!celebrating && <em>{step.text(state, chips)}</em>}
        </span>
        {!celebrating && (
          <button
            type="button"
            className="tut-skip"
            onClick={() => { store('done'); setPointer('done'); }}
          >
            skip the tour
          </button>
        )}
      </div>
    </>
  );
}
