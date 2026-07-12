# Space-Class ID Prefix — Design Spec

**Date:** 2026-07-12
**Status:** Approved (design), pending implementation plan
**Author:** operator + Claude

## Problem

A space's *type* (social vs profile vs DM vs private vs app) is currently
inferred from its **name**: an app space is named `@wiki:Minecraft` and the
node's `parse_app_space_name` splits that back into `(app, display)`. The id is
a plain hash with **no structural marker**.

This breaks on a freshly-synced node: the node has the space *block* but has not
fetched the *name* yet (`name_unresolved`), so it cannot classify the space —
`app` comes back `null` and there is nothing in the id to fall back on. The
feed/forum/chat/search clients then either (a) hide all unresolved spaces and
show "No spaces found" on a node that holds real spaces, or (b) show everything
unresolved, leaking wiki/profile/DM/private spaces into the social browse.

Filtering on the name is fragile by construction, and it is not robust to new
space formats — every new utility type needs a new exclusion rule.

## Decision

**Every space class carries a reserved marker byte as the first byte of its
16-byte space id.** Classification reads `space_id[0]` — known the instant the
space block syncs, no name lookup, self-describing, and robust to new formats
(an unknown class byte is simply not "social").

Chosen via design Q&A: *everything gets markers* (full taxonomy, not just
social) + *reset testnet* (clean slate, no legacy grandfathering).

### Taxonomy — `space_id[0]`

| Byte | Class     | Shown by | Derivation (`space_id = BYTE ‖ H[..15]`) |
|------|-----------|----------|-------------------------------------------|
| 0x01 | SOCIAL    | feed, forum, chat, search (browse) | `H = pow_hash` |
| 0x02 | PROFILE   | direct nav only | `H = sha256("profile:v1:<pk>")` |
| 0x03 | DM        | direct nav only | `H = sha256("dm:v1:<pk1>:<pk2>")` |
| 0x04 | PRIVATE   | private-space list (membership) | `H = sha256(creator‖name‖ts_le)` |
| 0x05 | APP       | matching app client (e.g. wiki) | `H = sha256("app:<app>:v1:<display>")` |

- `H[..15]` = the existing preimage/PoW hash, truncated to 15 bytes; the class
  byte replaces byte 0. 120 bits of entropy for social/private, deterministic
  for profile/DM/app — all unchanged in character.
- The class byte is **not squattable**: it is fixed per class, and the remaining
  15 bytes still come from PoW (social) or a fixed preimage (others).
- App identity (wiki vs chess) stays in the `@app:` name as today; the class
  byte only says "this is an app space." Cross-app disambiguation in an app
  client remains name-based (acceptable — the app client is the one place a
  name lookup is cheap and expected).

## Touch points

### Node (`src/`)
1. `rpc/methods.rs::create_space` (~5607) — social path: prefix `0x01`.
2. `rpc/methods.rs::app_space_id_16` (~94) — prefix `0x05`.
3. `rpc/methods.rs` profile derivation (~2148) — prefix `0x02` (and the
   `is_own_profile_space` check must match).
4. `rpc/methods.rs` DM derivations (11489/11719/11866) + `node/router/router.rs`
   (5705) — prefix `0x03`.
5. `rpc/methods.rs::create_private_space` (~12203) — prefix `0x04`.
6. `rpc/methods.rs::list_spaces` (~5387-5450) — replace name-based hide with
   `space_id[0]` classification; expose a `class` field (and keep `is_social`
   convenience). Social browse returns SOCIAL only.
7. Validation (`blocks/validation.rs`, block builder) — reject an action whose
   `space_id[0]` is inconsistent with how the space was created (anti-spoof:
   a social id must round-trip from a `0x01`-prefixed pow_hash, etc.). Verify
   scope during planning.
8. A single shared constant module for the taxonomy + derivation helpers, so
   there is ONE source of truth in the node.

### Clients (must match node byte-for-byte)
- `lib/profile.ts::getProfileSpaceId` — feed, forum, swimchain-react (+ chat if
  present): prefix `0x02`.
- `lib/dm.ts` — feed, forum, swimchain-react, chat: prefix `0x03`.
- Any client that derives private/app/social ids locally (audit; most call the
  RPC and receive the id back — those need no change but the *filtering* does).
- Browse/list filtering in feed/forum/chat/search: filter on `class == SOCIAL`
  from `list_spaces`, remove the name-based hide + the `name_unresolved`
  workaround entirely.
- wiki `useWikiNamespaces`: filter on `class == APP` (+ `@wiki:` name).

### Migration / rollout
1. Bump a space-scheme version marker (for wire/debug clarity).
2. **Reset testnet:** wipe genesis + seed-droplet + bot node data dirs,
   re-genesis, bot re-seeds demo spaces under the new scheme.
3. Rebuild + redeploy node to both droplets (167.71.241.252, 165.22.47.107).
4. Rebuild all clients + the mobile-app release APK; refresh the GitHub release.
5. Revert the interim `useRpc.tsx` "show name_unresolved spaces" patch
   (commit 8e0da061) — the class prefix supersedes it.

## Non-goals
- Backward compatibility with legacy (pre-prefix) space ids — testnet reset
  makes this moot. Mainnet is not live.
- Encoding the specific app (wiki/chess) into the id — stays name-based.

## Open questions for planning
- Exact anti-spoof validation rules per class in the block builder.
- Whether `list_spaces` should filter server-side to SOCIAL or return `class`
  and let clients filter (leaning: return `class`, filter client-side, since
  tools/analytics want all classes).
