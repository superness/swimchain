/**
 * The Trench — a node-homestead game on Swimchain, folded deterministically from the
 * chain, in the reef/chess "substrate = fold" tradition.
 *
 * "Claim = post, move = reply, world = pure function of the ordered action log."
 * Your node is your homestead's lantern: while it runs, it posts heartbeats (at most
 * once every 4 hours, capped at HB_CAP_PER_DAY/day, enforced HERE in the fold, not just
 * client-side). Lantern brightness — the trailing-7-day heartbeat count — governs farm
 * yield and structure decay. Go dark long enough and the abyss reclaims your structures.
 *
 * ── Determinism ─────────────────────────────────────────────────────────────────────
 * All quantities are INTEGER HALF-UNITS (display divides by 2). All time math derives
 * from embedded authoring-ms (the `#<ms>~` suffix reef pioneered), quantized to UTC
 * days — never wall-clock. Replies are sorted by (embeddedMs ?? created_at, content_id)
 * before folding, so the SAME reply set folds byte-identical regardless of array order
 * (test 12 proves this). Invalid moves fold as present-but-rejected (they still occupy
 * stream order), mirroring reef.
 *
 * ── Fold isolation rule (spec §2) ───────────────────────────────────────────────────
 * A player's balance and claim state fold ONLY from replies on their OWN claim post.
 * `foldClaim` takes just one claim's own reply stream; cross-claim data (neighbor
 * positions, brightness, ruins) is what `foldMap` is for — display/driver input, never
 * balance input. This is what keeps every observer's fold identical regardless of which
 * subset of the map they've hosted.
 *
 * ── Banking ──────────────────────────────────────────────────────────────────────────
 * Before applying each move at day D, days `lastDay+1 .. D` are banked one at a time:
 * per ALIVE farm, yield (by that day's brightness) is added to biomass (clamped to the
 * live cap); per structure, decay (by brightness) is subtracted from integrity, ruining
 * it at <=0; on a LIT day, alive structures earn glow. The FIRST move's day initializes
 * `lastDay` with NO retro-banking — the founding day itself banks nothing (there is no
 * "day before founding" to have produced or decayed anything).
 *
 * `project()` is the display-only forward simulation used for "what will my claim look
 * like if I don't touch it for N more days" — it NEVER banks (never mutates fold state);
 * it operates on cloned structures so the real ClaimState, and any later real fold, is
 * completely unaffected.
 */

// ── import.meta-env guard (reef pattern: reefEngine.ts's REEF_SPACE/GAME_SPONSOR) ────
// `import.meta.env` only exists under Vite; guarding with `?.` after `.env` (rather than
// `typeof import.meta === 'undefined'`, which would be a syntax trap since `import.meta`
// is always a live object in ESM) is what lets this module load unmodified under plain
// `tsx` (no Vite) for the test suite, exactly as reefEngine.ts:109-122 does.
export const TRENCH_SPACE: string =
  (import.meta.env?.VITE_TRENCH_SPACE as string | undefined)?.trim() || '';

/**
 * Preferred onboarding sponsor's public key (hex) — see reefEngine.ts's GAME_SPONSOR
 * for the full rationale (must be an always-online node so auto-sponsor claims resolve
 * promptly). Configurable via VITE_GAME_SPONSOR; defaults to the testnet genesis root,
 * same as reef/chess (production deploys override via .env.production).
 */
export const GAME_SPONSOR: string =
  (import.meta.env?.VITE_GAME_SPONSOR as string | undefined)?.trim() ||
  '9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420';

// ── Engine constants (Global Constraints — INTEGER HALF-UNITS unless noted "whole") ──
export const START_SALVAGE = 20;
export const COST_FARM = 10;
export const COST_STOREHOUSE = 16;
export const COST_BEACON = 12;
/** Per resource (salvage, biomass), before any storehouse. */
export const CAP_BASE = 40;
/** Each alive storehouse raises BOTH caps by this much. */
export const CAP_PER_STOREHOUSE = 40;
export const INTEGRITY_MAX = 20;
export const DECAY_LIT = 1;
export const DECAY_BASE = 2; // also what DIM uses
export const DECAY_DARK = 4;
export const YIELD_LIT = 4;
export const YIELD_DIM = 2;
export const YIELD_DARK = 1;
export const TEND_COST = 4;
/** Whole count. */
export const HB_CAP_PER_DAY = 6;
/** Whole counts — heartbeats over the trailing 7 days. */
export const LIT_MIN = 25;
export const DIM_MIN = 8;
/** Chebyshev distance, whole units. */
export const EXPEDITION_BASE_RANGE = 6;
export const RANGE_PER_BEACON = 4;
/** Chebyshev, whole units. */
export const CLAIM_MIN_SPACING = 2;
/** Whole. */
export const GLOW_PER_STRUCTURE_LIT_DAY = 1;

/** UTC-day quantum. Not exported — utcDay() is the public surface for this math. */
const DAY_MS = 86_400_000;

// ── Types ────────────────────────────────────────────────────────────────────────────
export type StructureKind = 'farm' | 'storehouse' | 'beacon';
export type Brightness = 'LIT' | 'DIM' | 'DARK';
export type MoveOutcome =
  | 'ok'
  | 'rejected-unaffordable'
  | 'rejected-capped'
  | 'rejected-unknown-structure'
  | 'rejected-ruined'
  | 'rejected-out-of-range'
  | 'rejected-day-gate'
  | 'rejected-malformed'
  | 'rejected-self';

export interface ReplyLike {
  author_id: string;
  body: string | null;
  content_id: string;
  created_at: number;
  block_height: number | null;
}

export interface Structure {
  kind: StructureKind;
  integrity: number;
  builtDay: number;
  ruined: boolean;
}

export interface FoldedMove {
  op: string;
  day: number;
  ms: number;
  outcome: MoveOutcome;
  contentId: string;
  author: string;
}

export interface ClaimHeader {
  v: 1;
  kind: 'trench-claim';
  name: string;
  x: number;
  y: number;
}

export interface ClaimState {
  header: ClaimHeader;
  owner: string;
  claimId: string;
  salvage: number; // half-units, clamped to capSalvage
  biomass: number; // half-units, clamped to capBiomass
  capSalvage: number;
  capBiomass: number;
  structures: Structure[]; // index-addressed by build order (ruins stay)
  brightness: Brightness; // as of lastDay
  heartbeatDays: Map<number, number>; // UTC day -> accepted heartbeat count
  lastDay: number; // last banked UTC day (from newest folded move)
  glow: number; // whole units
  moves: FoldedMove[];
  expeditionDays: Map<string, number>; // target16hex -> last expedition UTC day
}

// ── Parsing ──────────────────────────────────────────────────────────────────────────

/** Claim post body: `<name>\n\n{"v":1,"kind":"trench-claim","name":"<name>","x":<x>,"y":<y>}`. */
export function parseClaimHeader(body: string | null | undefined): ClaimHeader | null {
  if (!body) return null;
  const nl = body.indexOf('\n\n');
  const jsonStr = nl >= 0 ? body.slice(nl + 2) : body;
  try {
    const h = JSON.parse(jsonStr);
    if (!h || h.v !== 1 || h.kind !== 'trench-claim') return null;
    if (typeof h.name !== 'string' || !Number.isInteger(h.x) || !Number.isInteger(h.y)) return null;
    return { v: 1, kind: 'trench-claim', name: h.name, x: h.x, y: h.y };
  } catch {
    return null;
  }
}

/** Parses the `#<ms>~` authoring-timestamp field (reef convention). */
export function embeddedMs(body: string): number | undefined {
  const m = /#(\d+)~/.exec(body);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

export function utcDay(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** Brightness tier from the heartbeat count over the trailing 7 days INCLUDING `day`. */
export function brightnessOn(heartbeatDays: Map<number, number>, day: number): Brightness {
  let sum = 0;
  for (let d = day - 6; d <= day; d++) sum += heartbeatDays.get(d) ?? 0;
  if (sum >= LIT_MIN) return 'LIT';
  if (sum >= DIM_MIN) return 'DIM';
  return 'DARK';
}

export function chebyshev(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

/**
 * Deterministic 1..3 roll derived from the expedition move's own content-id hash, so
 * no observer needs anything but the mover's own reply to verify it. `contentId` is
 * expected in a `<scheme>:<hex>` shape (e.g. `sha256:00ab…`); the scheme prefix (if
 * any) is stripped and the first hex byte of what remains drives the roll. Falls back
 * to treating the whole string as the hash part when there's no `:`, so it never throws
 * on an unusual id shape — worst case, a non-hex-leading id rolls 1.
 */
export function salvageRoll(contentId: string): number {
  const colon = contentId.indexOf(':');
  const hashPart = colon >= 0 ? contentId.slice(colon + 1) : contentId;
  const n = parseInt(hashPart.slice(0, 2), 16);
  const safe = Number.isFinite(n) ? n : 0;
  return 1 + (safe % 3);
}

// ── Move parsing ─────────────────────────────────────────────────────────────────────

type ParsedMove =
  | { op: 'heartbeat' }
  | { op: 'harvest' }
  | { op: 'build'; kind: StructureKind }
  | { op: 'tend'; idx: number }
  | { op: 'expedition'; target: string; tx: number; ty: number };

/**
 * Reads only the tokens each verb needs; trailing tokens (the `#<ms>~` field, any
 * dedup nonce) are ignored, mirroring reef's parseMove. Anything not matching a known
 * verb with well-formed args is malformed (`null`) — folded as `rejected-malformed`,
 * still occupying stream order, by the caller.
 */
function parseMove(body: string | null | undefined): ParsedMove | null {
  if (!body) return null;
  const t = body.trim().split(/\s+/);
  switch (t[0]) {
    case 'heartbeat':
      return { op: 'heartbeat' };
    case 'harvest':
      return { op: 'harvest' };
    case 'build': {
      const kind = t[1];
      if (kind !== 'farm' && kind !== 'storehouse' && kind !== 'beacon') return null;
      return { op: 'build', kind };
    }
    case 'tend': {
      const idx = Number(t[1]);
      if (!Number.isInteger(idx)) return null;
      return { op: 'tend', idx };
    }
    case 'expedition': {
      const target = t[1];
      const tx = Number(t[2]);
      const ty = Number(t[3]);
      if (!target || !Number.isInteger(tx) || !Number.isInteger(ty)) return null;
      return { op: 'expedition', target, tx, ty };
    }
    default:
      return null;
  }
}

// ── Shared day-bank arithmetic (used by both foldClaim's real advance and project's
//    read-only simulation — passing a CLONE of `structures` for the latter is what
//    keeps project() from ever banking the real state). ──────────────────────────────

function capFor(structures: readonly Structure[]): number {
  let storehouses = 0;
  for (const s of structures) if (!s.ruined && s.kind === 'storehouse') storehouses++;
  return CAP_BASE + CAP_PER_STOREHOUSE * storehouses;
}

function yieldOf(b: Brightness): number {
  return b === 'LIT' ? YIELD_LIT : b === 'DIM' ? YIELD_DIM : YIELD_DARK;
}

function decayOf(b: Brightness): number {
  return b === 'LIT' ? DECAY_LIT : b === 'DIM' ? DECAY_BASE : DECAY_DARK;
}

/**
 * Banks one UTC day: alive-farm yield (clamped to the live cap; a cap that has since
 * shrunk below the CURRENT biomass never claws it back — "does not retroactively
 * spill"), then per-structure decay (ruining at <=0, integrity floored at 0), then
 * LIT-day glow. Mutates `structures`' elements in place — callers pass either the
 * real fold's array (foldClaim) or a deep clone (project) to control persistence.
 */
function advanceDay(
  day: number,
  structures: Structure[],
  heartbeatDays: Map<number, number>,
  biomass: number,
  glow: number
): { biomass: number; glow: number; brightness: Brightness } {
  const b = brightnessOn(heartbeatDays, day);

  let totalYield = 0;
  for (const s of structures) {
    if (s.ruined || s.kind !== 'farm') continue;
    totalYield += yieldOf(b);
  }
  let nextBiomass = biomass;
  if (totalYield > 0) {
    const cap = capFor(structures);
    nextBiomass = Math.max(biomass, Math.min(cap, biomass + totalYield));
  }

  for (const s of structures) {
    if (s.ruined) continue;
    s.integrity -= decayOf(b);
    if (s.integrity <= 0) {
      s.integrity = 0;
      s.ruined = true;
    }
  }

  let nextGlow = glow;
  if (b === 'LIT') {
    let alive = 0;
    for (const s of structures) if (!s.ruined) alive++;
    nextGlow += GLOW_PER_STRUCTURE_LIT_DAY * alive;
  }

  return { biomass: nextBiomass, glow: nextGlow, brightness: b };
}

// ── Fold ─────────────────────────────────────────────────────────────────────────────

/**
 * Fold ONE claim's own reply stream into its state (fold isolation rule — see file
 * header). Replies are sorted by (embeddedMs ?? created_at, content_id) so the result
 * is identical regardless of the input array's order.
 */
export function foldClaim(
  claimId: string,
  owner: string,
  header: ClaimHeader,
  replies: ReplyLike[]
): ClaimState {
  const structures: Structure[] = [];
  let salvage = START_SALVAGE;
  let biomass = 0;
  const heartbeatDays = new Map<number, number>();
  let lastDay: number | undefined;
  let glow = 0;
  const moves: FoldedMove[] = [];
  const expeditionDays = new Map<string, number>();
  let brightness: Brightness = 'DARK';

  const sortMs = (r: ReplyLike): number => (r.body ? embeddedMs(r.body) : undefined) ?? r.created_at;
  const sorted = [...replies].sort(
    (a, b) => sortMs(a) - sortMs(b) || a.content_id.localeCompare(b.content_id)
  );

  for (const r of sorted) {
    const ms = sortMs(r);
    const day = utcDay(ms);

    if (lastDay === undefined) {
      // Founding move: the day is set with NO retro-banking — there is no "day
      // before founding" for anything to have produced or decayed.
      lastDay = day;
      brightness = brightnessOn(heartbeatDays, day);
    } else if (day > lastDay) {
      for (let d = lastDay + 1; d <= day; d++) {
        const res = advanceDay(d, structures, heartbeatDays, biomass, glow);
        biomass = res.biomass;
        glow = res.glow;
        brightness = res.brightness;
      }
      lastDay = day;
    }

    const parsed = parseMove(r.body);
    let outcome: MoveOutcome;
    let op: string;

    if (!parsed) {
      outcome = 'rejected-malformed';
      op = (r.body ?? '').trim().split(/\s+/)[0] || 'malformed';
    } else {
      op = parsed.op;
      switch (parsed.op) {
        case 'heartbeat': {
          const count = heartbeatDays.get(day) ?? 0;
          if (count < HB_CAP_PER_DAY) {
            heartbeatDays.set(day, count + 1);
            outcome = 'ok';
          } else {
            outcome = 'rejected-capped';
          }
          break;
        }
        case 'harvest': {
          outcome = 'ok'; // banking already ran above; harvest itself has no effect
          break;
        }
        case 'build': {
          const cost =
            parsed.kind === 'farm' ? COST_FARM : parsed.kind === 'storehouse' ? COST_STOREHOUSE : COST_BEACON;
          if (salvage < cost) {
            outcome = 'rejected-unaffordable';
          } else {
            salvage -= cost;
            structures.push({ kind: parsed.kind, integrity: INTEGRITY_MAX, builtDay: day, ruined: false });
            // Storehouse caps are live-derived from alive structures (capFor), so
            // pushing it here is the entire "raise both caps" effect — no separate
            // cap variables to keep in sync.
            outcome = 'ok';
          }
          break;
        }
        case 'tend': {
          const s = structures[parsed.idx];
          if (parsed.idx < 0 || !s) {
            outcome = 'rejected-unknown-structure';
          } else if (s.ruined) {
            outcome = 'rejected-ruined';
          } else if (biomass < TEND_COST) {
            outcome = 'rejected-unaffordable';
          } else {
            biomass -= TEND_COST;
            s.integrity = INTEGRITY_MAX;
            outcome = 'ok';
          }
          break;
        }
        case 'expedition': {
          // A target16 prefix matching the actor's OWN claim id is a
          // self-expedition — free daily salvage for doing nothing (an
          // economy exploit, not a real visit: it drives no hosting, since
          // the actor's own node already has its own claim). Rejected
          // before the day-gate/range checks (and independent of them) so
          // no expeditionDays entry is ever recorded for it — a later
          // GENUINE expedition to that same 16-hex-colliding target (vanishingly
          // unlikely, but the day-gate is keyed on this same string) is
          // never blocked by a self-attempt that never should have counted.
          const selfHashPart = claimId.replace(/^sha256:/, '');
          if (selfHashPart.startsWith(parsed.target)) {
            outcome = 'rejected-self';
          } else {
            const lastVisit = expeditionDays.get(parsed.target);
            if (lastVisit === day) {
              outcome = 'rejected-day-gate';
            } else {
              let beacons = 0;
              for (const s of structures) if (!s.ruined && s.kind === 'beacon') beacons++;
              const range = EXPEDITION_BASE_RANGE + RANGE_PER_BEACON * beacons;
              const dist = chebyshev(header.x, header.y, parsed.tx, parsed.ty);
              if (dist > range) {
                outcome = 'rejected-out-of-range';
              } else {
                const gain = 2 * salvageRoll(r.content_id);
                const cap = capFor(structures);
                salvage = Math.max(salvage, Math.min(cap, salvage + gain));
                expeditionDays.set(parsed.target, day);
                outcome = 'ok';
              }
            }
          }
          break;
        }
      }
    }

    moves.push({ op, day, ms, outcome, contentId: r.content_id, author: r.author_id });
  }

  if (lastDay === undefined) lastDay = 0; // no replies at all — not a real playable claim

  return {
    header,
    owner,
    claimId,
    salvage,
    biomass,
    capSalvage: capFor(structures),
    capBiomass: capFor(structures),
    structures,
    brightness,
    heartbeatDays,
    lastDay,
    glow,
    moves,
    expeditionDays,
  };
}

// ── Helpers over a folded ClaimState ────────────────────────────────────────────────

export function aliveCount(s: ClaimState, kind: StructureKind): number {
  let n = 0;
  for (const st of s.structures) if (st.kind === kind && !st.ruined) n++;
  return n;
}

export function expeditionRange(s: ClaimState): number {
  return EXPEDITION_BASE_RANGE + RANGE_PER_BEACON * aliveCount(s, 'beacon');
}

/**
 * Display-only forward simulation of `s` to `nowMs` — NEVER banks. Operates on a clone
 * of `structures` and a local `biomass` copy; the real ClaimState (and any later
 * `foldClaim` over the same replies) is completely unaffected. Salvage has no daily
 * income, so it passes through unchanged; only biomass/structures/brightness project
 * forward.
 */
export function project(
  s: ClaimState,
  nowMs: number
): { biomass: number; salvage: number; structures: Structure[]; brightness: Brightness } {
  const day = utcDay(nowMs);
  const structures = s.structures.map((st) => ({ ...st }));
  let biomass = s.biomass;
  let glow = s.glow;
  let brightness = s.brightness;

  if (day > s.lastDay) {
    for (let d = s.lastDay + 1; d <= day; d++) {
      const res = advanceDay(d, structures, s.heartbeatDays, biomass, glow);
      biomass = res.biomass;
      glow = res.glow;
      brightness = res.brightness;
    }
  }

  return { biomass, salvage: s.salvage, structures, brightness };
}

// ── Map ──────────────────────────────────────────────────────────────────────────────

export interface MapClaim {
  claimId: string;
  owner: string;
  header: ClaimHeader;
  ms: number;
  accepted: boolean;
}

/**
 * Folds the shared claim list into acceptance state: claims are ordered by
 * (created_at, claimId) — a claim post carries no `#<ms>~` field, so there is no
 * authoring-ms to prefer — and any claim within CLAIM_MIN_SPACING (Chebyshev) of an
 * earlier-ACCEPTED claim is rejected, as is a malformed header. A malformed claim gets
 * a placeholder header (never null, matching the ClaimState-header contract) — callers
 * must gate on `accepted` before rendering/using it.
 */
export function foldMap(
  claims: Array<{ claimId: string; owner: string; body: string; created_at: number }>
): MapClaim[] {
  const sorted = [...claims].sort(
    (a, b) => a.created_at - b.created_at || a.claimId.localeCompare(b.claimId)
  );
  const accepted: ClaimHeader[] = [];
  const out: MapClaim[] = [];

  for (const c of sorted) {
    const header = parseClaimHeader(c.body);
    if (!header) {
      out.push({
        claimId: c.claimId,
        owner: c.owner,
        header: { v: 1, kind: 'trench-claim', name: '', x: 0, y: 0 },
        ms: c.created_at,
        accepted: false,
      });
      continue;
    }
    const tooClose = accepted.some((h) => chebyshev(h.x, h.y, header.x, header.y) < CLAIM_MIN_SPACING);
    if (tooClose) {
      out.push({ claimId: c.claimId, owner: c.owner, header, ms: c.created_at, accepted: false });
      continue;
    }
    accepted.push(header);
    out.push({ claimId: c.claimId, owner: c.owner, header, ms: c.created_at, accepted: true });
  }

  return out;
}
