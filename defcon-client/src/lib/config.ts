/**
 * Baked-at-build-time config. A bare `npm run build` with no real values must
 * still produce a bundle (the page renders the hero either way — App.tsx
 * warns rather than throws), but RunANode/BrowserJoin refuse to pretend a
 * sponsor/space is configured when it isn't. See .env.production's own
 * comments for the full baked-value verification recipe.
 */
export const RPC_URL = (import.meta.env?.VITE_RPC_ENDPOINT as string | undefined)?.trim() || '';

/** The defcon34 identity's public key, hex. */
export const DEFCON_SPONSOR = (import.meta.env?.VITE_DEFCON_SPONSOR as string | undefined)?.trim() || '';

/**
 * The @defcon34:DEFCON 34 space id — MUST be the bech32m form (`sp1...`), not
 * hex, even though sibling env vars in this file are hex. See
 * .env.production's comment on VITE_DEFCON_SPACE for why: `ensureSponsored`'s
 * `requireExactScope` does a plain `===` against `offer.space_scope`, and the
 * node always returns that field bech32m-encoded for a scoped offer.
 */
export const DEFCON_SPACE = (import.meta.env?.VITE_DEFCON_SPACE as string | undefined)?.trim() || '';

export const IS_CONFIGURED = RPC_URL !== '' && DEFCON_SPONSOR !== '' && DEFCON_SPACE !== '';
