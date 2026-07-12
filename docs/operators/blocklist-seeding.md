# Operator Guide: Seeding the Illegal-Content Blocklist

This guide covers the engineering side of seeding a node's CSAM/illegal-content
blocklist from a known hash list (SPEC_12). It explains the import format,
configuring trusted list-maintainer keys, and how signed bundles propagate.

> **Data sourcing is out of scope here.** This document does not provide, and
> the tooling does not generate, real illegal-content hashes. Obtaining a
> reputable hash list (IWF, NCMEC, Project Arachnid) is an organizational task
> gated behind membership/ESP agreements — see the acquisition handoff. Use
> **synthetic test hashes** for any local testing.

## Concepts

The blocklist has two authority models:

1. **Community-attested** (default, pre-existing): an entry is minted when 3+
   independent sponsor trees attest content as illegal. This is reactive —
   someone must see the content first.
2. **Trust-anchored** (this feature): entries signed by a configured
   *list-maintainer key* are accepted network-wide **without** attestations.
   This lets an operator seed a known list and have it propagate.

Matching happens at content ingest by refusing to store matched content. The
primary match is on the SHA-256 content id; SHA-1 and MD5 file digests are also
recomputed over received bytes and matched against the imported auxiliary index
(industry lists ship SHA-1/MD5 far more often than SHA-256).

Perceptual hashes (PhotoDNA, PDQ) are **out of scope for v1** — only exact
digest matching is supported.

## 1. Import format

An import file is UTF-8 text, one record per line. Blank lines and lines
starting with `#` are ignored; inline `#` comments are allowed.

```text
<digest-spec> [reason]
```

- `digest-spec` — one or more comma-separated digest tokens for the **same**
  underlying file. A token is either:
  - `type:hex` where `type` ∈ `sha256` | `sha1` | `md5`, or
  - a **bare** hex string whose length selects the type: 64 = SHA-256,
    40 = SHA-1, 32 = MD5.
- `reason` (optional) — `csam`, `terrorism`, or `external_list` (default).

### Examples (synthetic)

```text
# SHA-256-addressed entry, explicit reason
sha256:0000000000000000000000000000000000000000000000000000000000000001 csam

# same file identified by several industry digests on one line
sha256:...64hex...,sha1:...40hex...,md5:...32hex... csam

# bare hex, type inferred from length; default reason (external_list)
0000000000000000000000000000000000000000000000000000000000000002

# an industry entry that only ships an MD5 (matched locally, not gossiped)
md5:00000000000000000000000000000003
```

### SHA-256 vs SHA-1/MD5 propagation

- Records with a **SHA-256** become primary entries: they participate in the
  Merkle root, gossip, and signed bundles, so they propagate network-wide.
- SHA-1/MD5-only records are indexed for **local** recompute-and-match at
  ingest but are **not** gossiped, because the protocol content id is SHA-256.
  Prefer lists that include SHA-256 where possible.

Parsing is fail-closed: a single malformed line aborts the whole import (with a
line number), so a partial list is never silently seeded.

## 2. Importing a list

Import requires a running node — entries take effect immediately and the CLI
routes through the node's cookie-authenticated RPC.

```bash
# via the CLI (reads the file, sends it over cookie-authed RPC)
sw blocklist import known-hashes.txt

# regtest, JSON output
sw --regtest blocklist import test-list.txt --json

# inspect current entries
sw blocklist list
```

Direct JSON-RPC (cookie auth handled by the client config):

```bash
curl -s -u "__cookie__:$(cat <data_dir>/.cookie | cut -d: -f2)" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"import_blocklist",
       "params":{"path":"/srv/lists/known-hashes.txt"}}' \
  http://127.0.0.1:<rpc_port>
```

`import_blocklist` accepts either `list` (inline body) or `path` (a file on the
node host). It reports counts of entries added / skipped / aux-indexed.

## 3. Configuring trusted list-maintainer keys

Trusted keys let a maintainer's signed updates and bundles bypass the
community-attestation requirement. Configure them in a file in the node's data
directory:

```
<data_dir>/blocklist_trusted_keys.txt
```

One Ed25519 public key per line, as 64-char hex or a `swim1…` bech32m address.
Blank lines and `#` comments are ignored:

```text
# Project maintainer signing key
swim1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsz3x0h
# or hex
a1b2c3...  (64 hex chars)
```

The file is loaded at node startup. Keys not listed here have **no** special
authority — their updates still require the full attestation threshold, so
adding a maintainer key is the only way to grant seed authority.

Ship the project's maintainer public key to operators out-of-band; operators
who run their own deployment may substitute their own key.

## 4. Signed, versioned bundles

A maintainer can distribute the accumulated blocklist as a **signed bundle** so
fresh nodes start populated instead of empty. A bundle is:

- monotonically **versioned** — a node applies a bundle only if its version is
  strictly newer than what it already holds (idempotent, replay-safe), and
- **Ed25519-signed** by the maintainer — a receiving node validates the
  signature against its trusted-key set before applying, then forwards it to
  peers that haven't seen it (message type `BLOCKLIST_BUNDLE`, `0xB3`).

A bundle from an untrusted key, or with a bad signature, is dropped. Bundles
carry no attestations; their authority is entirely the maintainer signature.

## Security notes

- Import and the `import_blocklist` RPC are guarded by the node's cookie
  authentication — only a local operator with access to the data directory can
  invoke them.
- SHA-1 and MD5 are cryptographically broken and are used here **only** to
  match legacy industry file digests, never for any security decision.
- Never place real illegal-content hashes in a repository or test fixture. All
  examples above are synthetic.
