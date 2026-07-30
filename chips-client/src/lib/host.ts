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
import { bankBody, buyBody, bankBatchBody, dipBody } from './chipsBody';
import type { ChipsReply } from './chipsEngine';
import { chunkReport } from './reportChunk';

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
 * Where the ⚑ report goes to DIE ON THE RECORD rather than in a clipboard.
 *
 * The report button's own comment claimed this already worked. It did not:
 * nothing read this variable and no code posted anywhere, so every report a
 * player ever filed existed only as long as they did not copy anything else.
 * The operator hit exactly that — pressed the flag mid-bug, and the state at
 * the moment of the bug was one Ctrl-C away from gone.
 *
 * OPTIONAL by design. Unset (a local dev build, a fork) means clipboard-only,
 * which is the old behaviour and still works; it must never stop the game
 * from running.
 */
const DEBUG_SPACE = (import.meta.env?.VITE_CHIPS_DEBUG_SPACE as string | undefined)?.trim() || '';
/**
 * THE BOTTOM OF THE BOWL — the space the secret wall lives in.
 *
 * Minted on mainnet 2026-07-29 by the chips util identity. Spaces and posts are
 * ordinary network use; no special permission is involved, which is why this
 * could simply be created rather than requested.
 *
 * Readable by anyone who knows the id, which is exactly WHY the gate is
 * client-side and total: the moment is shown only on coming up through the
 * bottom, never from a menu and never twice.
 */
const BOTTOM_SPACE = (import.meta.env?.VITE_CHIPS_BOTTOM_SPACE as string | undefined)?.trim() || '';

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
   * `get_replies` returns it as hex (src/rpc/methods.rs:9446). The owner
   * filters in `foldChips` (chipsEngine.ts) and `verifyReplies`
   * (chipsVerify.ts) both compare `author_id` by exact string equality
   * against `ChipsHeader.owner` / the `owner` parameter — so a
   * `ChipsHeader.owner` built from this field MUST already be hex, or it
   * silently matches zero replies (every table
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
  /**
   * File a ⚑ report to the debug space, durably. Resolves to the content id,
   * or to null when no debug space is configured — NOT a throw, because a
   * missing debug space is a valid deployment and the caller's clipboard copy
   * has already succeeded by then.
   */
  reportBug(id: Identity, text: string, onProgress?: ProgressCallback): Promise<string | null>;
  /** Everyone who has come up through the bottom, newest first. */
  readTheBottom(): Promise<{ body: string; at: number }[]>;
  /** Leave your mark. Resolves to the content id, or null if unconfigured. */
  signTheBottom(id: Identity, body: string, onProgress?: ProgressCallback): Promise<string | null>;
}

/** Whether the wall exists to be read or signed at all. */
export const HAS_THE_BOTTOM = BOTTOM_SPACE !== '';

/** Whether reports can be filed at all — lets the UI promise only what it can do. */
export const CAN_FILE_REPORTS = DEBUG_SPACE !== '';

/**
 * How much report goes in ONE post.
 *
 * This used to be a TRUNCATION limit, and that was the wrong call. On
 * 2026-07-29 a report arrived clipped at exactly this many bytes, mid-journal,
 * and the surviving head was useful only by luck — `regressions` happens to be
 * emitted near the top. The journal and the dip ring, the two parts that say
 * what the client actually DID, were the parts thrown away. Operator: "we want
 * the whole report for sure."
 *
 * So a long report is now SPLIT across as many posts as it needs. Diagnostics
 * you have to be lucky to read are not diagnostics.
 */
const REPORT_CHUNK = 12_000;

// Re-exported for callers that only import the seam; the implementations
// themselves live in chipsBody.ts, dependency-free (no RPC/PoW/WASM), so
// their round-trip test (chipsBody.test.ts) doesn't drag this whole module's
// import chain along.
//
// `bankBatchBody` joins the re-export list here now that the emitter half of
// batching (Task 5) needs it reachable from the seam: App.tsx builds every
// bank body — the synthetic pending one AND the one actually submitted —
// through this module, never by importing chipsBody.ts directly.
export { bankBody, buyBody, bankBatchBody, dipBody };

/**
 * Mine an action PoW off the main thread. A difficulty ~8-10 Argon2id search
 * is several seconds of CPU; on the main thread it freezes the tab (and any
 * progress UI can't paint) — reef hit exactly this and fixed it with an
 * identical worker (reef-client/src/lib/pow.worker.ts / reefEngine.ts:66-104).
 * Falls back to on-thread mining only if Workers don't exist at all.
 *
 * ONE worker for the whole session, not one per submit. The old
 * spawn-terminate-per-call pattern instantiated a fresh 8 MiB Argon2id WASM
 * instance for EVERY chain write, alongside the instances the fryer workers
 * hold permanently — and under memory pressure that fresh instantiation is
 * exactly what failed, live and often: "WebAssembly.instantiate(): Out of
 * memory: Cannot allocate Wasm memory for new instance" (operator report,
 * 2026-07-27). A reused worker allocates once, stays warm, and every later
 * submit costs zero new WASM memory.
 *
 * Jobs are SERIALIZED through `powQueue`: the worker's mining loop starves
 * its own message queue while it runs (the hash-wasm microtask fact —
 * fryerLogic.ts's grindLoop doc has the measurement), so two concurrent
 * jobs on one worker would interleave wrongly — and the app's callers (the
 * single-flight sender, onboarding's one-at-a-time steps) never
 * legitimately overlap anyway. Any failure — worker-level `onerror`, or an
 * in-worker `error` message (which includes the WASM instantiation failing
 * INSIDE the worker) — tears the worker down and nulls the slot, so the
 * caller's existing retry/backoff starts over with a fresh worker instead
 * of a poisoned one.
 */
let powWorker: Worker | null = null;
let powQueue: Promise<unknown> = Promise.resolve();
let powSpawns = 0;
let powJobs = 0;
// Spawn/job counters — the reuse is otherwise unobservable from outside this
// module, and an unverifiable fix regresses silently.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__powStats = () => ({ spawns: powSpawns, jobs: powJobs });
}

function minePow(
  challenge: PoWChallenge,
  config: PoWConfig,
  onProgress?: ProgressCallback
): Promise<PoWSolution> {
  const job = powQueue.then(() => new Promise<PoWSolution>((resolve, reject) => {
    if (!powWorker) {
      try {
        powWorker = new Worker(new URL('./actionPow.worker.ts', import.meta.url), { type: 'module' });
        powSpawns++;
      } catch {
        // No Worker support at all — the one case the on-thread fallback is for.
        computePow(challenge, config, onProgress).then(resolve, reject);
        return;
      }
    }
    const w = powWorker;
    const fail = (message: string): void => {
      w.terminate();
      if (powWorker === w) powWorker = null;
      reject(new Error(message));
    };
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.type === 'progress') {
        onProgress?.(m.attempts, m.elapsedMs, m.hashRate);
      } else if (m?.type === 'solution') {
        powJobs++;
        resolve(m.solution as PoWSolution);   // the worker stays warm for the next job
      } else if (m?.type === 'error') {
        fail(m.message);
      }
    };
    w.onerror = (err) => fail(err.message || 'pow worker error');
    w.postMessage({ challenge, config });
  }));
  // The queue must survive a failed job — chain on settled, not on success.
  powQueue = job.catch(() => undefined);
  return job;
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

/**
 * The JSON header out of a post's stored text.
 *
 * `list_space_posts` returns the post EXACTLY as the node stored it, which for
 * a post is `${title}\n\n${body}` — the same string createTable hashes for PoW.
 * It also returns the split-out `title` alongside, and it is easy to read that
 * and assume `body` is likewise split; it is not.
 *
 * `JSON.parse` on the raw field therefore throws on the leading title, and
 * `listTables`'s catch swallows it — so EVERY table is silently skipped and
 * `listTables()` returns []. Verified against mainnet on 2026-07-25: the
 * boards stayed permanently empty (which also means `requestContent` never
 * runs, so nothing hosts anybody's table), and, far worse, App's
 * "do I already have a table?" lookup found nothing on every single load and
 * re-created one. That is only survivable because an identical post dedupes to
 * the same content_id — rename yourself once and you fork a fresh table and
 * lose every crumb and all your lifetime crunch.
 *
 * Tolerates both shapes: if there is no blank line, the field already is the
 * body, and this returns it unchanged.
 */
function headerJson(stored: string): string {
  const split = stored.indexOf('\n\n');
  return split >= 0 ? stored.slice(split + 2) : stored;
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
      // `owner` is here to make the table's CONTENT author-dependent, and for
      // no other reason — nothing downstream trusts it as an authority.
      //
      // A post's content_id is sha256(`${title}\n\n${body}`) and nothing else
      // (swimchain-react/src/lib/signAction.ts:30-32) — the author is NOT in
      // the preimage. Without an owner field, two cooks who pick the same name
      // mint the byte-identical post and therefore THE SAME TABLE. `defaultName`
      // draws from 8x6x900 = 43,200 combinations, so that starts happening in
      // the low hundreds of players by birthday collision alone, and instantly
      // for any two people who type the same name. The second player's
      // `tables.find(t => t.authorId === me.publicKeyHex)` never matches, so
      // they burn a full post Argon2id grind on EVERY page load, and the boards
      // credit their table to the first author, so their chips never appear.
      //
      // Binding the pubkey into the body makes the content_id author-dependent
      // and the collision impossible. listTables still derives `authorId` from
      // the authenticated `author_id` the node returns, never from this field —
      // see the spoof check there.
      const body = JSON.stringify({ v: 1, kind: 'chips-table', name, owner: id.publicKeyHex });
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

    async readTheBottom() {
      if (!BOTTOM_SPACE) return [];
      // Bounded: the wall is a moment, and `wall()` collapses and caps it anyway.
      // POSITIONAL, not an object — the same trap documented at listTables
      // below: `rpc.listSpacePosts(spaceId, { limit })`.
      const res = await rpc.listSpacePosts(BOTTOM_SPACE, { limit: 500 });
      // `headerJson` strips the title-and-blank-line prefix a post is stored
      // with; without it every mark would arrive still carrying "was here" and
      // parse as nothing.
      return (res.items ?? []).map((p) => ({
        body: headerJson(p.body ?? ''),
        at: p.created_at ?? 0,
      }));
    },

    async signTheBottom(id, body, onProgress) {
      if (!BOTTOM_SPACE) return null;
      // The mark rides in the BODY; the title is fixed so the wall reads as one
      // thing in any feed that happens to list it.
      const title = 'was here';
      // Same preimage contract as createTable: the node reconstructs
      // `${title}\n\n${body}` to verify PoW, so hashing anything else fails.
      const content = [title, body].join('\n\n');
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
        spaceId: BOTTOM_SPACE, title, body, authorId: id.publicKeyHex,
        powNonce: Number(p.pow_nonce), powDifficulty: p.pow_difficulty,
        powNonceSpace: p.pow_nonce_space, powHash: p.pow_hash,
        signature, timestamp: p.timestamp,
      });
      return res.content_id;
    },

    async reportBug(id, text, onProgress) {
      if (!DEBUG_SPACE) return null;   // clipboard-only deployment; not an error

      /** One post. Mines its own PoW — a report is per-part, not per-report. */
      const postOne = async (title: string, body: string): Promise<string> => {
        // Same preimage contract as createTable: the node reconstructs
        // `${title}\n\n${body}` to verify PoW, so hashing anything else fails
        // verification. See the long note in createTable.
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
          spaceId: DEBUG_SPACE, title, body, authorId: id.publicKeyHex,
          powNonce: Number(p.pow_nonce), powDifficulty: p.pow_difficulty,
          powNonceSpace: p.pow_nonce_space, powHash: p.pow_hash,
          signature, timestamp: p.timestamp,
        });
        return res.content_id;
      };

      // THE WHOLE REPORT, however many posts that takes.
      const parts = chunkReport(text, REPORT_CHUNK);

      // The title carries the author prefix so reports are greppable in a feed
      // without opening each one. No newlines: the node splits title from body
      // on the FIRST blank line, so a newline here would corrupt both.
      const who = id.publicKeyHex.slice(0, 8);
      if (parts.length === 1) return postOne(`chips report — ${who}`, parts[0]);

      // A multi-part report needs its parts identifiable as ONE report in a
      // feed that may hold several. `text.length` is a cheap discriminator: two
      // reports from the same player differing in nothing else would have to be
      // byte-identical in length to collide, and then they are interchangeable.
      const stamp = `${who}-${text.length}`;
      let first: string | null = null;
      for (let n = 0; n < parts.length; n++) {
        // Sequential, not parallel: each part mines a real PoW, and firing
        // several miners at once on a phone is how you get a browser to kill
        // the tab holding the report you are trying to file.
        const cid = await postOne(`chips report — ${stamp} (${n + 1}/${parts.length})`, parts[n]);
        if (first === null) first = cid;
      }
      return first;
    },

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
      // list_space_posts can return the SAME post more than once (observed
      // three identical rows for one content_id against mainnet on
      // 2026-07-25). Un-deduplicated, that table appears three times on the
      // boards and is requestContent'd three times per pass.
      const seen = new Set<string>();
      for (const c of res.items) {
        if (seen.has(c.content_id)) continue;
        seen.add(c.content_id);
        try {
          const header = JSON.parse(headerJson(c.body ?? ''));
          if (header?.kind !== 'chips-table') continue;

          // AUTHORITY IS THE NODE'S author_id, NOT the header. The header's
          // `owner` exists only to make the content author-dependent (see
          // createTable); trusting it would hand an attacker the table itself.
          // Anyone can post a body carrying somebody else's pubkey — and App's
          // reclaim lookup is `tables.find(t => t.authorId === me.publicKeyHex)`,
          // so a forged header would make the victim adopt the attacker's table
          // on their next load and abandon their own crumbs and lifetime crunch.
          const authorId = bytesToHex(decodeAddress(c.author_id));

          // Both shapes are tolerated: tables minted before `owner` existed
          // (there are already some on mainnet) carry no owner and are listed
          // on the strength of author_id alone. A table that DOES declare one
          // and disagrees with its own author is a forgery, and is dropped.
          const declared = typeof header.owner === 'string' ? header.owner.toLowerCase() : null;
          if (declared !== null && declared !== authorId.toLowerCase()) continue;

          out.push({ tableId: c.content_id, authorId, name: String(header.name ?? 'Untitled') });
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
