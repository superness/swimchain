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
  signAction,
  contentHashForPost,
  contentHashForReply,
  type SwimchainRpc,
  type ProgressCallback,
} from '@swimchain/react';

const TESTNET = true;

/** The chess space id (bech32 `sp1…`). Set via VITE_CHESS_SPACE at build/dev time. */
export const CHESS_SPACE: string =
  (import.meta.env.VITE_CHESS_SPACE as string | undefined)?.trim() || '';

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

// ---------------------------------------------------------------------------
// Games.
// ---------------------------------------------------------------------------

/** Create a new game. The creator is White; Black is an open seat until claimed. */
export async function createGame(
  rpc: SwimchainRpc,
  id: Identity,
  spaceId: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const header: GameHeader = {
    v: 1,
    kind: 'chess',
    white: id.address,
    variant: 'standard',
    created: Date.now(),
  };
  const title = `Chess — ${id.address.slice(0, 10)}… as White · open seat`;
  return submitMinedPost(rpc, id, spaceId, title, JSON.stringify(header), onProgress);
}

/** List chess games in the space. */
export async function listGames(rpc: SwimchainRpc, spaceId: string): Promise<GameSummary[]> {
  const res = await rpc.listSpacePosts(spaceId, { limit: 100 });
  const games: GameSummary[] = [];
  for (const it of res.items) {
    try {
      const header = JSON.parse(it.body ?? '') as GameHeader;
      if (header?.kind === 'chess') {
        games.push({ id: it.content_id, title: it.title ?? '', header });
      }
    } catch {
      /* not a chess game post */
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
  const header = JSON.parse(post.body ?? '{}') as GameHeader;
  const { replies } = await rpc.getReplies(gameId);
  const sorted = replies
    .slice()
    .sort((a, b) => a.created_at - b.created_at || a.content_id.localeCompare(b.content_id));

  const chess = new Chess();
  const moves: AppliedMove[] = [];
  let black: string | null = null;

  for (const r of sorted) {
    const san = (r.body ?? '').trim();
    if (!san) continue;
    const turn = chess.turn();
    if (turn === 'b' && !black && r.author_id !== header.white) black = r.author_id;
    const expected = turn === 'w' ? header.white : black;
    if (r.author_id !== expected) continue;
    try {
      const mv = chess.move(san);
      if (mv) {
        moves.push({ san: mv.san, from: mv.from, to: mv.to, author: r.author_id, contentId: r.content_id });
      }
    } catch {
      /* illegal in this position — ignore */
    }
  }

  return { chess, white: header.white, black, moves, turn: chess.turn(), result: gameResult(chess) };
}

/** Submit a move (SAN) as a reply to the game thread. */
export async function submitMove(
  rpc: SwimchainRpc,
  id: Identity,
  gameId: string,
  san: string,
  onProgress?: ProgressCallback
): Promise<string> {
  return submitMinedReply(rpc, id, gameId, san, onProgress);
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
export function playableSide(state: GameState, myAddress: string): 'w' | 'b' | null {
  if (state.result) return null;
  if (state.turn === 'w') return state.white === myAddress ? 'w' : null;
  // Black to move: the claimed Black player, or anyone-but-White if the seat is open.
  if (state.black) return state.black === myAddress ? 'b' : null;
  return myAddress !== state.white ? 'b' : null;
}
