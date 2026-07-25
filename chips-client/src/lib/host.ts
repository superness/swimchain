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
  solutionToRpcParams, hexToBytes, bytesToHex, ensureSponsored, signAction,
  contentHashForPost, contentHashForReply,
  type SwimchainRpc, type SignFn, type PoWChallenge, type PoWConfig,
  type PoWSolution, type ProgressCallback,
} from '@swimchain/react';
import { initWasm, decodeAddress } from '@swimchain/core';
import { bankBody, buyBody } from './chipsBody';
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
  /**
   * HEX public key (same format as `ChipsReply.author_id`, NOT bech32).
   *
   * `list_space_posts` returns `author_id` bech32m-encoded
   * (src/rpc/methods.rs:7396 -> src/crypto/address.rs:24-30), while
   * `get_replies` returns it as hex (src/rpc/methods.rs:9446). `foldChips`
   * (chipsEngine.ts:213) and `verifyReplies` (chipsVerify.ts:70) both compare
   * `author_id` by exact string equality against `ChipsHeader.owner` /
   * the `owner` parameter — so a `ChipsHeader.owner` built from this field
   * MUST already be hex, or it silently matches zero replies (every table
   * would render with no banks, no chips, no upgrades). This is normalized
   * here, at the seam, rather than left for every caller to remember —
   * unlike reef, which tolerates both forms at the point of comparison
   * instead (reefEngine.ts:859); comparing two differently-encoded strings
   * for the SAME key is exactly the class of bug that produces this file.
   */
  authorId: string;
  name: string;
}

export interface ChipsHost {
  rpc: SwimchainRpc;
  spaceId: string;
  sponsor(id: Identity): Promise<void>;
  createTable(id: Identity, name: string, onProgress?: ProgressCallback): Promise<string>;
  submitMove(id: Identity, tableId: string, body: string, onProgress?: ProgressCallback): Promise<string>;
  loadTable(tableId: string): Promise<ChipsReply[]>;
  listTables(): Promise<TableSummary[]>;
  requestContent(contentId: string): Promise<void>;
}

// Re-exported for callers that only import the seam; the implementations
// themselves live in chipsBody.ts, dependency-free (no RPC/PoW/WASM), so
// their round-trip test (chipsBody.test.ts) doesn't drag this whole module's
// import chain along.
export { bankBody, buyBody };

/**
 * Mine an action PoW off the main thread. A difficulty ~8-10 Argon2id search
 * is several seconds of CPU; on the main thread it freezes the tab (and any
 * progress UI can't paint) — reef hit exactly this and fixed it with an
 * identical worker (reef-client/src/lib/pow.worker.ts / reefEngine.ts:66-104).
 * Falls back to on-thread mining only if the worker can't be constructed
 * (very old runtime).
 */
function minePow(
  challenge: PoWChallenge,
  config: PoWConfig,
  onProgress?: ProgressCallback
): Promise<PoWSolution> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./actionPow.worker.ts', import.meta.url), { type: 'module' });
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

/**
 * A table name becomes the post `title`, and the stored body is
 * `${title}\n\n${json}` (the node's own post encoding — see the comment in
 * createTable below). The node splits on the FIRST `\n\n`
 * (src/rpc/methods.rs:7403-7411), so a name containing a blank line shifts
 * that split: `c.body` comes back as `<rest of name>\n\n{json}`, `JSON.parse`
 * throws, and `listTables`'s catch silently skips it — the table exists
 * on-chain (a full Argon2id grind spent), but can never be listed again.
 * Reject that up front instead of losing it after the fact.
 */
function assertValidTableName(name: string): void {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('createTable: name must be a non-empty string');
  }
  if (name.length > 80) {
    throw new Error(`createTable: name must be at most 80 characters, got ${name.length}`);
  }
  if (/[\r\n]/.test(name)) {
    throw new Error('createTable: name must not contain newlines (a blank line shifts the title/body split and makes the table unparseable)');
  }
}

/** Throws loudly at host-construction time rather than silently querying an empty space/endpoint. */
function assertConfigured(): void {
  if (!RPC_URL) {
    throw new Error('VITE_CHIPS_RPC is not set — refusing to run with no RPC endpoint configured.');
  }
  if (!CHIPS_SPACE) {
    throw new Error('VITE_CHIPS_SPACE is not set — refusing to run with no space id configured.');
  }
}

async function submitMinedReply(
  rpc: SwimchainRpc, id: Identity, parentId: string, body: string, onProgress?: ProgressCallback
): Promise<string> {
  // Reef passes the RAW body to createChallenge for a reply, not
  // `parentId:body` — matches contentHashForReply(body) = sha256(body).
  const challenge = await createChallenge(
    ActionType.Reply,
    new TextEncoder().encode(body),
    hexToBytes(id.publicKeyHex),
    getDifficulty(ActionType.Reply, POW_TESTNET_PARAMS)
  );
  const solution = await minePow(challenge, getConfig(POW_TESTNET_PARAMS), onProgress);
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
  assertConfigured();

  return {
    rpc,
    spaceId: CHIPS_SPACE,

    sponsor: (id) =>
      ensureSponsored(rpc, id, {
        preferredSponsorHex: GAME_SPONSOR,
        strictPreferred: true,
        requiredSpaceId: CHIPS_SPACE,
      }),

    async createTable(id, name, onProgress) {
      assertValidTableName(name);
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
      const solution = await minePow(challenge, getConfig(POW_TESTNET_PARAMS), onProgress);
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

    submitMove: (id, tableId, body, onProgress) => submitMinedReply(rpc, id, tableId, body, onProgress),

    async loadTable(tableId) {
      // get_replies takes the content id positionally, not as a params
      // object (SwimchainRpc.getReplies, swimchain-react/src/lib/rpc.ts:394-
      // 409). The TS wrapper has no `depthLimit` parameter, but the
      // underlying RPC does (src/rpc/types.rs:653-655) and DEFAULTS TO 5
      // server-side (src/rpc/methods.rs:9363) — so this returns the whole
      // nested subtree under the table post, not just direct replies. The
      // fold's only author guard is `author_id === owner`; a nested reply
      // BY THE OWNER (answering a stranger's comment, or a deliberate replay
      // planted deeper) would otherwise fold as a real move. Filter to
      // direct children of the table post explicitly.
      //
      // The node defaults `limit` to 1000; a long-lived table's move history
      // outgrows that within days (the same "board wipe" truncation reef
      // hit — see reefEngine.ts:1013's comment), so pass a high explicit
      // limit regardless of depth.
      const res = await rpc.getReplies(tableId, { limit: 100_000 });
      return res.replies
        .filter((r) => r.parent_id === tableId)
        .map((r) => ({
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

      // list_space_posts bech32m-encodes author_id; get_replies (used by
      // loadTable/verifyReplies/foldChips) hex-encodes it. Normalize to hex
      // HERE, once, at the seam — see TableSummary.authorId's doc comment
      // for why leaving this mismatch to the caller is the actual bug this
      // review flagged.
      await initWasm();

      const out: TableSummary[] = [];
      for (const c of res.items) {
        try {
          const header = JSON.parse(c.body ?? '{}');
          if (header?.kind === 'chips-table') {
            const authorId = bytesToHex(decodeAddress(c.author_id));
            out.push({ tableId: c.content_id, authorId, name: String(header.name ?? 'Untitled') });
          }
        } catch { /* not a table post, or an undecodable author_id — skip */ }
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
