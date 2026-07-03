/**
 * Base path helper for subpath deployments (e.g. https://swimchain.io/browse).
 *
 * Next.js automatically prefixes `basePath` for <Link>, router navigation and
 * static assets, but NOT for raw <a href="/..."> tags or fetch('/api/...')
 * calls. Route all internal hrefs and same-origin fetches through withBase().
 *
 * NEXT_PUBLIC_BASE_PATH is inlined at build time and must match the
 * `basePath` configured in next.config.js (empty string when unset).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
