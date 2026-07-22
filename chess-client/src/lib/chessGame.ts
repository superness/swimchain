/**
 * Swimchain Chess — "game = thread, move = reply".
 *
 * A game is a Post in the chess space whose body is a JSON header (who is White).
 * Each move is a Reply to that post whose body is the move in SAN (e.g. "e4", "Nf3").
 * The board is a pure function of the ordered reply chain: every client folds the
 * replies through chess.js and arrives at the same position — the chain is the
 * referee, nobody owns it. Because the node now enforces per-action signatures,
 * a move is provably its author's; a relay cannot forge it.
 */

import { Chess } from 'chess.js';
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

const TESTNET = true;

/**
 * Mine an action PoW off the main thread. A difficulty-8 Argon2id search is
 * several seconds of CPU; on the main thread it froze the tab (and the progress
 * overlay couldn't paint). Runs the same `computePow` in a Web Worker and
 * resolves with the solution, streaming progress through. Falls back to
 * on-thread mining only if the worker can't be constructed (very old runtime).
 * Same fix as reef-client.
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

/** The chess space id (bech32 `sp1…`). Set via VITE_CHESS_SPACE at build/dev time. */
export const CHESS_SPACE: string =
  (import.meta.env.VITE_CHESS_SPACE as string | undefined)?.trim() || '';

/**
 * Preferred onboarding sponsor (hex) — the always-online node whose standing
 * auto-approve offer new players claim. Configurable via VITE_GAME_SPONSOR;
 * defaults to the testnet genesis root. See ensureSponsored / reef's GAME_SPONSOR.
 */
export const GAME_SPONSOR: string =
  (import.meta.env.VITE_GAME_SPONSOR as string | undefined)?.trim() ||
  '9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420';

/**
 * Make a brand-new identity able to play: claim a standing auto-approve offer
 * from the game sponsor and wait for the chain to record it. Thin wrapper over
 * the shared ensureSponsored so reef and chess share one path.
 */
export function ensureChessSponsored(
  rpc: SwimchainRpc,
  id: Identity,
  onProgress?: (phase: string) => void
): Promise<void> {
  return ensureSponsored(rpc, id, {
    preferredSponsorHex: GAME_SPONSOR,
    strictPreferred: true,
    onProgress,
  });
}

export type SignFn = (
  message: Uint8Array
) => Uint8Array | null | Promise<Uint8Array | null>;

/** The local player. `address` is the bech32 form the node returns as `author_id`. */
export interface Identity {
  publicKeyHex: string;
  address: string;
  sign: SignFn;
}

export interface GameHeader {
  v: 1;
  kind: 'chess';
  white: string; // creator's bech32 address
  variant: 'standard';
  created: number;
  name?: string; // optional player-chosen room name
  bot?: boolean; // creator requested the computer opponent (a bot service plays Black)
  unlisted?: boolean; // hidden from the public lobby; joinable only via invite link
}

export interface CreateGameOpts {
  name?: string;
  vsBot?: boolean; // request the non-AI computer opponent
  unlisted?: boolean; // invite-only (not shown in the lobby)
}

export interface GameSummary {
  id: string;
  title: string;
  header: GameHeader;
}

export interface AppliedMove {
  san: string;
  from: string;
  to: string;
  author: string;
  contentId: string;
}

export interface GameState {
  chess: Chess;
  header: GameHeader;
  white: string;
  black: string | null;
  moves: AppliedMove[];
  turn: 'w' | 'b';
  result: string | null;
}

// ---------------------------------------------------------------------------
// Low level: PoW-mine + canonically sign, then submit.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Games.
// ---------------------------------------------------------------------------

/** Create a new game. The creator is White; Black is an open seat until claimed.
 *  `opts` carries an optional room name, a request for the computer opponent, and
 *  an invite-only (unlisted) flag. */
export async function createGame(
  rpc: SwimchainRpc,
  id: Identity,
  spaceId: string,
  opts: CreateGameOpts = {},
  onProgress?: ProgressCallback
): Promise<string> {
  // White is stored as the pubkey hex, because move replies come back from
  // get_replies with author_id in pubkey-hex form (list_space_posts uses bech32 —
  // an RPC inconsistency). The fold compares against reply author_id, so the header
  // must use the same form.
  const name = opts.name?.trim().slice(0, 60) || undefined;
  const header: GameHeader = {
    v: 1,
    kind: 'chess',
    white: id.publicKeyHex,
    variant: 'standard',
    created: Date.now(),
    ...(name ? { name } : {}),
    ...(opts.vsBot ? { bot: true } : {}),
    ...(opts.unlisted ? { unlisted: true } : {}),
  };
  const label = name ?? `${id.address.slice(0, 10)}… as White`;
  const tags = [opts.vsBot ? 'vs computer' : null, opts.unlisted ? 'private' : 'open seat']
    .filter(Boolean)
    .join(' · ');
  const title = `Chess — ${label}${tags ? ` · ${tags}` : ''}`;
  return submitMinedPost(rpc, id, spaceId, title, JSON.stringify(header), onProgress);
}

/**
 * Extract the game-header JSON from a post's stored content.
 *
 * The node stores a POST as `title\n\nbody`, so the retrieved `body` is
 * `"<title>\n\n<json>"`. The header is the JSON after the first blank line.
 */
function parseGameHeader(body: string | null | undefined): GameHeader | null {
  if (!body) return null;
  const nl = body.indexOf('\n\n');
  const jsonStr = nl >= 0 ? body.slice(nl + 2) : body;
  try {
    const h = JSON.parse(jsonStr) as GameHeader;
    return h?.kind === 'chess' ? h : null;
  } catch {
    return null;
  }
}

/** List chess games in the space. */
export async function listGames(rpc: SwimchainRpc, spaceId: string): Promise<GameSummary[]> {
  const res = await rpc.listSpacePosts(spaceId, { limit: 100 });
  const games: GameSummary[] = [];
  for (const it of res.items) {
    const header = parseGameHeader(it.body);
    if (header) {
      games.push({ id: it.content_id, title: it.title ?? '', header });
    }
  }
  return games;
}

/**
 * Load a game by folding its reply chain through chess.js.
 *
 * Determinism: replies are ordered by (created_at, content_id). White's moves must
 * come from the creator; the first distinct author who plays a legal move on Black's
 * turn claims the Black seat, and thereafter Black's moves must come from that author.
 * Moves from the wrong side, or illegal in the current position, are ignored — so
 * every client derives the same board without a referee.
 */
export async function loadGame(rpc: SwimchainRpc, gameId: string): Promise<GameState> {
  const post = await rpc.getContent(gameId);
  const header = parseGameHeader(post.body) ?? { v: 1, kind: 'chess', white: '', variant: 'standard', created: 0 };
  const { replies } = await rpc.getReplies(gameId, { limit: 100000 });
  const sorted = replies
    .slice()
    .sort((a, b) => a.created_at - b.created_at || a.content_id.localeCompare(b.content_id));

  const chess = new Chess();
  const moves: AppliedMove[] = [];

  // Fold moves by legality + turn order. The node cryptographically enforces that
  // each move is signed by its author (that's what makes a move "provably yours"),
  // so the client trusts authorship and just applies legal moves in order. We do NOT
  // strict-match author to a stored White/Black id here because the node returns
  // author_id inconsistently (bech32 address vs pubkey hex across RPCs/games).
  for (const r of sorted) {
    // Move body is "<san> <gameId>#<ply>"; the SAN is the first token.
    const san = (r.body ?? '').trim().split(/\s+/)[0] ?? '';
    if (!san) continue;
    try {
      const mv = chess.move(san);
      if (mv) {
        moves.push({ san: mv.san, from: mv.from, to: mv.to, author: r.author_id, contentId: r.content_id });
      }
    } catch {
      /* illegal in this position — ignore */
    }
  }

  // Black = the author of the first Black move (ply 1), for display / seat detection.
  const black = moves.length >= 2 ? moves[1].author : null;
  return { chess, header, white: header.white, black, moves, turn: chess.turn(), result: gameResult(chess) };
}

/**
 * Submit a move as a reply to the game thread.
 *
 * Replies are content-addressed by sha256(body), so an identical body (e.g. "e4")
 * in two different games — or a repeated SAN within one game — would collide and
 * dedup. The move body is therefore `"<san> <gameId>#<ply>"`, which is unique per
 * game and ply. The fold reads the SAN as the first whitespace-delimited token.
 */
export async function submitMove(
  rpc: SwimchainRpc,
  id: Identity,
  gameId: string,
  san: string,
  ply: number,
  onProgress?: ProgressCallback
): Promise<string> {
  const body = `${san} ${gameId}#${ply}`;
  return submitMinedReply(rpc, id, gameId, body, onProgress);
}

/**
 * Apply the local player's move to the board immediately (optimistic), before it
 * finalizes on-chain — so the UI updates without waiting a block. The poll then
 * reconciles once the move seals (and won't go backwards; see the monotonic guard).
 */
export function applyMoveOptimistic(state: GameState, san: string, author: string): GameState {
  const c = new Chess(state.chess.fen());
  try {
    c.move(san);
  } catch {
    return state;
  }
  return {
    ...state,
    chess: c,
    turn: c.turn(),
    moves: [
      ...state.moves,
      { san, from: '', to: '', author, contentId: `pending-${state.moves.length}` },
    ],
    result: gameResult(c),
  };
}

function gameResult(chess: Chess): string | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) return chess.turn() === 'w' ? 'Black wins — checkmate' : 'White wins — checkmate';
  if (chess.isStalemate()) return 'Draw — stalemate';
  if (chess.isThreefoldRepetition()) return 'Draw — threefold repetition';
  if (chess.isInsufficientMaterial()) return 'Draw — insufficient material';
  if (chess.isDraw()) return 'Draw — 50-move rule';
  return 'Game over';
}

/**
 * Which side, if any, the local player may move right now.
 * Returns 'w' | 'b' if it's their turn, or null (spectator / not their turn).
 * An unclaimed Black seat lets a non-White player move as Black.
 */
export function playableSide(
  state: GameState,
  myPubkeyHex: string,
  myAddress: string
): 'w' | 'b' | null {
  if (state.result) return null;
  // author_id comes back as address OR pubkey hex depending on the RPC, so match either.
  const isMe = (id: string | null) => !!id && (id === myPubkeyHex || id === myAddress);
  const iAmWhite = isMe(state.white);
  if (state.turn === 'w') return iAmWhite ? 'w' : null;
  // Black to move: the claimed Black player, or anyone-but-White if the seat is open.
  if (state.black) return isMe(state.black) ? 'b' : null;
  return !iAmWhite ? 'b' : null;
}
