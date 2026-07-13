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
 *   1. RESOURCE ECONOMY. Each player has a growth budget. Growing/contesting/tending
 *      cost budget; budget regenerates each epoch in proportion to your *living*
 *      territory. You cannot spam-paint — every placement is a real tradeoff (expand
 *      vs. tend vs. bank). Scarcity beyond raw PoW time.
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
 * Phase 1 keys epochs to the *move sequence*: every EPOCH_MOVES **well-formed** moves
 * (any parseable grow/tend, whether or not it was affordable/legal) ticks one epoch —
 * decay, then budget regen, then scoring. Pacing is decoupled from budget on purpose,
 * so budgets can never deadlock (as long as anyone keeps playing, epochs advance and
 * everyone regenerates). Fully deterministic with ZERO node changes.
 *
 * ── Phase 2 (later; see docs/GAMES_ON_SWIMCHAIN.md) ─────────────────────────────────
 * Rekey epochs to block height; add the confirmed/tentative reorg frontier; spaces-as-
 * shards across many regions.
 *
 * Determinism rules honored here: integer-only state, no floats, no wall-clock, moves
 * sorted by (created_at, content_id), deterministic tie-breaks by id string.
 */

import {
  ActionType,
  createChallenge,
  computePow,
  getConfig,
  getDifficulty,
  solutionToRpcParams,
  hexToBytes,
  signAction,
  contentHashForPost,
  contentHashForReply,
  type SwimchainRpc,
  type ProgressCallback,
} from '@swimchain/react';

const TESTNET = true;

/** The reef space id (bech32 `sp1…`). Set via VITE_REEF_SPACE at build/dev time. */
export const REEF_SPACE: string =
  (import.meta.env.VITE_REEF_SPACE as string | undefined)?.trim() || '';

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
export const START_BUDGET = 6;
export const MAX_BUDGET = 14;
export const COST_GROW = 2; // seed or spread onto open water
export const COST_TEND = 1; // refresh your own coral
export const COST_CONTEST = 3; // grow onto an enemy border cell
/** Per epoch, every tracked player regenerates this + floor(livingCells / 2). */
export const REGEN_BASE = 2;

// Seasons
export const SEASON_EPOCHS = 5;

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
}

export interface SeasonResult {
  index: number;
  winner: string | null;
  points: number;
}

export interface Standing {
  owner: string;
  seasonPoints: number; // banked this season
  territory: number; // living cells right now
  vitality: number; // Σ vitality of living cells right now (live score)
}

export interface ReefState {
  header: ReefHeader;
  cells: Map<string, Cell>;
  moves: AppliedMove[];
  epoch: number;
  season: number; // current season index
  epochsLeftInSeason: number;
  budgets: Map<string, number>;
  seasonPoints: Map<string, number>; // current-season accumulator
  seasons: SeasonResult[]; // closed seasons, in order
  standings: Standing[]; // sorted leaderboard (season points desc, then live vitality)
  owners: string[]; // distinct current cell owners (for the grid legend)
}

/** What clicking a cell would do for a given player, its cost, and whether affordable. */
export interface Intent {
  op: Op;
  kind: MoveKind;
  cost: number;
  affordable: boolean;
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
      return COST_TEND;
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
    if (cell && isOwner(cell.owner)) return { kind: 'tend', cost: COST_TEND };
    return null;
  }
  // op === 'grow'
  if (!cell) {
    if (!ownsAnyCell(cells, isOwner)) return { kind: 'seed', cost: costOf('seed') };
    if (hasAdjacentOwnedBy(cells, isOwner, x, y)) return { kind: 'spread', cost: costOf('spread') };
    return null;
  }
  if (isOwner(cell.owner)) return { kind: 'tend', cost: COST_TEND }; // grow on your own = tend
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

interface ReplyLike {
  body?: string | null;
  created_at: number;
  content_id: string;
  author_id: string;
}

/**
 * Fold a region's reply chain into world-state — including budgets, season points, and
 * the leaderboard. Deterministic and byte-identical across replicas.
 */
export function foldReef(header: ReefHeader, replies: ReplyLike[]): ReefState {
  const cells = new Map<string, Cell>();
  const budgets = new Map<string, number>();
  let seasonPoints = new Map<string, number>();
  const seasons: SeasonResult[] = [];
  const moves: AppliedMove[] = [];
  let attempts = 0;
  let epoch = 0;

  const sorted = replies
    .slice()
    .sort((a, b) => a.created_at - b.created_at || a.content_id.localeCompare(b.content_id));

  for (const r of sorted) {
    const parsed = parseMove(r.body);
    if (!parsed) continue; // garbage doesn't even pace the clock
    const author = r.author_id;
    if (!budgets.has(author)) budgets.set(author, START_BUDGET);

    const isAuthor = (owner: string) => owner === author;
    const cls = classify(cells, header, isAuthor, parsed.op, parsed.x, parsed.y);
    let ok = false;
    if (cls) {
      const have = budgets.get(author)!;
      if (have >= cls.cost) {
        mutate(cells, author, cls.kind, parsed.x, parsed.y);
        budgets.set(author, have - cls.cost);
        ok = true;
      }
    }
    moves.push({ ...parsed, author, contentId: r.content_id, ok });

    attempts += 1;
    if (attempts % EPOCH_MOVES === 0) {
      // 1) decay
      epochTick(cells);
      // 2) regen + 3) score, both off the post-decay living map
      const living = livingByOwner(cells);
      for (const [owner, cur] of budgets) {
        const live = living.get(owner);
        const regen = REGEN_BASE + Math.floor((live?.cells ?? 0) / 2);
        budgets.set(owner, Math.min(MAX_BUDGET, cur + regen));
      }
      for (const [owner, live] of living) {
        seasonPoints.set(owner, (seasonPoints.get(owner) ?? 0) + live.vitality);
      }
      epoch += 1;
      // 4) close the season on its boundary
      if (epoch % SEASON_EPOCHS === 0) {
        let winner: string | null = null;
        let best = -1;
        for (const [owner, pts] of [...seasonPoints].sort((a, b) => a[0].localeCompare(b[0]))) {
          if (pts > best) {
            best = pts;
            winner = owner;
          }
        }
        seasons.push({ index: epoch / SEASON_EPOCHS - 1, winner, points: Math.max(0, best) });
        seasonPoints = new Map();
      }
    }
  }

  const living = livingByOwner(cells);
  const owners = [...living.keys()];
  const standingOwners = new Set<string>([...owners, ...seasonPoints.keys()]);
  const standings: Standing[] = [...standingOwners]
    .map((owner) => ({
      owner,
      seasonPoints: seasonPoints.get(owner) ?? 0,
      territory: living.get(owner)?.cells ?? 0,
      vitality: living.get(owner)?.vitality ?? 0,
    }))
    .sort(
      (a, b) => b.seasonPoints - a.seasonPoints || b.vitality - a.vitality || a.owner.localeCompare(b.owner)
    );

  return {
    header,
    cells,
    moves,
    epoch,
    season: Math.floor(epoch / SEASON_EPOCHS),
    epochsLeftInSeason: SEASON_EPOCHS - (epoch % SEASON_EPOCHS),
    budgets,
    seasonPoints,
    seasons,
    standings,
    owners,
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

/**
 * The intent for a click, resolving the op the player most likely wants (grow unless
 * the cell is already theirs, in which case tend), with cost + affordability.
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
  const budget = myBudget(state, myPubkeyHex, myAddress);
  return { op, kind: cls.kind, cost: cls.cost, affordable: budget >= cls.cost };
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
  const solution = await computePow(challenge, getConfig(TESTNET), onProgress);
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
  const solution = await computePow(challenge, getConfig(TESTNET), onProgress);
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
  const { replies } = await rpc.getReplies(regionId);
  return foldReef(header, replies as ReplyLike[]);
}

/**
 * Submit a move as a reply to the region thread.
 *
 * Replies are content-addressed by sha256(body), so identical bodies collide/dedup.
 * The body embeds regionId, a monotonically-growing seq, and a slice of the author id,
 * so two different players (or the same player at different seqs) never collide. The
 * fold reads only the first three tokens (`<op> <x> <y>`).
 */
export async function submitReefMove(
  rpc: SwimchainRpc,
  id: Identity,
  regionId: string,
  op: Op,
  x: number,
  y: number,
  seq: number,
  onProgress?: ProgressCallback
): Promise<string> {
  const body = `${op} ${x} ${y} ${regionId}#${seq}~${id.publicKeyHex.slice(0, 10)}`;
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
  const isAuthor = (owner: string) => owner === authorPubkeyHex;
  const cls = classify(cells, state.header, isAuthor, op, x, y);
  let ok = false;
  if (cls) {
    const have = budgets.get(authorPubkeyHex) ?? START_BUDGET;
    if (have >= cls.cost) {
      mutate(cells, authorPubkeyHex, cls.kind, x, y);
      budgets.set(authorPubkeyHex, have - cls.cost);
      ok = true;
    }
  }
  const living = livingByOwner(cells);
  return {
    ...state,
    cells,
    budgets,
    owners: [...living.keys()],
    moves: [
      ...state.moves,
      { op, x, y, author: authorPubkeyHex, contentId: `pending-${state.moves.length}`, ok },
    ],
  };
}
