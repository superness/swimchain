/**
 * Canonical action signing for Swimchain content actions (Post / Reply / Edit).
 *
 * This is the ONE correct implementation of the action-signature preimage that the
 * node verifies in `src/blocks/validation.rs` `validate_action_signature()`:
 *
 *   v2 (current, 41 bytes): content_hash(32) || timestamp.to_le_bytes()(8) || private(1)
 *   v1 (legacy,  40 bytes): content_hash(32) || timestamp.to_le_bytes()(8)   [private==false only]
 *
 * We always emit v2. For public spaces `private` is 0, which the node's v2 check
 * accepts (it stamps `action.private = 0`); for private spaces the client passes
 * `isPrivate = true` to match the `private = 1` the node will stamp.
 *
 * IMPORTANT: the `timestamp` passed here MUST be the same timestamp used for the PoW
 * challenge and submitted to the RPC (`solutionToRpcParams().timestamp`). Signing a
 * different timestamp than is submitted is the bug that silently produced invalid
 * signatures across the clients before enforcement.
 *
 * content_hash is defined by the node:
 *   POST  = sha256(`${title}\n\n${body}`)   (src/rpc/methods.rs submit_post)
 *   REPLY = sha256(body)                     (src/rpc/methods.rs submit_reply)
 *
 * @packageDocumentation
 */

import { sha256 } from './action-pow';
import { bytesToHex } from './utils';

/** content_hash for a POST — `sha256(title + "\n\n" + body)`. Matches the node. */
export async function contentHashForPost(title: string, body: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(`${title}\n\n${body}`));
}

/** content_hash for a REPLY — `sha256(body)`. Matches the node. */
export async function contentHashForReply(body: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(body));
}

/**
 * Build the canonical 41-byte action-signature preimage:
 *   content_hash(32) || timestamp_LE(8) || private(1)
 */
export function actionSignaturePreimage(
  contentHash: Uint8Array,
  timestamp: number,
  isPrivate = false
): Uint8Array {
  if (contentHash.length !== 32) {
    throw new Error(`content_hash must be 32 bytes, got ${contentHash.length}`);
  }
  const msg = new Uint8Array(41);
  msg.set(contentHash, 0);
  // timestamp as u64 little-endian (matches Rust `timestamp.to_le_bytes()`)
  new DataView(msg.buffer).setBigUint64(32, BigInt(timestamp), true);
  msg[40] = isPrivate ? 1 : 0;
  return msg;
}

/** A signing function over raw bytes (e.g. `keypair.sign` from useStoredKeypair). */
export type SignFn = (
  message: Uint8Array
) => Uint8Array | null | Promise<Uint8Array | null>;

/**
 * Sign a content action canonically and return the 64-byte signature as hex,
 * ready to pass as the `signature` field to submit_post / submit_reply / submit_edit.
 */
export async function signAction(
  sign: SignFn,
  params: { contentHash: Uint8Array; timestamp: number; isPrivate?: boolean }
): Promise<string> {
  const preimage = actionSignaturePreimage(
    params.contentHash,
    params.timestamp,
    params.isPrivate ?? false
  );
  const signature = await sign(preimage);
  if (!signature) {
    throw new Error('signAction: signing failed (no keypair loaded?)');
  }
  if (signature.length !== 64) {
    throw new Error(`signAction: expected 64-byte signature, got ${signature.length}`);
  }
  return bytesToHex(signature);
}
