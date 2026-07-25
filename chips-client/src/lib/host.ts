/**
 * The ONLY platform seam.
 *
 * Game code never talks to a node directly — it goes through ChipsHost. The
 * browser implementation relays through the gateway (the reef/chess path); a
 * later desktop build adds a sidecar implementation of this same interface
 * and changes nothing else. If any other file learns which target it is on,
 * this boundary has leaked.
 *
 * The submit recipe below (challenge -> mine -> solutionToRpcParams ->
 * contentHash -> signAction -> rpc.submit*) is copied from
 * reef-client/src/lib/reefEngine.ts (submitMinedPost / submitMinedReply,
 * lines ~873-936), which is the one implementation known to work against a
 * live (mainnet) node. Every RPC method name and parameter below was checked
 * against swimchain-react/src/lib/rpc.ts (the actual `SwimchainRpc` class) —
 * see task-8-report.md for the line-by-line verification and the several
 * places this diverges from the original design-doc draft.
 */
import {
  ActionType, createChallenge, computePow, getConfig, getDifficulty,
  solutionToRpcParams, hexToBytes, ensureSponsored, signAction,
  contentHashForPost, contentHashForReply,
  type SwimchainRpc, type SignFn,
} from '@swimchain/react';
import { MAX_BITS } from './chipsConst';
import type { ChipsReply } from './chipsEngine';

/**
 * The local player. Mirrors reef-client's local `Identity` (reefEngine.ts:165)
 * exactly — `@swimchain/react` does NOT export an `Identity` type (it exports
 * `SponsorableIdentity` and `StoredIdentity`, which are narrower shapes), so
 * every client that wants a `{ publicKeyHex, address, sign }` bundle defines
 * it locally. `address` is the bech32 form; `publicKeyHex` is what get_replies
 * returns as `author_id`.
 */
export interface Identity {
  publicKeyHex: string;
  address: string;
  sign: SignFn;
}

/** Baked at build time. A localhost fallback must NEVER ship — see Task 11. */
const RPC_URL = (import.meta.env?.VITE_CHIPS_RPC as string | undefined)?.trim() || '';
const CHIPS_SPACE = (import.meta.env?.VITE_CHIPS_SPACE as string | undefined)?.trim() || '';
const GAME_SPONSOR = (import.meta.env?.VITE_GAME_SPONSOR as string | undefined)?.trim() || '';

/**
 * Reef runs these "testnet" PoW params live on mainnet today (see
 * swimchain-react/src/lib/action-pow.ts's TESTNET_CONFIG / TESTNET_DIFFICULTY
 * and chipsConst.ts's CHIP_POW comment) — the flag name is a historical
 * misnomer, not a network selector. Chips matches that known-good precedent.
 */
const POW_TESTNET_PARAMS = true;

export interface TableSummary {
  tableId: string;
  authorId: string;
  name: string;
}

export interface ChipsHost {
  rpc: SwimchainRpc;
  spaceId: string;
  sponsor(id: Identity): Promise<void>;
  createTable(id: Identity, name: string): Promise<string>;
  submitMove(id: Identity, tableId: string, body: string): Promise<string>;
  loadTable(tableId: string): Promise<ChipsReply[]>;
  listTables(): Promise<TableSummary[]>;
  requestContent(contentId: string): Promise<void>;
}

/**
 * Build a `bank` move body. The fold (`parseMove` in chipsEngine.ts) requires
 * `bank <bits> <nonce_hex>#<ms>~` with the nonce matching `[0-9a-fA-F]{1,16}`
 * exactly — a malformed body doesn't error, it silently becomes an unparseable
 * reply and the move is lost forever. These asserts catch that before the PoW
 * grind + broadcast, not after.
 */
export function bankBody(bits: number, nonce: bigint, ms: number): string {
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) {
    throw new Error(`bankBody: bits must be an integer in [0, ${MAX_BITS}], got ${bits}`);
  }
  if (nonce < 0n || nonce > 0xffffffffffffffffn) {
    throw new Error(`bankBody: nonce must fit in an unsigned 64-bit int, got ${nonce}`);
  }
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`bankBody: ms must be a positive safe integer, got ${ms}`);
  }
  // BigInt#toString(16) is always lowercase, satisfying parseMove's regex.
  return `bank ${bits} ${nonce.toString(16)}#${ms}~`;
}

/** Build a `buy` move body: `buy <upgrade-key>#<ms>~`. */
export function buyBody(key: string, ms: number): string {
  if (!/^[a-z0-9]+$/.test(key)) {
    throw new Error(`buyBody: key must match /^[a-z0-9]+$/, got ${JSON.stringify(key)}`);
  }
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`buyBody: ms must be a positive safe integer, got ${ms}`);
  }
  return `buy ${key}#${ms}~`;
}

async function submitMinedReply(
  rpc: SwimchainRpc, id: Identity, parentId: string, body: string
): Promise<string> {
  // Reef passes the RAW body to createChallenge for a reply, not
  // `parentId:body` — matches contentHashForReply(body) = sha256(body).
  const challenge = await createChallenge(
    ActionType.Reply,
    new TextEncoder().encode(body),
    hexToBytes(id.publicKeyHex),
    getDifficulty(ActionType.Reply, POW_TESTNET_PARAMS)
  );
  const solution = await computePow(challenge, getConfig(POW_TESTNET_PARAMS));
  const p = solutionToRpcParams(solution);
  const contentHash = await contentHashForReply(body);
  const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });
  const res = await rpc.submitReply({
    parentId, body, authorId: id.publicKeyHex,
    powNonce: Number(p.pow_nonce), powDifficulty: p.pow_difficulty,
    powNonceSpace: p.pow_nonce_space, powHash: p.pow_hash,
    signature, timestamp: p.timestamp,
  });
  return res.content_id;
}

export function createBrowserHost(rpc: SwimchainRpc): ChipsHost {
  return {
    rpc,
    spaceId: CHIPS_SPACE,

    sponsor: (id) =>
      ensureSponsored(rpc, id, {
        preferredSponsorHex: GAME_SPONSOR,
        strictPreferred: true,
        requiredSpaceId: CHIPS_SPACE,
      }),

    async createTable(id, name) {
      const title = name;
      // No `owner` field here: ChipsHeader.owner (chipsEngine.ts) is meant to
      // come from the post's authenticated `author_id` (as returned by the
      // RPC, e.g. via TableSummary.authorId or ContentResult.author_id), not
      // from self-declared JSON a spoofed copy of this body could carry.
      const body = JSON.stringify({ v: 1, kind: 'chips-table', name });
      // POST content_hash / PoW challenge content is `${title}\n\n${body}` per
      // the node (src/rpc/methods.rs submit_post) and contentHashForPost's
      // doc comment — reef's submitMinedPost builds the exact same string
      // before calling createChallenge. Hashing just `body` here (as an
      // earlier draft of this file did) would make the client's PoW preimage
      // diverge from what the node reconstructs to verify it, and the
      // submission would fail PoW verification.
      const content = `${title}\n\n${body}`;
      const challenge = await createChallenge(
        ActionType.Post,
        new TextEncoder().encode(content),
        hexToBytes(id.publicKeyHex),
        getDifficulty(ActionType.Post, POW_TESTNET_PARAMS)
      );
      const solution = await computePow(challenge, getConfig(POW_TESTNET_PARAMS));
      const p = solutionToRpcParams(solution);
      const contentHash = await contentHashForPost(title, body);
      const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });
      const res = await rpc.submitPost({
        spaceId: CHIPS_SPACE, title, body, authorId: id.publicKeyHex,
        powNonce: Number(p.pow_nonce), powDifficulty: p.pow_difficulty,
        powNonceSpace: p.pow_nonce_space, powHash: p.pow_hash,
        signature, timestamp: p.timestamp,
      });
      return res.content_id;
    },

    submitMove: (id, tableId, body) => submitMinedReply(rpc, id, tableId, body),

    async loadTable(tableId) {
      // get_replies takes the content id positionally, not as a params
      // object, and has no `depthLimit` param (SwimchainRpc.getReplies in
      // swimchain-react/src/lib/rpc.ts:394-409). The node defaults to
      // limit=1000; a long-lived table's move history outgrows that within
      // days (the same "board wipe" truncation reef hit — see
      // reefEngine.ts:1013's comment), so pass a high explicit limit.
      const res = await rpc.getReplies(tableId, { limit: 100_000 });
      return res.replies.map((r) => ({
        author_id: r.author_id, body: r.body,
        block_height: r.block_height ?? null,
        content_id: r.content_id, created_at: r.created_at,
      }));
    },

    async listTables() {
      // Tables are top-level posts (created via submitPost in createTable
      // above), so list_space_posts — which the node already filters to
      // posts-only — is the correct call, not list_space_content (which
      // would also return every bank/buy reply from every table). Reef's
      // listRegions (reefEngine.ts:992) uses the same call for the same
      // reason: `rpc.listSpacePosts(spaceId, { limit })`, positional, not an
      // object with a `spaceId` field.
      const res = await rpc.listSpacePosts(CHIPS_SPACE, { limit: 1000 });
      const out: TableSummary[] = [];
      for (const c of res.items) {
        try {
          const header = JSON.parse(c.body ?? '{}');
          if (header?.kind === 'chips-table') {
            out.push({ tableId: c.content_id, authorId: c.author_id, name: String(header.name ?? 'Untitled') });
          }
        } catch { /* not a table post — skip */ }
      }
      return out;
    },

    // Rendering the boards is what keeps other players' tables hosted.
    // Content-getting needs a driver; this is it.
    async requestContent(contentId) {
      // request_content takes the content id positionally, not `{ contentId }`.
      await rpc.requestContent(contentId);
    },
  };
}

export { RPC_URL, CHIPS_SPACE, GAME_SPONSOR };
