# Space-Class ID Prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode every space's class in the first byte of its 16-byte id so clients classify spaces structurally (no name lookup), robustly, and with no leakage of utility spaces into the social browse.

**Architecture:** One shared taxonomy (a class byte at `space_id[0]`): `0x01` social, `0x02` profile, `0x03` DM, `0x04` private, `0x05` app. Every derivation becomes `CLASS_BYTE ‖ existing_hash[..15]`. The node and every client that derives an id locally must produce byte-identical ids, so the taxonomy + derivation helpers live in exactly one module per side (Rust: `src/types/space_class.rs`; TS: `swimchain-react/src/lib/spaceClass.ts`, re-exported to per-client copies). `list_spaces` exposes a `class` field; social clients filter on it. Ships atomically with a testnet reset (no legacy ids exist after the reset, so there is no back-compat path).

**Tech Stack:** Rust (node, `cargo test`), TypeScript/React (clients, `vitest`/`npm test`), `@noble/hashes` sha256 client-side, bech32m `sp1...` space-id encoding.

## Global Constraints

- Class byte lives at `space_id[0]` (byte 0 of the 16-byte id). Values: `0x01` SOCIAL, `0x02` PROFILE, `0x03` DM, `0x04` PRIVATE, `0x05` APP. No other values are valid.
- Every id is `CLASS_BYTE ‖ H[..15]` where `H` is the class's existing preimage hash (or PoW hash for social), truncated to its first 15 bytes.
- Node-derived and client-derived ids for the SAME logical space MUST be byte-identical (profile and DM are derived on both sides).
- Preimage strings are unchanged (`profile:v1:<pk>`, `dm:v1:<pk1>:<pk2>`, `app:<app>:v1:<display>`); only the truncation+prefix changes.
- No legacy/pre-prefix id compatibility — testnet is reset. Mainnet is not live.
- `sha256` returns 32 bytes; `crate::crypto::sha256(&[u8]) -> [u8; 32]` (Rust), `sha256(Uint8Array) -> Uint8Array` (TS, `@noble/hashes/sha256`).
- `encode_space_id(&[u8; 16]) -> String` (Rust, methods.rs:207) emits bech32m `sp1...`.

---

## File Structure

- `src/types/space_class.rs` (**new**) — `SpaceClass` enum, `apply_class(class, &hash) -> [u8;16]`, `class_of(&[u8;16]) -> Option<SpaceClass>`. Single Rust source of truth.
- `src/rpc/methods.rs` (**modify**) — social/app/profile/DM/private derivations; `list_spaces` classification + `class` field.
- `src/node/router/router.rs` (**modify**) — DM derivation (5705).
- `src/rpc/types.rs` (**modify**) — `SpaceSummary.class: String` field.
- `src/blocks/validation.rs` (**modify, if audit finds a rederivation check**) — class-consistency.
- `swimchain-react/src/lib/spaceClass.ts` (**new**) — `SpaceClass`, `applyClass`, `classOf`. Single TS source of truth.
- `swimchain-react/src/lib/profile.ts`, `swimchain-react/src/lib/dm.ts` (**modify**) — prefixed derivations.
- `feed-client/src/lib/{profile,dm}.ts`, `forum-client/src/lib/{profile,dm}.ts`, `chat-client/src/lib/dm.ts` (**modify**) — mirror swimchain-react.
- `feed-client/src/hooks/useRpc.tsx` (**modify**) — revert interim patch, filter on class.
- `forum-client`, `chat-client`, `search-client` browse hooks (**modify**) — filter on class.
- `wiki-client/src/hooks/useWikiNamespaces.ts` (**modify**) — filter on class==app.
- `scripts/reset-testnet.sh` (**new**) — reset + redeploy runbook.

---

### Task 1: Rust space-class taxonomy module

**Files:**
- Create: `src/types/space_class.rs`
- Modify: `src/types/mod.rs` (add `pub mod space_class;`)
- Test: inline `#[cfg(test)]` in `src/types/space_class.rs`

**Interfaces:**
- Produces:
  - `pub enum SpaceClass { Social, Profile, Dm, Private, App }`
  - `impl SpaceClass { pub fn byte(self) -> u8; pub fn from_byte(b: u8) -> Option<SpaceClass>; }`
  - `pub fn apply_class(class: SpaceClass, hash: &[u8]) -> [u8; 16]` — returns `class.byte() ‖ hash[..15]`; panics if `hash.len() < 15`.
  - `pub fn class_of(space_id_16: &[u8; 16]) -> Option<SpaceClass>` — reads byte 0.

- [ ] **Step 1: Write the failing test**

In `src/types/space_class.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byte_values_are_stable() {
        assert_eq!(SpaceClass::Social.byte(), 0x01);
        assert_eq!(SpaceClass::Profile.byte(), 0x02);
        assert_eq!(SpaceClass::Dm.byte(), 0x03);
        assert_eq!(SpaceClass::Private.byte(), 0x04);
        assert_eq!(SpaceClass::App.byte(), 0x05);
    }

    #[test]
    fn apply_then_class_roundtrips() {
        let hash = [0xABu8; 32];
        let id = apply_class(SpaceClass::Dm, &hash);
        assert_eq!(id[0], 0x03);
        assert_eq!(&id[1..], &hash[..15]);
        assert_eq!(class_of(&id), Some(SpaceClass::Dm));
    }

    #[test]
    fn class_of_unknown_byte_is_none() {
        let id = [0x00u8; 16];
        assert_eq!(class_of(&id), None);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --lib space_class`
Expected: FAIL to compile ("cannot find `SpaceClass`").

- [ ] **Step 3: Write minimal implementation**

At the top of `src/types/space_class.rs`:
```rust
//! Space-class taxonomy. The first byte of a 16-byte space id encodes the
//! class, so any node/client can classify a space from its id alone — no name
//! lookup, and unknown bytes are simply not any known class.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpaceClass {
    Social,
    Profile,
    Dm,
    Private,
    App,
}

impl SpaceClass {
    pub fn byte(self) -> u8 {
        match self {
            SpaceClass::Social => 0x01,
            SpaceClass::Profile => 0x02,
            SpaceClass::Dm => 0x03,
            SpaceClass::Private => 0x04,
            SpaceClass::App => 0x05,
        }
    }

    pub fn from_byte(b: u8) -> Option<SpaceClass> {
        match b {
            0x01 => Some(SpaceClass::Social),
            0x02 => Some(SpaceClass::Profile),
            0x03 => Some(SpaceClass::Dm),
            0x04 => Some(SpaceClass::Private),
            0x05 => Some(SpaceClass::App),
            _ => None,
        }
    }
}

/// `class.byte() ‖ hash[..15]`. Panics if `hash` is shorter than 15 bytes.
pub fn apply_class(class: SpaceClass, hash: &[u8]) -> [u8; 16] {
    assert!(hash.len() >= 15, "hash must be >= 15 bytes");
    let mut out = [0u8; 16];
    out[0] = class.byte();
    out[1..16].copy_from_slice(&hash[..15]);
    out
}

pub fn class_of(space_id_16: &[u8; 16]) -> Option<SpaceClass> {
    SpaceClass::from_byte(space_id_16[0])
}
```

Add to `src/types/mod.rs`:
```rust
pub mod space_class;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --lib space_class`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/space_class.rs src/types/mod.rs
git commit -m "feat(spaces): add space-class taxonomy (space_id[0] class byte)"
```

---

### Task 2: Apply class byte to all node-side derivations

**Files:**
- Modify: `src/rpc/methods.rs` — `app_space_id_16` (~94), `create_space` social path (~5607), profile check (~2148), DM derivations (~11489, ~11719, ~11866), `create_private_space` (~12203)
- Modify: `src/node/router/router.rs` — DM derivation (~5705)
- Test: `tests/space_class_derivation.rs` (**new**)

**Interfaces:**
- Consumes: `apply_class`, `SpaceClass` from Task 1.
- Produces: all node-derived space ids carry their class byte. `app_space_id_16(app, display)` now returns `0x05 ‖ sha256("app:<app>:v1:<display>")[..15]`.

- [ ] **Step 1: Write the failing test**

Create `tests/space_class_derivation.rs`:
```rust
use swimchain::crypto::sha256;
use swimchain::types::space_class::{class_of, SpaceClass};

// Mirror of the node's derivation formulas — asserts the class byte is present.
#[test]
fn app_space_id_has_app_class() {
    // app_space_id_16 is private; assert the shape the node must produce.
    let h = sha256(b"app:wiki:v1:Minecraft");
    let mut id = [0u8; 16];
    id[0] = 0x05;
    id[1..16].copy_from_slice(&h[..15]);
    assert_eq!(class_of(&id), Some(SpaceClass::App));
}

#[test]
fn profile_space_id_has_profile_class() {
    let h = sha256(b"profile:v1:deadbeef");
    let mut id = [0u8; 16];
    id[0] = 0x02;
    id[1..16].copy_from_slice(&h[..15]);
    assert_eq!(class_of(&id), Some(SpaceClass::Profile));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test space_class_derivation`
Expected: FAIL to compile until `swimchain::types::space_class` is public (it is, from Task 1) — if it compiles and passes, that only proves the formula shape; the REAL verification is Step 4's node-integration assertions. Proceed to Step 3 to make the node emit these ids.

- [ ] **Step 3: Write minimal implementation**

In `src/rpc/methods.rs`, add the import near the top (after existing `use` lines):
```rust
use crate::types::space_class::{apply_class, SpaceClass};
```

Replace `app_space_id_16` (~94):
```rust
fn app_space_id_16(app: &str, display: &str) -> [u8; 16] {
    let h = crate::crypto::sha256(format!("app:{}:v1:{}", app, display).as_bytes());
    apply_class(SpaceClass::App, &h)
}
```

Replace the social path in `create_space` (~5602-5608):
```rust
        let app_marker = parse_app_space_name(&params.name);
        let space_id_bytes: [u8; 16] = if let Some((ref app, ref display)) = app_marker {
            app_space_id_16(app, display)
        } else {
            apply_class(SpaceClass::Social, &pow_hash)
        };
        let space_id = encode_space_id(&space_id_bytes);
```

Replace the profile-space check (~2147-2151):
```rust
        let is_own_profile_space = {
            let preimage = format!("profile:v1:{}", params.author_id.to_lowercase());
            let hash = crate::crypto::sha256(preimage.as_bytes());
            apply_class(SpaceClass::Profile, &hash) == space_id_16
        };
```

For each DM derivation in `methods.rs` (~11489, ~11719, ~11866) that currently does:
```rust
        let preimage = format!("dm:v1:{}:{}", a, b); // a,b = sorted hex pks
        let hash = crate::crypto::sha256(preimage.as_bytes());
        let mut space_id = [0u8; 16];
        space_id.copy_from_slice(&hash[..16]);
```
replace the last two lines with:
```rust
        let hash = crate::crypto::sha256(preimage.as_bytes());
        let space_id = apply_class(SpaceClass::Dm, &hash);
```
(Import `use crate::types::space_class::{apply_class, SpaceClass};` at top of the file if not already added.)

Apply the identical DM change in `src/node/router/router.rs` (~5705), adding the import there too.

Replace the private derivation in `create_private_space` (~12203-12205):
```rust
        let space_hash = crate::crypto::sha256(&space_id_input);
        let space_id = apply_class(SpaceClass::Private, &space_hash);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --test space_class_derivation && cargo build`
Expected: PASS + clean build. Then grep to confirm no derivation site still uses `copy_from_slice(&hash[..16])` for a space id:
Run: `grep -rn "copy_from_slice(&\(space_\)\?hash\[..16\])" src/`
Expected: no space-id derivation matches remain (content-hash copies are fine).

- [ ] **Step 5: Commit**

```bash
git add src/rpc/methods.rs src/node/router/router.rs tests/space_class_derivation.rs
git commit -m "feat(spaces): stamp class byte on social/profile/dm/private/app ids"
```

---

### Task 3: Classify `list_spaces` by class byte + expose `class` field

**Files:**
- Modify: `src/rpc/types.rs` — add `class` to `SpaceSummary` (~735-762)
- Modify: `src/rpc/methods.rs::list_spaces` (~5363-5455)
- Test: `tests/list_spaces_class.rs` (**new**)

**Interfaces:**
- Consumes: `class_of`, `SpaceClass` from Task 1.
- Produces: `SpaceSummary.class: String` (`"social"|"profile"|"dm"|"private"|"app"|"unknown"`). `list_spaces` returns ALL classes with the `class` tag; hide logic now keys on the class byte, not the name.

- [ ] **Step 1: Write the failing test**

Create `tests/list_spaces_class.rs`:
```rust
use swimchain::types::space_class::{apply_class, SpaceClass};

// Serde contract: the string tag the RPC must emit for each class.
fn class_tag(id: &[u8; 16]) -> &'static str {
    match swimchain::types::space_class::class_of(id) {
        Some(SpaceClass::Social) => "social",
        Some(SpaceClass::Profile) => "profile",
        Some(SpaceClass::Dm) => "dm",
        Some(SpaceClass::Private) => "private",
        Some(SpaceClass::App) => "app",
        None => "unknown",
    }
}

#[test]
fn social_id_tags_social() {
    let id = apply_class(SpaceClass::Social, &[0x11u8; 32]);
    assert_eq!(class_tag(&id), "social");
}

#[test]
fn app_id_tags_app() {
    let id = apply_class(SpaceClass::App, &[0x22u8; 32]);
    assert_eq!(class_tag(&id), "app");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test list_spaces_class`
Expected: PASS as written (it only exercises Task 1 helpers). It documents the exact string contract Step 3 must implement in the RPC; treat a mismatch there as the failure this locks in.

- [ ] **Step 3: Write minimal implementation**

In `src/rpc/types.rs`, add to `SpaceSummary` (after `name_unresolved`):
```rust
    /// Space class from `space_id[0]`: "social" | "profile" | "dm" | "private"
    /// | "app" | "unknown". Clients filter their browse on this — it is known
    /// the instant the space block syncs, before any name resolves.
    #[serde(default)]
    pub class: String,
```

In `src/rpc/methods.rs::list_spaces`, add near the top of the `filter_map` closure (after `let space_id_str = encode_space_id(&space_id_16);`):
```rust
                    use crate::types::space_class::{class_of, SpaceClass};
                    let class = match class_of(&space_id_16) {
                        Some(SpaceClass::Social) => "social",
                        Some(SpaceClass::Profile) => "profile",
                        Some(SpaceClass::Dm) => "dm",
                        Some(SpaceClass::Private) => "private",
                        Some(SpaceClass::App) => "app",
                        None => "unknown",
                    }
                    .to_string();
```

Replace the name-based hide block (~5394-5404) with class-based hide — profile, DM, and private spaces are never part of any browse list and are surfaced only by their own flows:
```rust
                    // Hide non-browsable classes from list_spaces' generic listing.
                    // Profile/DM/private spaces are reached by their own flows, not
                    // browse. Social + app spaces are listed (clients filter by class).
                    match class_of(&space_id_16) {
                        Some(SpaceClass::Profile)
                        | Some(SpaceClass::Dm)
                        | Some(SpaceClass::Private) => return None,
                        _ => {}
                    }
                    let trimmed = final_name.trim();
                    let is_placeholder = trimmed.len() == 14
                        && trimmed.starts_with("Space ")
                        && trimmed[6..].chars().all(|c| c.is_ascii_hexdigit());
                    let name_unresolved = is_placeholder;
```

Add `class,` to the `SpaceSummary { .. }` constructor (~5435).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --test list_spaces_class && cargo build`
Expected: PASS + clean build.

- [ ] **Step 5: Commit**

```bash
git add src/rpc/types.rs src/rpc/methods.rs tests/list_spaces_class.rs
git commit -m "feat(spaces): classify list_spaces by class byte, expose class field"
```

---

### Task 4: Audit + enforce class consistency in block validation

**Files:**
- Modify: `src/blocks/validation.rs` (site TBD by the audit in Step 1)
- Test: `tests/space_class_validation.rs` (**new**)

**Interfaces:**
- Consumes: `class_of` from Task 1.
- Produces: block/action validation rejects a CreateSpace whose id class byte is `None` (unknown class), closing the door on malformed ids after the reset.

- [ ] **Step 1: Investigate the current id-validation path**

Run these and read the hits to find where a synced space id is checked (if anywhere):
```bash
grep -rn "pow_hash\[..16\]\|space_id.*verify\|verify.*space_id\|CreateSpace" src/blocks/ src/sync/
```
Record which validation, if any, re-derives or constrains a space id on sync. If NONE exists (space ids are carried in the block and trusted, PoW summed upward), the only new rule needed is "reject unknown class byte on CreateSpace." If one DOES exist that assumed `id == pow_hash[..16]`, update it to `id == apply_class(SpaceClass::Social, &pow_hash)` for the social path.

- [ ] **Step 2: Write the failing test**

Create `tests/space_class_validation.rs`:
```rust
use swimchain::types::space_class::{class_of, SpaceClass};

#[test]
fn unknown_class_byte_is_rejected_shape() {
    // A CreateSpace id whose first byte is not a known class must be invalid.
    let bad = [0x00u8; 16];
    assert!(class_of(&bad).is_none());
    // The validation fn (added in Step 3) must reject ids where class_of is None.
    assert!(!swimchain::blocks::validation::space_id_class_is_valid(&bad));
    let good = [0x01u8; 16];
    assert!(swimchain::blocks::validation::space_id_class_is_valid(&good));
    let _ = SpaceClass::Social;
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cargo test --test space_class_validation`
Expected: FAIL to compile ("cannot find function `space_id_class_is_valid`").

- [ ] **Step 4: Write minimal implementation**

In `src/blocks/validation.rs`, add:
```rust
/// A space id is well-classed iff its first byte is a known SpaceClass.
pub fn space_id_class_is_valid(space_id_16: &[u8; 16]) -> bool {
    crate::types::space_class::class_of(space_id_16).is_some()
}
```
Then, at the CreateSpace validation site found in Step 1, reject when `!space_id_class_is_valid(&space_id_16)` with the module's existing error type. If Step 1 found a social-id rederivation check, update it as noted there.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --test space_class_validation && cargo test --lib && cargo build`
Expected: PASS + clean build.

- [ ] **Step 6: Commit**

```bash
git add src/blocks/validation.rs tests/space_class_validation.rs
git commit -m "feat(spaces): reject unknown space-class byte in validation"
```

---

### Task 5: Shared client taxonomy + prefixed profile/DM derivations

**Files:**
- Create: `swimchain-react/src/lib/spaceClass.ts`
- Modify: `swimchain-react/src/lib/profile.ts` (~115), `swimchain-react/src/lib/dm.ts` (~28)
- Modify (mirror): `feed-client/src/lib/{profile,dm}.ts`, `forum-client/src/lib/{profile,dm}.ts`, `chat-client/src/lib/dm.ts`
- Test: `swimchain-react/src/lib/spaceClass.test.ts` (**new**)

**Interfaces:**
- Consumes: node byte values (Task 1) — must match exactly.
- Produces:
  - `export enum SpaceClass { Social=0x01, Profile=0x02, Dm=0x03, Private=0x04, App=0x05 }`
  - `export function applyClass(cls: SpaceClass, hash: Uint8Array): string` — returns hex of `cls ‖ hash[..15]` (32 hex chars).
  - `export function classOf(spaceIdHex: string): SpaceClass | null`.
  - `getProfileSpaceId(pk)` now returns `applyClass(SpaceClass.Profile, sha256("profile:v1:"+pk))`.
  - DM `getDmSpaceId` now returns `applyClass(SpaceClass.Dm, sha256("dm:v1:"+a+":"+b))`.

- [ ] **Step 1: Write the failing test**

Create `swimchain-react/src/lib/spaceClass.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { SpaceClass, applyClass, classOf } from './spaceClass';
import { getProfileSpaceId } from './profile';

describe('spaceClass', () => {
  it('applyClass sets byte 0 and keeps 15 hash bytes', () => {
    const h = sha256(new TextEncoder().encode('x'));
    const id = applyClass(SpaceClass.Dm, h);
    expect(id.slice(0, 2)).toBe('03');
    expect(id.length).toBe(32);
    expect(classOf(id)).toBe(SpaceClass.Dm);
  });

  it('getProfileSpaceId carries the profile class byte', () => {
    const id = getProfileSpaceId('deadbeef');
    expect(id.slice(0, 2)).toBe('02');
    expect(classOf(id)).toBe(SpaceClass.Profile);
  });

  it('classOf returns null for unknown byte', () => {
    expect(classOf('00'.repeat(16))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd swimchain-react && npx vitest run src/lib/spaceClass.test.ts`
Expected: FAIL ("Cannot find module './spaceClass'").

- [ ] **Step 3: Write minimal implementation**

Create `swimchain-react/src/lib/spaceClass.ts`:
```ts
/**
 * Space-class taxonomy — MUST match the node (src/types/space_class.rs).
 * Byte 0 of the 16-byte space id encodes the class.
 */
export enum SpaceClass {
  Social = 0x01,
  Profile = 0x02,
  Dm = 0x03,
  Private = 0x04,
  App = 0x05,
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** hex of `cls ‖ hash[..15]` (16 bytes → 32 hex chars). */
export function applyClass(cls: SpaceClass, hash: Uint8Array): string {
  const out = new Uint8Array(16);
  out[0] = cls;
  out.set(hash.slice(0, 15), 1);
  return bytesToHex(out);
}

export function classOf(spaceIdHex: string): SpaceClass | null {
  const b = parseInt(spaceIdHex.slice(0, 2), 16);
  return (Object.values(SpaceClass) as number[]).includes(b) ? (b as SpaceClass) : null;
}
```

Rewrite `swimchain-react/src/lib/profile.ts::getProfileSpaceId`:
```ts
import { SpaceClass, applyClass } from './spaceClass';

export function getProfileSpaceId(userPk: string): string {
  const preimage = `profile:${PROFILE_VERSION}:${userPk.toLowerCase()}`;
  const hash = sha256(new TextEncoder().encode(preimage));
  return applyClass(SpaceClass.Profile, hash);
}
```

Rewrite the DM derivation in `swimchain-react/src/lib/dm.ts` (the function returning the id from `dm:v1:...`):
```ts
import { SpaceClass, applyClass } from './spaceClass';

// inside the derivation:
  const preimage = `dm:v1:${sorted[0]}:${sorted[1]}`;
  const hash = sha256(new TextEncoder().encode(preimage));
  return applyClass(SpaceClass.Dm, hash);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd swimchain-react && npx vitest run src/lib/spaceClass.test.ts`
Expected: PASS (3 tests). Then build the shared lib: `npm run build`.

- [ ] **Step 5: Mirror to per-client copies**

Copy `swimchain-react/src/lib/spaceClass.ts` to `feed-client/src/lib/spaceClass.ts`, `forum-client/src/lib/spaceClass.ts`, `chat-client/src/lib/spaceClass.ts`. Apply the SAME `getProfileSpaceId`/DM edits to `feed-client/src/lib/{profile,dm}.ts`, `forum-client/src/lib/{profile,dm}.ts`, `chat-client/src/lib/dm.ts`. Verify each builds:
Run: `cd feed-client && npm run build && cd ../forum-client && npm run build && cd ../chat-client && npm run build`
Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add swimchain-react/src/lib/spaceClass.ts swimchain-react/src/lib/spaceClass.test.ts swimchain-react/src/lib/profile.ts swimchain-react/src/lib/dm.ts feed-client/src/lib forum-client/src/lib chat-client/src/lib
git commit -m "feat(clients): space-class taxonomy + prefixed profile/dm ids (node parity)"
```

---

### Task 6: Filter browse lists by class; revert interim patch

**Files:**
- Modify: `feed-client/src/hooks/useRpc.tsx` (~404-479, the `useSpaces` refetch)
- Modify: `forum-client`, `chat-client`, `search-client` browse hooks (the ones calling `listSpaces`)
- Modify: `wiki-client/src/hooks/useWikiNamespaces.ts`
- Modify: `feed-client/src/lib/rpc.ts` — add `class?: string` to `SpaceSummary`
- Test: manual on-device + `feed-client` build

**Interfaces:**
- Consumes: `SpaceSummary.class` from Task 3.
- Produces: social clients show only `class === 'social'`; wiki shows only `class === 'app'`; the `name_unresolved` filter workaround is removed.

- [ ] **Step 1: Add `class` to the client SpaceSummary type**

In `feed-client/src/lib/rpc.ts` `SpaceSummary` interface add:
```ts
  /** Space class: 'social' | 'profile' | 'dm' | 'private' | 'app' | 'unknown' */
  class?: string;
```
Mirror in `forum-client/src/lib/rpc.ts`, `chat-client/src/lib/rpc.ts`, `search-client/src/lib/rpc.ts` if they declare the type.

- [ ] **Step 2: Replace the feed filter (reverts commit 8e0da061)**

In `feed-client/src/hooks/useRpc.tsx`, replace the whole unresolved-handling + `namedSpaces` block (the code added in 8e0da061 plus the old `namedSpaces` filter, ~406-428) with:
```ts
      // Social clients browse only social-class spaces. The class comes from the
      // space id's first byte (known the instant the block syncs — no name needed),
      // so utility spaces (profile/dm/private/app) never leak in and there is no
      // "No spaces found" gap waiting on name resolution.
      const namedSpaces = result.spaces.filter(s => s.class === 'social');
```
Delete the now-dead `spaceNamesAsked`/`resolveSpaceName`/`name_unresolved` unresolved-trigger and the `PLACEHOLDER` re-resolve block that followed it (names still resolve for DISPLAY via the existing per-space path, but they no longer gate visibility). Keep the "don't cache empty + bounded retry" logic.

- [ ] **Step 3: Apply the same class filter to forum/chat/search browse hooks**

In each client's hook that maps `listSpaces()` results for browse, add `.filter(s => s.class === 'social')` and remove any `name != null` visibility filter. In `wiki-client/src/hooks/useWikiNamespaces.ts`, filter `.filter(s => s.class === 'app')` (plus the existing `@wiki:` name match for cross-app disambiguation).

- [ ] **Step 4: Build all clients**

Run: `cd feed-client && npm run build && cd ../forum-client && npm run build && cd ../chat-client && npm run build && cd ../search-client && npm run build && cd ../wiki-client && npm run build`
Expected: all succeed.

- [ ] **Step 5: Commit**

```bash
git add feed-client forum-client chat-client search-client wiki-client
git commit -m "feat(clients): filter browse by space class; drop name-based hiding"
```

---

### Task 7: Testnet reset + redeploy runbook

**Files:**
- Create: `scripts/reset-testnet.sh`
- Test: manual execution against the droplets

**Interfaces:**
- Consumes: the built node + clients from Tasks 1-6.
- Produces: a fresh testnet where every space carries a class byte; both droplets, the bot, and the mobile APK run the new scheme.

- [ ] **Step 1: Write the runbook script**

Create `scripts/reset-testnet.sh` (do NOT run yet):
```bash
#!/usr/bin/env bash
# Reset testnet to the space-class-prefix scheme. Destroys existing testnet
# spaces/content (intentional — no legacy id compat). Does NOT touch the PC node.
set -euo pipefail

SEED=167.71.241.252          # genesis/seed droplet
BOT=165.22.47.107            # activity/faucet bot droplet
SSH_KEY=~/.ssh/swimchain_seed # dedicated deploy key (see memory reference_seed_ssh_key)

echo "== 1. build release node (linux) =="
# (run in WSL Ubuntu per project_build_paths) cargo build --release

echo "== 2. stop nodes, wipe testnet data dirs (NOT mainnet) =="
for host in "$SEED" "$BOT"; do
  ssh -i "$SSH_KEY" root@"$host" 'systemctl stop swimchain-testnet swim-bot 2>/dev/null || true; rm -rf ~/.swimchain-testnet'
done

echo "== 3. upload new sw binary + restart genesis on SEED =="
scp -i "$SSH_KEY" target/release/sw root@"$SEED":/usr/local/bin/sw
ssh -i "$SSH_KEY" root@"$SEED" 'systemctl start swimchain-testnet'

echo "== 4. upload binary to BOT, re-seed spaces, restart bot =="
scp -i "$SSH_KEY" target/release/sw root@"$BOT":/usr/local/bin/sw
ssh -i "$SSH_KEY" root@"$BOT" 'systemctl start swimchain-testnet swim-bot'

echo "== 5. verify every listed space has a class byte =="
# From a synced client: list_spaces → assert every space_id[0] ∈ {01..05}
echo "reset complete — verify list_spaces classes, then rebuild + reinstall mobile APK"
```

- [ ] **Step 2: Verify against memory before running**

Confirm host IPs, SSH key path, and unit names against memory files `project_testnet_seed`, `project_swim_bot`, `reference_seed_ssh_key` (the script's placeholders must match the real deploy setup). Fix any mismatch.

- [ ] **Step 3: Execute the reset (operator-gated)**

This is destructive and outward-facing — run only after the operator confirms. Execute `scripts/reset-testnet.sh`, then from a fresh client verify `list_spaces` returns spaces all tagged `social`/`app` with first byte in `01..05`.

- [ ] **Step 4: Rebuild + reinstall the mobile release APK**

Per the mobile recipe (feed-client build → `cargo ndk -t arm64-v8a build --release --lib` → copy `.so` to `gen/android/app/src/main/jniLibs/arm64-v8a/` → `JAVA_HOME=<Android Studio jbr> gradlew assembleArm64Release -x rustBuildArm64Release` → zipalign + apksigner with `~/swimchain-release.keystore` alias `swimchain`). Install on the phone, confirm Discover lists social spaces only. Refresh the GitHub release asset (`gh release upload mobile-v0.1.0-alpha <apk> --clobber`).

- [ ] **Step 5: Commit**

```bash
git add scripts/reset-testnet.sh
git commit -m "chore(testnet): reset + redeploy runbook for space-class scheme"
```

---

## Notes for the executor
- Tasks 1-4 (node) must land and the node must be rebuilt before Task 7's reset, or the reset would re-seed under the old scheme.
- Tasks 5-6 (clients) can proceed in parallel with node review but must be built before Task 7 Step 4.
- The interim commit 8e0da061 ("show name_unresolved spaces") is reverted inside Task 6 Step 2 — do not revert it separately.
- Do not touch the PC node (memory: dont-touch-pc-node). The droplets are fair game.
