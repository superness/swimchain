// The mine -> sign -> submit pipeline for a single dwell-engage (Surf Phase
// B, Task 3). Talks to the Task 2 worker (web/workers/engage.worker.js,
// message contract documented in scripts/worker-src/engage.worker.mjs) and
// the node's real RPC surface. Not unit-tested directly (no Worker/crypto in
// plain `node --test`); exercised live via CDP per the task brief — see
// task-3-report.md.
import { ARGON2, ENGAGE_DIFFICULTY_BITS } from './policy.mjs';

// ActionType.Engage = 4 in the crypto-layer PoW enum (action_pow.rs:44-59;
// NOT the chain enum's Reply=0x03/Engage-adjacent numbering) — cross-checked
// byte-for-byte in Task 2 (task-2-report.md).
const ENGAGE_ACTION_TYPE = 4;

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function utf8ToHex(str) {
  return bytesToHex(new TextEncoder().encode(str));
}

function randomNonceSpaceHex() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

// Spawns the worker, posts one challenge, resolves on 'solution', rejects on
// 'error' (or a Worker-level onerror). Ignores 'progress' messages — this
// pipeline mines a single 6-bit-difficulty engage (sub-second per Task 2's
// live measurements), no UI progress hookup needed yet.
function mineInWorker(challenge, config) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/workers/engage.worker.js');
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === 'solution') {
        worker.terminate();
        resolve(msg);
      } else if (msg?.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message ?? 'engage worker error'));
      }
      // 'progress' — ignored, not terminal.
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e?.message ?? 'engage worker crashed'));
    };
    worker.postMessage({ challenge, config });
  });
}

// A sponsorship/authorization rejection classifies as receive-only (the
// silent, one-try-then-stop path per the brief's §2.5 note): fresh
// identities are unsponsored by default even on mainnet, and that's the
// default new-user path, not an error state. A1's rpc() throws
// `new Error(json.error.message)`, discarding `error.code` (the node sends
// -32015 IdentityNotSponsored per src/rpc/error.rs:31, message "Identity is
// not sponsored. You must be sponsored by an existing member to post."
// src/rpc/methods.rs:958) — so classify on the message text, per the brief
// (no A1 rpc() change).
function isSponsorshipRejection(err) {
  const msg = String(err?.message ?? err ?? '');
  return /not sponsored/i.test(msg);
}

// mineSignSubmit({ rpc, sign, myPk, contentId }) -> { ok: true } |
//   { ok: false, receiveOnly: boolean }
// Never throws — every failure path (mining, signing, RPC) resolves to a
// typed result so dwell.mjs's fire() loop can classify without a try/catch
// of its own.
export async function mineSignSubmit({ rpc, sign, myPk, contentId }) {
  try {
    const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
    const nonceSpaceHex = randomNonceSpaceHex();
    // Unix SECONDS — the challenge, the signature preimage, and the
    // submit_engagement `timestamp` param all use this SAME seconds value
    // (dwell.mjs's ledger and shell.mjs's other timestamps use ms — kept
    // deliberately distinct, per the brief).
    const timestamp = Math.floor(Date.now() / 1000);

    const challenge = {
      actionType: ENGAGE_ACTION_TYPE,
      contentHashHex,
      authorPkHex: myPk,
      timestamp,
      difficulty: ENGAGE_DIFFICULTY_BITS,
      nonceSpaceHex,
    };
    const solution = await mineInWorker(challenge, ARGON2);

    // Signature preimage keeps the worker's DECIMAL-STRING nonce (matches
    // the node's `format!("engage:{}:{}:{}", content_id, pow_nonce,
    // timestamp)` at methods.rs:3918-3928/4052-4062, which Display-formats
    // the parsed u64 back to the same decimal string) — do NOT use
    // Number(nonce) here, only at the submit_engagement param below.
    const preimage = `engage:${contentId}:${solution.nonce}:${timestamp}`;
    const signature = await sign(utf8ToHex(preimage));

    const result = await rpc('submit_engagement', {
      content_id: contentId,
      author_id: myPk,
      // pow_nonce MUST be a JSON number: SubmitEngagementParams.pow_nonce is
      // a bare u64 (types.rs:400) with no string-deserialize shim — serde
      // rejects a JSON string with InvalidParams before any PoW check runs.
      // Safe at 6 bits (nonce is ~tens, far below 2^53).
      pow_nonce: Number(solution.nonce),
      pow_difficulty: ENGAGE_DIFFICULTY_BITS,
      pow_nonce_space: nonceSpaceHex,
      pow_hash: solution.hashHex,
      signature,
      timestamp,
    });
    return { ok: !!result?.engaged };
  } catch (err) {
    if (isSponsorshipRejection(err)) return { ok: false, receiveOnly: true };
    return { ok: false, receiveOnly: false };
  }
}
