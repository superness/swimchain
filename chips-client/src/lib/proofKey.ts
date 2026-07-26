/**
 * The identity of a single chip proof.
 *
 * This string stands for one exact Argon2id input — the same four values the
 * preimage binds (`chips-v1 ‖ author ‖ table ‖ ms ‖ nonce`). It is used by the
 * fold's dedupe set AND by the verification cache, which is why it lives in its
 * own dependency-free file: `chipsEngine.ts` must be able to import it without
 * dragging hash-wasm into the fold's import graph.
 *
 * The two variable-length fields are length-prefixed, for the same reason
 * `chipPreimage` length-prefixes: a `|` inside `tableId` or `authorId` would
 * otherwise shift the field boundary, and two genuinely different chips would
 * produce one key — crediting one chip as another, or silently suppressing a
 * real one through false dedupe. `tableId` is caller-supplied and this file
 * constrains its shape not at all, so the encoding must be unambiguous on its
 * own rather than resting on what today's callers happen to pass. `ms` and
 * `nonce` are numeric and cannot contain the separator.
 */
export function proofKey(tableId: string, authorId: string, ms: number, nonce: bigint): string {
  const author = authorId.toLowerCase();
  return `${tableId.length}:${tableId}|${author.length}:${author}|${ms}|${nonce.toString(16)}`;
}
