# Swimchain — Posture on Moderation, Operation, and Responsibility

**Not legal advice.** This document describes how the project is *structured* and
how its safety tools work, so that operators and contributors can make informed
choices. It is written by contributors, not lawyers. For decisions that carry
real risk, consult a media/technology attorney in your jurisdiction.

## What Swimchain is (and is not)

Swimchain is an **open-source peer-to-peer protocol** (MIT-licensed) for
decentralized social content. It is software, not a service. There is **no
company, no owner, and no central operator of "the network."** Anyone may run a
node; the network is the sum of the nodes people voluntarily run. Participation
is willing entry by willing participants.

This is the same category as Nostr, BitTorrent, IPFS, and Tor: the *protocol*
has no operator, and no node can remove content from *other* people's nodes.

## Three roles, three different responsibilities

Conflating these is the mistake to avoid. They are distinct:

1. **Contributors / developers.** Write and publish the open-source code.
   Publishing protocol software is not operating a service and is not
   responsible for what independent third parties do with it. The project does
   not induce or market illegal use — the opposite: it ships abuse-mitigation
   tooling and documents its use (this file, `THREAT_MODEL.md §4`).

2. **Node operators.** Anyone running a node — including public
   seed/gateway/`/browse` operators — is responsible for **their own node**: what
   it stores and serves. An operator may apply moderation to their own node
   (that is normal and expected) without that implying any control over, or
   responsibility for, the wider network. Operating your own relay and choosing
   what it carries does not make you the operator of "the network."

3. **Participants.** Run their own nodes, author their own content, and are
   responsible for what they create and host. Their node, their content.

**Keeping these roles separate is the core of the posture.** A contributor who
does not operate public infrastructure sits in the most protected seat. An
operator's exposure is scoped to their own node, and is theirs to manage with
the tools below.

## The swimchain.io gateway / `/browse` (operator-run)

The public web ingress at swimchain.io — including the read-only `/browse` UI —
is **operator-run infrastructure**, not "the project." It is the one surface that
is branded, public, and serves content, so it is the surface where operator
moderation matters most. Its operator may, at their discretion:

- **Apply the blocklist** (below) so the gateway refuses to store/serve
  known-illegal content;
- **Restrict or remove** `/browse` entirely;
- **Publish an abuse-report contact** and honor takedown requests **for that
  node's serving**, without any claim or ability to remove content
  network-wide.

Moderating your own gateway is an operator choice about your own node. It does
not centralize the network or create an "owner."

## Safety tools built into the protocol

These exist in the code today (`src/blocklist/`, `src/spam_attestation/`,
`src/sponsorship/`, `src/content/` decay):

- **Hash blocklist (known-illegal content).** Nodes reject content whose
  SHA-256/SHA-1/MD5 matches a seeded blocklist, at ingest — so a node that has
  seeded the list will not store it and therefore cannot serve it
  (`src/node/router/router.rs` DATA_CONTENT gate). This is **hash-matching of
  known content only** — no human speech decisions — the same mechanism
  platforms use with NCMEC/IWF/Project Arachnid lists. Trusted list-maintainer
  keys let signed bundles apply without community attestations.
- **Operator seed auto-load.** On startup a node imports a hash-list file if
  present (`SWIMCHAIN_BLOCKLIST_SEED` env, else `<data_dir>/blocklist-seed.txt`;
  idempotent). Drop an industry hash export there and the node enforces it every
  boot. **Recommended for any public operator, especially the swimchain.io
  gateway.**
- **Community spam attestation + reputation.** Threshold-based flagging that
  accelerates decay of abused content; informational reputation that never buys
  privilege.
- **Sponsorship trees.** Pseudonymous accountability — every identity is
  sponsored by another, so abuse is traceable through the trust graph without a
  central registry.
- **Decay.** Unengaged content disappears (7-day half-life; 4h if spam-flagged),
  so illegal content that isn't actively kept alive removes itself.
- **No algorithmic amplification.** Nothing "recommends" content; there is no
  feed algorithm to weaponize.

## Recommended operator checklist (public nodes)

For anyone running a public seed/gateway (e.g. swimchain.io):

1. **Seed the blocklist** — obtain a known-CSAM hash list from a reputable
   source (NCMEC/IWF/Project Arachnid) and place it at the seed path; confirm the
   startup log shows it loaded.
2. **Publish an abuse contact** for your node and honor takedown requests for
   *your node's serving*.
3. **Decide on `/browse`** — keep it with the blocklist enforced, or remove it;
   both are legitimate.
4. **Do not induce illegal use** in any framing of your operation.
5. Keep your operator role distinct in how you describe the project ("I run a
   public node," not "I run the network").

## What the project deliberately does NOT do

- Claim to be able to remove content network-wide (it cannot, by design).
- Advertise forward secrecy for private spaces (the crypto does not provide it —
  see `docs/MAINNET_LAUNCH_READINESS.md` R2).
- Centralize moderation decisions about lawful speech.

The design goal is a resilient, no-owner network where illegal-content
mitigation is provided as tooling and applied by operators to their own nodes —
good-faith by construction, not by central fiat.
