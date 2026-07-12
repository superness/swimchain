# Plan 1 — Private-Space Confidentiality: Foundation (`private` bit + crypto validators)

**Spec:** [`docs/superpowers/specs/2026-07-11-private-space-confidentiality-design.md`](../specs/2026-07-11-private-space-confidentiality-design.md)
**Phase:** 1 of 4 (Foundation → Write-enforcement → Propagation/serve-gating → Sealed-handshake)
**Status:** Ready to implement
**Date:** 2026-07-11

---

## Why this phase exists

The other three phases all need two primitives that do not exist yet:

1. **An authenticated `private` marker on every `Action`** so a node can decide *without decrypting or even fetching the content* whether a piece of content is private — and cannot be tricked by a forged marker.
2. **Reusable, tested crypto validators** that answer "is this text a well-formed `[PRIVATE:v1:]` envelope?" and "is this media blob a well-formed encrypted-media envelope?" — the exact predicates the write-side enforcement (Phase 2) and serve-gating (Phase 3) will call.

This phase adds *only* those primitives. It changes the wire format (a hard fork of the `Action` encoding) and the action signing preimage, but it deliberately **does not** yet enforce encryption on writes, gate propagation, or touch DMs. Everything here is pure, unit-testable, and independently shippable.

## Load-bearing facts (verified against the tree, 2026-07-11)

- `src/blocks/action.rs`
  - `pub const ACTION_SERIALIZED_SIZE: usize = 465;` — a **fixed-size manual byte layout** (no bincode).
  - Field layout sums exactly to 465: `action_type(1) + actor(32) + timestamp(8 BE) + content_hash(32) + parent_id(32) + pow_nonce(8 BE) + pow_work(8 BE) + pow_target(32) + signature(64) + emoji(1) + display_name_len(1) + display_name(64) + media_count(1) + media_refs(4×37=148) + replaces_pending_flag(1) + replaces_pending_hash(32)`.
  - `serialize(&self) -> [u8; ACTION_SERIALIZED_SIZE]` (line ~548) and `deserialize(data: &[u8])` (line ~640) which **hard-rejects any length != 465**.
- `src/blocks/validation.rs:314` `validate_action_signature` — the signed message is **only** `content_hash(32) || timestamp.to_le_bytes()(8)` = 40 bytes. **The `private` bit is not covered by any signature today**, so if we add it naively it is forgeable on the wire.
- `src/crypto/private_space.rs`
  - `const PRIVATE_PREFIX: &str = "[PRIVATE:v1:";` / `const PRIVATE_SUFFIX: &str = "]";` (both currently private to the module).
  - `pub fn encrypt_content_with_space_key(plaintext, key) -> String` → `[PRIVATE:v1:<base64(iv‖ct‖tag)>]`.
  - `pub fn decrypt_content_with_space_key(framed, key) -> Result<String, PrivateCryptoError>`.
  - AES-256-GCM; 12-byte IV, 16-byte tag; base64 payload.

## Key design decisions (baked into the steps below)

### D1 — Authenticate the `private` bit by folding it into the signing preimage
The bit MUST be authenticated or an attacker can flip it on the wire:
- `true→false` on genuinely-private content → tricks nodes into treating ciphertext as freely-servable public content (weakens Phase 3 gating).
- `false→true` on public content → censors/hides an arbitrary post (DoS).

Decision: extend the signed message to **`content_hash(32) || timestamp_LE(8) || private_flag(1)`** (41 bytes) for the new format. This is cheap, binds the bit to the author's key, and rides along on the hard fork we are already doing.

### D2 — Versioned deserialize with a legacy grace window
`deserialize` must accept **both** encodings during rollout:
- **466 bytes** → new format: last byte is the `private` flag (0/1); verify signature against the 41-byte preimage.
- **465 bytes** → legacy format: `private = false`; verify signature against the existing 40-byte preimage.

`serialize` always emits the new 466-byte format. This lets already-signed legacy actions still validate while the network upgrades, exactly matching the spec's "legacy aged out by decay" stance. A follow-up (post-rollout) can drop 465 support.

> ⚠️ This is a wire/consensus-visible change. It ships behind the network-coordinated rollout the spec calls for; Phases 2–4 depend on it but it is inert on its own (default `private = false` reproduces today's behaviour byte-for-byte in the signed preimage).

### D3 — Encrypted-media envelope format
Text already has `[PRIVATE:v1:]`. Media is binary, so define a parallel binary envelope with a magic header so a node can recognise encrypted media without a key:

```
magic: b"PRVM1\0"   (6 bytes)   # PRiVate Media v1
iv:    12 bytes                 # AES-256-GCM nonce
ct+tag: rest                    # ciphertext ‖ 16-byte GCM tag  (>= 16 bytes)
```

Minimum valid length = 6 + 12 + 16 = 34 bytes. The validator checks magic + minimum length only (it does not decrypt — it has no key). Actual encrypt/decrypt of media lands in Phase 2; this phase only ships the **recognizer** `is_encrypted_media_envelope(&[u8]) -> bool` and the magic constant, because Phase 3 serve-gating needs the recognizer.

### D4 — Public predicates for the text envelope
Expose `is_private_envelope(&str) -> bool` (well-formed `[PRIVATE:v1:...]` framing) from `crypto::private_space`, reusing the existing prefix/suffix constants. Phases 2 & 3 call this.

## Documentation deliverable (per user: "heavily document this feature")

This phase produces, in addition to code:
- `docs/private-spaces.md` — a new operator/developer-facing document covering: the confidentiality threat model, the `private` bit and why it is signed, the `[PRIVATE:v1:]` text envelope and `PRVM1` media envelope formats (byte-for-byte), the 465→466 hard-fork and rollout, and a "what a node can and cannot see about private content" table. Start it in this phase (formats + `private` bit) and grow it across Phases 2–4.
- Rust doc-comments (`///`) on **every** new public item (`Action.private`, each validator fn, each magic constant) explaining intent and citing the spec.
- Update `CLAUDE.md`'s module notes for `crypto/` and `blocks/` to mention the confidentiality primitives.

Documentation is a first-class step in the checklist below, not an afterthought.

---

## Implementation steps (TDD — write failing test → run (red) → implement → run (green) → commit)

> Every step is one commit. Run `cargo test --lib <module>` after each. Formatting/clippy per CLAUDE.md before each commit.

### Step 1 — `is_private_envelope` text recognizer
1. **Test (red):** in `src/crypto/private_space.rs` tests, add `is_private_envelope("[PRIVATE:v1:AAAA]") == true`, `is_private_envelope("hello") == false`, `is_private_envelope("[PRIVATE:v1:") == false` (no suffix), `is_private_envelope("[PRIVATE:v2:x]") == false`.
2. Run → fails to compile (fn missing).
3. **Implement:** `pub fn is_private_envelope(s: &str) -> bool` = starts with `PRIVATE_PREFIX` && ends with `PRIVATE_SUFFIX` && `s.len() > PREFIX.len()+SUFFIX.len()`. Doc-comment cites spec §"write-side".
4. Run → green. Commit: `feat(crypto): public is_private_envelope recognizer for private-space text`.

### Step 2 — `PRVM1` media magic + `is_encrypted_media_envelope`
1. **Test (red):** magic-prefixed 34-byte buffer → `true`; 33-byte → `false`; wrong magic → `false`; empty → `false`.
2. Run → red.
3. **Implement:** `pub const ENCRYPTED_MEDIA_MAGIC: &[u8; 6] = b"PRVM1\0";` and `pub fn is_encrypted_media_envelope(b: &[u8]) -> bool` = `b.len() >= 34 && b.starts_with(ENCRYPTED_MEDIA_MAGIC)`. Doc-comment with the byte layout from D3.
4. Green. Commit: `feat(crypto): PRVM1 encrypted-media envelope recognizer`.

### Step 3 — Add `private: bool` field to `Action` (struct + constructors, no wire change yet)
1. **Test (red):** construct an `Action` and assert `action.private == false` via the existing default/constructor path; update any struct-literal call sites the compiler flags.
2. Run → compile errors at every `Action { .. }` literal.
3. **Implement:** add `pub private: bool` to the struct with a `///` doc-comment (D1 rationale + "authenticated via signing preimage"). Default it to `false` in all constructors/builders. **Do not** touch serialize/deserialize/signing yet.
4. Green (`cargo build --all-targets`). Commit: `feat(action): add private marker field (in-memory only)`.

### Step 4 — Serialize the `private` byte → 466-byte format
1. **Test (red):** `serialize()` output `.len() == 466`; byte 465 == `1` when `private=true`, `0` when `false`.
2. Run → red (still 465).
3. **Implement:** bump `ACTION_SERIALIZED_SIZE` to `466`; write `buf[465] = self.private as u8;` at the end of `serialize`. Update the layout comment. 
4. Green. Commit: `feat(action): serialize private flag (465→466 wire bump)`.

### Step 5 — Versioned deserialize (accept 465 legacy + 466 new)
1. **Test (red):**
   - round-trip: `Action{private:true}` → serialize → deserialize → `private==true`; same for false.
   - legacy: hand-build a 465-byte buffer (old layout) → deserialize → `Ok` with `private==false`.
   - garbage length (e.g. 400) → `Err`.
2. Run → red.
3. **Implement:** change the length guard to accept `465 | 466`; read `private = if data.len()==466 { data[465]==1 } else { false }`. Keep every existing field offset identical.
4. Green. Commit: `feat(action): versioned deserialize with 465-byte legacy grace`.

### Step 6 — Fold `private` into the signing preimage (authenticate the bit)
1. **Test (red):** in `validation.rs` tests: sign an action with `private=true` using the new 41-byte preimage → `validate_action_signature` == Ok; then flip `action.private` to `false` on the signed struct → verification **fails**. Legacy 40-byte-signed action with `private=false` still verifies Ok.
2. Run → red.
3. **Implement:** build message as `content_hash(32) || timestamp_LE(8) || [private as u8]` (41 bytes) for the verify path; ensure the signer (wherever actions are signed for tests/RPC — trace callers of the 40-byte preimage) uses the same 41-byte preimage. For a `private==false` action the extra byte is `0`; to preserve legacy-signature validity, verify **41-byte first, then fall back to the 40-byte preimage** so already-signed 465-format actions still pass.
4. Green. Commit: `feat(action): authenticate private flag via signing preimage`.

> **Note for the executor:** Step 6 requires finding the *sign* side (client/RPC/test helpers building the 40-byte message) so signer and verifier agree. Grep for `to_le_bytes` + `content_hash` and for `[0u8; 40]`. If the canonical signer lives in WASM/JS (`swimchain-wasm` / clients), that becomes a tracked follow-up in Phase 2's write-path work — record it, do not silently skip.

### Step 7 — Documentation: `docs/private-spaces.md` (formats + private bit)
1. Write the doc per the Documentation deliverable above: threat model summary (link spec), `private` bit + signing, `[PRIVATE:v1:]` and `PRVM1` byte layouts, 465→466 fork + rollout note, "what a node can see" table.
2. Add the `crypto/`+`blocks/` notes to `CLAUDE.md`.
3. Commit: `docs(private-spaces): confidentiality primitives, envelope formats, wire fork`.

### Step 8 — Full-suite regression + clippy/fmt
1. `cargo test --all-targets` — confirm no existing action/block/sync test broke on the 466 bump (watch for hard-coded 465 in tests/fixtures; grep `465` repo-wide).
2. `cargo fmt --all` + clippy line from CLAUDE.md.
3. Commit any fixups: `test: adjust fixtures for 466-byte action encoding`.

## Done criteria
- [ ] `is_private_envelope`, `is_encrypted_media_envelope`, `ENCRYPTED_MEDIA_MAGIC` public + tested.
- [ ] `Action.private` field; serialize=466; deserialize accepts 465|466; round-trips.
- [ ] `private` bit authenticated by signature; flipping it post-sign fails verification; legacy sigs still validate.
- [ ] `docs/private-spaces.md` created; every new public item has a spec-citing doc-comment.
- [ ] `cargo test --all-targets`, fmt, clippy all green.

## Explicitly out of scope for Phase 1 (tracked for later phases)
- Rejecting unencrypted writes to private spaces → **Phase 2**.
- Actually encrypting media (producing `PRVM1` blobs) → **Phase 2**.
- Skipping private content in the block-receipt fetch loop (`router.rs:3931`) + member-only serving + opaque denial → **Phase 3**.
- Signed-GET fetch-auth and the sealed-sender DM handshake → **Phase 4**.

## Roadmap (subsequent plans — write after Phase 1 lands)
- **Plan 2 — Write-side enforcement:** `submit_post`/`submit_reply` reject non-`[PRIVATE:v1:]` bodies for private spaces; `upload_media` requires `PRVM1` for private; wire the `private` bit through RPC + client signers.
- **Plan 3 — Propagation & serve-gating:** membership-filter the fetch loop; member-only `handle_get`; silent-drop/opaque denial; suppress I_HAVE for private to non-members.
- **Plan 4 — Sealed-sender DM handshake:** addressless `{ephemeral_x25519_pubkey, nonce, pow, ts, sealed_ct}` + trial-decryption, replacing the graph-leaking `DmRequestAnnounce`.
