/**
 * The Reef — a slow, persistent, shared world on Swimchain, folded deterministically
 * from the chain.
 *
 * "Region = thread, move = reply, world = pure function of the ordered action log."
 * This is the same substrate proof as Chess, one step up: instead of two players
 * alternating, *many* players grow a shared cellular world, and the world-state is a
 * pure **integer** fold over every reply in chain order. Every client folds the same
 * replies to the byte-identical grid — the chain is the world, and nobody owns it.
 *
 * Because the node enforces per-action signatures, each move is provably its author's,
 * so the coral you grew is provably yours; a relay cannot forge growth for you.
 *
 * ── What makes it a game (not just painting) ───────────────────────────────────────
 * Two deterministic systems give the paint layer stakes, both folded from the log:
 *
 *   1. RESOURCE ECONOMY. Each player has a growth budget. Growing and contesting cost
 *      budget; budget regenerates each epoch in proportion to your *living* territory.
 *      You cannot spam-paint — every placement is a real tradeoff. Tending is free but
 *      RATIONED: you may refresh only TEND_CAP cells per tide, so a reef bigger than
 *      your tending capacity cannot all be kept fresh — you must choose which coral to
 *      save each epoch, and the rest fades. (Free-but-capped, rather than priced, so a
 *      broke player can always still act and the epoch clock can never deadlock.)
 *
 *   2. SEASONS + SCORING. Time is divided into seasons (SEASON_EPOCHS epochs each).
 *      Every epoch, each player banks points equal to the vitality they kept alive.
 *      Sustained territory wins, not a single land-grab moment. At season's end the
 *      highest tally is recorded as that season's winner and the tally resets.
 *
 * Both are computed inside the fold, so the score/leaderboard/season winner every
 * client shows is derived identically — the chain is the scorekeeper.
 *
 * ── Epoch pacing ───────────────────────────────────────────────────────────────────
 * The tide is keyed to REEF ACTIVITY: every EPOCH_MOVES **well-formed** confirmed moves
 * (any parseable grow/tend, whether or not it was affordable/legal) ticks one epoch —
 * decay, then budget regen, then scoring. It is deliberately NOT keyed to block height:
 * doing so coupled reef decay to *global* chain activity (chess games, other spaces, raw
 * block cadence), so a burst of unrelated blocks could cull the whole under-tended board
 * at once. Keying to reef moves means only playing the reef ages it, and an idle reef
 * doesn't decay. Pending (not-yet-in-a-block) moves are the tentative frontier — shown
 * optimistically, but they don't tick the clock until they confirm.
 *
 * Determinism: integer-only state, no floats, no wall-clock. Confirmed moves are ordered
 * by (block_height, created_at, authoring-seq, content_id); the reorg frontier is still
 * computed from the chain tip (CONFIRM_DEPTH), just not the decay clock.
 */

import {
  ActionType,
  createChallenge,
  computePow,
  getConfig,
  getDifficulty,
  solutionToRpcParams,
  hexToBytes,
  ensureSponsored,
  signAction,
  contentHashForPost,
  contentHashForReply,
  type SwimchainRpc,
  type ProgressCallback,
  type PoWChallenge,
  type PoWConfig,
  type PoWSolution,
} from '@swimchain/react';

/**
 * Mine an action PoW off the main thread. A difficulty-8 Argon2id search is
 * several seconds of CPU; on the main thread it froze the tab (and the
 * progress modal couldn't paint). Runs the same `computePow` in a Web Worker
 * and resolves with the solution, streaming progress through. Falls back to
 * on-thread mining only if the worker can't be constructed (very old runtime).
 */
function minePow(
  challenge: PoWChallenge,
  config: PoWConfig,
  onProgress?: ProgressCallback
): Promise<PoWSolution> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return computePow(challenge, config, onProgress);
  }
  return new Promise<PoWSolution>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.type === 'progress') {
        onProgress?.(m.attempts, m.elapsedMs, m.hashRate);
      } else if (m?.type === 'solution') {
        resolve(m.solution as PoWSolution);
        worker.terminate();
      } else if (m?.type === 'error') {
        reject(new Error(m.message));
        worker.terminate();
      }
    };
    worker.onerror = (err) => {
      reject(new Error(err.message || 'pow worker error'));
      worker.terminate();
    };
    worker.postMessage({ challenge, config });
  });
}

const TESTNET = true;

/** The reef space id (bech32 `sp1…`). Set via VITE_REEF_SPACE at build/dev time. */
export const REEF_SPACE: string =
  (import.meta.env?.VITE_REEF_SPACE as string | undefined)?.trim() || '';

/**
 * Preferred onboarding sponsor's public key (hex). Auto-sponsor claims an
 * offer from THIS sponsor when available — it must be an always-online node
 * (the testnet genesis root) so the claim is auto-approved promptly. Without
 * this, onboarding could pick a stale auto-approve offer from an offline
 * sponsor and hang forever "waiting for approval". Configurable per deployment
 * via VITE_GAME_SPONSOR; defaults to the testnet genesis root.
 */
export const GAME_SPONSOR: string =
  (import.meta.env?.VITE_GAME_SPONSOR as string | undefined)?.trim() ||
  '9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420';

// ── Engine constants (all integer; changing these changes the shared ruleset) ──────
export const GRID_W = 12;
export const GRID_H = 12;
/** A freshly grown or tended cell starts here and loses 1 per epoch. */
export const MAX_VITALITY = 6;
/** Every this-many *well-formed* moves, the world ticks one epoch. */
export const EPOCH_MOVES = 8;
/** Damage a contesting `grow` deals to an enemy cell. */
export const CONTEST_DAMAGE = 2;
/** Vitality a just-captured cell has (a taken border cell is weak). */
export const CAPTURE_VITALITY = 1;

// Resource economy
export const START_BUDGET = 8;
export const MAX_BUDGET = 14;
export const COST_GROW = 2; // seed or spread onto open water
export const COST_CONTEST = 3; // grow onto an enemy border cell
/** Per epoch, every tracked player regenerates this + floor(livingCells / 2). */
export const REGEN_BASE = 2;
/** Tending is free but rationed: at most this many refreshes per player per tide. */
export const TEND_CAP = 4;

// Seasons
export const SEASON_EPOCHS = 5;

/**
 * LEGACY — no longer used by the fold. The tide was briefly keyed to consensus
 * BLOCK HEIGHT (every BLOCKS_PER_EPOCH blocks = one epoch), but that coupled reef
 * decay to *global* chain activity: chess games, other spaces, and raw block
 * cadence all advanced the reef's tide, so a burst of unrelated blocks could cull
 * the whole under-tended board at once ("the reef poofed"). The tide is now driven
 * by reef activity — EPOCH_MOVES reef moves per tide — so only playing the reef
 * ages it. Kept exported for the diagnostics/bot that still reference it.
 */
export const BLOCKS_PER_EPOCH = 2;

export type SignFn = (
  message: Uint8Array
) => Uint8Array | null | Promise<Uint8Array | null>;

/** The local player. `address` is the bech32 form; `publicKeyHex` is what get_replies returns as author_id. */
export interface Identity {
  publicKeyHex: string;
  address: string;
  sign: SignFn;
}

export interface ReefHeader {
  v: 1;
  kind: 'reef';
  founder: string; // creator's pubkey hex
  w: number;
  h: number;
  created: number;
}

export interface RegionSummary {
  id: string;
  title: string;
  header: ReefHeader;
}

export type Op = 'grow' | 'tend';
export type MoveKind = 'seed' | 'spread' | 'tend' | 'contest';

/**
 * The settled result of a move, so a client can explain to a player what
 * happened to *their* action instead of silently reverting the optimistic view.
 * - `grew`     seeded / spread onto open water; the tile is now yours
 * - `tended`   refreshed one of your own cells
 * - `captured` a contest that flipped an enemy cell to you
 * - `contested`a contest that damaged an enemy cell but didn't capture it
 * - `tie-lost` you and another player grabbed the same open tile in the same
 *              block; they won the (deterministic) tie, and YOUR budget was NOT
 *              spent — a refund, not a wasted resource
 * - `rejected-unaffordable` you couldn't afford it (no tile, no charge)
 * - `rejected-invalid`      disconnected / out-of-bounds placement (no charge)
 * - `rejected-capped`       a tend beyond this tide's TEND_CAP (no charge)
 */
export type MoveOutcome =
  | 'grew'
  | 'tended'
  | 'captured'
  | 'contested'
  | 'tie-lost'
  | 'rejected-unaffordable'
  | 'rejected-invalid'
  | 'retuned'
  | 'rejected-not-founder'
  | 'rejected-capped';

export interface Cell {
  owner: string; // author_id (pubkey hex) of whoever holds the cell
  vitality: number;
}

export interface AppliedMove {
  op: Op;
  x: number;
  y: number;
  author: string;
  contentId: string;
  ok: boolean; // did it change the world? (illegal / unaffordable moves are inert)
  outcome: MoveOutcome; // the settled result, for client-side explanation
}

export interface SeasonResult {
  index: number;
  winner: string | null;
  points: number;
}

/** Per-owner ledger of what one tide (epoch tick) did to a player. */
export interface TideOwnerDelta {
  territoryBefore: number; // living cells the instant before the tide
  territoryAfter: number; // living cells after decay
  vitalityBefore: number; // Σ vitality before
  vitalityAfter: number; // Σ vitality after (also = points banked this tide)
  pointsBanked: number; // vitality added to the season score this tide
  seasonPointsAfter: number; // season tally after this tide (0 if the season just closed)
}

/**
 * A settled snapshot of the most recent tide (epoch tick), so a client can show
 * the player a real end-of-round report — how much coral the tide claimed, what
 * they banked, how their reef changed — instead of numbers silently shifting.
 * Reflects the LAST tick folded (the newest tide reaching the current tip).
 */
export interface TideSummary {
  epoch: number; // the epoch number that just began
  decayedGlobal: number; // living cells lost to decay reef-wide this tide
  survivorsGlobal: number; // living cells remaining reef-wide after the tide
  crownedSeason: SeasonResult | null; // the season this tide closed, if any
  byOwner: Map<string, TideOwnerDelta>;
}

export interface Standing {
  owner: string;
  seasonPoints: number; // banked this season
  territory: number; // living cells right now
  vitality: number; // Σ vitality of living cells right now (live score)
  // Career / brag stats (cumulative over the whole region history):
  crowns: number; // seasons won
  peak: number; // largest territory ever held at once
  conquests: number; // enemy cells captured via contest
}

/**
 * Live per-region rule parameters. Defaults are the engine constants; the
 * region FOUNDER can adjust them mid-game with an on-chain `retune` move
 * (`retune epochMoves=<n> tendCap=<n> #<ms>~`), which the fold applies
 * deterministically from that point in the move sequence forward — every
 * client and the bot derive the same values, and only that one region is
 * affected. Values are clamped (epochMoves 2..64, tendCap 1..12) so a typo'd
 * retune can't wedge a region. Non-founder retunes are inert
 * (`rejected-not-founder`), so nobody else can rule-change your reef.
 */
export interface RegionParams {
  epochMoves: number;
  tendCap: number;
}

export interface ReefState {
  header: ReefHeader;
  params: RegionParams; // live (possibly retuned) rules for THIS region
  /** Confirmed well-formed moves since the last tide — the tide turns when
   *  this reaches params.epochMoves. Drives the "tide is coming" indicator. */
  tideMoves: number;
  cells: Map<string, Cell>;
  moves: AppliedMove[];
  epoch: number;
  season: number; // current season index
  epochsLeftInSeason: number;
  budgets: Map<string, number>;
  tendsUsed: Map<string, number>; // tends spent this epoch (resets each tide)
  seasonPoints: Map<string, number>; // current-season accumulator
  seasons: SeasonResult[]; // closed seasons, in order
  standings: Standing[]; // sorted leaderboard (season points desc, then live vitality)
  owners: string[]; // distinct current cell owners (for the grid legend)
  tentative: number; // count of pending (not-yet-in-a-block) moves shown optimistically
  confirmedEpoch: number; // epochs fully settled by consensus (the confirmed frontier)
  justCrownedSeason: SeasonResult | null; // most recently closed season, for the banner
  lastTide: TideSummary | null; // ledger of the most recent tide, for the end-of-round report
  // Cell keys whose current ownership is NOT yet reorg-safe — claimed within
  // CONFIRM_DEPTH blocks of the tip, or by a still-pending move. These can still
  // flip as the chain settles, so the client renders them as "settling" rather
  // than committing a hard state that later swaps and looks like a glitch.
  frontier: Set<string>;
}

/** Blocks a move must be buried before its cell ownership is treated as final. */
export const CONFIRM_DEPTH = 2;

/** What clicking a cell would do for a given player, and whether it's currently possible. */
export interface Intent {
  op: Op;
  kind: MoveKind;
  cost: number; // budget cost (0 for tend — tend is capped, not priced)
  affordable: boolean; // enough budget (grow/contest) or tending capacity left (tend)
  limit: 'budget' | 'capacity'; // which resource gates this move
}

// ── Geometry helpers ───────────────────────────────────────────────────────────────
export const cellKey = (x: number, y: number) => `${x},${y}`;

function inBounds(x: number, y: number, w: number, h: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < w && y < h;
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function hasAdjacentOwnedBy(
  cells: Map<string, Cell>,
  isOwner: (owner: string) => boolean,
  x: number,
  y: number
): boolean {
  for (const [dx, dy] of ORTHO) {
    const c = cells.get(cellKey(x + dx, y + dy));
    if (c && isOwner(c.owner)) return true;
  }
  return false;
}

function ownsAnyCell(cells: Map<string, Cell>, isOwner: (owner: string) => boolean): boolean {
  for (const c of cells.values()) if (isOwner(c.owner)) return true;
  return false;
}

function costOf(kind: MoveKind): number {
  switch (kind) {
    case 'seed':
    case 'spread':
      return COST_GROW;
    case 'tend':
      return 0; // tend is capped, not priced
    case 'contest':
      return COST_CONTEST;
  }
}

/**
 * Classify a move by board position alone (ignoring budget): what kind it is and what
 * it costs, or null if it's illegal where it's aimed. Shared by the fold and the UI so
 * legality is identical everywhere. `isOwner` compares a cell owner to "the actor".
 */
function classify(
  cells: Map<string, Cell>,
  header: ReefHeader,
  isOwner: (owner: string) => boolean,
  op: Op,
  x: number,
  y: number
): { kind: MoveKind; cost: number } | null {
  if (!inBounds(x, y, header.w, header.h)) return null;
  const cell = cells.get(cellKey(x, y));

  if (op === 'tend') {
    if (cell && isOwner(cell.owner)) return { kind: 'tend', cost: 0 };
    return null;
  }
  // op === 'grow'
  if (!cell) {
    if (!ownsAnyCell(cells, isOwner)) return { kind: 'seed', cost: costOf('seed') };
    if (hasAdjacentOwnedBy(cells, isOwner, x, y)) return { kind: 'spread', cost: costOf('spread') };
    return null;
  }
  if (isOwner(cell.owner)) return { kind: 'tend', cost: 0 }; // grow on your own = tend
  if (hasAdjacentOwnedBy(cells, isOwner, x, y)) return { kind: 'contest', cost: COST_CONTEST };
  return null;
}

/** Apply a classified move's effect to the grid. Mutates `cells`. */
function mutate(cells: Map<string, Cell>, author: string, kind: MoveKind, x: number, y: number): void {
  const k = cellKey(x, y);
  if (kind === 'seed' || kind === 'spread') {
    cells.set(k, { owner: author, vitality: MAX_VITALITY });
    return;
  }
  if (kind === 'tend') {
    const c = cells.get(k);
    if (c) c.vitality = MAX_VITALITY;
    return;
  }
  // contest
  const c = cells.get(k);
  if (!c) return;
  c.vitality -= CONTEST_DAMAGE;
  if (c.vitality <= 0) {
    c.owner = author;
    c.vitality = CAPTURE_VITALITY;
  }
}

/** One epoch of decay: every cell loses a vitality; those at 0 recede to open water. */
function epochTick(cells: Map<string, Cell>): void {
  for (const [k, c] of cells) {
    c.vitality -= 1;
    if (c.vitality <= 0) cells.delete(k);
  }
}

/** Sum living vitality per owner (post-decay), used for regen and scoring. */
function livingByOwner(cells: Map<string, Cell>): Map<string, { cells: number; vitality: number }> {
  const m = new Map<string, { cells: number; vitality: number }>();
  for (const c of cells.values()) {
    const e = m.get(c.owner) ?? { cells: 0, vitality: 0 };
    e.cells += 1;
    e.vitality += c.vitality;
    m.set(c.owner, e);
  }
  return m;
}

function parseMove(body: string | null | undefined): { op: Op; x: number; y: number } | null {
  if (!body) return null;
  const t = body.trim().split(/\s+/);
  const op = t[0];
  if (op !== 'grow' && op !== 'tend') return null;
  const x = Number(t[1]);
  const y = Number(t[2]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { op, x, y };
}

/** Founder rule-change move: `retune epochMoves=6 tendCap=4 #<ms>~`. */
function parseRetune(body: string | null | undefined): Partial<RegionParams> | null {
  if (!body) return null;
  const t = body.trim().split(/\s+/);
  if (t[0] !== 'retune') return null;
  const out: Partial<RegionParams> = {};
  for (const tok of t.slice(1)) {
    const m = /^(epochMoves|tendCap)=(\d+)$/.exec(tok);
    if (!m) continue;
    const n = Number(m[2]);
    if (m[1] === 'epochMoves') out.epochMoves = Math.min(64, Math.max(2, n));
    else out.tendCap = Math.min(12, Math.max(1, n));
  }
  return out.epochMoves !== undefined || out.tendCap !== undefined ? out : null;
}

/**
 * The AUTHORING sequence embedded in a move body — the `#<n>~` field written at
 * submit time (`submitReefMove`). It lives in the signed, immutable body, so it
 * is byte-identical for every client and stable across fetches — unlike the
 * node's `created_at`, which is query-stamped (and thus unstable, ~equal) for
 * pending mempool replies. This is what puts a player's `seed` before the
 * `spread` that grows from it, even while both are still pending. Returns
 * `undefined` when a body has no such field (legacy/foreign), so callers can
 * fall back to `created_at`.
 */
function authorSeqOf(body: string | null | undefined): number | undefined {
  if (!body) return undefined;
  const m = /#(\d+)~/.exec(body);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}
/** Authoring-sequence tiebreak: 0 unless BOTH replies carry a seq (so a missing
 *  seq never reorders against one that has it). */
function seqCmp(a: ReplyLike, b: ReplyLike): number {
  const sa = authorSeqOf(a.body);
  const sb = authorSeqOf(b.body);
  return sa !== undefined && sb !== undefined ? sa - sb : 0;
}

export interface ReplyLike {
  body?: string | null;
  created_at: number;
  content_id: string;
  author_id: string;
  block_height?: number | null;
}

/**
 * Fold a region's reply chain into world-state, keyed to CONSENSUS BLOCK HEIGHT.
 *
 * Confirmed moves (in a block) are applied in height order; every BLOCKS_PER_EPOCH blocks
 * one epoch ticks (decay → regen → score → maybe close a season) — including *empty* epochs
 * when blocks pass with no moves, so an idle reef keeps decaying with real chain time. The
 * tide is advanced up to the current chain tip (`tipHeight`). Pending moves (no block yet)
 * are the tentative frontier: applied optimistically at the current epoch, but the confirmed
 * frontier (`confirmedEpoch`) is what consensus has settled. Deterministic across replicas.
 */
export function foldReef(header: ReefHeader, replies: ReplyLike[], tipHeight?: number): ReefState {
  const cells = new Map<string, Cell>();
  const budgets = new Map<string, number>();
  let tendsUsed = new Map<string, number>(); // resets every tide
  let seasonPoints = new Map<string, number>();
  const seasons: SeasonResult[] = [];
  const peak = new Map<string, number>(); // largest territory ever held (brag stat)
  const conquests = new Map<string, number>(); // enemy cells captured (brag stat)
  const moves: AppliedMove[] = [];
  // Height at which each occupied cell's CURRENT owner claimed it (seed / spread
  // / capture). Lets us tell a same-block race (a "tie" — refund the loser) from
  // a deliberate attack on an established cell (a real contest — costs). Pending
  // (unconfirmed) claims use PENDING_HEIGHT so two racing pending moves also tie.
  const claimedAt = new Map<string, number>();
  const PENDING_HEIGHT = Number.MAX_SAFE_INTEGER;
  let curHeight = 0; // the effective height of the move currently being applied
  let epoch = 0;
  // Live region rules — founder `retune` moves adjust these mid-history, applied
  // in fold order so every observer derives identical values (see RegionParams).
  const params: RegionParams = { epochMoves: EPOCH_MOVES, tendCap: TEND_CAP };
  let justCrowned: SeasonResult | null = null;
  let lastTide: TideSummary | null = null; // ledger of the most recent epoch tick

  // Within a block, apply moves in CREATION order (then content_id as the final
  // deterministic tiebreak) — NOT content_id alone. Ordering same-block moves by
  // hash reorders a player's own build chain: a `spread` could be applied before
  // the `seed` it grows from, so a perfectly valid spread got rejected as "not
  // connected to your reef" even though the supporting cell is right there in the
  // final grid. created_at is on the reply (identical for every client) and the
  // node validates it within a tolerance window, so this stays deterministic and
  // only-mildly-nudgeable. Matches the pending sort and this file's header doc.
  // Confirmed moves: block height, then the node's (stable, consensus) created_at,
  // then the embedded authoring seq to break same-second ties, then id. The seq
  // tiebreak is what keeps a same-block, same-second seed ahead of its spread.
  const confirmed = replies
    .filter((r) => typeof r.block_height === 'number')
    .sort(
      (a, b) =>
        a.block_height! - b.block_height! ||
        a.created_at - b.created_at ||
        seqCmp(a, b) ||
        a.content_id.localeCompare(b.content_id)
    );
  // Pending (mempool) moves: created_at is query-stamped here and thus unstable/
  // ~equal, so the AUTHORING seq leads (it is stable, in the signed body), with
  // created_at then id as fallbacks. This is the fix for "not next to your reef"
  // on freshly-taken tiles: a seed always precedes the spread that grows from it.
  const pending = replies
    .filter((r) => typeof r.block_height !== 'number')
    .sort((a, b) => seqCmp(a, b) || a.created_at - b.created_at || a.content_id.localeCompare(b.content_id));

  const updatePeaks = () => {
    for (const [o, e] of livingByOwner(cells)) peak.set(o, Math.max(peak.get(o) ?? 0, e.cells));
  };

  const tickEpoch = () => {
    const before = livingByOwner(cells); // snapshot the reef the instant before the tide
    let beforeCells = 0;
    for (const l of before.values()) beforeCells += l.cells;
    epochTick(cells); // decay
    const living = livingByOwner(cells);
    let afterCells = 0;
    for (const l of living.values()) afterCells += l.cells;
    for (const [owner, cur] of budgets) {
      budgets.set(
        owner,
        Math.min(MAX_BUDGET, cur + REGEN_BASE + Math.floor((living.get(owner)?.cells ?? 0) / 2))
      );
    }
    for (const [owner, l] of living) seasonPoints.set(owner, (seasonPoints.get(owner) ?? 0) + l.vitality);
    tendsUsed = new Map();
    epoch += 1;
    let crownedThisTick: SeasonResult | null = null;
    if (epoch % SEASON_EPOCHS === 0) {
      let winner: string | null = null;
      let best = -1;
      for (const [owner, pts] of [...seasonPoints].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (pts > best) {
          best = pts;
          winner = owner;
        }
      }
      justCrowned = { index: epoch / SEASON_EPOCHS - 1, winner, points: Math.max(0, best) };
      crownedThisTick = justCrowned;
      seasons.push(justCrowned);
      seasonPoints = new Map();
    }
    updatePeaks();

    // Record this tick's ledger so the client can show a real tide report. Every
    // owner that held coral before OR after the tide gets a line.
    const byOwner = new Map<string, TideOwnerDelta>();
    for (const owner of new Set([...before.keys(), ...living.keys()])) {
      const b = before.get(owner);
      const a = living.get(owner);
      byOwner.set(owner, {
        territoryBefore: b?.cells ?? 0,
        territoryAfter: a?.cells ?? 0,
        vitalityBefore: b?.vitality ?? 0,
        vitalityAfter: a?.vitality ?? 0,
        pointsBanked: a?.vitality ?? 0,
        seasonPointsAfter: seasonPoints.get(owner) ?? 0, // 0 if the season just reset
      });
    }
    lastTide = {
      epoch,
      decayedGlobal: Math.max(0, beforeCells - afterCells),
      survivorsGlobal: afterCells,
      crownedSeason: crownedThisTick,
      byOwner,
    };
  };

  const applyOne = (r: ReplyLike, p: { op: Op; x: number; y: number }) => {
    const author = r.author_id;
    if (!budgets.has(author)) budgets.set(author, START_BUDGET);
    const key = cellKey(p.x, p.y);
    const isAuthor = (owner: string) => owner === author;

    // Tie: a grow onto a cell another author claimed in THIS SAME block (or
    // another still-pending move) is a race you couldn't have seen coming. The
    // deterministic winner (earlier in fold order — lowest content_id in the
    // block) already owns it; refund this one (no cost, no effect) instead of
    // treating it as a contest/invalid attempt. A grow onto a cell claimed in
    // an EARLIER block is a deliberate contest and falls through to classify.
    const target = cells.get(key);
    if (p.op === 'grow' && target && target.owner !== author && claimedAt.get(key) === curHeight) {
      moves.push({ ...p, author, contentId: r.content_id, ok: false, outcome: 'tie-lost' });
      return;
    }

    const cls = classify(cells, header, isAuthor, p.op, p.x, p.y);
    let ok = false;
    let outcome: MoveOutcome;
    if (!cls) {
      outcome = 'rejected-invalid';
    } else if (cls.kind === 'tend') {
      const used = tendsUsed.get(author) ?? 0;
      if (used < params.tendCap) {
        mutate(cells, author, 'tend', p.x, p.y);
        tendsUsed.set(author, used + 1);
        ok = true;
        outcome = 'tended';
      } else {
        outcome = 'rejected-capped';
      }
    } else {
      const have = budgets.get(author)!;
      if (have >= cls.cost) {
        const prevOwner = cls.kind === 'contest' ? cells.get(key)?.owner : undefined;
        mutate(cells, author, cls.kind, p.x, p.y);
        budgets.set(author, have - cls.cost);
        ok = true;
        const now = cells.get(key);
        if (cls.kind === 'contest') {
          if (now?.owner === author) {
            outcome = 'captured';
            if (prevOwner && prevOwner !== author) {
              conquests.set(author, (conquests.get(author) ?? 0) + 1);
            }
          } else {
            outcome = 'contested';
          }
        } else {
          outcome = 'grew'; // seed or spread onto open water
        }
        // Record the claim height whenever ownership just became this author's,
        // so a same-block follower on this tile is detected as a tie.
        if (now?.owner === author) claimedAt.set(key, curHeight);
      } else {
        outcome = 'rejected-unaffordable';
      }
    }
    moves.push({ ...p, author, contentId: r.content_id, ok, outcome });
    if (ok) updatePeaks();
  };

  // 1) Confirmed moves. The tide is driven by REEF ACTIVITY, not global block
  // height: every EPOCH_MOVES well-formed moves ticks one epoch (decay → regen →
  // scoring). This decouples reef decay from unrelated chain activity — chess
  // games, other spaces, and the raw block cadence no longer age the reef, so a
  // burst of blocks elsewhere can't cull the whole board. The reef only ages when
  // the reef is played, and an idle reef doesn't decay at all. curHeight is still
  // the real block height (for same-block tie detection and the reorg frontier).
  // Founder rule changes: `retune` applies live params from this point in the
  // sequence forward. Config moves never advance the tide clock; a non-founder
  // retune is inert but still recorded so the author sees why nothing changed.
  const applyRetune = (r: ReplyLike, tune: Partial<RegionParams>): void => {
    const isFounder = r.author_id === header.founder;
    if (isFounder) Object.assign(params, tune);
    moves.push({
      op: 'tend', // placeholder op for the AppliedMove shape; never renders as coral
      x: -1,
      y: -1,
      author: r.author_id,
      contentId: r.content_id,
      ok: isFounder,
      outcome: isFounder ? 'retuned' : 'rejected-not-founder',
    });
  };

  let sinceTide = 0;
  for (const r of confirmed) {
    const tune = parseRetune(r.body);
    if (tune) {
      curHeight = r.block_height!;
      applyRetune(r, tune);
      continue;
    }
    const p = parseMove(r.body);
    if (!p) continue;
    curHeight = r.block_height!;
    applyOne(r, p);
    sinceTide += 1;
    if (sinceTide >= params.epochMoves) {
      tickEpoch();
      sinceTide = 0;
    }
  }
  const confirmedEpoch = epoch;
  const tideMoves = sinceTide; // confirmed moves toward the next tide

  // 3) Pending (not-yet-in-a-block) moves: the tentative frontier, shown
  // optimistically. All pending claims share PENDING_HEIGHT, so two racing
  // pending grows on the same tile resolve as a tie just like a same-block race.
  let tentative = 0;
  curHeight = PENDING_HEIGHT;
  for (const r of pending) {
    const tune = parseRetune(r.body);
    if (tune) {
      applyRetune(r, tune); // optimistic, like any pending move
      continue;
    }
    const p = parseMove(r.body);
    if (!p) continue;
    tentative += 1;
    applyOne(r, p);
  }
  updatePeaks();

  const living = livingByOwner(cells);
  const owners = [...living.keys()];
  const standingOwners = new Set<string>([...owners, ...seasonPoints.keys(), ...peak.keys()]);
  const crownsOf = (o: string) => seasons.filter((s) => s.winner === o).length;
  const standings: Standing[] = [...standingOwners]
    .map((owner) => ({
      owner,
      seasonPoints: seasonPoints.get(owner) ?? 0,
      territory: living.get(owner)?.cells ?? 0,
      vitality: living.get(owner)?.vitality ?? 0,
      crowns: crownsOf(owner),
      peak: peak.get(owner) ?? 0,
      conquests: conquests.get(owner) ?? 0,
    }))
    .sort(
      (a, b) => b.seasonPoints - a.seasonPoints || b.vitality - a.vitality || a.owner.localeCompare(b.owner)
    );

  // Frontier: cells whose current owner claimed them within CONFIRM_DEPTH of the
  // tip (still reorg-eligible) or via a pending move — the ones that can still flip.
  const frontier = new Set<string>();
  const confirmH = (tipHeight ?? 0) - CONFIRM_DEPTH;
  for (const k of cells.keys()) {
    const c = claimedAt.get(k);
    if (c === undefined) continue;
    if (c === PENDING_HEIGHT || c > confirmH) frontier.add(k);
  }

  return {
    header,
    params,
    tideMoves,
    cells,
    moves,
    epoch,
    season: Math.floor(epoch / SEASON_EPOCHS),
    epochsLeftInSeason: SEASON_EPOCHS - (epoch % SEASON_EPOCHS),
    budgets,
    tendsUsed,
    seasonPoints,
    seasons,
    standings,
    owners,
    tentative,
    confirmedEpoch,
    justCrownedSeason: justCrowned,
    lastTide,
    frontier,
  };
}

/** Stable hue (0–359) for a player, derived from their id — same everywhere, no registry. */
export function ownerHue(id: string): number {
  let h = 2166136261 >>> 0; // FNV-1a-ish
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 360;
}

/** My current growth budget (matching either author_id form). */
export function myBudget(state: ReefState, myPubkeyHex: string, myAddress: string): number {
  return state.budgets.get(myPubkeyHex) ?? state.budgets.get(myAddress) ?? START_BUDGET;
}

/** How many tends I have left this tide (matching either author_id form). */
export function myTendsLeft(state: ReefState, myPubkeyHex: string, myAddress: string): number {
  const used = state.tendsUsed.get(myPubkeyHex) ?? state.tendsUsed.get(myAddress) ?? 0;
  return Math.max(0, state.params.tendCap - used);
}

/**
 * The intent for a click, resolving the op the player most likely wants (grow unless
 * the cell is already theirs, in which case tend), with the resource that gates it.
 */
export function intentAt(
  state: ReefState,
  myPubkeyHex: string,
  myAddress: string,
  x: number,
  y: number
): Intent | null {
  const isMe = (owner: string) => owner === myPubkeyHex || owner === myAddress;
  const cell = state.cells.get(cellKey(x, y));
  const op: Op = cell && isMe(cell.owner) ? 'tend' : 'grow';
  const cls = classify(state.cells, state.header, isMe, op, x, y);
  if (!cls) return null;
  if (cls.kind === 'tend') {
    return { op, kind: 'tend', cost: 0, affordable: myTendsLeft(state, myPubkeyHex, myAddress) > 0, limit: 'capacity' };
  }
  const budget = myBudget(state, myPubkeyHex, myAddress);
  return { op, kind: cls.kind, cost: cls.cost, affordable: budget >= cls.cost, limit: 'budget' };
}

// ── RPC: PoW-mine + canonically sign, then submit (mirrors chess-client) ─────────────

async function submitMinedPost(
  rpc: SwimchainRpc,
  id: Identity,
  spaceId: string,
  title: string,
  body: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const content = `${title}\n\n${body}`;
  const challenge = await createChallenge(
    ActionType.Post,
    new TextEncoder().encode(content),
    hexToBytes(id.publicKeyHex),
    getDifficulty(ActionType.Post, TESTNET)
  );
  const solution = await minePow(challenge, getConfig(TESTNET), onProgress);
  const p = solutionToRpcParams(solution);
  const contentHash = await contentHashForPost(title, body);
  const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });
  const res = await rpc.submitPost({
    spaceId,
    title,
    body,
    authorId: id.publicKeyHex,
    powNonce: Number(p.pow_nonce),
    powDifficulty: p.pow_difficulty,
    powNonceSpace: p.pow_nonce_space,
    powHash: p.pow_hash,
    signature,
    timestamp: p.timestamp,
  });
  return res.content_id;
}

async function submitMinedReply(
  rpc: SwimchainRpc,
  id: Identity,
  parentId: string,
  body: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const challenge = await createChallenge(
    ActionType.Reply,
    new TextEncoder().encode(body),
    hexToBytes(id.publicKeyHex),
    getDifficulty(ActionType.Reply, TESTNET)
  );
  const solution = await minePow(challenge, getConfig(TESTNET), onProgress);
  const p = solutionToRpcParams(solution);
  const contentHash = await contentHashForReply(body);
  const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });
  const res = await rpc.submitReply({
    parentId,
    body,
    authorId: id.publicKeyHex,
    powNonce: Number(p.pow_nonce),
    powDifficulty: p.pow_difficulty,
    powNonceSpace: p.pow_nonce_space,
    powHash: p.pow_hash,
    signature,
    timestamp: p.timestamp,
  });
  return res.content_id;
}

// ── Onboarding: auto-sponsor a brand-new visitor ───────────────────────────────────

/**
 * Make a brand-new identity able to play, preferring the game's always-online
 * sponsor. Thin wrapper over the shared `ensureSponsored` (in @swimchain/react)
 * so reef and chess share one claim-construction path.
 */
export function ensureReefSponsored(
  rpc: SwimchainRpc,
  id: Identity,
  onProgress?: (phase: string) => void
): Promise<void> {
  return ensureSponsored(rpc, id, { preferredSponsorHex: GAME_SPONSOR, onProgress });
}

// ── Regions ──────────────────────────────────────────────────────────────────────

export async function createRegion(
  rpc: SwimchainRpc,
  id: Identity,
  spaceId: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const header: ReefHeader = {
    v: 1,
    kind: 'reef',
    founder: id.publicKeyHex,
    w: GRID_W,
    h: GRID_H,
    created: Date.now(),
  };
  const title = `Reef — founded by ${id.address.slice(0, 10)}…`;
  return submitMinedPost(rpc, id, spaceId, title, JSON.stringify(header), onProgress);
}

function parseRegionHeader(body: string | null | undefined): ReefHeader | null {
  if (!body) return null;
  const nl = body.indexOf('\n\n');
  const jsonStr = nl >= 0 ? body.slice(nl + 2) : body;
  try {
    const h = JSON.parse(jsonStr) as ReefHeader;
    if (h?.kind !== 'reef') return null;
    if (!Number.isInteger(h.w) || !Number.isInteger(h.h)) return null;
    return h;
  } catch {
    return null;
  }
}

export async function listRegions(rpc: SwimchainRpc, spaceId: string): Promise<RegionSummary[]> {
  const res = await rpc.listSpacePosts(spaceId, { limit: 100 });
  const regions: RegionSummary[] = [];
  for (const it of res.items) {
    const header = parseRegionHeader(it.body);
    if (header) regions.push({ id: it.content_id, title: it.title ?? '', header });
  }
  return regions;
}

export async function loadRegion(rpc: SwimchainRpc, regionId: string): Promise<ReefState> {
  const post = await rpc.getContent(regionId);
  const header =
    parseRegionHeader(post.body) ??
    ({ v: 1, kind: 'reef', founder: '', w: GRID_W, h: GRID_H, created: 0 } as ReefHeader);
  // Fetch replies and the current chain tip together — the tip advances the tide to
  // "now" so idle reefs decay as blocks pass (getInfo failure just skips idle-catchup).
  // limit: the node's get_replies defaults to 1000 — a reef region outgrows that
  // within days of play, and every move past the cap silently vanished from the
  // fold (the 2026-07-16 "board wipe": sealed moves invisible, cells reaped).
  const [{ replies }, tipHeight] = await Promise.all([
    rpc.getReplies(regionId, { limit: 100000 }),
    rpc.getInfo().then((i) => i.block_height).catch(() => undefined),
  ]);
  return foldReef(header, replies as ReplyLike[], tipHeight);
}

/**
 * Submit a move as a reply to the region thread.
 *
 * Replies are content-addressed by sha256(body), so IDENTICAL bodies dedup to
 * one on-chain — desirable for a re-broadcast of the same submission, but a
 * silent data-loss trap for two DISTINCT clicks that happen to produce the
 * same body. The old scheme keyed uniqueness on `seq` (= the client's current
 * move count) + a slice of the author id, and claimed collisions were
 * impossible. They aren't: the same identity on two devices (or two fast
 * clicks before the fold updates) sees the same `seq`, and a same-cell move
 * then yields a byte-identical body → the node dedups it, the move never
 * seals, and the client is left showing a phantom that can never land.
 *
 * Fix: append a per-submission random nonce. Distinct clicks now ALWAYS get
 * distinct bodies (so every real move seals), while the node's mempool
 * rebroadcast still resends the exact same bytes (so a genuine re-broadcast
 * still dedups correctly). The fold only reads the first three tokens
 * (`<op> <x> <y>`), so the nonce is inert to game state.
 */
export async function submitReefMove(
  rpc: SwimchainRpc,
  id: Identity,
  regionId: string,
  op: Op,
  x: number,
  y: number,
  onProgress?: ProgressCallback
): Promise<string> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // The `#<n>~` field is the AUTHORING timestamp (ms). The fold orders moves by
  // it (see `authorSeqOf`/`seqCmp`), so a seed always precedes the spread that
  // grows from it — even while both are pending and the node's `created_at` is
  // still query-stamped. Real wall-clock time, so it is monotonic across reloads
  // and reorgs (unlike a move-count seq). The random nonce keeps bodies unique.
  const body = `${op} ${x} ${y} ${regionId}#${Date.now()}~${id.publicKeyHex.slice(0, 10)}~${nonce}`;
  return submitMinedReply(rpc, id, regionId, body, onProgress);
}

/**
 * Apply the local player's move optimistically (before it seals on-chain) so the UI
 * updates without waiting a block. Spends budget locally but does NOT tick an epoch —
 * the poll reconciles exact state (and won't go backwards; see App's monotonic guard).
 */
export function applyMoveOptimistic(
  state: ReefState,
  authorPubkeyHex: string,
  op: Op,
  x: number,
  y: number
): ReefState {
  const cells = new Map<string, Cell>();
  for (const [k, c] of state.cells) cells.set(k, { ...c });
  const budgets = new Map(state.budgets);
  const tendsUsed = new Map(state.tendsUsed);
  const isAuthor = (owner: string) => owner === authorPubkeyHex;
  const cls = classify(cells, state.header, isAuthor, op, x, y);
  let ok = false;
  // Optimistic outcome is a best-guess for immediate feedback; the authoritative
  // outcome (incl. tie-lost / capture) comes from the fold once the move seals.
  let outcome: MoveOutcome = 'rejected-invalid';
  if (cls) {
    if (cls.kind === 'tend') {
      const used = tendsUsed.get(authorPubkeyHex) ?? 0;
      if (used < state.params.tendCap) {
        mutate(cells, authorPubkeyHex, 'tend', x, y);
        tendsUsed.set(authorPubkeyHex, used + 1);
        ok = true;
        outcome = 'tended';
      } else {
        outcome = 'rejected-capped';
      }
    } else {
      const have = budgets.get(authorPubkeyHex) ?? START_BUDGET;
      if (have >= cls.cost) {
        mutate(cells, authorPubkeyHex, cls.kind, x, y);
        budgets.set(authorPubkeyHex, have - cls.cost);
        ok = true;
        outcome = cls.kind === 'contest' ? 'contested' : 'grew';
      } else {
        outcome = 'rejected-unaffordable';
      }
    }
  }
  const living = livingByOwner(cells);
  // The optimistically-touched cell is unsettled by definition — add it to the
  // frontier so it renders as "settling" until the real move confirms.
  const frontier = new Set(state.frontier);
  if (ok) frontier.add(cellKey(x, y));
  return {
    ...state,
    cells,
    budgets,
    tendsUsed,
    owners: [...living.keys()],
    frontier,
    moves: [
      ...state.moves,
      { op, x, y, author: authorPubkeyHex, contentId: `pending-${state.moves.length}`, ok, outcome },
    ],
  };
}
