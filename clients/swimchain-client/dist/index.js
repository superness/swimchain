"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ActionType: () => ActionType,
  ContentType: () => ContentType,
  DIFFICULTY: () => DIFFICULTY,
  PRODUCTION_CONFIG: () => PRODUCTION_CONFIG,
  REACTION_CODES: () => REACTION_CODES,
  REACTION_EMOJIS: () => REACTION_EMOJIS,
  SwimchainClient: () => SwimchainClient,
  SwimchainRpc: () => SwimchainRpc,
  TESTNET_CONFIG: () => TESTNET_CONFIG,
  TESTNET_DIFFICULTY: () => TESTNET_DIFFICULTY,
  TEST_CONFIG: () => TEST_CONFIG,
  bytesToHex: () => bytesToHex,
  computePow: () => computePow,
  createChallenge: () => createChallenge,
  createClient: () => createClient,
  createMainnetClient: () => createMainnetClient,
  createTestnetClient: () => createTestnetClient,
  estimateMiningTime: () => estimateMiningTime,
  formatTimestamp: () => formatTimestamp,
  getDifficulty: () => getDifficulty,
  getPoWConfig: () => getPoWConfig,
  hexToBytes: () => hexToBytes,
  leadingZeros: () => leadingZeros,
  nowSeconds: () => nowSeconds,
  randomBytes: () => randomBytes,
  serializeChallenge: () => serializeChallenge,
  sha256: () => sha256,
  sha256Hex: () => sha256Hex,
  sha256String: () => sha256String,
  sleep: () => sleep,
  solutionToRpcParams: () => solutionToRpcParams,
  swimchain: () => swimchain,
  swimchainMainnet: () => swimchainMainnet,
  swimchainTestnet: () => swimchainTestnet,
  timeAgo: () => timeAgo,
  truncate: () => truncate,
  truncateAddress: () => truncateAddress
});
module.exports = __toCommonJS(index_exports);

// src/types.ts
var ContentType = /* @__PURE__ */ ((ContentType2) => {
  ContentType2["Post"] = "Post";
  ContentType2["Reply"] = "Reply";
  ContentType2["Quote"] = "Quote";
  return ContentType2;
})(ContentType || {});
var REACTION_CODES = {
  heart: 1,
  thumbs_up: 2,
  thumbs_down: 3,
  laugh: 4,
  thinking: 5,
  mind_blown: 6,
  fire: 7,
  swimming: 8
};
var REACTION_EMOJIS = {
  heart: "\u2764\uFE0F",
  thumbs_up: "\u{1F44D}",
  thumbs_down: "\u{1F44E}",
  laugh: "\u{1F602}",
  thinking: "\u{1F914}",
  mind_blown: "\u{1F92F}",
  fire: "\u{1F525}",
  swimming: "\u{1F3CA}"
};
var ActionType = /* @__PURE__ */ ((ActionType2) => {
  ActionType2[ActionType2["SpaceCreation"] = 1] = "SpaceCreation";
  ActionType2[ActionType2["Post"] = 2] = "Post";
  ActionType2[ActionType2["Reply"] = 3] = "Reply";
  ActionType2[ActionType2["Engage"] = 4] = "Engage";
  ActionType2[ActionType2["IdentityUpdate"] = 5] = "IdentityUpdate";
  return ActionType2;
})(ActionType || {});

// src/utils.ts
var import_hash_wasm = require("hash-wasm");
function hexToBytes(hex) {
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(data) {
  const hasher = await (0, import_hash_wasm.createSHA256)();
  hasher.update(data);
  return hasher.digest("binary");
}
async function sha256String(str) {
  return sha256(new TextEncoder().encode(str));
}
async function sha256Hex(data) {
  return bytesToHex(await sha256(data));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function nowSeconds() {
  return Math.floor(Date.now() / 1e3);
}
function formatTimestamp(ts) {
  return new Date(ts * 1e3).toISOString();
}
function timeAgo(ts) {
  const seconds = nowSeconds() - ts;
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
function truncateAddress(address, startLen = 8, endLen = 6) {
  if (address.length <= startLen + endLen + 3) return address;
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}
function randomBytes(length) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    const nodeCrypto = require("crypto");
    const randomBuffer = nodeCrypto.randomBytes(length);
    bytes.set(new Uint8Array(randomBuffer));
  }
  return bytes;
}

// src/pow.ts
var import_hash_wasm2 = require("hash-wasm");
var DIFFICULTY = {
  [1 /* SpaceCreation */]: 22,
  [2 /* Post */]: 20,
  [3 /* Reply */]: 18,
  [4 /* Engage */]: 16,
  [5 /* IdentityUpdate */]: 20
};
var TESTNET_DIFFICULTY = {
  [1 /* SpaceCreation */]: 12,
  [2 /* Post */]: 10,
  [3 /* Reply */]: 8,
  [4 /* Engage */]: 6,
  [5 /* IdentityUpdate */]: 10
};
var PRODUCTION_CONFIG = {
  memoryKib: 65536,
  iterations: 3,
  parallelism: 4
};
var TESTNET_CONFIG = {
  memoryKib: 8192,
  iterations: 1,
  parallelism: 2
};
var TEST_CONFIG = {
  memoryKib: 1024,
  iterations: 1,
  parallelism: 1
};
async function createChallenge(actionType, content, authorPubkey, difficulty) {
  const contentHash = await sha256(content);
  const timestamp = Math.floor(Date.now() / 1e3);
  const nonceSpace = randomBytes(8);
  return {
    actionType,
    contentHash,
    authorId: authorPubkey,
    timestamp,
    difficulty,
    nonceSpace
  };
}
function serializeChallenge(challenge) {
  const buf = new Uint8Array(82);
  buf[0] = challenge.actionType;
  buf.set(challenge.contentHash, 1);
  buf.set(challenge.authorId, 33);
  const view = new DataView(buf.buffer);
  const ts = BigInt(challenge.timestamp);
  view.setBigUint64(65, ts, false);
  buf[73] = challenge.difficulty;
  buf.set(challenge.nonceSpace, 74);
  return buf;
}
function leadingZeros(hash) {
  let zeros = 0;
  for (const byte of hash) {
    if (byte === 0) {
      zeros += 8;
    } else {
      zeros += Math.clz32(byte) - 24;
      break;
    }
  }
  return zeros;
}
async function computeArgon2id(input, salt, config) {
  const hash = await (0, import_hash_wasm2.argon2id)({
    password: input,
    salt,
    parallelism: config.parallelism,
    memorySize: config.memoryKib,
    iterations: config.iterations,
    hashLength: 32,
    outputType: "binary"
  });
  return new Uint8Array(hash);
}
async function computePow(challenge, config, onProgress, isCancelled) {
  const serialized = serializeChallenge(challenge);
  let nonce = 0n;
  const startTime = Date.now();
  let attempts = 0;
  const input = new Uint8Array(90);
  input.set(serialized, 0);
  const view = new DataView(input.buffer);
  while (true) {
    if (isCancelled?.()) {
      throw new Error("Mining cancelled");
    }
    view.setBigUint64(82, nonce, false);
    const hash = await computeArgon2id(input, challenge.nonceSpace, config);
    attempts++;
    if (leadingZeros(hash) >= challenge.difficulty) {
      return {
        challenge,
        nonce,
        hash
      };
    }
    if (attempts % 10 === 0) {
      const elapsedMs = Date.now() - startTime;
      const hashRate = attempts / elapsedMs * 1e3;
      onProgress?.(attempts, elapsedMs, hashRate);
    }
    nonce++;
  }
}
function solutionToRpcParams(solution) {
  return {
    powNonce: Number(solution.nonce),
    powDifficulty: solution.challenge.difficulty,
    powNonceSpace: bytesToHex(solution.challenge.nonceSpace),
    powHash: bytesToHex(solution.hash),
    timestamp: solution.challenge.timestamp
  };
}
function getDifficulty(actionType, isTestnet = true) {
  return isTestnet ? TESTNET_DIFFICULTY[actionType] : DIFFICULTY[actionType];
}
function getPoWConfig(isTestnet = true) {
  return isTestnet ? TESTNET_CONFIG : PRODUCTION_CONFIG;
}
function estimateMiningTime(difficulty, hashRate = 1) {
  const expectedAttempts = Math.pow(2, difficulty);
  return expectedAttempts / hashRate;
}

// src/rpc.ts
function toNodeInfo(rpc) {
  return {
    version: rpc.version,
    network: rpc.network,
    uptimeSeconds: rpc.uptime_seconds,
    peerCount: rpc.peer_count,
    blockHeight: rpc.block_height,
    nodeId: rpc.node_id,
    rpcPort: rpc.rpc_port,
    p2pPort: rpc.p2p_port
  };
}
function toSyncStatus(rpc) {
  return {
    state: rpc.state,
    chainPercent: rpc.chain_percent,
    peerCount: rpc.peer_count,
    peersReceiving: rpc.peers_receiving,
    peersSending: rpc.peers_sending,
    storageMB: rpc.storage_mb,
    storageTargetMB: rpc.storage_target_mb,
    lastBlockTime: rpc.last_block_time
  };
}
function toContentItem(rpc) {
  return {
    contentId: rpc.content_id,
    contentType: rpc.content_type,
    authorId: rpc.author_id,
    spaceId: rpc.space_id,
    parentId: rpc.parent_id,
    createdAt: rpc.created_at,
    lastEngagement: rpc.last_engagement,
    title: rpc.title,
    body: rpc.body,
    engagementCount: rpc.engagement_count,
    decayState: rpc.decay_state,
    secondsUntilDecay: rpc.seconds_until_decay
  };
}
function toSpace(rpc) {
  return {
    id: rpc.space_id,
    name: rpc.name || rpc.space_id,
    postCount: rpc.post_count,
    lastActivity: rpc.last_activity ?? void 0
  };
}
function toIdentityLevel(rpc) {
  return {
    identityId: rpc.identity_id,
    level: rpc.level,
    levelName: rpc.level_name,
    isGenesis: rpc.is_genesis,
    streakDays: rpc.streak_days,
    bandwidthServed: rpc.bandwidth_served,
    contributionScore: rpc.contribution_score
  };
}
function toPoolInfo(rpc) {
  return {
    poolId: rpc.pool_id,
    contentId: rpc.content_id,
    totalPow: rpc.total_pow,
    requiredPow: rpc.required_pow,
    status: rpc.status,
    contributorCount: rpc.contributor_count,
    expiresAt: rpc.expires_at
  };
}
function toPeerInfo(rpc) {
  return {
    peerId: rpc.peer_id,
    address: rpc.address,
    direction: rpc.direction
  };
}
var SwimchainRpc = class {
  constructor(config) {
    this.signer = null;
    this.publicKeyHex = null;
    this.requestId = 1;
    this.connected = false;
    this.nodeInfo = null;
    this.endpoint = config.endpoint;
    this.auth = config.auth;
    this.timeout = config.timeout ?? 3e4;
  }
  /**
   * Set signer for signature authentication
   */
  setSigner(signer, publicKeyHex) {
    this.signer = signer;
    this.publicKeyHex = publicKeyHex;
  }
  /**
   * Clear signer
   */
  clearSigner() {
    this.signer = null;
    this.publicKeyHex = null;
  }
  /**
   * Get current public key (hex)
   */
  getPublicKey() {
    return this.publicKeyHex;
  }
  /**
   * Make a raw RPC call
   */
  async call(method, params = {}) {
    const request = {
      jsonrpc: "2.0",
      method,
      params,
      id: this.requestId++
    };
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.signer && this.publicKeyHex) {
      const timestamp = Math.floor(Date.now() / 1e3).toString();
      const paramsJson = JSON.stringify(params);
      const paramsHash = await sha256String(paramsJson);
      const paramsHashHex = bytesToHex(paramsHash);
      const message = `swimchain-rpc:${method}:${paramsHashHex}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signature = await this.signer.sign(messageBytes);
      const signatureHex = bytesToHex(signature);
      headers["X-CS-Identity"] = this.publicKeyHex;
      headers["X-CS-Timestamp"] = timestamp;
      headers["X-CS-Signature"] = signatureHex;
    } else if (this.auth) {
      const credentials = `${this.auth.username}:${this.auth.password}`;
      headers["Authorization"] = `Basic ${Buffer.from(credentials).toString("base64")}`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const rpcResponse = await response.json();
      if (rpcResponse.error) {
        throw new Error(`RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
      }
      return rpcResponse.result;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  /**
   * Connect and verify node is reachable
   */
  async connect() {
    try {
      const info = await this.call("get_info");
      this.nodeInfo = toNodeInfo(info);
      this.connected = true;
      return true;
    } catch (error) {
      this.connected = false;
      this.nodeInfo = null;
      return false;
    }
  }
  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }
  /**
   * Get cached node info
   */
  getNodeInfo() {
    return this.nodeInfo;
  }
  // ===========================================================================
  // Node Status
  // ===========================================================================
  async getInfo() {
    const info = await this.call("get_info");
    return toNodeInfo(info);
  }
  async getSyncStatus() {
    const status = await this.call("get_sync_status");
    return toSyncStatus(status);
  }
  async getPeers() {
    const peers = await this.call("get_peers");
    return peers.map(toPeerInfo);
  }
  // ===========================================================================
  // Spaces
  // ===========================================================================
  async listSpaces(options) {
    const result = await this.call("list_spaces", {
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0
    });
    return {
      spaces: result.spaces.map(toSpace),
      total: result.total
    };
  }
  // ===========================================================================
  // Content
  // ===========================================================================
  async getContent(contentId) {
    const item = await this.call("get_content", { content_id: contentId });
    return toContentItem(item);
  }
  async listSpaceContent(spaceId, options) {
    const result = await this.call("list_space_content", {
      space_id: spaceId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      sort: options?.sort ?? "recent"
    });
    return {
      items: result.items.map(toContentItem),
      total: result.total
    };
  }
  async listSpacePosts(spaceId, options) {
    const result = await this.call("list_space_posts", {
      space_id: spaceId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      sort: "recent"
    });
    return {
      items: result.items.map(toContentItem),
      total: result.total
    };
  }
  async requestContent(contentId) {
    return this.call("request_content", { content_id: contentId });
  }
  // ===========================================================================
  // Replies
  // ===========================================================================
  async getReplies(contentId) {
    const result = await this.call("get_replies", { content_id: contentId });
    return {
      parentId: result.parent_id,
      replies: result.replies.map((r) => ({
        contentId: r.content_id,
        authorId: r.author_id,
        body: r.body,
        parentId: r.parent_id,
        createdAt: r.created_at,
        lastEngagement: r.last_engagement
      })),
      totalCount: result.total_count
    };
  }
  // ===========================================================================
  // Reactions
  // ===========================================================================
  async getReactions(contentId) {
    const result = await this.call("get_reactions", { content_id: contentId });
    return {
      contentId: result.content_id,
      reactions: result.reactions.map((r) => ({
        emoji: r.emoji,
        reactionType: r.reaction_type,
        count: r.count
      })),
      total: result.total
    };
  }
  // ===========================================================================
  // Identity
  // ===========================================================================
  async getIdentityLevel(identityId) {
    const level = await this.call("get_identity_level", { identity_id: identityId });
    return toIdentityLevel(level);
  }
  // ===========================================================================
  // Pools
  // ===========================================================================
  async getPoolInfo(poolId) {
    const pool = await this.call("get_pool_info", { pool_id: poolId });
    return toPoolInfo(pool);
  }
  async getPoolForContent(contentId) {
    const result = await this.call("get_pool_for_content", { content_id: contentId });
    return {
      hasPool: result.has_pool,
      poolId: result.pool_id,
      totalPow: result.total_pow,
      requiredPow: result.required_pow,
      status: result.status,
      contributorCount: result.contributor_count,
      expiresAt: result.expires_at
    };
  }
  // ===========================================================================
  // Content Submission
  // ===========================================================================
  async submitPost(params) {
    const result = await this.call("submit_post", {
      space_id: params.spaceId,
      title: params.title,
      body: params.body,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp
    });
    return {
      contentId: result.content_id,
      broadcast: result.broadcast,
      recipients: result.recipients
    };
  }
  async submitReply(params) {
    const result = await this.call("submit_reply", {
      parent_id: params.parentId,
      body: params.body,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp
    });
    return {
      contentId: result.content_id,
      message: result.message
    };
  }
  async submitEngagement(params) {
    const result = await this.call("submit_engagement", {
      content_id: params.contentId,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
      emoji: params.emoji
    });
    return {
      engaged: result.engaged,
      reactionStored: result.reaction_stored,
      contentId: result.content_id,
      emoji: result.emoji
    };
  }
  async createSpace(params) {
    const result = await this.call("create_space", {
      name: params.name,
      creator_id: params.creatorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp
    });
    return {
      spaceId: result.space_id,
      name: result.name,
      success: result.success
    };
  }
};
function createTestnetClient(port = 19736) {
  return new SwimchainRpc({
    endpoint: `http://127.0.0.1:${port}`,
    timeout: 3e4
  });
}
function createMainnetClient(port = 9736) {
  return new SwimchainRpc({
    endpoint: `http://127.0.0.1:${port}`,
    timeout: 3e4
  });
}
function createClient(endpoint, config) {
  return new SwimchainRpc({
    endpoint,
    timeout: config?.timeout ?? 3e4,
    auth: config?.auth
  });
}

// src/client.ts
var SwimchainClient = class {
  constructor(options = {}) {
    this.signer = null;
    this.publicKey = null;
    this.publicKeyHex = null;
    this.isTestnet = options.testnet ?? true;
    if (options.endpoint) {
      this.rpc = createClient(options.endpoint, { timeout: options.timeout });
    } else {
      const port = options.port ?? (this.isTestnet ? 19736 : 9736);
      this.rpc = this.isTestnet ? createTestnetClient(port) : createMainnetClient(port);
    }
  }
  /**
   * Set identity for authenticated operations
   *
   * Requires @noble/ed25519 for signing. If not available, use setCustomSigner().
   */
  async setIdentity(options) {
    this.publicKeyHex = options.publicKey;
    this.publicKey = hexToBytes(options.publicKey);
    try {
      const ed25519 = await import("@noble/ed25519");
      const seed = hexToBytes(options.seed);
      this.signer = {
        sign: (message) => {
          return ed25519.sign(message, seed);
        }
      };
      this.rpc.setSigner(this.signer, options.publicKey);
    } catch (e) {
      console.warn("Ed25519 not available, use setCustomSigner() instead");
    }
  }
  /**
   * Set a custom signer (for WASM or other implementations)
   */
  setCustomSigner(signer, publicKeyHex) {
    this.signer = signer;
    this.publicKeyHex = publicKeyHex;
    this.publicKey = hexToBytes(publicKeyHex);
    this.rpc.setSigner(signer, publicKeyHex);
  }
  /**
   * Connect to the node
   */
  async connect() {
    return this.rpc.connect();
  }
  /**
   * Check connection status
   */
  isConnected() {
    return this.rpc.isConnected();
  }
  // ===========================================================================
  // Node Status
  // ===========================================================================
  async getInfo() {
    return this.rpc.getInfo();
  }
  async getSyncStatus() {
    return this.rpc.getSyncStatus();
  }
  async getPeers() {
    return this.rpc.getPeers();
  }
  // ===========================================================================
  // Spaces
  // ===========================================================================
  async listSpaces(options) {
    return this.rpc.listSpaces(options);
  }
  // ===========================================================================
  // Content Retrieval
  // ===========================================================================
  async getContent(contentId) {
    return this.rpc.getContent(contentId);
  }
  async getSpaceContent(spaceId, options) {
    return this.rpc.listSpaceContent(spaceId, options);
  }
  async getSpacePosts(spaceId, options) {
    return this.rpc.listSpacePosts(spaceId, options);
  }
  async getReplies(contentId) {
    return this.rpc.getReplies(contentId);
  }
  async getReactions(contentId) {
    return this.rpc.getReactions(contentId);
  }
  async requestContent(contentId) {
    return this.rpc.requestContent(contentId);
  }
  // ===========================================================================
  // Content Creation (with PoW)
  // ===========================================================================
  /**
   * Create a new post (mines PoW automatically)
   */
  async createPost(spaceId, title, body, options) {
    if (!this.publicKey || !this.signer || !this.publicKeyHex) {
      throw new Error("Identity not set");
    }
    const content = new TextEncoder().encode(JSON.stringify({ spaceId, title, body }));
    const difficulty = getDifficulty(2 /* Post */, this.isTestnet);
    const challenge = await createChallenge(2 /* Post */, content, this.publicKey, difficulty);
    const solution = await computePow(
      challenge,
      getPoWConfig(this.isTestnet),
      options?.onProgress,
      options?.isCancelled
    );
    const signatureBytes = await this.signer.sign(content);
    const signature = bytesToHex(signatureBytes);
    const powParams = solutionToRpcParams(solution);
    return this.rpc.submitPost({
      spaceId,
      title,
      body,
      authorId: this.publicKeyHex,
      signature,
      ...powParams
    });
  }
  /**
   * Create a reply (mines PoW automatically)
   */
  async createReply(parentId, body, options) {
    if (!this.publicKey || !this.signer || !this.publicKeyHex) {
      throw new Error("Identity not set");
    }
    const content = new TextEncoder().encode(JSON.stringify({ parentId, body }));
    const difficulty = getDifficulty(3 /* Reply */, this.isTestnet);
    const challenge = await createChallenge(3 /* Reply */, content, this.publicKey, difficulty);
    const solution = await computePow(
      challenge,
      getPoWConfig(this.isTestnet),
      options?.onProgress,
      options?.isCancelled
    );
    const signatureBytes = await this.signer.sign(content);
    const signature = bytesToHex(signatureBytes);
    const powParams = solutionToRpcParams(solution);
    return this.rpc.submitReply({
      parentId,
      body,
      authorId: this.publicKeyHex,
      signature,
      ...powParams
    });
  }
  /**
   * Engage with content (mines PoW automatically)
   */
  async engage(contentId, emoji, options) {
    if (!this.publicKey || !this.signer || !this.publicKeyHex) {
      throw new Error("Identity not set");
    }
    const content = new TextEncoder().encode(JSON.stringify({ contentId, emoji }));
    const difficulty = getDifficulty(4 /* Engage */, this.isTestnet);
    const challenge = await createChallenge(4 /* Engage */, content, this.publicKey, difficulty);
    const solution = await computePow(
      challenge,
      getPoWConfig(this.isTestnet),
      options?.onProgress,
      options?.isCancelled
    );
    const signatureBytes = await this.signer.sign(content);
    const signature = bytesToHex(signatureBytes);
    const powParams = solutionToRpcParams(solution);
    return this.rpc.submitEngagement({
      contentId,
      authorId: this.publicKeyHex,
      signature,
      emoji,
      ...powParams
    });
  }
  /**
   * Create a new space (mines PoW automatically)
   */
  async createSpace(name, options) {
    if (!this.publicKey || !this.signer || !this.publicKeyHex) {
      throw new Error("Identity not set");
    }
    const content = new TextEncoder().encode(JSON.stringify({ name }));
    const difficulty = getDifficulty(1 /* SpaceCreation */, this.isTestnet);
    const challenge = await createChallenge(1 /* SpaceCreation */, content, this.publicKey, difficulty);
    const solution = await computePow(
      challenge,
      getPoWConfig(this.isTestnet),
      options?.onProgress,
      options?.isCancelled
    );
    const signatureBytes = await this.signer.sign(content);
    const signature = bytesToHex(signatureBytes);
    const powParams = solutionToRpcParams(solution);
    return this.rpc.createSpace({
      name,
      creatorId: this.publicKeyHex,
      signature,
      ...powParams
    });
  }
  // ===========================================================================
  // Identity
  // ===========================================================================
  async getIdentityLevel(identityId) {
    return this.rpc.getIdentityLevel(identityId);
  }
  // ===========================================================================
  // Pools
  // ===========================================================================
  async getPoolInfo(poolId) {
    return this.rpc.getPoolInfo(poolId);
  }
  async getPoolForContent(contentId) {
    return this.rpc.getPoolForContent(contentId);
  }
  // ===========================================================================
  // Raw RPC Access
  // ===========================================================================
  /**
   * Get underlying RPC client for advanced usage
   */
  getRpc() {
    return this.rpc;
  }
};
function swimchainTestnet(port = 19736) {
  return new SwimchainClient({ testnet: true, port });
}
function swimchainMainnet(port = 9736) {
  return new SwimchainClient({ testnet: false, port });
}
function swimchain(endpoint, testnet = true) {
  return new SwimchainClient({ endpoint, testnet });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ActionType,
  ContentType,
  DIFFICULTY,
  PRODUCTION_CONFIG,
  REACTION_CODES,
  REACTION_EMOJIS,
  SwimchainClient,
  SwimchainRpc,
  TESTNET_CONFIG,
  TESTNET_DIFFICULTY,
  TEST_CONFIG,
  bytesToHex,
  computePow,
  createChallenge,
  createClient,
  createMainnetClient,
  createTestnetClient,
  estimateMiningTime,
  formatTimestamp,
  getDifficulty,
  getPoWConfig,
  hexToBytes,
  leadingZeros,
  nowSeconds,
  randomBytes,
  serializeChallenge,
  sha256,
  sha256Hex,
  sha256String,
  sleep,
  solutionToRpcParams,
  swimchain,
  swimchainMainnet,
  swimchainTestnet,
  timeAgo,
  truncate,
  truncateAddress
});
