/**
 * The identity of a single chip proof.
 *
 * This string stands for one exact Argon2id input — the same four values the
 * preimage binds (`chips-v1 ‖ author ‖ table ‖ ms ‖ nonce`). It is used by the
 * fold's dedupe set AND by the verification cache, which is why it lives in its
 * own dependency-free file: `chipsEngine.ts` must be able to import it without
 * dragging hash-wasm into the fold's import graph.
 *
 * Fields are fixed-shape (hex author, decimal ms, hex nonce) and none can
 * contain the separator, so plain joining is unambiguous here — unlike the
 * chip preimage itself, which length-prefixes because it takes free-form
 * strings.
 */
export function proofKey(tableId: string, authorId: string, ms: number, nonce: bigint): string {
  return `${tableId}|${authorId.toLowerCase()}|${ms}|${nonce.toString(16)}`;
}
