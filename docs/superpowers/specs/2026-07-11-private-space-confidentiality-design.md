# Private-Space Confidentiality — Node-Enforced Design

**Status:** Approved design (pre-implementation)
**Date:** 2026-07-11
**Scope:** Private / DM spaces only. Public-space content propagation is unchanged.

---

## 1. Problem & threat model

**Threat actor:** a node/client that is **not** a member of a private space and has no space key. They somehow learn or guess a `content_id` / media hash that lives in that private space.

**What's wrong today (verified in code):**
- Content-serving is **open-by-hash with no authorization** on every path: P2P `WHO_HAS`→`handle_who_has` and `GET`→`handle_get` (`router.rs:728,1020` → `retrieval.rs:654,784`), and the `get_content` / `get_media` RPCs (`methods.rs:3793,2530`). Anyone who names a hash gets the bytes.
- Encryption is a **client convention, not enforced**: `submit_post`/`upload_media` store bytes verbatim (`methods.rs:1981-2020,2503`); there is no `is_private` check and no encryption call. A buggy/old/malicious client can post private-space plaintext and the node is none the wiser.
- **Every node replicates everything**: the block-receipt fetch loop (`router.rs:3931-3969`) fetches the body + images of *all* content it's missing, with no membership/space/private filter. So private ciphertext (and its existence/size/author metadata) already sits on **every node in the network** — maximal harvest-now-decrypt-later exposure.
- The **DM handshake leaks the social graph**: `DmRequestAnnouncePayload` (`messages.rs`) re-floods `requester` and `recipient` ed25519 pubkeys **in cleartext** (only the `key_share` is wrapped). The whole network learns "A is opening a DM with B."

**Goals:**
1. A non-member who learns a hash gets **nothing useful** and **cannot confirm the content exists**.
2. Private ciphertext **never lands on non-members' nodes**.
3. Private content (text *and* images) is **always encrypted** — guaranteed by the node, not the client.
4. The DM handshake hides **who is talking to whom**.

**Non-goals (explicit, out of scope):**
- **Traffic analysis** (timing/size/volume correlation). Defeating that needs mixnet/onion-routing-level work.
- **Public-space** propagation changes.
- **Perfect offline availability** for private content (see §9 cost).

---

## 2. Design overview

Five coordinated changes, all keyed off one new signal:

| # | Change | Effect |
|---|--------|--------|
| 1 | **`private` bit on `Action`** | Every node can tell which content is private, from the block alone. |
| 2 | **Write-side encryption enforcement** | Node refuses to store unencrypted private content/images. |
| 3 | **Member-only propagation** | Block-receipt fetch loop skips `private` actions unless the node is a member. |
| 4 | **Signed-GET fetch-auth + silent-drop** | Only members can pull private bytes; non-members are ghosted (no reply, no existence confirmation). |
| 5 | **Sealed handshake** | DM establishment hides requester+recipient via addressless re-flood + trial-decryption. |

The security emerges from the combination: (2) guarantees ciphertext, (3)+(4) keep that ciphertext on members only and ghost outsiders, (1) is the reliable signal that lets (3)/(4) act without a body fetch, and (5) closes the metadata leak in establishment.

---

## 3. Component design

### 3.1 The `private` bit on `Action`

- Add `private: bool` to `blocks::action::Action`. Set by the poster for any content destined for a private/DM space.
- **Wire format:** `Action` is fixed-size (`ACTION_SERIALIZED_SIZE`). Adding the flag is a **versioned serialization bump** — implementation must define the version handling (new field appended; version byte or size-discriminated parse) so old/new nodes interoperate predictably. Bincode does not tolerate silent field addition, so this is a deliberate format revision, not a drop-in.
- **Trust model:** the poster controls their own content's `private` bit. Mis-marking is self-defeating: marking private-as-public leaks *your own* content (which you could do anyway); marking public-as-private just means it won't replicate. So poster-controlled is acceptable — the bit protects honest posters.
- The bit is covered by the action's existing signature (so a relay can't flip it).
- It reveals *which* actions are private (and their author/space/size/timestamp, already in the chain) — **not** their contents. Acceptable metadata; full metadata-hiding is a non-goal.

### 3.2 Write-side: enforced encryption

In `submit_post`, `submit_reply` (and any content-write RPC), when `private == true`:
- **Text:** reject unless `body` is a well-formed `[PRIVATE:v1:<base64(iv‖ct‖tag)>]` envelope (`crypto/private_space.rs`) — structural check: correct prefix, valid base64, length ≥ iv(12)+tag(16). If the node **holds the space key** (node-managed member), additionally verify it decrypts. Reject with an opaque error (do not reveal decryption specifics).
- **Images:** private posts may only reference **encrypted-media** blobs. Define an encrypted-media envelope (reuse `[PRIVATE:v1:…]` framing over the raw image bytes, or a binary magic header — implementation choice). At submit time, for each `media_ref` on a private action, load the blob and verify it is an encrypted-media envelope; reject otherwise.
- `upload_media` must **accept** encrypted media (today it rejects anything outside the `image/*` allowlist). Add an encrypted-media media-type/flag; store the encrypted bytes as-is (the node never encrypts — it only *requires* encryption).

### 3.3 Member-only propagation

- The block-receipt fetch loop (`router.rs:3931-3969`): when an action has `private == true`, **do not** add its `content_hash` / `media_refs` to `missing_hashes` **unless** the node is a member of that space (`membership_store.get_member(space_id, me)` present, or — for a DM — it can re-derive the space, see §3.4).
- Consequence: non-members hold only the action metadata, never the private body/images. Private ciphertext replicates to members only.

### 3.4 Fetch-auth: signed GET + silent-drop ghosting

- A `GET` for content whose action is `private` must carry `{requester_pubkey, timestamp, nonce, signature}` where `signature = sign(requester_key, content_id ‖ nonce ‖ timestamp)`.
- **Holder logic** on receiving such a GET:
  1. Verify the signature against `requester_pubkey` and check freshness (nonce/timestamp within tolerance).
  2. Authorize:
     - **DM (2-party):** compute `hash(sorted[my_identity_pubkey, requester_pubkey])`; if it equals the content's space id `S`, the requester is the DM partner. (No stored membership list needed — the space id *is* the proof.)
     - **Group private space:** check `membership_store.get_member(space_id, requester_pubkey)`.
  3. Pass → serve the ciphertext. **Fail or missing signature → silent drop** (no response at all — byte-identical to "I don't have it").
- **`WHO_HAS` / `I_HAVE`:** do **not** advertise or answer for `private` content to unauthenticated peers — otherwise an `I_HAVE` reply confirms existence. (Discovery for private content happens member-side; a member already knows the id from the action.)
- **Fetcher logic:** when a node wants a `private` body it *is* entitled to (it's a member), it sends the **signed** GET. A non-member's node either skips (§3.3) or, if it tries, sends an unsigned/normal GET and is silently dropped.
- **Replay note:** a captured signed GET replayed by an outsider yields only *ciphertext* (still unreadable without the space key), and freshness bounds the window. Acceptable residual.
- **RPC parity:** `get_content` / `get_media` apply the same rule for `private` content — a caller without membership standing gets the same "not found" as genuinely-absent content. The node tracks a **private-blob-hash set** derived from `private` actions so `get_media` / blob-serving can recognize a private blob by hash alone.

### 3.5 Sealed handshake (hide who↔who)

Replace the cleartext `requester`/`recipient` in the DM establishment broadcast with **sealed-sender**:

- **Outer (broadcast, addressless):** `{ ephemeral_x25519_pubkey, nonce, pow, timestamp, sealed_ct }`. No requester, no recipient, no requester signature in the clear.
- **`sealed_ct = box(ephemeral_sk → recipient_x25519_pk)`** wrapping the inner payload `{ requester_pubkey, requester_signature, wrapped_space_key, space_id/derivation }`.
- **Re-flood** exactly as today (`broadcast_except`), dedup by hash.
- **Every node trial-decrypts** each DM-request broadcast with its own x25519 secret + the envelope's ephemeral pubkey (`box_open`). Only the true recipient succeeds; everyone else just relays. The network sees "an encrypted DM request occurred," not for/from whom.
- **Anti-spam:** PoW is on the *outer* envelope (over `sealed_ct`), since we can't rate-limit by a cleartext identity.
- **Accept / decline** replies (`DmAcceptAnnounce` / `DmDeclineAnnounce`) currently leak B↔A the same way and get the **same sealed treatment** (sealed to the original requester).
- **Cost:** every node attempts one `box_open` per DM-request broadcast. `box_open` is microseconds; DM-establishment volume is low. Fine.

---

## 4. Backward compatibility

- **Going forward:** private writes without valid encryption are **rejected** (that is the point). This breaks any client that posts private content unencrypted — the desktop clients already encrypt; older/third-party clients that don't will get errors and must update.
- **Legacy content** already on the chain (unencrypted private content, actions without the `private` bit): treated **as-is** (served under the *old* open rules only if a node still holds it). New nodes **stop replicating** legacy private content they can identify; they do not retroactively delete. Content decay ages it out.
- **Action format bump** must interoperate with un-upgraded peers for a transition window (version-discriminated parse). Define the rollout: nodes that don't understand the `private` bit will treat those actions as non-private — so the network gains protection only once a majority upgrades. Document this clearly; it is a network-coordinated change.

---

## 5. Components & boundaries (for implementation isolation)

- `blocks::action` — the `private` flag + versioned (de)serialization. Pure data + format; testable in isolation.
- `crypto::private_space` — extend with (a) structural validation of a text envelope, (b) encrypted-media envelope encode/validate, (c) sealed-sender box/open helpers. Pure crypto; unit-testable.
- `rpc::methods` (write) — `submit_post`/`submit_reply`/`upload_media` private-enforcement. Depends on action flag + crypto validators.
- `node::router` (propagate + serve) — skip-private in the block-receipt loop; signed-GET gate in `handle_get`/`handle_who_has`; private-blob-hash index. Depends on membership + action flag.
- `rpc::methods` (read) — `get_content`/`get_media` private gate. Depends on the private-blob index + membership.
- DM handshake (`request_dm_managed`/`accept`/`decline` + `DmRequestAnnounce` handling) — sealed-sender envelope + trial-decrypt. Depends on the sealed-sender crypto helpers.

Each unit has a clear interface (data in → decision/bytes out) and can be understood/tested without the others.

---

## 6. Testing strategy

- **Crypto units:** round-trip text/media envelope encode→validate; sealed box→open (only recipient opens, wrong key fails); membership re-derive (`hash(sorted[…])` matches only the true pair).
- **Write enforcement:** private submit with plaintext → rejected; with valid envelope → accepted; private post referencing unencrypted media → rejected.
- **Propagation:** simulate a non-member syncing a block with a `private` action → asserts it does **not** fetch the body/media; a member → does.
- **Fetch-auth:** signed GET from the member → served; unsigned/wrong-signer GET → **no response** (assert silence, not an error); `WHO_HAS` for private content from a non-member → no `I_HAVE`.
- **Handshake:** end-to-end sealed DM request → only the recipient's node decrypts; a third node relays but cannot read requester/recipient; accept/decline sealed likewise.
- **End-to-end (live nodes):** run the existing regtest/testnet harness — post an encrypted DM between two members, confirm a third (non-member) node never obtains the body (`get_content` returns not-found) and never stores the blob.

---

## 7. Residuals & open items (carried into the plan)

- A **member** still holds the ciphertext and, in principle, could hand it to a guesser — but that's now a tiny surface (only members), and the bytes are unreadable without the space key.
- **Offline delivery** for private content depends on a member (or a member-run always-on relay) being reachable — a future "member relay" opt-in could restore store-and-forward while keeping ciphertext on trusted holders.
- **Group private spaces** rely on `membership_store` being present + correct on the serving node; the DM 2-party re-derive shortcut does not apply.
- **Traffic analysis** remains (non-goal).
- **Network-coordinated rollout** of the `Action` format bump — protection is partial until adoption.

---

## 8. Decisions made (record)

- Scope: private/DM only (not general public content) — first pass.
- Fetch-auth: **signed GET up-front** (not challenge round-trip) — best ghosting, no extra round-trip.
- Private signal: **`private` bit on the action** (accept a versioned wire change) — cleanest ghosting, no `WHO_HAS` existence leak.
- Handshake: **sealed-sender included in this spec** (hide requester+recipient), not deferred.
- Backward compat: **reject unencrypted private writes going forward**; legacy content aged out by decay, not deleted.
