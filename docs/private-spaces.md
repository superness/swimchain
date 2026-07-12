# Private Spaces — Node-Enforced Confidentiality

> **Status:** Phases 1 (Foundation) and 2 (write-side enforcement) landed. Serve-gating
> and the sealed-sender DM handshake follow in Phases 3–4. See the design spec at
> [`docs/superpowers/specs/2026-07-11-private-space-confidentiality-design.md`](superpowers/specs/2026-07-11-private-space-confidentiality-design.md)
> and the Phase 1 plan at
> [`docs/superpowers/plans/2026-07-11-private-space-confidentiality-foundation.md`](superpowers/plans/2026-07-11-private-space-confidentiality-foundation.md).

Swimchain is serverless: every node stores and re-serves content it has seen. That
"view-to-host" model is what makes public content censorship-resistant — and it is exactly
what makes **private** content dangerous if handled naively. A private post is only as
private as the weakest node that can be tricked into serving its bytes.

This document describes how the node enforces confidentiality for private spaces so that
**content is unreadable to non-members and, where possible, un-fetchable by them** — for
text *and* images alike.

## Threat model

What a private space must protect against:

| Adversary capability | Must NOT be able to |
|---|---|
| Runs a node, syncs the chain | Read private text or media (it is ciphertext at rest and in flight) |
| Guesses / acquires a private `content_id` | Obtain usable plaintext by requesting it from the network |
| Requests private content it isn't a member of | Learn *whether* the content exists, or that it was denied (opaque denial — Phase 3) |
| Observes DM setup traffic | Learn who is talking to whom (sealed-sender handshake — Phase 4) |

Explicit **non-goals** (out of scope): global traffic-analysis resistance (timing,
volume, connection graph at the transport layer), and any change to *public*-content
behaviour. Tor/proxy transport (SWIM-PRIV-2) addresses network-level metadata separately.

## The `private` marker on every action

Every on-chain action now carries an authenticated 1-bit `private` marker
(`Action.private`, `src/blocks/action.rs`). It lets a node classify content as private
**without decrypting it or even fetching the body** — which is what makes member-only
propagation and serving (Phase 3) possible.

### Why it must be signed

The marker is security-critical, so it is **folded into the signature preimage**. If it
were an unauthenticated wire bit, an attacker could flip it in transit:

- `private → public`: trick nodes into treating ciphertext as freely-servable public
  content, defeating serve-gating.
- `public → private`: mark someone else's public post as private so nodes refuse to serve
  it — targeted censorship.

The action signing preimage (`src/blocks/validation.rs::validate_action_signature`) is
therefore:

```
v2 (current):  content_hash(32) || timestamp_LE(8) || private(1)   = 41 bytes
v1 (legacy):   content_hash(32) || timestamp_LE(8)                 = 40 bytes
```

A **v1 (legacy) signature is accepted only for a public action** (`private == false`). A
private action can never authenticate under the flag-less v1 preimage, so the flag cannot
be stripped by downgrading to the old format.

## Content envelopes

The node recognizes encrypted content structurally, without holding any key, via two
recognizers in `src/crypto/private_space.rs`:

### Text — `[PRIVATE:v1:…]`

Private text is AES-256-GCM ciphertext, base64-encoded, wrapped in a printable frame that
is byte-for-byte interop-compatible with the browser clients:

```
[PRIVATE:v1:<base64(iv(12) || ciphertext || gcm_tag(16))>]
```

`is_private_envelope(&str)` returns true for a well-formed frame (structural check only —
it does not decrypt).

### Media — `PRVM1` binary envelope

Media is binary, so it uses a fixed magic header instead of a printable frame:

```
magic:  "PRVM1\0"   (6 bytes)   # PRiVate Media, v1
iv:     12 bytes                 # AES-256-GCM nonce
ct+tag: >= 16 bytes              # ciphertext || 16-byte GCM tag
                                 # minimum total length = 34 bytes
```

`is_encrypted_media_envelope(&[u8])` (magic + `ENCRYPTED_MEDIA_MAGIC`) returns true for a
well-formed blob. The recognizer never decrypts — a serving node uses it only to classify
a blob as private.

## Wire fork: action encoding 465 → 466 bytes

Actions use a fixed-size manual byte layout. Adding the trailing `private` byte grew the
encoding from **465 to 466 bytes** (`ACTION_SERIALIZED_SIZE`), a hard fork of the action
format.

To keep the network functioning through a coordinated rollout:

- `Action::serialize` always emits the **466-byte** layout.
- `Action::deserialize` accepts **both** 466-byte (new) and 465-byte
  (`ACTION_SERIALIZED_SIZE_LEGACY`) buffers. A legacy 465-byte action decodes as
  `private = false` and validates under the v1 signing fallback.

Legacy (pre-fork) private content, which predates node-level enforcement, is not
retroactively protected; it ages out under normal decay (7-day half-life; 4 h if
spam-flagged). Going forward, writes to private spaces must be encrypted (Phase 2).

## What a node can and cannot see about private content

| | Public content | Private content (post-enforcement) |
|---|---|---|
| Action metadata (actor, timestamp, PoW, `private` bit) | visible | visible |
| Content body bytes | plaintext | **ciphertext only** (`[PRIVATE:v1:]` / `PRVM1`) |
| Content plaintext (text or image) | readable by anyone | readable **only by members** (hold the space key) |
| Can a non-member fetch the bytes? | yes | **no** — served to members only; denial is opaque (Phase 3) |
| Is the content served/re-hosted by all nodes? | yes | no — member nodes only (Phase 3) |
| DM participants (who↔whom) | n/a | hidden via sealed-sender handshake (Phase 4) |

## Where this lives in the code

- `src/blocks/action.rs` — `Action.private`, `ACTION_SERIALIZED_SIZE` (466),
  `ACTION_SERIALIZED_SIZE_LEGACY` (465), serialize/deserialize.
- `src/blocks/validation.rs` — `validate_action_signature` (v2 preimage + v1 fallback).
- `src/crypto/private_space.rs` — envelope crypto and the `is_private_envelope` /
  `is_encrypted_media_envelope` recognizers, `ENCRYPTED_MEDIA_MAGIC`.

## Write-side enforcement (Phase 2)

The node refuses to let unencrypted content enter a private space. On `submit_post` /
`submit_reply`, if the target space is registered private (`SpaceInfo.is_private`), the
node requires (`crypto::private_space::private_write_violation`, wired via
`rpc::methods::check_private_write`):

- **body** is a well-formed `[PRIVATE:v1:]` envelope;
- **title** (posts only) is empty — a private post carries no plaintext title; any title
  lives inside the encrypted body;
- every referenced **media** blob (looked up in the blob store) is a `PRVM1` envelope; a
  missing/unreadable blob fails closed.

On any violation the write is rejected (`InvalidParams` with a descriptive reason — shown
only to the authoring member). On success the node stamps the authenticated
`Action.private` bit from the space's privacy, so clients cannot spoof it.

> **Known gap (pre-existing, tracked):** the node does not currently call
> `validate_action_signature` on RPC-submitted or peer-gossiped actions (clients sign a
> `post:…`/`reply:…` *string*, not the `content_hash‖ts` preimage). So the Phase-1
> signature-authentication of the `private` bit is latent until action-signature
> validation is wired into ingest — a broader hardening beyond this phase. Write-side
> enforcement and the authoritative node-set `private` bit do not depend on it.

## Roadmap

- **Phase 3 — Propagation & serve-gating:** membership-filter the block-receipt fetch
  loop; serve private content to members only; opaque denial (no "we said no"); suppress
  `I_HAVE` for private content to non-members.
- **Phase 4 — Sealed-sender DM handshake:** replace the graph-leaking `DmRequestAnnounce`
  with an addressless sealed handshake + trial-decryption.
