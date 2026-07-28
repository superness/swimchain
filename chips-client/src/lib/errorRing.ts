/**
 * A tiny ring of everything that went wrong, kept in memory so a bug that
 * happened two minutes ago is still describable when the player notices it.
 *
 * WHY THIS EXISTS. A 4.1M dip paid nothing on a phone (operator, 2026-07-28)
 * and the chain could prove only that no such dip was ever submitted — the
 * reason lived in a console nobody was looking at, on a device with no
 * console to look at. Everything the client knows about a failure is thrown
 * away the instant it scrolls, which on mobile is immediately.
 *
 * Deliberately dumb: a fixed-size array, no timers, no I/O, no dependencies.
 * It must never be the thing that breaks, because it only matters when
 * something else already has.
 */

export interface RingEntry {
  /** Epoch ms. */
  at: number;
  kind: 'error' | 'rejection' | 'console' | 'note';
  text: string;
}

/** Small enough to paste into a chat, long enough to cover a minute of mess. */
export const RING_MAX = 40;
/** One entry cannot swallow the whole ring with a stack trace. */
export const ENTRY_MAX = 400;

const ring: RingEntry[] = [];

/** Coerce anything at all into one short line. Never throws — a logger that
 *  can throw turns one bug into two. */
export function describe(v: unknown): string {
  try {
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    return String(v);
  } catch {
    return '[undescribable]';
  }
}

export function note(kind: RingEntry['kind'], text: string, at: number = Date.now()): void {
  ring.push({ at, kind, text: text.slice(0, ENTRY_MAX) });
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
}

/** A copy, oldest first. Callers may not mutate the ring. */
export function entries(): RingEntry[] {
  return ring.slice();
}

export function clearRing(): void {
  ring.length = 0;
}

/**
 * Attach to the window. Idempotent, and it CHAINS rather than replaces —
 * swallowing an existing handler (or the real console.error) to collect
 * diagnostics would be its own bug.
 */
let attached = false;
export function attachErrorRing(w: Window & typeof globalThis = window): void {
  if (attached) return;
  attached = true;
  w.addEventListener('error', (e) => {
    note('error', `${describe(e.error ?? e.message)} @ ${e.filename ?? '?'}:${e.lineno ?? 0}`);
  });
  w.addEventListener('unhandledrejection', (e) => {
    note('rejection', describe((e as PromiseRejectionEvent).reason));
  });
  const original = w.console.error.bind(w.console);
  w.console.error = (...args: unknown[]) => {
    note('console', args.map(describe).join(' '));
    original(...args);
  };
}
