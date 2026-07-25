/**
 * Chips & Dip — the deterministic fold.
 *
 * Your bowl, your upgrades and your lifetime crunch are a pure function of the
 * replies on YOUR OWN table post, in chain order. Other players' tables are
 * display input for the boards and never touch your balance — that fold
 * isolation is what makes every observer's state byte-identical even though
 * different clients host different subsets of tables.
 *
 * Determinism rules, all load-bearing:
 *   - integers only, every multiplier a num/den pair with Math.floor
 *   - no wall clock; elapsed time is the consensus-bounded action timestamp
 *     (created_at) of CONFIRMED replies only. The body's authoring-ms orders
 *     moves within a block and salts the chip preimage, but NEVER measures
 *     elapsed time — a player writes it themselves, so keying decay to it lets
 *     them switch decay off by future-dating a single move.
 *   - only the table owner's replies are folded; anyone can reply to a post
 *   - pure and synchronous; Argon2id verification is done by the caller and
 *     handed in as `verified`, which MUST contain an entry for every bank.
 */
import {
  BANK_MIN_BITS, CRUMBS_PER_CHIP, GOLDEN_BITS, GOLD_NUM, GOLD_DEN, MAX_BITS,
  SOG_BASE_NUM, SOG_DEN, AIRTIGHT_BONUS, SOG_MAX_HOURS, START_BOWL_CAP,
  DIP_TIERS, CONGEAL_GAP_MS, UPGRADES, UPGRADE_CHAINS,
} from './chipsConst';

export interface ChipsHeader {
  v: 1;
  kind: 'chips-table';
  name: string;
  /** The table post's author_id. Replies from anyone else are skipped entirely. */
  owner: string;
}

export interface ChipsReply {
  author_id: string;
  body: string;
  block_height: number | null;
  content_id: string;
  created_at: number;
}

export type Outcome =
  | 'banked' | 'rejected-bits' | 'rejected-duplicate' | 'rejected-unverified'
  | 'bought' | 'rejected-cost' | 'rejected-owned' | 'rejected-order' | 'rejected-parse';

export interface MoveResult {
  content_id: string;
  ms: number;
  outcome: Outcome;
  bits?: number;
  crumbs?: number;
  upgradeKey?: string;
}

export interface ChipsState {
  crumbs: number;
  lifetimeChips: number;
  crispest: number;
  owned: Set<string>;
  bowlCap: number;
  seasoningNum: number;
  seasoningDen: number;
  fryers: number;
  goldenBits: number;
  airtight: boolean;
  dipIndex: number;
  /** Action timestamp of the last CONFIRMED move. The decay clock. */
  lastConfirmedAt: number;
  /** Action timestamp of the last confirmed bank, for the congeal quirk. */
  lastBankAt: number;
  /** Banks with no entry in `verified` — the UI must gate on this being 0. */
  unverifiedBanks: number;
  moves: MoveResult[];
}

export type ParsedMove =
  | { kind: 'bank'; bits: number; nonce: bigint; ms: number }
  | { kind: 'buy'; key: string; ms: number };

/** The reef-style embedded authoring timestamp: `...#<ms>~` */
export function authoringMs(body: string): number | null {
  const m = /#(\d+)~\s*$/.exec(body.trim());
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

export function parseMove(body: string): ParsedMove | null {
  const ms = authoringMs(body);
  if (ms === null) return null;
  const head = body.trim().replace(/#\d+~$/, '').trim();

  const bankM = /^bank\s+(\d+)\s+([0-9a-fA-F]{1,16})$/.exec(head);
  if (bankM) {
    const bits = Number(bankM[1]);
    if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) return null;
    return { kind: 'bank', bits, nonce: BigInt('0x' + bankM[2]), ms };
  }

  const buyM = /^buy\s+([a-z0-9]+)$/.exec(head);
  if (buyM) return { kind: 'buy', key: buyM[1], ms };

  return null;
}

/**
 * Confirmed first (by height), then authoring-ms, then content_id. Pending last.
 *
 * `authoringMs` is a regex over the body, so it is computed ONCE per reply and
 * carried alongside it rather than being called from the comparator — a
 * comparator that re-parses would run ~2 regexes per comparison, i.e. O(N log N)
 * regex executions on the main thread. Callers additionally filter to the
 * table owner BEFORE calling this, so N is the owner's own move count and a
 * stranger cannot inflate it (see `foldChips`).
 */
function orderReplies(replies: ChipsReply[]): ChipsReply[] {
  // Fall back to 0, never created_at: the node stamps PENDING replies'
  // created_at at query time, so using it here would order unparsed replies
  // differently on every client and every refresh (the reef pending bug).
  const keyed = replies.map((r) => ({ r, ms: authoringMs(r.body) ?? 0 }));
  keyed.sort((a, b) => {
    const ah = a.r.block_height ?? Number.MAX_SAFE_INTEGER;
    const bh = b.r.block_height ?? Number.MAX_SAFE_INTEGER;
    if (ah !== bh) return ah - bh;
    if (a.ms !== b.ms) return a.ms - b.ms;
    return a.r.content_id < b.r.content_id ? -1 : a.r.content_id > b.r.content_id ? 1 : 0;
  });
  return keyed.map((x) => x.r);
}

export function dipIndexFor(lifetimeChips: number): number {
  let idx = 0;
  for (let i = 0; i < DIP_TIERS.length; i++) {
    if (lifetimeChips >= DIP_TIERS[i].minLifetime) idx = i;
  }
  return idx;
}

/**
 * Sog numerator: the dip tier sets the base, `airtight` then adds. Order fixed.
 *
 * Exported so the DISPLAY-ONLY projection (sogProjection.ts) can consume the
 * fold's own resolution instead of hand-copying it — a second copy of this
 * two-line rule is a display that lies the moment either half is retuned.
 */
export function sogNum(state: ChipsState): number {
  const tier = DIP_TIERS[state.dipIndex];
  const base = tier.sogNum ?? SOG_BASE_NUM;
  return base + (state.airtight ? AIRTIGHT_BONUS : 0);
}

/**
 * Hours elapsed between two action timestamps, clamped to SOG_MAX_HOURS.
 *
 * Exported — not inlined into `applySog` — because this clamp is NOT
 * observable through `crumbs` in any realistic fixture: at the base decay
 * rate (97/100), integer flooring already zeroes a reachable bowl within
 * ~379 hours, well inside the 720-hour clamp, so a fixture-based test would
 * pass identically with the clamp deleted. Even under `airtight` (99/100),
 * the surviving remainder at the 720-hour boundary is the same order of
 * magnitude as the accumulated integer-floor error, so that too would be
 * luck rather than proof (see chipsEngine.sog.test.ts block 7 and
 * chipsEngine.buy.test.ts's note on this). The clamp is instead pinned
 * arithmetically, directly against this function. Do not inline it back into
 * `applySog` — that removes the only place the clamp can be tested.
 */
export function sogHoursFor(fromAt: number, toAt: number): number {
  if (toAt <= fromAt) return 0;
  return Math.min(Math.floor((toAt - fromAt) / 3_600_000), SOG_MAX_HOURS);
}

/** Decay the bowl over whole elapsed hours. Integer-only, bounded work. */
function applySog(state: ChipsState, fromMs: number, toMs: number): void {
  if (state.crumbs <= 0) return;
  const hours = sogHoursFor(fromMs, toMs);
  const num = sogNum(state);
  for (let i = 0; i < hours && state.crumbs > 0; i++) {
    state.crumbs = Math.floor((state.crumbs * num) / SOG_DEN);
  }
}

/**
 * `at` is the ACTION timestamp (created_at), never the body's authoring-ms.
 *
 * The payout resolution order is FIXED at: base -> golden -> dip `payNum` ->
 * congeal x2 -> seasoning, with `Math.floor` at each multiplying step. It is
 * consensus-critical, not cosmetic: integer division does not commute, so
 * swapping any two steps changes crumbs by a few units on some inputs and every
 * client that reordered them would disagree about the same table forever. The
 * spec pins this same order (docs/superpowers/specs/2026-07-25-chips-and-dip-design.md).
 * Do not reorder these lines, and do not "simplify" them into one expression.
 */
function payoutFor(state: ChipsState, bits: number, at: number): number {
  let crumbs = CRUMBS_PER_CHIP * 2 ** (bits - BANK_MIN_BITS);
  if (bits >= state.goldenBits) crumbs = Math.floor((crumbs * GOLD_NUM) / GOLD_DEN);

  const tier = DIP_TIERS[state.dipIndex];
  if (tier.payNum && tier.payDen) crumbs = Math.floor((crumbs * tier.payNum) / tier.payDen);
  if (tier.congeal && state.lastBankAt > 0 && at - state.lastBankAt >= CONGEAL_GAP_MS) crumbs *= 2;

  return Math.floor((crumbs * state.seasoningNum) / state.seasoningDen);
}

function initialState(): ChipsState {
  return {
    crumbs: 0, lifetimeChips: 0, crispest: 0,
    owned: new Set(), bowlCap: START_BOWL_CAP,
    seasoningNum: 1, seasoningDen: 1, fryers: 1,
    goldenBits: GOLDEN_BITS, airtight: false,
    dipIndex: 0, lastConfirmedAt: 0, lastBankAt: 0,
    unverifiedBanks: 0, moves: [],
  };
}

/**
 * Fold a table's replies into game state.
 *
 * PRECONDITION: `verified` maps content_id -> actual leading zero bits for
 * EVERY bank reply. A missing entry folds as `rejected-unverified`, which is
 * deterministic but wrong — callers must complete verification first
 * (see chipsVerify.ts) or clients will disagree.
 */
export function foldChips(
  header: ChipsHeader,
  _tableId: string,
  replies: ChipsReply[],
  verified: Map<string, number>
): ChipsState {
  const state = initialState();
  const seenProofs = new Set<string>();

  // OWNER ENFORCEMENT, and it runs BEFORE the sort for two separate reasons.
  //
  // CORRECTNESS: anyone may reply to a public post, so without this a stranger
  // drives your state for the price of one reply: floor your bowl by advancing
  // the clock, inflate your lifetime into a faster-decaying dip tier, or spend
  // your crumbs. Foreign replies are dropped before any clock advance, any
  // mutation, and before they appear in `moves`.
  //
  // COST: `loadTable` pulls up to 100k replies and the boards re-fold on every
  // rotation, so sorting first would let N spam replies buy every observer an
  // O(N log N) main-thread sort of content they are about to discard. Filtering
  // first is what makes the fold's work proportional to the OWNER's move count,
  // matching the identical filter verifyReplies already applies before hashing.
  //
  // This cannot change fold OUTPUT: the comparator is a total order over
  // (block_height, authoring-ms, content_id), so the owner's replies come out
  // in the same sequence whether the strangers were removed before or after.
  const mine = replies.filter((r) => r.author_id === header.owner);

  for (const reply of orderReplies(mine)) {
    const parsed = parseMove(reply.body);
    if (!parsed) {
      state.moves.push({ content_id: reply.content_id, ms: 0, outcome: 'rejected-parse' });
      continue;
    }

    // THE DECAY CLOCK IS THE ACTION TIMESTAMP (created_at), NEVER parsed.ms.
    // created_at is consensus-bounded — verify_pow rejects actions >60s in the
    // future (src/crypto/action_pow.rs:554-572) — whereas the body's #<ms>~ is
    // free text a player could pin in the future forever to switch decay off.
    // Pending replies carry a query-time created_at, so they never advance it.
    const confirmed = reply.block_height !== null;
    if (confirmed) {
      if (state.lastConfirmedAt > 0) applySog(state, state.lastConfirmedAt, reply.created_at);
      state.lastConfirmedAt = Math.max(state.lastConfirmedAt, reply.created_at);
    }
    const at = confirmed ? reply.created_at : state.lastConfirmedAt;

    if (parsed.kind === 'bank') {
      // Author is part of the proof preimage, so it belongs in the identity key.
      const proofKey = `${reply.author_id}:${parsed.ms}:${parsed.nonce.toString(16)}`;
      const actual = verified.get(reply.content_id);

      if (actual === undefined) {
        state.unverifiedBanks++;
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-unverified' });
      } else if (parsed.bits < BANK_MIN_BITS || actual < parsed.bits) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-bits', bits: parsed.bits });
      } else if (seenProofs.has(proofKey)) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-duplicate', bits: parsed.bits });
      } else {
        seenProofs.add(proofKey);
        const crumbs = payoutFor(state, parsed.bits, at);
        state.crumbs = Math.min(state.crumbs + crumbs, state.bowlCap);
        state.lifetimeChips += 2 ** (parsed.bits - BANK_MIN_BITS);
        if (parsed.bits > state.crispest) state.crispest = parsed.bits;
        state.dipIndex = dipIndexFor(state.lifetimeChips);
        if (confirmed) state.lastBankAt = at;
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'banked', bits: parsed.bits, crumbs });
      }
      continue;
    }

    applyBuy(state, reply, parsed);
  }

  return state;
}

/**
 * Check precedence is FIXED at: unknown key -> already owned -> chain order ->
 * affordability. Order precedes cost deliberately: "you skipped a tier" is the
 * more fundamental error, and a player who is both broke and out of order is
 * better told the thing that will still be true once they have the crumbs.
 * The tests depend on this order — changing it flips expected outcomes.
 */
function applyBuy(
  state: ChipsState,
  reply: ChipsReply,
  parsed: { kind: 'buy'; key: string; ms: number }
): void {
  const push = (outcome: Outcome): void => {
    state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome, upgradeKey: parsed.key });
  };

  const upgrade = UPGRADES[parsed.key];
  if (!upgrade) return push('rejected-parse');
  if (state.owned.has(parsed.key)) return push('rejected-owned');

  // Chained upgrades must be bought in order.
  const chain = UPGRADE_CHAINS.find((c) => c.includes(parsed.key));
  if (chain) {
    const idx = chain.indexOf(parsed.key);
    for (let i = 0; i < idx; i++) {
      if (!state.owned.has(chain[i])) return push('rejected-order');
    }
  }

  if (state.crumbs < upgrade.cost) return push('rejected-cost');

  state.crumbs -= upgrade.cost;
  state.owned.add(parsed.key);
  if (upgrade.bowlCap !== undefined) state.bowlCap = upgrade.bowlCap;
  if (upgrade.seasoningNum !== undefined && upgrade.seasoningDen !== undefined) {
    state.seasoningNum = upgrade.seasoningNum;
    state.seasoningDen = upgrade.seasoningDen;
  }
  if (upgrade.fryers !== undefined) state.fryers = upgrade.fryers;
  if (upgrade.goldenBits !== undefined) state.goldenBits = upgrade.goldenBits;
  if (upgrade.airtight) state.airtight = true;

  push('bought');
}
