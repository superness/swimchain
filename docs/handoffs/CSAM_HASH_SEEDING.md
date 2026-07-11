# Handoff: Seed the CSAM Blocklist from Known Hash Lists

**Status:** Engineering half ready to work; acquisition half is an organizational task for the operator. Decision (operator, 2026-07-11): "We DEFINITELY need to seed with a known list of hashes."

## Current state (what exists)

The blocklist mechanism works but is purely **reactive**: the list starts empty, and entries are minted only when content accumulates enough community spam-attestations with reason `IllegalContent` (threshold + Ed25519 validation in `blocklist/gossip.rs:146 validate_update`), then gossiped (`router.rs:6108+`) and enforced by refuse-to-store (`router.rs:1176-1188`, also checked on post submit `rpc/methods.rs:1947`). Someone has to see the content before the network blocks it. There is no import pipeline and no external list integration.

## Two workstreams

### A. Engineering: trusted-list import + distribution (buildable now)

1. **Import tooling:** a CLI/RPC path to bulk-load hash entries from a file into `BlocklistStore` (`blocklist/storage.rs:89 add`) with a distinct entry provenance (e.g. `reason: ExternalList` — the variant already exists in `blocklist/types.rs:36-100`). Operator-only (cookie-auth RPC or CLI on the node host).
2. **Trust-anchored list updates:** current gossip validation accepts updates backed by community attestations. Seeded entries won't have attestations — add a second validation path: updates signed by a **list-maintainer key** (configurable set of trusted pubkeys in node config; ship with the project's maintainer key as default, operator-overridable). This keeps "any peer can gossip a block entry" impossible while letting a signed seed list propagate network-wide without every node importing manually.
3. **List versioning:** signed list bundles with a version/timestamp so nodes can request "everything since version N" (the BLOCKLIST_REQUEST/SYNC messages already exist — extend for bundle sync).
4. **Hash-type honesty in code/docs:** the store matches exact SHA-256 of content. Industry CSAM lists (NCMEC, IWF, Project Arachnid) are largely **perceptual** hashes (PhotoDNA, PDQ) plus some exact hashes (MD5/SHA1). v1 supports exact-hash entries only; if source lists provide MD5/SHA1, either store multi-hash entries (compute all three digests at ingest time — content is hashed on receipt anyway) or normalize at import. Perceptual matching is explicitly out of scope for v1 (licensing + implementation weight); document that limitation plainly.

### B. Acquisition: getting real hash data (operator/organizational)

Reputable CSAM hash lists are access-controlled — this requires applying as a project, not downloading:
- **IWF (Internet Watch Foundation)** — hash list available to members; membership application required.
- **NCMEC** — hash sharing via their industry programs; US-based, typically requires an ESP relationship.
- **Canadian Centre for Child Protection (Project Arachnid)** — offers hash list access to platforms.
- Note: these organizations will ask what the platform is, how hashes are protected, and how matches are handled. Prepare answers (decentralized protocol, hashes distributed as signed blocklist, matched content refused at storage). Some may only offer perceptual formats — see A4.

Until access is granted, the trust-anchored pipeline (A) still pays for itself: the project can distribute its own signed list of community-confirmed entries so new nodes start with the network's accumulated blocklist instead of empty.

## Acceptance criteria (engineering)

- Import a test hash file → entries in store with ExternalList provenance → posting matching content is rejected on a regtest node.
- A signed list bundle propagates to a second node via gossip and is rejected if signed by an untrusted key.
- Multi-hash (SHA-256/SHA-1/MD5) matching tested if implemented.
- `cargo test --all-targets` + clippy; documentation for node operators on configuring trusted list keys.
