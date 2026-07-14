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
  ensureSponsored,
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

/**
 * Preferred onboarding sponsor's public key (hex). Auto-sponsor claims an
 * offer from THIS sponsor when available — it must be an always-online node
 * (the testnet genesis root) so the claim is auto-approved promptly. Without
 * this, onboarding could pick a stale auto-approve offer from an offline
 * sponsor and hang forever "waiting for approval". Configurable per deployment
 * via VITE_GAME_SPONSOR; defaults to the testnet genesis root.
 */
export const GAME_SPONSOR: string =
  (import.meta.env.VITE_GAME_SPONSOR as string | undefined)?.trim() ||
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
 * Phase 2: the tide is keyed to CONSENSUS BLOCK HEIGHT, not move order. Every this-many
 * blocks is one epoch, so decay/regen/scoring advance with real chain time — ungameable
 * (block height is consensus, not author-set) and never frantic (a burst of moves in one
 * block is still one tide). Idle reefs keep decaying as blocks pass. Moves not yet in a
 * block (null height) are the tentative frontier: shown, but not yet final.
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
  // Career / brag stats (cumulative over the whole region history):
  crowns: number; // seasons won
  peak: number; // largest territory ever held at once
  conquests: number; // enemy cells captured via contest
}

export interface ReefState {
  header: ReefHeader;
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
}

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

interface ReplyLike {
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
  let epoch = 0;
  let justCrowned: SeasonResult | null = null;

  const confirmed = replies
    .filter((r) => typeof r.block_height === 'number')
    .sort((a, b) => a.block_height! - b.block_height! || a.content_id.localeCompare(b.content_id));
  const pending = replies
    .filter((r) => typeof r.block_height !== 'number')
    .sort((a, b) => a.created_at - b.created_at || a.content_id.localeCompare(b.content_id));

  const baseHeight = confirmed.length ? confirmed[0].block_height! : tipHeight ?? 0;
  const epochOf = (h: number) => Math.max(0, Math.floor((h - baseHeight) / BLOCKS_PER_EPOCH));

  const updatePeaks = () => {
    for (const [o, e] of livingByOwner(cells)) peak.set(o, Math.max(peak.get(o) ?? 0, e.cells));
  };

  const tickEpoch = () => {
    epochTick(cells); // decay
    const living = livingByOwner(cells);
    for (const [owner, cur] of budgets) {
      budgets.set(
        owner,
        Math.min(MAX_BUDGET, cur + REGEN_BASE + Math.floor((living.get(owner)?.cells ?? 0) / 2))
      );
    }
    for (const [owner, l] of living) seasonPoints.set(owner, (seasonPoints.get(owner) ?? 0) + l.vitality);
    tendsUsed = new Map();
    epoch += 1;
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
      seasons.push(justCrowned);
      seasonPoints = new Map();
    }
    updatePeaks();
  };

  const applyOne = (r: ReplyLike, p: { op: Op; x: number; y: number }) => {
    const author = r.author_id;
    if (!budgets.has(author)) budgets.set(author, START_BUDGET);
    const isAuthor = (owner: string) => owner === author;
    const cls = classify(cells, header, isAuthor, p.op, p.x, p.y);
    let ok = false;
    if (cls) {
      if (cls.kind === 'tend') {
        const used = tendsUsed.get(author) ?? 0;
        if (used < TEND_CAP) {
          mutate(cells, author, 'tend', p.x, p.y);
          tendsUsed.set(author, used + 1);
          ok = true;
        }
      } else {
        const have = budgets.get(author)!;
        if (have >= cls.cost) {
          const prevOwner = cls.kind === 'contest' ? cells.get(cellKey(p.x, p.y))?.owner : undefined;
          mutate(cells, author, cls.kind, p.x, p.y);
          budgets.set(author, have - cls.cost);
          ok = true;
          const now = cells.get(cellKey(p.x, p.y));
          if (cls.kind === 'contest' && now?.owner === author && prevOwner && prevOwner !== author) {
            conquests.set(author, (conquests.get(author) ?? 0) + 1);
          }
        }
      }
    }
    moves.push({ ...p, author, contentId: r.content_id, ok });
    if (ok) updatePeaks();
  };

  // 1) Confirmed moves, ticking epochs by block height between them.
  for (const r of confirmed) {
    const p = parseMove(r.body);
    if (!p) continue;
    const target = epochOf(r.block_height!);
    while (epoch < target) tickEpoch();
    applyOne(r, p);
  }
  // 2) Advance the tide to the current chain tip — idle reefs decay as blocks pass.
  if (typeof tipHeight === 'number') {
    const tipEpoch = epochOf(tipHeight);
    while (epoch < tipEpoch) tickEpoch();
  }
  const confirmedEpoch = epoch;

  // 3) Pending (not-yet-in-a-block) moves: the tentative frontier, shown optimistically.
  let tentative = 0;
  for (const r of pending) {
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

  return {
    header,
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
  return Math.max(0, TEND_CAP - used);
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
  const [{ replies }, tipHeight] = await Promise.all([
    rpc.getReplies(regionId),
    rpc.getInfo().then((i) => i.block_height).catch(() => undefined),
  ]);
  return foldReef(header, replies as ReplyLike[], tipHeight);
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
  const tendsUsed = new Map(state.tendsUsed);
  const isAuthor = (owner: string) => owner === authorPubkeyHex;
  const cls = classify(cells, state.header, isAuthor, op, x, y);
  let ok = false;
  if (cls) {
    if (cls.kind === 'tend') {
      const used = tendsUsed.get(authorPubkeyHex) ?? 0;
      if (used < TEND_CAP) {
        mutate(cells, authorPubkeyHex, 'tend', x, y);
        tendsUsed.set(authorPubkeyHex, used + 1);
        ok = true;
      }
    } else {
      const have = budgets.get(authorPubkeyHex) ?? START_BUDGET;
      if (have >= cls.cost) {
        mutate(cells, authorPubkeyHex, cls.kind, x, y);
        budgets.set(authorPubkeyHex, have - cls.cost);
        ok = true;
      }
    }
  }
  const living = livingByOwner(cells);
  return {
    ...state,
    cells,
    budgets,
    tendsUsed,
    owners: [...living.keys()],
    moves: [
      ...state.moves,
      { op, x, y, author: authorPubkeyHex, contentId: `pending-${state.moves.length}`, ok },
    ],
  };
}
