/**
 * Self-sufficient space discovery (operator design, 2026-07-16):
 *
 *   "the wiki client should be seeing wiki-typed spaces on chain by their id
 *    and fetching their space names, then lazy-loading content on click."
 *
 * A space's CLASS is derived from its on-chain id (first byte), so app-class
 * candidates are visible to every node immediately. But the name and app tag
 * travel by peer metadata exchange, and a fresh/behind node has them as
 * `null` / `name_unresolved` until something asks. Nothing asked — so wiki
 * namespaces were simply invisible on fresh nodes until a manual
 * resolve_space_name (found during the 2026-07-16 BVT on the operator's own
 * desktop node).
 *
 * This helper fires resolve_space_name for every unresolved app-class space
 * (once per space per session) and reports whether any were queried, so the
 * caller can schedule a refetch. Content itself stays lazy — nothing here
 * fetches posts.
 */

interface ResolvableSpace {
  space_id: string;
  class?: string;
  app?: string | null;
  name?: string | null;
  name_unresolved?: boolean;
}

interface MinimalRpc {
  call<T>(method: string, params: Record<string, unknown>): Promise<T>;
}

// Once per space per session — resolve queries fan out to peers, so don't
// re-ask on every poll. A failed resolve retries next session/full reload.
const asked = new Set<string>();

/** Fire resolves for unresolved app-class spaces. Returns true if any were queried. */
export function resolveUnresolvedAppSpaces(rpc: MinimalRpc, spaces: ResolvableSpace[]): boolean {
  const pending = spaces.filter(
    s =>
      s.class === 'app' &&
      (s.app == null || s.name == null || s.name_unresolved === true) &&
      !asked.has(s.space_id)
  );
  for (const s of pending) {
    asked.add(s.space_id);
    rpc
      .call('resolve_space_name', { space_id: s.space_id })
      .catch(() => asked.delete(s.space_id)); // allow a retry on transient failure
  }
  return pending.length > 0;
}
