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
 *     handed in as `verified`, which MUST contain an entry for every CHIP of
 *     every bank reply (a batch reply carries more than one) — see
 *     `foldChips`'s own docstring below for the precondition in full.
 */
import {
  BANK_MIN_BITS, CRUMBS_PER_CHIP, GOLDEN_BITS, GOLD_NUM, GOLD_DEN, MAX_BITS,
  SOG_BASE_NUM, SOG_DEN, AIRTIGHT_BONUS, SOG_MAX_HOURS, START_BOWL_CAP,
  TIP_FLOOR, SALT_PER_TIP,
  DIP_TIERS, CONGEAL_GAP_MS, UPGRADES, UPGRADE_CHAINS, MAX_BATCH,
  DEEP_BAND_COUNT, CHAR_PER_BAND, deepBandFloor,
  BURN_REFUND_NUM, BURN_REFUND_DEN,
  bossHp,
  FIRST_HP_BAND,
  type Upgrade,
} from './chipsConst';
import { proofKey } from './proofKey';

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
  | 'rejected-oversize'
  | 'dipped'
  | 'tipped' | 'rejected-shallow'
  | 'broke'
  | 'spent'
  /** A blow that hurt the boss without finishing it. */
  | 'chipped'
  /** `spend`: not enough char, or you already have it. */
  | 'rejected-char'
  | 'bought' | 'rejected-cost' | 'rejected-owned' | 'rejected-order' | 'rejected-parse'
  /** `burn` only: you do not have that jar. Distinct from `rejected-owned`,
   *  which is a BUY failing because you already do. */
  | 'burned' | 'rejected-unowned';

export interface MoveResult {
  content_id: string;
  ms: number;
  outcome: Outcome;
  bits?: number;
  crumbs?: number;
  upgradeKey?: string;
  /** Set on a banked chip whose payout was doubled by the double-dip rule —
   *  `crumbs` already includes the doubling; this flag exists so displays
   *  can celebrate it without re-deriving the nonce test. */
  doubleDip?: true;
  /** Old Salt granted by a `tipped` move. */
  salt?: number;
}

export interface ChipsState {
  crumbs: number;
  lifetimeChips: number;
  /** OLD SALT — permanent across tips, the one thing a tipped bowl keeps.
   *  "salt that has been through a bowl. it does not dissolve and it does
   *  not forget." */
  oldSalt: number;
  /** How many times this bowl has gone back over. */
  tips: number;
  /* ── THE DESCENT ────────────────────────────────────────────────────────
     Below the dip the bowl runs out and the world starts. `broken` is this
     bowl's progress and resets with the run; `deepest`, `char` and `bowls`
     are prestige and never do. Splitting them is what makes char
     ONCE-PER-BAND-EVER: a second descent re-walks the same bands and mints
     nothing, because char is paid only on a new personal best. */
  /** Bands broken in THIS run. Resets on a tip and on coming up through a
   *  bowl — you are in a new bowl and you dig out of it again. */
  broken: number;
  /** Jars REFUSED this run (`burn`). You took 70% of the price in crumbs and
   *  gave up the jar until the bowl goes over — and, for a chain rung, gave
   *  up everything above it too, because a buy still needs its prefix. */
  declined: Set<string>;
  /** The most bands ever broken in one run. Permanent. The char watermark. */
  deepest: number;
  /** Grains of char. Permanent, and capped forever at CHAR_TOTAL. */
  char: number;

  /** Total worth of chips FED TO BOSSES. Spent, never banked — recorded only
   *  so the UI can say what the descent cost. */
  paidToBosses: number;

  /** Damage dealt to the CURRENT band's boss, in crumbs — "chipping away at
   *  the table". Belongs to the BOWL: a tip resets it, so tipping mid-fight
   *  costs you the fight. Meaningless for band 0, which settles in one blow. */
  bossDamage: number;

  /** Char abilities bought from scoop. PRESTIGE — rides across a tip, like
   *  char itself: you paid the descent for these, not the run. */
  charOwned: Set<string>;
  /** Bowls come up through — the one number only the descent can move. */
  bowls: number;
  crispest: number;
  owned: Set<string>;
  bowlCap: number;
  seasoningNum: number;
  seasoningDen: number;
  fryers: number;
  goldenBits: number;
  airtight: boolean;
  /** Additional sog numerator from upgrades (chipsConst `sogBonus`), additive
   *  with `airtight`'s fixed +2. 0 until something grants it. */
  sogBonus: number;
  /** Double-dip modulus: 0 = off; otherwise a banked chip whose nonce is
   *  divisible by this pays double (see chipsConst's grind-resistance note). */
  doubleDipMod: number;
  dipIndex: number;
  /** Action timestamp of the last CONFIRMED move. The decay clock. */
  lastConfirmedAt: number;
  /** Action timestamp of the last confirmed bank, for the congeal quirk. */
  lastBankAt: number;
  /** Chips with no entry in `verified` — the UI must gate on this being 0. */
  unverifiedBanks: number;
  moves: MoveResult[];
}

/** One chip inside a bank move. A v1 reply carries exactly one. */
export interface ChipEntry {
  ms: number;
  bits: number;
  nonce: bigint;
}

export type ParsedMove =
  | { kind: 'bank'; chips: ChipEntry[]; ms: number }
  | { kind: 'buy'; key: string; ms: number }
  /** The pot-x-multi game's cash-out (2026-07-27): a SELF-DECLARED amount,
   *  accepted Cookie-Clicker style — no proof, no verification. The game is
   *  designer-paced and honor-scored by explicit operator decision ("we can
   *  be as secure and authentic as Cookie Clicker is. it's a GAME"). The
   *  fold's only guards are the parse bounds and the bowl cap. */
  | { kind: 'dip'; amount: number; ms: number }
  /** The bowl goes back over: everything resets except OLD SALT, which the
   *  FOLD computes from lifetime — never the client (see parseMove). */
  /** `keep` is the jar THE CRACK saves from the bowl; null for a plain tip. */
  | { kind: 'tip'; keep: string | null; ms: number }
  /** `paid` is the chip fed to the boss — it buys the band and pays nothing.
   *  0 for the legacy bare `broke` (one such reply exists on mainnet). */
  | { kind: 'broke'; paid: number; ms: number }
  | { kind: 'spend'; ability: string; cost: number; ms: number }
  /** Give a jar back for BURN_REFUND of its price. Names its key — unlike
   *  `broke`, the choice IS the move, and naming it forges nothing: the fold
   *  still checks you own it and computes the refund from the catalog. */
  | { kind: 'burn'; key: string; ms: number }
  /** Declared more than MAX_BATCH entries. Carried as a distinct kind so the
   *  fold can reject it whole WITHOUT verifying anything — see chipsConst. */
  | { kind: 'oversize'; count: number; ms: number };

/** The reef-style embedded authoring timestamp: `...#<ms>~` */
export function authoringMs(body: string): number | null {
  const m = /#(\d+)~\s*$/.exec(body.trim());
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

const ENTRY = /^(\d+):(\d+):([0-9a-fA-F]{1,16})$/;


export function parseMove(body: string): ParsedMove | null {
  const ms = authoringMs(body);
  if (ms === null) return null;
  const head = body.trim().replace(/#\d+~$/, '').trim();

  // NOTE: (.+), not (\S+) — the v1 form ("bank <bits> <nonce>") has a space
  // inside its argument, so a non-whitespace-only gate would never admit it
  // into this branch at all (the nested v1 check below, which matches against
  // `head` rather than `arg` specifically to handle that space, would then
  // never run). `arg` itself is only consumed by the batch path below, after
  // the v1 early-return, so widening this gate does not affect batch parsing.
  const bankM = /^bank\s+(.+)$/.exec(head);
  if (bankM) {
    const arg = bankM[1];

    // v1: `bank <bits> <nonce>` — two space-separated fields, no colons. The
    // chip's ms IS the authoring ms, which is what it has always meant.
    const v1 = /^bank\s+(\d+)\s+([0-9a-fA-F]{1,16})$/.exec(head);
    if (v1) {
      const bits = Number(v1[1]);
      if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) return null;
      return { kind: 'bank', chips: [{ ms, bits, nonce: BigInt('0x' + v1[2]) }], ms };
    }

    // Batch. Count commas FIRST, without splitting: an over-cap reply must
    // cost a comma-counting loop and nothing more. `split(',')` always yields
    // exactly `commaCount + 1` parts, so this produces the identical cutoff
    // and the identical reported `count` for every input — but a hostile
    // multi-megabyte comma-heavy body (there is no enforced reply-body size
    // limit on the node) no longer forces an allocation of millions of
    // throwaway strings just to be told the reply is oversize. This fold runs
    // for every viewer of a table, twice per fold pass (`verifyReplies` and
    // `foldChips` each call `parseMove`), on every board rotation.
    let commaCount = 0;
    for (let i = 0; i < arg.length; i++) if (arg.charCodeAt(i) === 44 /* ',' */) commaCount++;
    if (commaCount + 1 > MAX_BATCH) return { kind: 'oversize', count: commaCount + 1, ms };

    const parts = arg.split(',');

    const chips: ChipEntry[] = [];
    for (const part of parts) {
      const m = ENTRY.exec(part);
      if (!m) return null;
      const entryMs = Number(m[1]);
      const bits = Number(m[2]);
      if (!Number.isSafeInteger(entryMs) || entryMs <= 0) return null;
      if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) return null;
      chips.push({ ms: entryMs, bits, nonce: BigInt('0x' + m[3]) });
    }
    return { kind: 'bank', chips, ms };
  }

  const buyM = /^buy\s+([a-z0-9]+)$/.exec(head);
  if (buyM) return { kind: 'buy', key: buyM[1], ms };

  const burnM = /^burn\s+([a-z0-9]+)$/.exec(head);
  if (burnM) return { kind: 'burn', key: burnM[1], ms };

  // `tip` — the bottom of the bowl. Takes NO argument on purpose: the salt
  // it awards is computed by the fold from the lifetime it can see, never
  // declared by the client, so a hostile body cannot mint prestige. (The
  // dip verb is self-declared because its ceiling is one chip's pot; salt
  // is permanent and compounds across every future run.)
  // `tip [keep]` — THE CRACK names one jar to carry through the bowl.
  // Must START WITH A LETTER. Every jar key does, and it keeps the original
  // security property literally true: a tip can never carry a NUMBER, because
  // a self-declared salt amount would be free money forever (salt is permanent
  // and compounds). `keep` names a jar; it can never name a quantity.
  const tipM = /^tip\s+([a-z][a-z0-9]*)$/.exec(head);
  if (tipM) return { kind: 'tip', keep: tipM[1], ms };
  if (/^tip$/.test(head)) return { kind: 'tip', keep: null, ms };

  // `broke` — one band of the descent. NO ARGUMENT, for exactly the reason
  // `tip` has none: the band is whichever comes next, which the fold can see,
  // and the char it pays is permanent prestige. A client that could name its
  // own depth could name the lava on a fresh table and mint the whole supply.
  // `broke 5` must therefore FAIL to parse rather than be range-checked.
  // `broke <paid>` — the chip fed to the boss. The bare legacy form still
  // parses and pays nothing, which is the same rule it always should have had.
  // `spend <ability> <cost>` — char buys a rule change from scoop.
  const spendM = /^spend\s+([a-z0-9]+)\s+(\d{1,6})$/.exec(head);
  if (spendM) return { kind: 'spend', ability: spendM[1], cost: Number(spendM[2]), ms };

  const brokeM = /^broke\s+(\d{1,15})$/.exec(head);
  if (brokeM) return { kind: 'broke', paid: Number(brokeM[1]), ms };
  if (/^broke$/.test(head)) return { kind: 'broke', paid: 0, ms };

  // `dip <amount>` — see ParsedMove's doc for why this is unverified by
  // design. The bound stops a typo'd or hostile body from overflowing safe
  // integer arithmetic; it is a parse rule, not an economy rule.
  const dipM = /^dip\s+(\d{1,15})$/.exec(head);
  if (dipM) {
    const amount = Number(dipM[1]);
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    return { kind: 'dip', amount, ms };
  }

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

/**
 * OLD SALT from a run's lifetime — "salt that has been through a bowl. it
 * does not dissolve and it does not forget."
 *
 * sqrt-shaped ON PURPOSE. Linear salt would make tipping strictly better the
 * longer you wait, and the whole design ask was that a player be tempted to
 * tip EARLY: under a square root, two short runs beat one run of twice the
 * length, so looping is a real strategy rather than a consolation prize.
 * TIP_FLOOR keeps a fresh table from farming the ceremony for free rungs.
 */
export function saltFor(lifetimeChips: number): number {
  if (lifetimeChips < TIP_FLOOR) return 0;
  return Math.floor(Math.sqrt(lifetimeChips / TIP_FLOOR) * SALT_PER_TIP);
}

/** Every grain of salt fattens each tick by this fraction (display-side in
 *  useCooking; the fold only ever stores the salt itself). */
export const SALT_TICK_BONUS = 0.02;

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
  return base + (state.airtight ? AIRTIGHT_BONUS : 0) + state.sogBonus;
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
 *
 * Exported for the SAME reason `sogNum`/`sogHoursFor` are: a display that
 * wants to show a payout — the gain a bank just credited, or what a frying
 * chip would pay out right now — must call this, never restate the formula.
 * A second copy of the doubling/golden/dip/congeal/seasoning chain is a
 * display that silently drifts from the real payout the moment any one of
 * those is retuned. See lib/chipsPayoutDisplay.ts.
 */
export function payoutFor(state: ChipsState, bits: number, at: number): number {
  let crumbs = CRUMBS_PER_CHIP * 2 ** (bits - BANK_MIN_BITS);
  if (bits >= state.goldenBits) crumbs = Math.floor((crumbs * GOLD_NUM) / GOLD_DEN);

  const tier = DIP_TIERS[state.dipIndex];
  if (tier.payNum && tier.payDen) crumbs = Math.floor((crumbs * tier.payNum) / tier.payDen);
  if (tier.congeal && state.lastBankAt > 0 && at - state.lastBankAt >= CONGEAL_GAP_MS) crumbs *= 2;

  return Math.floor((crumbs * state.seasoningNum) / state.seasoningDen);
}

function initialState(): ChipsState {
  return {
    crumbs: 0, lifetimeChips: 0, oldSalt: 0, tips: 0, crispest: 0,
    owned: new Set(), bowlCap: START_BOWL_CAP,
    seasoningNum: 1, seasoningDen: 1, fryers: 1,
    broken: 0, deepest: 0, char: 0, bowls: 0, paidToBosses: 0, bossDamage: 0, charOwned: new Set(), declined: new Set(),
    goldenBits: GOLDEN_BITS, airtight: false,
    sogBonus: 0, doubleDipMod: 0,
    dipIndex: 0, lastConfirmedAt: 0, lastBankAt: 0,
    unverifiedBanks: 0, moves: [],
  };
}

/**
 * Fold a table's replies into game state.
 *
 * PRECONDITION: `verified` maps `proofKey(tableId, author, chip.ms, chip.nonce)`
 * -> actual leading zero bits, for EVERY chip of EVERY bank reply (a batch
 * reply carries more than one). A missing entry folds as `rejected-unverified`,
 * which is deterministic but wrong — callers must complete verification first
 * (see chipsVerify.ts) or clients will disagree.
 */
export function foldChips(
  header: ChipsHeader,
  tableId: string,
  replies: ChipsReply[],
  verified: Map<string, number>
): ChipsState {
  const state = initialState();
  const seenProofs = new Set<string>();
  /**
   * ACCUMULATING MOVES ALREADY APPLIED, keyed `<verb>:<ms>`.
   *
   * A settling move is folded TWICE on purpose: the confirmed reply and the
   * optimistic copy are both in the input until `retireSettled` drops the copy
   * (see chipsSettling.ts, which is where the timing is explained). That is
   * only safe if a second application is a no-op, and chipsSettling's header
   * argues exactly that — for banks (keyed by `proofKey` in `seenProofs`) and
   * for buys (keyed by `state.owned`).
   *
   * IT NEVER COVERED dip OR broke. Both were added later, both ACCUMULATE, and
   * neither self-guards, so each was applied twice for the whole settling
   * window:
   *   - dip   credited its crumbs twice
   *   - broke did double damage to a boss for one chip, and double
   *           `paidToBosses` — a band at half price
   *
   * `tip` is ALSO guarded here, but it turned out to be safe already and the
   * honest reason is luck: tipping zeroes `lifetimeChips`, and tip's own
   * precondition tests `lifetimeChips`, so a second application folds
   * `rejected-shallow`. Verified by removing this guard — the second tip is
   * rejected and `tips` stays 1. It is kept as defence in depth precisely
   * because that safety is INCIDENTAL: change the shallow threshold to
   * anything the reset does not zero and tip starts double-counting prestige
   * silently. Do not read the tip guard as evidence tip was broken.
   *
   * Measured 2026-07-29: eight regressions in three minutes, `pollGaps: 0` and
   * `lostMoves: 0` (so nothing was lost and no poll came back short) with a
   * STABLE floor and varying peaks — the peak being the inflated number and the
   * floor being the truth. Crumbs fell by exactly one dip's amount each time a
   * copy retired.
   *
   * `ms` is the right key because it is already each verb's identity on the
   * wire (chipsSettling's `moveKey` keys dip/tip/broke on exactly this), and
   * the allocator is strictly increasing (`createMsAllocator`), so two distinct
   * moves cannot collide within a session.
   */
  const seenMoves = new Set<string>();
  /** Has this exact move already been applied? Marks it if not. */
  const firstTime = (verb: string, ms: number): boolean => {
    const k = `${verb}:${ms}`;
    if (seenMoves.has(k)) return false;
    seenMoves.add(k);
    return true;
  };

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

  // Labelled so a nested prefix check can abandon the WHOLE reply rather
  // than just its inner loop — see the `burn` branch.
  outer: for (const reply of orderReplies(mine)) {
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

    if (parsed.kind === 'oversize') {
      // Rejected on the count alone — nothing here is verified, which is the
      // entire point of the cap.
      state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-oversize' });
      continue;
    }

    if (parsed.kind === 'bank') {
      for (const chip of parsed.chips) {
        const key = proofKey(tableId, reply.author_id, chip.ms, chip.nonce);
        const actual = verified.get(key);

        if (actual === undefined) {
          state.unverifiedBanks++;
          state.moves.push({ content_id: reply.content_id, ms: chip.ms, outcome: 'rejected-unverified' });
        } else if (chip.bits < BANK_MIN_BITS || actual < chip.bits) {
          state.moves.push({ content_id: reply.content_id, ms: chip.ms, outcome: 'rejected-bits', bits: chip.bits });
        } else if (seenProofs.has(key)) {
          state.moves.push({ content_id: reply.content_id, ms: chip.ms, outcome: 'rejected-duplicate', bits: chip.bits });
        } else {
          seenProofs.add(key);
          // The double dip sits AFTER payoutFor's fixed multiplier chain and
          // is a plain x2 on an integer, so it commutes with nothing and
          // needs no floor of its own. It stays OUTSIDE payoutFor because
          // payoutFor's signature (state, bits, at) is what every display
          // calls to price a chip whose nonce it does not know.
          const dipped = state.doubleDipMod > 0 && chip.nonce % BigInt(state.doubleDipMod) === 0n;
          const crumbs = payoutFor(state, chip.bits, at) * (dipped ? 2 : 1);
          state.crumbs = Math.min(state.crumbs + crumbs, state.bowlCap);
          // Deliberately NOT doubled: tiers measure real work done, and the
          // double dip pays crumbs, it does not mint chips.
          state.lifetimeChips += 2 ** (chip.bits - BANK_MIN_BITS);
          if (chip.bits > state.crispest) state.crispest = chip.bits;
          state.dipIndex = dipIndexFor(state.lifetimeChips);
          if (confirmed) state.lastBankAt = at;
          state.moves.push({
            content_id: reply.content_id, ms: chip.ms, outcome: 'banked', bits: chip.bits, crumbs,
            ...(dipped ? { doubleDip: true as const } : {}),
          });
        }
      }
      continue;
    }

    if (parsed.kind === 'tip') {
      // A tip INCREMENTS `tips`, so folding it twice counted one prestige as two.
      if (!firstTime('tip', parsed.ms)) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-duplicate' });
        continue;
      }
      // THE BOTTOM OF THE BOWL. Everything the run accumulated goes back in;
      // OLD SALT is what stuck to you. Salt is derived here, from the fold's
      // own lifetime — sqrt-shaped so a deep run is worth more but never
      // proportionally so, which is exactly what makes tipping EARLY a live
      // choice rather than a strictly worse one.
      //
      // Rejected below the floor so the twist cannot be farmed by tipping a
      // fresh table over and over for a free rung.
      const earned = saltFor(state.lifetimeChips);
      if (earned <= 0) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-shallow' });
        continue;
      }
      state.oldSalt += earned;
      state.tips += 1;
      // The descent belongs to THE BOWL. Tipping it empties the bowl, so any
      // bands broken in it are gone with it — you are back at the surface of
      // a new one. `deepest` and `char` are prestige and stay (see `broke`).
      state.broken = 0;
      state.bossDamage = 0;   // the fight belongs to the bowl
      state.declined = new Set();
      state.crumbs = 0;
      state.lifetimeChips = 0;
      state.crispest = 0;
      // THE CRACK (char): one jar of your choosing survives the bowl. Read
      // BEFORE `owned` is cleared, honoured after — you cannot keep something
      // you did not have, and without the ability you cannot keep anything.
      const keeping = parsed.keep !== null
        && state.charOwned.has('crack')
        && state.owned.has(parsed.keep)
        ? UPGRADES[parsed.keep]
        : undefined;

      state.owned = new Set();
      state.bowlCap = START_BOWL_CAP;
      state.seasoningNum = 1; state.seasoningDen = 1;
      state.fryers = 1;
      state.goldenBits = GOLDEN_BITS;
      state.airtight = false;
      state.sogBonus = 0;
      state.doubleDipMod = 0;
      state.dipIndex = 0;
      // ...and the kept jar goes back on, effects and all, through the same
      // path a purchase uses so the two can never drift.
      if (keeping) applyUpgradeEffects(state, keeping);
      if (confirmed) state.lastBankAt = at;
      state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'tipped', salt: earned });
      continue;
    }

    if (parsed.kind === 'burn') {
      /* ── REFUSE A JAR, TAKE 70% OF ITS PRICE ────────────────────────────
         You are not selling something back — you never take it. The jar is
         gone for the run and the crumbs land now. It is a RUSH: convert a
         permanent upgrade you have earned the right to buy into immediate
         spending power, and go faster with less.

         It pays for itself because the price is REAL, not nominal. Refusing
         a chain rung forfeits everything above it — a buy still needs its
         prefix owned, so declining Seasoning III ends the seasoning ladder
         at III for the rest of the run. The deeper the rung, the bigger the
         payout and the more of the game you are giving up for it.

         The gate is simply "could you have been offered this": the jar must
         exist, you must not already own it, you must not already have
         refused it, and its chain prefix must be owned. Crumbs are NOT
         required — that is the whole point of a rush. */
      const jar = UPGRADES[parsed.key];
      if (!jar || state.owned.has(parsed.key) || state.declined.has(parsed.key)) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-unowned', upgradeKey: parsed.key });
        continue;
      }
      const bchain = UPGRADE_CHAINS.find((c) => c.includes(parsed.key));
      if (bchain) {
        const bidx = bchain.indexOf(parsed.key);
        for (let i = 0; i < bidx; i++) {
          if (!state.owned.has(bchain[i])) {
            state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-order', upgradeKey: parsed.key });
            continue outer;
          }
        }
      }
      state.declined.add(parsed.key);
      state.crumbs = Math.min(state.bowlCap, state.crumbs + Math.floor(jar.cost * BURN_REFUND_NUM / BURN_REFUND_DEN));
      state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'burned', upgradeKey: parsed.key });
      continue;
    }

    if (parsed.kind === 'spend') {
      /* ── CHAR BUYS A RULE CHANGE ────────────────────────────────────────
         The fold's whole job here is that char cannot go negative and nothing
         is bought twice. WHAT the ability does, and what it costs, are policy
         (lib/chipsConst CHAR_ABILITIES) — the cost rides in the body the way a
         dip's amount does, on the same self-declared precedent, so five prices
         never become five permanent decisions.

         `charOwned` is PRESTIGE and survives a tip: the descent paid for it,
         not the run. */
      if (state.charOwned.has(parsed.ability) || state.char < parsed.cost) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-char' });
        continue;
      }
      state.char -= parsed.cost;
      state.charOwned.add(parsed.ability);
      state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'spent' });
      continue;
    }

    if (parsed.kind === 'broke') {
      // A broke ACCUMULATES damage, so folding it twice let one chip hit a boss
      // for double its worth — a band bought at half price.
      if (!firstTime('broke', parsed.ms)) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-duplicate' });
        continue;
      }
      /* ── ONE BAND OF THE DESCENT ────────────────────────────────────────
         The band is `state.broken` — whichever comes next — never anything
         the body said. Three refusals, in the order that makes the reason
         legible:

           1. past the end. The last band is a tip, so reaching it resets the
              run; a further `broke` has nothing under it.
           2. not deep enough. The floor doubles per band and lifetime is
              per-run, so this is the whole difficulty of the descent.
           3. (there is no third — sequence is structural, because the band
              IS the counter. Out-of-order is not a state that can be
              expressed.)

         CHAR IS PAID ONLY ON A NEW PERSONAL BEST. `deepest` is the
         watermark; a second descent walks the same bands and mints nothing.
         That is what fixes the supply at CHAR_TOTAL forever and lets ability
         prices stay put for the life of the game. */
      const band = state.broken;
      if (band >= DEEP_BAND_COUNT) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-order' });
        continue;
      }
      if (state.lifetimeChips < deepBandFloor(band)) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-shallow' });
        continue;
      }
      // THE CHIP IS SPENT, NOT BANKED. `paid` is recorded so the UI can say
      // what the band cost, and credited to nothing: not crumbs, not lifetime.
      // Banking it as well is what let one enormous winning dip carry a player
      // past every remaining band in a single move.
      state.paidToBosses += parsed.paid;

      /* ── CHIPPING AWAY AT THE TABLE ─────────────────────────────────────
         Bands 1+ have HEALTH. Every chip fed does its worth in damage and the
         band only gives when the total lands, so a fight can span sessions —
         which is the whole point: The Porcelain rewards one enormous swing,
         The Table makes you keep coming back.

         BAND 0 IS EXEMPT and settles in one blow, as it always has (operator:
         "leave porcelein alone"). That also keeps this change safe: the single
         `broke` already on mainnet is the legacy bare form carrying NO amount,
         so under HP rules it would deal zero damage and silently un-break a
         real player's band — taking their char and their ability with it.

         A blow that does not finish the boss is not a failure and not a
         rejection: it is progress, and it says so. */
      if (band >= FIRST_HP_BAND) {
        state.bossDamage += parsed.paid;
        const hp = bossHp(band, state.lifetimeChips);
        if (state.bossDamage < hp) {
          state.moves.push({
            content_id: reply.content_id, ms: parsed.ms, outcome: 'chipped',
          });
          continue;
        }
        // It gives. Damage resets for whatever is under it.
        state.bossDamage = 0;
      }

      state.broken = band + 1;
      if (state.broken > state.deepest) {
        state.deepest = state.broken;
        state.char += CHAR_PER_BAND[band];
      }
      state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'broke' });

      // THE LAST BAND IS A TIP. You do not arrive somewhere new; you come up
      // through the bottom of another bowl, which is a fresh run by every
      // measure the fold has. Salt is earned exactly as a tip earns it — the
      // lifetime was real — while char, the watermark and the bowl count are
      // prestige and ride across. `broken` resets because the NEXT bowl has
      // its own porcelain to get through.
      if (state.broken >= DEEP_BAND_COUNT) {
        state.oldSalt += saltFor(state.lifetimeChips);
        state.bowls += 1;
        state.tips += 1;
        state.broken = 0;
        state.declined = new Set();
        state.crumbs = 0;
        state.lifetimeChips = 0;
        state.crispest = 0;
        state.owned = new Set();
        state.bowlCap = START_BOWL_CAP;
        state.seasoningNum = 1; state.seasoningDen = 1;
        state.fryers = 1;
        state.goldenBits = GOLDEN_BITS;
        state.airtight = false;
        state.sogBonus = 0;
        state.doubleDipMod = 0;
        state.dipIndex = 0;
        if (confirmed) state.lastBankAt = at;
      }
      continue;
    }

    if (parsed.kind === 'dip') {
      // A dip CREDITS, so folding the settling copy as well paid it twice.
      if (!firstTime('dip', parsed.ms)) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-duplicate' });
        continue;
      }
      // Pot x multi, already computed and declared by the client. Bowl cap
      // still clamps storage; lifetime advances by the dip's chip-equivalents
      // so the tier ladder keeps pacing on total play.
      state.crumbs = Math.min(state.crumbs + parsed.amount, state.bowlCap);
      state.lifetimeChips += Math.max(1, Math.round(parsed.amount / CRUMBS_PER_CHIP));
      state.dipIndex = dipIndexFor(state.lifetimeChips);
      if (confirmed) state.lastBankAt = at;
      state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'dipped', crumbs: parsed.amount });
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
  // Refused this run — the crumbs were taken instead, and the jar is gone
  // until the bowl goes over.
  if (state.declined.has(parsed.key)) return push('rejected-owned');

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
  applyUpgradeEffects(state, upgrade);

  push('bought');
}

/**
 * Put a jar's effects on the state. Extracted so BUYING one and KEEPING one
 * through a tip (THE CRACK) can never drift apart — a kept jar that forgot to
 * raise your bowl cap would be a silent, unnoticeable wrong.
 *
 * Idempotent for everything except `sogBonus`, which accumulates by design;
 * only ever called once per jar per run.
 */
function applyUpgradeEffects(state: ChipsState, upgrade: Upgrade): void {
  state.owned.add(upgrade.key);
  if (upgrade.bowlCap !== undefined) state.bowlCap = upgrade.bowlCap;
  if (upgrade.seasoningNum !== undefined && upgrade.seasoningDen !== undefined) {
    state.seasoningNum = upgrade.seasoningNum;
    state.seasoningDen = upgrade.seasoningDen;
  }
  if (upgrade.fryers !== undefined) state.fryers = upgrade.fryers;
  if (upgrade.goldenBits !== undefined) state.goldenBits = upgrade.goldenBits;
  if (upgrade.airtight) state.airtight = true;
  if (upgrade.sogBonus !== undefined) state.sogBonus += upgrade.sogBonus;
  if (upgrade.doubleDipMod !== undefined) state.doubleDipMod = upgrade.doubleDipMod;
}
