/**
 * Timestamp unit guard. Node RPCs are inconsistent about units —
 * `list_space_content` returns created_at/last_engagement in MILLISECONDS
 * while the wiki's formatters expect UNIX SECONDS. Feeding ms into a
 * seconds formatter put every Recent Changes row 56,000 years in the
 * future, which rendered as a permanent "just now" (2026-07-16 BVT).
 *
 * Any value that would be after the year 33658 when read as seconds is
 * unambiguously milliseconds; convert. Idempotent for values already in
 * seconds.
 */
export function toUnixSeconds(t: number | null | undefined): number {
  if (!t || !Number.isFinite(t)) return 0;
  return t > 1e12 ? Math.floor(t / 1000) : t;
}
