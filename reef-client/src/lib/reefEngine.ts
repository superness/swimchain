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
 * ── Phase 1 (this file) ──────────────────────────────────────────────────────────
 *  - A single region = one grid.
 *  - A move = a tiny reply body: "<op> <x> <y> …" where op ∈ { grow, tend }.
 *  - Epochs are keyed to the **move sequence**: every EPOCH_MOVES applied moves ticks
 *    one epoch of decay. This is fully deterministic with ZERO node changes — no need
 *    to read per-action block heights. Abandoned coral loses vitality and recedes to
 *    open water: decay as the storage governor, made diegetic.
 *
 * ── Phase 2 (later; see docs/GAMES_ON_SWIMCHAIN.md) ─────────────────────────────────
 *  - Rekey epochs to block height; add the confirmed/tentative reorg frontier.
 *  - Spaces-as-shards: many regions, cross-border contest, seasonal scoring.
 *
 * Determinism rules honored here: integer-only state, no floats, no wall-clock, no
 * iteration-order surprises (moves are sorted by (created_at, content_id), and cell
 * scans use a fixed key order only where order is observable).
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
/** Every this-many *applied* moves, the world ticks one epoch of decay. */
export const EPOCH_MOVES = 8;
/** Damage a contesting `grow` deals to an enemy cell. */
export const CONTEST_DAMAGE = 2;
/** Vitality a just-captured cell has (a taken border cell is weak). */
export const CAPTURE_VITALITY = 1;

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
  ok: boolean; // did it change the world? (illegal moves are recorded but inert)
}

export interface ReefState {
  header: ReefHeader;
  cells: Map<string, Cell>;
  moves: AppliedMove[];
  epoch: number;
  owners: string[]; // distinct current cell owners (for the legend)
}

/** What clicking a cell would do for a given player, and whether it's allowed. */
export type Intent =
  | { op: 'grow'; kind: 'seed' | 'spread' | 'contest' }
  | { op: 'tend'; kind: 'tend' }
  | null;

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

/** Does `author` own a cell orthogonally adjacent to (x,y)? */
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

// ── The pure engine: apply one move; tick an epoch; fold the whole chain ────────────

/**
 * Apply a single parsed move authored by `author`. Mutates `cells`. Returns whether
 * the move was legal (changed the world). Legality is identical across all clients, so
 * every replica derives the same grid — no referee.
 */
function applyMove(
  cells: Map<string, Cell>,
  header: ReefHeader,
  author: string,
  op: Op,
  x: number,
  y: number
): boolean {
  if (!inBounds(x, y, header.w, header.h)) return false;
  const k = cellKey(x, y);
  const cell = cells.get(k);
  const isAuthor = (owner: string) => owner === author;

  if (op === 'tend') {
    // You can always refresh a cell you already hold.
    if (cell && cell.owner === author) {
      cell.vitality = MAX_VITALITY;
      return true;
    }
    return false;
  }

  // op === 'grow'
  if (!cell) {
    // Plant on open water: your first cell may seed anywhere; after that you must
    // grow outward from your own coral (adjacency) — territory spreads, not teleports.
    if (!ownsAnyCell(cells, isAuthor) || hasAdjacentOwnedBy(cells, isAuthor, x, y)) {
      cells.set(k, { owner: author, vitality: MAX_VITALITY });
      return true;
    }
    return false;
  }
  if (cell.owner === author) {
    cell.vitality = MAX_VITALITY;
    return true;
  }
  // Enemy cell: contest, but only along a shared border (one of your cells adjacent).
  if (hasAdjacentOwnedBy(cells, isAuthor, x, y)) {
    cell.vitality -= CONTEST_DAMAGE;
    if (cell.vitality <= 0) {
      cell.owner = author;
      cell.vitality = CAPTURE_VITALITY;
    }
    return true;
  }
  return false;
}

/** One epoch of decay: every cell loses a vitality; those at 0 recede to open water. */
function epochTick(cells: Map<string, Cell>): void {
  for (const [k, c] of cells) {
    c.vitality -= 1;
    if (c.vitality <= 0) cells.delete(k);
  }
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

/**
 * Fold a region's reply chain into world-state.
 *
 * Replies are ordered by (created_at, content_id) — the same canonical order every
 * client uses — then applied in sequence. Every EPOCH_MOVES *applied* moves, one epoch
 * of decay ticks. The result is byte-identical across replicas.
 */
export function foldReef(header: ReefHeader, replies: ReplyLike[]): ReefState {
  const cells = new Map<string, Cell>();
  const moves: AppliedMove[] = [];
  let applied = 0;
  let epoch = 0;

  const sorted = replies
    .slice()
    .sort((a, b) => a.created_at - b.created_at || a.content_id.localeCompare(b.content_id));

  for (const r of sorted) {
    const parsed = parseMove(r.body);
    if (!parsed) continue;
    const ok = applyMove(cells, header, r.author_id, parsed.op, parsed.x, parsed.y);
    moves.push({ ...parsed, author: r.author_id, contentId: r.content_id, ok });
    if (ok) {
      applied += 1;
      if (applied % EPOCH_MOVES === 0) {
        epochTick(cells);
        epoch += 1;
      }
    }
  }

  const owners = [...new Set([...cells.values()].map((c) => c.owner))];
  return { header, cells, moves, epoch, owners };
}

interface ReplyLike {
  body?: string | null;
  created_at: number;
  content_id: string;
  author_id: string;
}

/**
 * What a click on (x,y) would do for the local player, and whether it's allowed.
 * Mirrors applyMove's legality read-only, matching either author_id form (the node
 * returns bech32 address in some RPCs and pubkey hex in others).
 */
export function moveIntent(
  state: ReefState,
  myPubkeyHex: string,
  myAddress: string,
  x: number,
  y: number
): Intent {
  if (!inBounds(x, y, state.header.w, state.header.h)) return null;
  const isMe = (owner: string) => owner === myPubkeyHex || owner === myAddress;
  const cell = state.cells.get(cellKey(x, y));

  if (cell && isMe(cell.owner)) return { op: 'tend', kind: 'tend' };
  if (!cell) {
    if (!ownsAnyCell(state.cells, isMe)) return { op: 'grow', kind: 'seed' };
    if (hasAdjacentOwnedBy(state.cells, isMe, x, y)) return { op: 'grow', kind: 'spread' };
    return null;
  }
  // enemy cell
  if (hasAdjacentOwnedBy(state.cells, isMe, x, y)) return { op: 'grow', kind: 'contest' };
  return null;
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

/** Create a new reef region (a Post in the reef space). */
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

/** Extract the reef header JSON from a post's stored `title\n\nbody` content. */
function parseRegionHeader(body: string | null | undefined): ReefHeader | null {
  if (!body) return null;
  const nl = body.indexOf('\n\n');
  const jsonStr = nl >= 0 ? body.slice(nl + 2) : body;
  try {
    const h = JSON.parse(jsonStr) as ReefHeader;
    if (h?.kind !== 'reef') return null;
    // Defensive: clamp dimensions so a malformed header can't blow up the grid render.
    if (!Number.isInteger(h.w) || !Number.isInteger(h.h)) return null;
    return h;
  } catch {
    return null;
  }
}

/** List reef regions in the space. */
export async function listRegions(rpc: SwimchainRpc, spaceId: string): Promise<RegionSummary[]> {
  const res = await rpc.listSpacePosts(spaceId, { limit: 100 });
  const regions: RegionSummary[] = [];
  for (const it of res.items) {
    const header = parseRegionHeader(it.body);
    if (header) regions.push({ id: it.content_id, title: it.title ?? '', header });
  }
  return regions;
}

/** Load a region by folding its reply chain into world-state. */
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
 * updates without waiting a block. Does NOT tick an epoch — the poll reconciles the
 * exact state (and won't go backwards; see the monotonic guard in App).
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
  const ok = applyMove(cells, state.header, authorPubkeyHex, op, x, y);
  const owners = [...new Set([...cells.values()].map((c) => c.owner))];
  return {
    ...state,
    cells,
    owners,
    moves: [
      ...state.moves,
      { op, x, y, author: authorPubkeyHex, contentId: `pending-${state.moves.length}`, ok },
    ],
  };
}
