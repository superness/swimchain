/**
 * The interval driver for the cooking engine — deliberately DUMB. All rules
 * live in cooking.ts (pure, tested); this hook owns exactly three things:
 * the setInterval, the React state array, and surfacing tick/crackle events
 * to the caller for sound and animation.
 *
 * No workers, no WASM, no mining: the clock IS the game (see cooking.ts's
 * header — designer-paced by operator decision). This file replacing
 * useFryers.ts is what removed Argon2id from gameplay entirely.
 */
import { useEffect, useRef, useState } from 'react';
import {
  tickChip, dipChip, freshChip, createMsAllocator, isGolden,
  TICK_MS, type CookingChip, type DipResult,
} from './cooking';

export interface CookEvent {
  index: number;
  ms: number;
  gained: number;
  crackled: boolean;
  /** The crackle that just landed made the chip golden (terminal). */
  wentGolden: boolean;
}

export function useCooking(
  count: number,
  seasoning: number,
  crackleHaste: number,
  /** No cooking before the shop is actually open (no table/identity yet). */
  active: boolean,
  onEvents?: (events: CookEvent[]) => void
) {
  const [chips, setChips] = useState<CookingChip[]>([]);
  const latest = useRef<CookingChip[]>([]);
  const allocRef = useRef<() => number>();
  if (!allocRef.current) allocRef.current = createMsAllocator();

  // Read by the interval without restarting it — the tick cadence must never
  // reset just because an upgrade changed the seasoning mid-cook.
  const params = useRef({ seasoning, crackleHaste });
  params.current = { seasoning, crackleHaste };
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;

  // Resize the rack — keep existing chips BY IDENTITY (a pot in progress is
  // the player's accumulated watching; a count change must never reset it).
  useEffect(() => {
    const target = active ? Math.max(0, count) : 0;
    const cur = latest.current;
    if (cur.length === target) return;
    const next = cur.length > target
      ? cur.slice(0, target)
      : [...cur, ...Array.from({ length: target - cur.length }, () => freshChip(allocRef.current!()))];
    latest.current = next;
    setChips(next);
  }, [count, active]);

  // The clock. One interval for the whole rack; every chip ticks together —
  // "tick, tick, tick, every few seconds, always".
  useEffect(() => {
    if (!active) return;
    const iv = window.setInterval(() => {
      if (latest.current.length === 0) return;
      const events: CookEvent[] = [];
      const next = latest.current.map((chip, index) => {
        const before = chip.crackles;
        const r = tickChip(chip, params.current.seasoning, params.current.crackleHaste, Math.random);
        if (r.gained > 0 || r.crackled) {
          events.push({
            index, ms: chip.ms, gained: r.gained, crackled: r.crackled,
            wentGolden: r.crackled && isGolden(r.chip) && before < r.chip.crackles,
          });
        }
        return r.chip;
      });
      latest.current = next;
      setChips(next);
      if (events.length > 0) onEventsRef.current?.(events);
    }, TICK_MS);
    return () => window.clearInterval(iv);
  }, [active]);

  /**
   * Cash chip `index`. DESTRUCTIVE like the old bank(): the returned result
   * is the only copy of that dip; the slot restarts with a fresh chip
   * immediately. Returns null for an empty pot — dipping nothing is a no-op,
   * not an error.
   */
  function dip(index: number, doubleDipMod: number): (DipResult & { ms: number; pot: number }) | null {
    const chip = latest.current[index];
    if (!chip || chip.pot <= 0) return null;
    const res = dipChip(chip, doubleDipMod, Math.random);
    const next = latest.current.slice();
    next[index] = freshChip(allocRef.current!());
    latest.current = next;
    setChips(next);
    return { ...res, ms: chip.ms, pot: chip.pot };
  }

  return { chips, dip };
}
