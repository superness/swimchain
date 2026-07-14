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
/** content_hash for a POST — `sha256(title + "\n\n" + body)`. Matches the node. */
export declare function contentHashForPost(title: string, body: string): Promise<Uint8Array>;
/** content_hash for a REPLY — `sha256(body)`. Matches the node. */
export declare function contentHashForReply(body: string): Promise<Uint8Array>;
/**
 * Build the canonical 41-byte action-signature preimage:
 *   content_hash(32) || timestamp_LE(8) || private(1)
 */
export declare function actionSignaturePreimage(contentHash: Uint8Array, timestamp: number, isPrivate?: boolean): Uint8Array;
/** A signing function over raw bytes (e.g. `keypair.sign` from useStoredKeypair). */
export type SignFn = (message: Uint8Array) => Uint8Array | null | Promise<Uint8Array | null>;
/**
 * Sign a content action canonically and return the 64-byte signature as hex,
 * ready to pass as the `signature` field to submit_post / submit_reply / submit_edit.
 */
export declare function signAction(sign: SignFn, params: {
    contentHash: Uint8Array;
    timestamp: number;
    isPrivate?: boolean;
}): Promise<string>;
//# sourceMappingURL=signAction.d.ts.map