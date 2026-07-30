// Engage PoW worker. Bundled by build-worker.cjs (esbuild --format=iife)
// into surf-app/web/workers/engage.worker.js — a same-origin classic worker
// script loaded via `new Worker('/workers/engage.worker.js')`.
//
// Wraps swimchain-react's computePow rather than hand-rolling the Argon2id
// loop: swimchain-react/dist/lib/action-pow.js is a committed build artifact
// (git-tracked, no React dependency — plain challenge-serialize/mine/verify
// utilities) already shipped and exercised in forum-client's lineage. Its
// byte layout, difficulty constants, and hash-wasm memorySize handling were
// cross-checked line-by-line against the node during Task 2 (see
// task-2-report.md) and match exactly:
//   - serializeChallenge(): 82-byte layout, u64 BE timestamp, u8 difficulty,
//     8-byte nonceSpace — identical to action_pow.rs:126-145.
//   - ActionType.Engage = 0x04 — identical to crypto::action_pow::ActionType
//     (action_pow.rs:44-59; NOT the chain enum's Reply=0x03/Engage-adjacent
//     numbering — this is the crypto-layer PoW enum).
//   - TESTNET_CONFIG = { memoryKib: 8192, iterations: 1, parallelism: 2 } —
//     identical to ForkPoWConfig::production()/testnet() (action_pow.rs:264-311),
//     8 MiB = 8192 KiB.
//   - TESTNET_DIFFICULTY[Engage] = 6 — identical to the mainnet Engage
//     minimum (mode.rs:274-296, "Engage 6").
// Reusing this known-good module is less drift risk than re-deriving the
// same serialization by hand (the brief's fallback shape, kept only as a
// reference in the task brief — not duplicated here).
//
// Message contract (Task 3 depends on this exactly):
//   in:  { challenge: { actionType, contentHashHex, authorPkHex, timestamp,
//                        difficulty, nonceSpaceHex },
//          config: { memoryMiB, iterations, parallelism } }
//   out: { type: 'solution', nonce: string(u64), hashHex } |
//        { type: 'error', message } |
//        { type: 'progress', attempts } (optional, informational)
import { computePow, hexToBytes, bytesToHex } from '../../../swimchain-react/dist/lib/action-pow.js';

self.onmessage = async (e) => {
  const { challenge, config } = e.data;
  try {
    const powChallenge = {
      actionType: challenge.actionType,
      contentHash: hexToBytes(challenge.contentHashHex), // RAW 32-byte hash, never re-hashed
      authorId: hexToBytes(challenge.authorPkHex),
      timestamp: challenge.timestamp, // Unix SECONDS — the shell (policy.mjs consumer) owns this
      difficulty: challenge.difficulty,
      nonceSpace: hexToBytes(challenge.nonceSpaceHex),
    };
    const powConfig = {
      // policy.mjs's ARGON2 dial is expressed in MiB (node-truth: action_pow.rs
      // memory_kib field name notwithstanding, the human-facing constant is
      // MiB); hash-wasm/action-pow.js's PoWConfig wants KiB.
      memoryKib: config.memoryMiB * 1024,
      iterations: config.iterations,
      parallelism: config.parallelism,
    };

    const solution = await computePow(powChallenge, powConfig, (attempts) => {
      postMessage({ type: 'progress', attempts });
    });

    postMessage({
      type: 'solution',
      nonce: solution.nonce.toString(), // decimal string; Number() at the submit_engagement call site
      hashHex: bytesToHex(solution.hash),
    });
  } catch (err) {
    postMessage({ type: 'error', message: String(err) });
  }
};
