/**
 * Mint the `@defcon34` space + its seed post — DEF CON 34 onboarding, Task 5.
 *
 * ONE-SHOT, IDEMPOTENT. Run it once at go-live (Task 10's runbook mints the
 * space, then fills DEFCON_SPACE_HEX into the keeper unit and the client
 * .env), and safely again any time after — a second run is a no-op that
 * still prints the same ids and exits 0.
 *
 * ## Why the space name is `@defcon34:DEFCON 34`, not the bare string `DEFCON 34`
 *
 * `create_space` derives a space's id one of two ways
 * (`src/rpc/methods.rs` ~5991-6002, `src/types/space_class.rs` `derive_space_id`):
 *   - an app-namespaced name (`@<app>:<display>`, `parse_app_space_name`,
 *     `src/types/space_class.rs:52-65`) gets a NAME-DERIVED id —
 *     `sha256("app:<app>:v1:<display>")[..16]` (`app_space_id_16`,
 *     `space_class.rs:70-73`) — the SAME id every time that exact name is
 *     submitted, and `create_space` returns the existing space idempotently
 *     on a repeat (`methods.rs` ~6024-6038, "already registered; returning it
 *     idempotently"; see docs/APP_NAMESPACED_SPACES.md).
 *   - anything else gets a PoW-HASH-derived id (`apply_class(Social,
 *     pow_hash)`) — and pow_hash's non-zero bits differ by mining nonce on
 *     every run, so minting the bare string "DEFCON 34" as a plain space name
 *     would silently create a DIFFERENT space every single time this script
 *     runs. That is the opposite of the idempotence this script exists to
 *     provide, so it is not what's done here.
 *
 * So `SPACE_APP = 'defcon34'` (matching the design spec's own framing of the
 * space as `@defcon34`, `docs/superpowers/specs/2026-07-29-defcon34-onboarding
 * -design.md:18,37,44) and the brief's literal "space display name constant:
 * DEFCON 34" becomes the `<display>` half — `SPACE_NAME = '@defcon34:DEFCON 34'`
 * — giving both a name-derived, truly idempotent space id AND the literal
 * display string the brief specifies. This mirrors shoal's own
 * `@shoal:main` / `WATER_SPACE_NAME` precedent exactly
 * (`shoal-client/src/ui/shellConfig.ts:113-143`).
 *
 * ## Shape, idempotence strategy, and identity
 *
 * Follows `shoal-client/scripts/mint-water.ts`'s structure: mint the space
 * (idempotent via the app-namespace mechanism above — no separate
 * pre-existence check is needed or attempted, exactly as mint-water.ts does
 * not pre-check either, relying on the server's own idempotent return), then
 * mint the seed post idempotently by DERIVING its content id (`sha256` of
 * `${title}\n\n${body}`, the same formula `submit_post` hashes server-side)
 * and calling `get_content` on it FIRST — if it answers, the post is already
 * there and nothing is submitted (`mint-water.ts:124-134`'s exact pattern;
 * this is the "derive it" option the brief offers, chosen over the
 * list_space_posts-scan alternative because the derivation is a plain
 * `sha256(title + "\n\n" + body)` — trivial to reproduce with `node:crypto`,
 * not "impractical" at all). Finally verifies by reading the post back
 * through `get_content` (see "KNOWN NODE GAP" below for why this is
 * `get_content`, not `list_space_posts`, despite the brief naming the latter)
 * and asserting title/body/content-id all match, exiting non-zero on any
 * mismatch.
 *
 * ## KNOWN NODE GAP — `list_space_posts` does not see a self-formed block's
 * own post on a solo (no-peer) regtest node; verification reads `get_content`
 * instead
 *
 * Discovered while live-testing this script (not a defect in this script):
 * once a locally-mined block containing this script's Post action actually
 * COMMITS (`get_info().block_height` advances), `list_space_posts` /
 * `list_spaces[].post_count` for that space silently go to empty/zero —
 * while `get_content` on the exact same post's derived content id keeps
 * answering correctly, with the right title/body, indefinitely. Reproduced
 * twice cleanly with raw RPC (curl), both for `@defcon34:DEFCON 34` and for
 * an unrelated plain (non-namespaced) throwaway space + post — so this is
 * not specific to app-namespacing or to anything this script does
 * differently from a normal client. Before the containing block commits, the
 * post *is* visible via `list_space_posts` (as `"pending": true`, served from
 * the block builder's mempool per `src/rpc/methods.rs`'s "Add pending posts
 * from BlockBuilder mempool" branch) — it only disappears once the block
 * actually forms. The likely area is `ChainStore::put_content_block`
 * (`src/storage/chain.rs:378-498`), which indexes non-Reply actions into
 * `posts_by_space_index` using the CONTAINING BLOCK's own `space_id` field
 * (`block_space_id_16`, line 406) rather than the action's own target space —
 * a mismatch there for a locally-formed block would produce exactly this
 * symptom (chain-index empty, mempool item gone, content itself intact).
 * This is a *finding*, not something this task fixes ("zero Rust changes" is
 * this whole plan's global constraint) — flagged prominently here and in
 * Task 5's report because Task 6/7's Wall and Task 9's E2E rehearsal both
 * depend on `list_space_posts` to show content, and will hit this same gap
 * once a block actually commits during those tasks' own regtest testing.
 *
 * Signs everything as the NODE'S OWN identity via the `sign_message` RPC —
 * never a raw keypair held by this script — exactly mint-water.ts's identity
 * story ("no seed, no key file... the one identity story that is identical on
 * regtest, testnet and mainnet"). On non-regtest networks that identity MUST
 * already be sponsored (`check_identity_sponsored`, `src/rpc/methods.rs:753`)
 * or `create_space`/`submit_post` are refused at ingestion; the DEF CON
 * runbook grants that sponsorship (genesis-direct to `defcon34`) before this
 * script ever runs. Regtest bypasses the sponsorship check only.
 *
 * ## Mining — Argon2id action PoW, ported from already-verified code
 *
 * The byte layouts below (challenge, signature preimage, PoW config per
 * network, difficulty per action type) are not re-derived from scratch: they
 * are the exact layouts already verified against the Rust source in
 * `shoal-client/src/lib/shoalSend.ts` (`serializeChallenge`, `minePow`,
 * `actionSignaturePreimage`, `difficultyFor`, `powProfileFor`) and already
 * running in `tools/swim-bot/activity-bot.mjs` (`minePow`, `actionSigPreimage`,
 * `POW_CONFIG`/`POW_DIFF`), ported here to plain JS with no bundler:
 *
 *   - PoW challenge (82 bytes, `PoWChallenge::serialize`,
 *     `src/crypto/action_pow.rs:136-145`): action_type(1) || content_hash(32)
 *     || author_id(32) || timestamp_BIG-endian(8) || difficulty(1) ||
 *     nonce_space(8). Mined by appending nonce_BIG-endian(8) (90 bytes total)
 *     and hashing with Argon2id until the result has >= difficulty leading
 *     zero BITS (never bytes — byte-counting overmines 8x and looks like a
 *     hang; project memory "PoW difficulty units").
 *   - Signature preimage (41 bytes, v2 canonical,
 *     `validate_action_signature`, `src/blocks/validation.rs:359-393`):
 *     content_hash(32) || timestamp LITTLE-endian(8) || private(1=0, this
 *     space/post are always public). Used for BOTH the space-creation and
 *     the post action, matching mint-water.ts's `mineAndSignAction`, which
 *     signs every action type through this one preimage. Note: CreateSpace
 *     actions are NOT authenticated on the ingest/gossip path today
 *     (`validate_content_action_authenticity`,
 *     `src/blocks/validation.rs:440-447`, explicitly defers signature
 *     enforcement for CreateSpace — "peers do not apply them... an explicit,
 *     documented deferral, not an accidental gap") — so this preimage choice
 *     for space creation isn't exercised by any check today, but the
 *     canonical form is used anyway for consistency with Post, whose
 *     signature over this SAME preimage IS synchronously verified inline by
 *     `submit_post` (`methods.rs:2287-2310`, `validate_content_action_
 *     authenticity` called directly in the RPC handler) before the action is
 *     even added to the mempool.
 *   - PoW config + minimum difficulty per network
 *     (`NetworkMode::adjusted_difficulty`, `src/network/mode.rs:274-296`;
 *     `ForkPoWConfig`, `src/crypto/action_pow.rs`), detected once via
 *     `get_info` (never assumed): regtest 1024KiB/1 iter/1 par, FLAT 4-bit
 *     difficulty for every action type; testnet/mainnet 8192KiB/1 iter/2 par,
 *     difficulty = base - 10 floored at 4 (SpaceCreation base 22 -> 12, Post
 *     base 20 -> 10).
 *
 * `hash-wasm`'s argon2id is synchronous WASM behind an async signature — an
 * uninterrupted await-hash loop never actually yields the event loop (cross-
 * client gotcha recorded in project memory, hit in reef/chess). Not fatal for
 * a one-shot CLI script with nothing else sharing the process, but the
 * mining loop below still yields every 8 attempts so a `Ctrl+C` lands
 * promptly rather than after however long mining takes.
 *
 * ## Running it — hash-wasm has no home in tools/defcon-gate/ (on purpose:
 * this directory carries no package.json, per the plan's global constraint)
 *
 * `hash-wasm` is already an installed dependency of `tools/swim-bot/`
 * (its `package.json`). Two things were verified empirically before choosing
 * how to load it here (do not "fix" either without re-testing on the actual
 * Node in use):
 *   1. A bare ESM `import 'hash-wasm'` from a file in `tools/defcon-gate/`
 *      cannot see `tools/swim-bot/node_modules` — Node's ESM resolver only
 *      walks UP from the importing file's own directory, never sideways to a
 *      sibling.
 *   2. `NODE_PATH` is NOT consulted by the ESM resolver at all — a bare
 *      `import` under `NODE_PATH` throws `ERR_MODULE_NOT_FOUND` on Node 24,
 *      confirmed by direct test.
 *   3. `NODE_PATH` IS honored by Node's CJS `require()` — confirmed by direct
 *      test: `createRequire(import.meta.url)` then `require('hash-wasm')`
 *      resolves and `argon2id` runs correctly under `NODE_PATH`.
 * So this file loads hash-wasm through `createRequire` + `require`, not
 * `import`, specifically so `NODE_PATH` can point at it. Invoke as:
 *
 *   cd tools/swim-bot && npm install    # once, if its node_modules isn't there
 *   cd ../defcon-gate
 *   RPC_URL=http://127.0.0.1:29736 \
 *   COOKIE_FILE=<data-dir>/.cookie \
 *   NODE_PATH=<absolute path to tools/swim-bot/node_modules> \
 *   node mint-space.mjs
 *
 * (PowerShell: `$env:NODE_PATH = (Resolve-Path ..\swim-bot\node_modules).Path`.)
 * `NODE_PATH` may point at ANY node_modules that has `hash-wasm` installed —
 * swim-bot's is just the nearest existing one in this repo; it does not need
 * to be swim-bot specifically, and does not need swim-bot's own bots to ever
 * run alongside this script.
 *
 * Env:
 *   RPC_URL      (required) node JSON-RPC endpoint, e.g. http://127.0.0.1:29736
 *   COOKIE_FILE  (required) path to the node's RPC auth cookie
 *
 * Output (stdout, on success — the contract Tasks 4/6/7/10 read):
 *   DEFCON_SPACE_HEX=<32 lowercase hex chars>
 *   DEFCON_SPACE_BECH32=sp1...
 * All progress/diagnostic logging goes to stderr, so stdout stays exactly
 * those two lines and is safe to grep/parse directly.
 *
 * Exit codes: 0 success (mint or idempotent no-op alike); 2 missing/invalid
 * env; 1 any other failure (RPC error, verification mismatch).
 */
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { argon2id } = require('hash-wasm');

// ── env config ───────────────────────────────────────────────────────────
function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is required`);
    process.exit(2);
  }
  return v;
}

const RPC_URL = required('RPC_URL');
const COOKIE_FILE = required('COOKIE_FILE');

const log = (msg) => console.error(`[mint-space ${new Date().toISOString()}] ${msg}`);

// ── RPC (cookie re-read every call — mirrors tools/defcon-gate/defcon-gate.mjs) ──
let rpcId = 0;
async function rpc(method, params) {
  const cookie = readFileSync(COOKIE_FILE, 'utf-8').trim();
  const auth = 'Basic ' + Buffer.from(`__cookie__:${cookie}`).toString('base64');
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function signWithNode(msgBuffer) {
  const r = await rpc('sign_message', { message: msgBuffer.toString('hex') });
  if (!r?.signature) throw new Error('sign_message returned no signature');
  return r.signature;
}

// ── bech32m space-id decoder (sp1... -> 16-byte hex) ────────────────────────
// Copied from tools/defcon-gate/defcon-gate.mjs's decoder (same charset/
// polymod/generator constants, standard per BIP-173/350; no dependency
// added). Needed only because create_space's response `space_id` is
// bech32m, and DEFCON_SPACE_HEX (what Tasks 4/6 consume) is hex.
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  return ret;
}

function decodeSpaceIdBech32ToHex(spaceId) {
  const lower = spaceId.toLowerCase();
  const pos = lower.lastIndexOf('1');
  if (pos < 1 || pos + 7 > lower.length) {
    throw new Error(`malformed bech32 space id: ${spaceId}`);
  }
  const hrp = lower.slice(0, pos);
  if (hrp !== 'sp') throw new Error(`unexpected space-id HRP "${hrp}" in ${spaceId}`);
  const dataPart = lower.slice(pos + 1);
  const data = [];
  for (const c of dataPart) {
    const v = BECH32_CHARSET.indexOf(c);
    if (v === -1) throw new Error(`invalid bech32 character in space id: ${spaceId}`);
    data.push(v);
  }
  const values = bech32HrpExpand(hrp).concat(data);
  if (bech32Polymod(values) !== BECH32M_CONST) {
    throw new Error(`bad bech32m checksum on space id: ${spaceId}`);
  }
  const payload = data.slice(0, -6); // strip 6-char checksum
  const bytes = convertBits(payload, 5, 8, false); // version(1) + space id(16) = 17 bytes
  return Buffer.from(bytes.slice(1, 17)).toString('hex');
}

// ── PoW profile detection (once, via get_info — never assumed) ─────────────
async function detectProfile() {
  const info = await rpc('get_info', {});
  const net = String(info?.network ?? '').toLowerCase();
  const network = net === 'regtest' ? 'regtest' : net === 'testnet' ? 'testnet' : 'mainnet';
  // ForkPoWConfig::test() vs ::testnet()/::production() — action_pow.rs.
  // testnet and mainnet currently share the same numbers but are kept as
  // separate branches here, matching shoalSend.ts's documented reasoning
  // (independently tunable in the node, must not be collapsed to one).
  const config =
    network === 'regtest'
      ? { memoryKib: 1024, iterations: 1, parallelism: 1 }
      : { memoryKib: 8192, iterations: 1, parallelism: 2 };
  return { network, config };
}

const ACTION_TYPE_SPACE_CREATION = 0x01;
const ACTION_TYPE_POST = 0x02;
// Base difficulty per action type — crate::crypto::action_pow::difficulty.
const BASE_DIFFICULTY = { [ACTION_TYPE_SPACE_CREATION]: 22, [ACTION_TYPE_POST]: 20 };

/** NetworkMode::adjusted_difficulty (src/network/mode.rs:274-296): regtest is
 *  a flat 4 bits for every action type; testnet/mainnet is base-10 floored
 *  at 4. */
function difficultyFor(network, actionType) {
  if (network === 'regtest') return 4;
  const base = BASE_DIFFICULTY[actionType];
  if (base === undefined) throw new RangeError(`difficultyFor: unknown action type 0x${actionType.toString(16)}`);
  const shifted = base - 10;
  return shifted > 4 ? shifted : 4;
}

// ── PoW mining (Argon2id) ────────────────────────────────────────────────────
const sha256 = (buf) => createHash('sha256').update(buf).digest();

/** Leading zero BITS, matching crate::crypto::leading_zeros. Bits, never
 *  bytes (project memory "PoW difficulty units": byte-counting overmines 8x
 *  and reads as a hang). */
function leadingZeroBits(hash) {
  let zeros = 0;
  for (const b of hash) {
    if (b === 0) {
      zeros += 8;
    } else {
      zeros += Math.clz32(b) - 24;
      break;
    }
  }
  return zeros;
}

/** The 82-byte canonical challenge, byte-for-byte against PoWChallenge::serialize
 *  (action_pow.rs:136-145). */
function serializeChallenge(actionType, contentHash, authorId, timestamp, difficulty, nonceSpace) {
  const b = Buffer.alloc(82);
  b[0] = actionType;
  contentHash.copy(b, 1);
  authorId.copy(b, 33);
  b.writeBigUInt64BE(BigInt(timestamp), 65); // big-endian
  b[73] = difficulty;
  nonceSpace.copy(b, 74);
  return b;
}

/** Mine until Argon2id(challenge || nonce_BE(8), salt=nonce_space) has >=
 *  difficulty leading zero bits — the exact recomputation verify_pow performs. */
async function minePow(actionType, contentHash, authorId, timestamp, difficulty, config) {
  const nonceSpace = randomBytes(8);
  const challenge = serializeChallenge(actionType, contentHash, authorId, timestamp, difficulty, nonceSpace);
  const input = Buffer.alloc(90);
  challenge.copy(input, 0);

  let nonce = 0n;
  for (;;) {
    input.writeBigUInt64BE(nonce, 82); // nonce is big-endian too
    const raw = await argon2id({
      password: new Uint8Array(input),
      salt: new Uint8Array(nonceSpace),
      parallelism: config.parallelism,
      memorySize: config.memoryKib,
      iterations: config.iterations,
      hashLength: 32,
      outputType: 'binary',
    });
    const hash = Buffer.from(raw);
    if (leadingZeroBits(hash) >= difficulty) {
      return { nonce, hash, nonceSpace };
    }
    nonce++;
    if (nonce % 8n === 0n) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

/** v2 canonical action-signature preimage (validate_action_signature,
 *  src/blocks/validation.rs:359-393): content_hash(32) || timestamp_LE(8) ||
 *  private(1). Both this script's actions are always public. */
function actionSignaturePreimage(contentHash, timestamp) {
  const b = Buffer.alloc(41);
  contentHash.copy(b, 0);
  b.writeBigUInt64LE(BigInt(timestamp), 32); // little-endian
  b[40] = 0; // public
  return b;
}

/** Mine + canonically sign one action over `content` (whose sha256 is the
 *  content_hash the node re-derives for itself). Mirrors mint-water.ts's
 *  `mineAndSignAction` — see this file's header for the exact byte layouts. */
async function mineAndSignAction(actionType, content, authorIdHex, timestampSecs, profile) {
  const contentHash = sha256(content);
  const authorId = Buffer.from(authorIdHex, 'hex');
  const difficulty = difficultyFor(profile.network, actionType);

  const solution = await minePow(actionType, contentHash, authorId, timestampSecs, difficulty, profile.config);
  const signature = await signWithNode(actionSignaturePreimage(contentHash, timestampSecs));

  return {
    pow_nonce: Number(solution.nonce),
    pow_difficulty: difficulty,
    pow_nonce_space: solution.nonceSpace.toString('hex'),
    pow_hash: solution.hash.toString('hex'),
    signature,
    timestamp: timestampSecs,
  };
}

// ── the space and its seed post ─────────────────────────────────────────────
const SPACE_APP = 'defcon34';
const SPACE_DISPLAY = 'DEFCON 34';
const SPACE_NAME = `@${SPACE_APP}:${SPACE_DISPLAY}`;

const SEED_TITLE = 'Report your findings';
const SEED_BODY =
  'Broke something? Post it here. This space and everything in it was minted for DEF CON 34.';

/** Create the space, or find it already there (create_space is idempotent
 *  for an app-namespaced name — see this file's header). Returns the
 *  bech32m `sp1...` space id. */
async function mintSpace(authorIdHex, profile) {
  const ts = Math.floor(Date.now() / 1000);
  const mined = await mineAndSignAction(ACTION_TYPE_SPACE_CREATION, Buffer.from(SPACE_NAME, 'utf-8'), authorIdHex, ts, profile);
  const result = await rpc('create_space', {
    name: SPACE_NAME,
    creator_id: authorIdHex,
    ...mined,
  });
  return result.space_id;
}

/** sha256:<hex> for the seed post, derived the same way submit_post derives
 *  it server-side (content_hash = sha256(`${title}\n\n${body}`)). */
function seedPostContentId() {
  const text = `${SEED_TITLE}\n\n${SEED_BODY}`;
  return `sha256:${sha256(Buffer.from(text, 'utf-8')).toString('hex')}`;
}

/** Create the seed post, or find it already there. Returns its content id. */
async function mintSeedPost(spaceId, authorIdHex, profile) {
  const derived = seedPostContentId();
  try {
    await rpc('get_content', { content_id: derived });
    log(`seed post already there: ${derived}`);
    return derived;
  } catch {
    // not there yet — mint it below
  }

  const ts = Math.floor(Date.now() / 1000);
  const text = `${SEED_TITLE}\n\n${SEED_BODY}`;
  const mined = await mineAndSignAction(ACTION_TYPE_POST, Buffer.from(text, 'utf-8'), authorIdHex, ts, profile);
  const result = await rpc('submit_post', {
    space_id: spaceId,
    title: SEED_TITLE,
    body: SEED_BODY,
    author_id: authorIdHex,
    ...mined,
  });
  // The node's id and the one we derived MUST agree, or the idempotence
  // check above (get_content on the derived id) would never find this post
  // on a future run, and it would be re-minted forever.
  if (result.content_id !== derived) {
    throw new Error(`seed post content id mismatch: node said ${result.content_id}, derived ${derived}`);
  }
  log(`seed post minted: ${result.content_id}`);
  return result.content_id;
}

/**
 * Verify by reading the post back through RPC — the check that matters: not
 * "the calls returned success" but "the post, read the normal way, is
 * actually there with the right content". Reads `get_content` on the derived
 * id and asserts `content_id`/`title`/`body` all match, exiting (via a
 * thrown Error, caught in `main`'s `.catch`) non-zero on any mismatch.
 *
 * This is `get_content`, not `list_space_posts`, for two reasons:
 *
 *   1. Precedent — the shipping Shoal client's own readiness check,
 *      `roomReady` (`shoal-client/src/ui/shellConfig.ts:332-344`), verifies a
 *      just-minted room the exact same way: a plain `get_content` on the
 *      derived id, not a list scan.
 *   2. The KNOWN NODE GAP documented in this file's header, live-reproduced
 *      during this task's own regtest testing: `list_space_posts` stops
 *      showing a space's own posts once their containing block self-commits
 *      on a solo (no-peer) regtest node, while `get_content` on that exact
 *      content id keeps answering correctly, with the right title/body,
 *      indefinitely afterward.
 *
 * `get_content` is also a STRICTER check than a list scan (asserts the exact
 * title/body content, not just presence in a list). `list_space_posts` is
 * still called below, but only as a best-effort, NON-FATAL cross-check: it's
 * logged so a run against a node without the gap (or before this script's
 * own block has committed) shows it lining up, but a solo regtest node
 * hitting the gap must not turn a correct mint into a false failure. Task
 * 6/7 (the Wall) and Task 9 (the E2E rehearsal script) both read
 * `list_space_posts` directly with no fallback of their own, and will hit
 * this identical gap once a block commits during their own regtest testing —
 * see this file's header and Task 5's report for the full writeup.
 */
async function verifyReadback(spaceId, expectedContentId) {
  const MAX_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 300;
  let content;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      content = await rpc('get_content', { content_id: expectedContentId });
      break;
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw new Error(`verify FAILED: get_content(${expectedContentId}) never succeeded: ${e.message}`);
      log(`verify: get_content not answering yet (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  if (content.content_id !== expectedContentId) {
    throw new Error(`verify FAILED: get_content returned content_id ${content.content_id}, expected ${expectedContentId}`);
  }
  if (content.title !== SEED_TITLE) {
    throw new Error(`verify FAILED: seed post title is "${content.title}", expected "${SEED_TITLE}"`);
  }
  if (content.body !== SEED_BODY) {
    throw new Error(`verify FAILED: seed post body is "${content.body}", expected "${SEED_BODY}"`);
  }

  // Best-effort cross-check, not fatal — see this function's docstring and
  // the "KNOWN NODE GAP" section in the file header.
  try {
    const listed = await rpc('list_space_posts', { space_id: spaceId, limit: 50 });
    const seen = (listed?.items ?? []).some((it) => it.content_id === expectedContentId);
    log(`list_space_posts cross-check: ${seen ? 'post visible there too' : 'post NOT visible there (known node gap once the block commits — see file header; get_content above is the source of truth)'}`);
  } catch (e) {
    log(`list_space_posts cross-check failed (non-fatal): ${e.message}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  log(`node: ${RPC_URL}`);
  log(`space: ${SPACE_NAME}`);
  log(`seed post: ${JSON.stringify(SEED_TITLE)} / ${JSON.stringify(SEED_BODY)}`);

  const profile = await detectProfile();
  log(`network: ${profile.network}`);

  const me = await rpc('get_identity_info', {});
  if (!me?.public_key) throw new Error('get_identity_info returned no public_key');
  log(`minting as the node's own identity ${me.public_key.slice(0, 16)}...`);

  const spaceId = await mintSpace(me.public_key, profile);
  log(`space id (bech32): ${spaceId}`);
  const spaceIdHex = decodeSpaceIdBech32ToHex(spaceId);
  log(`space id (hex):    ${spaceIdHex}`);

  const postContentId = await mintSeedPost(spaceId, me.public_key, profile);

  await verifyReadback(spaceId, postContentId);
  log('verified: the seed post reads back correctly via get_content');

  // The two lines Tasks 4/6/7/10 read. Everything else in this script logs
  // to stderr so these are the only bytes on stdout.
  console.log(`DEFCON_SPACE_HEX=${spaceIdHex}`);
  console.log(`DEFCON_SPACE_BECH32=${spaceId}`);
}

main().catch((e) => {
  console.error(`[mint-space] FAILED: ${e?.stack || e?.message || e}`);
  process.exit(1);
});
