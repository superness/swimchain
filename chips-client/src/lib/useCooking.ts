/**
 * The interval driver for the cooking engine — deliberately DUMB. All rules
 * live in cooking.ts (pure, tested); this hook owns exactly three things:
 * the setInterval, the React state array, and surfacing tick/crackle events
 * to the caller for sound and animation.
 *
 * No workers, no WASM, no mining: the clock IS the game (see cooking.ts's
 * header — designer-paced by operator decision). This file replacing
 * useFryers.ts is what removed Argon2id from gameplay entirely.
 *
 * The crew reaches into the clock through `modsFor` (rat siphons a fryer,
 * angel forces a crackle — lib/crewJobs.ts) and through `take` (a vendor is
 * fed a chip: consumed like a dip, credited like nothing).
 */
import { useEffect, useRef, useState } from 'react';
import { readRack, writeRack } from './rackStore';
import {
  tickChip, dipFor, freshChip, createMsAllocator, isGolden,
  TICK_MS, type CookingChip, type DipResult, type TickMods,
} from './cooking';

export interface CookEvent {
  index: number;
  ms: number;
  gained: number;
  crackled: boolean;
  /** The crackle that just landed made the chip golden (terminal). */
  wentGolden: boolean;
  /** The gain was siphoned by whoever latched this fryer (rat) — the pot
   *  did not move; the caller banks it in the hoard. */
  diverted: boolean;
  /** A crackle landed here and was EATEN — the multi did not move. */
  crackleEaten: boolean;
}

export function useCooking(
  count: number,
  seasoning: number,
  crackleHaste: number,
  /** No cooking before the shop is actually open (no table/identity yet). */
  active: boolean,
  onEvents?: (events: CookEvent[]) => void,
  /** Per-fryer interference for the NEXT tick (crew jobs). Read through a
   *  ref at tick time, like the params — never restarts the clock. */
  modsFor?: (index: number) => TickMods,
  /** Where to keep the rack across reloads. Omit and nothing is stored — the
   *  pots then live only in memory, which is what destroyed them before. */
  persist?: { tableId: string; author: string } | null
) {
  const [chips, setChips] = useState<CookingChip[]>([]);
  const latest = useRef<CookingChip[]>([]);
  const persistRef = useRef(persist);
  persistRef.current = persist;
  /** Restored once, on the first tick the rack is real — see the effect. */
  const restored = useRef(false);
  const allocRef = useRef<() => number>();
  if (!allocRef.current) allocRef.current = createMsAllocator();

  // Read by the interval without restarting it — the tick cadence must never
  // reset just because an upgrade changed the seasoning mid-cook.
  const params = useRef({ seasoning, crackleHaste });
  params.current = { seasoning, crackleHaste };
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;
  const modsForRef = useRef(modsFor);
  modsForRef.current = modsFor;

  /**
   * THE RACK COMES BACK. A pot lived only in React state, so a refresh, a
   * crash or a phone reclaiming the tab destroyed it — worst for the player
   * playing best, since holding is the whole strategy (cooking.ts's BALANCE
   * MATH note). Restored once, the first time the rack has a real size.
   *
   * NOT offline progress: the chips come back exactly as they were left and
   * the clock does not catch up. You lose nothing by closing the tab and you
   * gain nothing either, which is the rule the rest of the game already
   * follows.
   */
  useEffect(() => {
    if (restored.current || !active || !persist || count <= 0) return;
    restored.current = true;
    const saved = readRack(window.localStorage, persist.tableId, persist.author);
    if (!saved || saved.length === 0) return;
    const next = saved.slice(0, count);
    latest.current = next;
    setChips(next);
  }, [active, persist, count]);

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
        const mods = modsForRef.current?.(index) ?? {};
        const r = tickChip(chip, params.current.seasoning, params.current.crackleHaste, Math.random, mods);
        if (r.gained > 0 || r.crackled || r.crackleEaten) {
          events.push({
            index, ms: chip.ms, gained: r.gained, crackled: r.crackled,
            wentGolden: r.crackled && isGolden(r.chip) && before < r.chip.crackles,
            diverted: r.diverted, crackleEaten: r.crackleEaten,
          });
        }
        return r.chip;
      });
      latest.current = next;
      setChips(next);
      if (events.length > 0) onEventsRef.current?.(events);
      // Save on the tick, not on every render: the cadence is 2.5s and the
      // row is a handful of numbers, so this is cheap and means at most one
      // tick of pot is ever at risk.
      const pr = persistRef.current;
      if (pr) writeRack(window.localStorage, pr.tableId, pr.author, latest.current);
    }, TICK_MS);
    return () => window.clearInterval(iv);
  }, [active]);

  /**
   * Cash chip `index`. DESTRUCTIVE like the old bank(): the returned result
   * is the only copy of that dip; the slot restarts with a fresh chip
   * immediately. Returns null for an empty pot — dipping nothing is a no-op,
   * not an error.
   */
  function dip(
    index: number, doubleDipMod: number,
  ): (DipResult & { ms: number; chipMs: number; pot: number; cookedMs: number }) | null {
    const chip = latest.current[index];
    if (!chip || chip.pot <= 0) return null;
    // `ms` is allocated HERE, at the dip, and is what goes on the wire — see
    // dipFor's header for why handing over the chip's birth ms silently fed
    // the biggest dips to a stale bowl cap. Allocated before the basket
    // restarts below so the dip's identity precedes the new chip's.
    const res = dipFor(chip, doubleDipMod, Math.random, allocRef.current!);
    const next = latest.current.slice();
    next[index] = freshChip(allocRef.current!());
    latest.current = next;
    setChips(next);
    return res;
  }

  /**
   * TAKE chip `index` off the fryer without dipping it — a vendor's payment.
   * Consumed exactly like a dip (the slot restarts fresh) but credits
   * NOTHING: the pot is the price. Null on an empty pot — a critter will not
   * be fobbed off with raw batter.
   */
  function take(index: number): Pick<CookingChip, 'ms' | 'pot' | 'crackles'> | null {
    const chip = latest.current[index];
    if (!chip || chip.pot <= 0) return null;
    const next = latest.current.slice();
    next[index] = freshChip(allocRef.current!());
    latest.current = next;
    setChips(next);
    return { ms: chip.ms, pot: chip.pot, crackles: chip.crackles };
  }

  /**
   * EMPTY THE WHOLE RACK. Every slot restarts fresh and NOTHING is credited.
   *
   * The rack-resize effect above keeps chips by identity on purpose — a pot
   * in progress is the player's accumulated watching and a count change must
   * never reset it. That is right for buying a fryer and WRONG for a tip: a
   * tip drops the count 4 -> 1, so `slice(0, 1)` carried chip 0 across the
   * reset with its whole old-run pot and multiplier, into a bowl whose cap
   * had just gone back to START_BOWL_CAP. The first dip of every new run was
   * therefore clamped, every time (operator: "the first dip is always
   * eaten"). Resizing cannot express "start over"; this can.
   */
  function resetAll(): void {
    const next = latest.current.map(() => freshChip(allocRef.current!()));
    latest.current = next;
    setChips(next);
  }

  /** The shared authoring-ms allocator — rat payouts need wire identities
   *  from the SAME sequence as dips, or two moves could collide on ms. */
  function allocMs(): number {
    return allocRef.current!();
  }

  return { chips, dip, take, resetAll, allocMs };
}
