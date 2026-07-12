# Swimchain Glossary

This document distinguishes between **protocol-level concepts** (defined in specifications, enforced by the network) and **client-level concepts** (implementation choices, UX patterns).

---

## The Swimming Metaphor

Swimchain's name embodies its philosophy. The swimming metaphor runs throughout the project:

### Core Concepts

| Swimming Term | Swimchain Concept | Meaning |
|---------------|-------------------|---------|
| **Swimming** | Proof of Work | You have to put in effort to participate. No passive consumption. |
| **Lanes** | Spaces | Each community is a lane. "Stay in your lane" = respect community boundaries. |
| **Pool** | The Network | Everyone's in the pool together. The shared infrastructure. |
| **Strokes** | Posts | Each post is a stroke - effort that moves you forward. |
| **Laps** | Engagement cycles | Completing PoW rounds, keeping content alive. |
| **Treading water** | Maintaining presence | Ongoing effort to stay part of the community. |
| **Diving in** | Joining a space | Active commitment to participate. |
| **Drift** | Content decay | Without effort, content drifts away and fades. |
| **Current** | Active conversation | The flow of discussion in a space. |
| **Upstream** | Against decay | Effort required to keep content persistent. |
| **Downstream** | With decay | Content naturally flowing toward expiration. |
| **Surfacing** | Content discovery | Popular content rises; forgotten content sinks. |

### Social Layer Terms (Updated December 2025)

**Core Insight**: Recognition is based on HOSTING contribution (bandwidth served, uptime) and participation, NOT posting activity. Recognition is purely cosmetic — it never grants protocol privileges.

| Activity Term | Swimchain Concept | Meaning |
|---------------|-------------------|---------|
| **Hosting** | Serving content | Storing and serving content to peers (the PRIMARY contribution) |
| **Swim Streak** 🔥 | Consecutive days | Days in a row with hosting activity |
| **Keeping Afloat** | Content persistence | Doing engagement PoW to keep content alive |
| **Lane Health** | Space health | Hosting coverage of a space (active hosts, uptime, availability) |

**Key insight**: Hosting is recognized with permanent, non-transferable achievement badges shown on your profile. A silent node that serves 500GB/month earns hosting achievements; an active poster who never hosts does not. The recognition is cosmetic — no one gets faster posting, longer decay, or higher limits from it.

### Why Swimming? (Updated)

1. **Effort is Required**: You can't passively float - swimming requires continuous work (PoW)
2. **Lanes Create Order**: Communities stay organized, not chaotic (spaces)
3. **Everyone's in the Same Pool**: Shared infrastructure, no privileged swimmers (decentralization)
4. **You Can Rest, But Not Forever**: Stop swimming, eventually you sink (decay)
5. **Different Strokes**: Various ways to participate (posts, replies, engagement)
6. **Recognition for Hosts**: Active HOSTS earn achievement badges shown on their profile (social layer recognizes hosting, with no protocol privileges)
7. **Pool Health Matters**: The network survives through collective participation

### The Casual Phrase

**"Have you checked your swimchain?"** - A natural way to ask about activity, like "have you checked your email?"

---

## Protocol vs. Client Distinction

| Layer | Defined By | Enforced By | Can Vary |
|-------|-----------|-------------|----------|
| **Protocol** | Specifications | All nodes | No - must be consistent |
| **Client** | Implementers | Individual client | Yes - different clients can make different choices |

---

## Protocol-Level Concepts

These are defined in the protocol specifications and must be implemented consistently by all nodes.

### Core Data Structures

| Term | Definition | Specification |
|------|------------|---------------|
| **Space** | A topic-based container for content. Has a unique identifier, creation signature, and decay state. | SPEC_04_SPACES |
| **Post** | A content record with author signature, PoW proof, content hash, and timestamp. | SPEC_02_CONTENT_DECAY |
| **Thread** | A chain of posts linked by parent references. | SPEC_02_CONTENT_DECAY |
| **Identity** | A keypair-based pseudonymous identity. The public key IS the identity. | SPEC_01_IDENTITY |
| **Fork** | A divergence in the chain where communities split. | SPEC_05_FORKS_CONSENSUS |

### Protocol Mechanics

| Term | Definition | Specification |
|------|------------|---------------|
| **Proof of Work (PoW)** | Computational cost required to create posts. Friction, not mining. | SPEC_03_PROOF_OF_WORK |
| **Decay** | Time-based content expiration influenced by engagement. | SPEC_02_CONTENT_DECAY |
| **Heat** | Engagement metric that slows decay. | SPEC_02_CONTENT_DECAY |
| **Content Hash** | Cryptographic hash pointing to content blob in P2P layer. | SPEC_07_CONTENT_DISTRIBUTION |
| **Fracturing** | Binary splitting of spaces for storage optimization. | VISION.md |
| **Contribution Record** | Protocol-level tracking of HOSTING metrics (bandwidth served, uptime, peer requests). | SPEC_09_SOCIAL_LAYER |
| **Attestation** | Peer verification of hosting contribution claims. | SPEC_09_SOCIAL_LAYER |
| **Streak** | Consecutive days of hosting activity, tracked in protocol. | SPEC_09_SOCIAL_LAYER |
| **Achievement** | Permanent, non-transferable badge for hosting/participation milestones. Cosmetic recognition only, zero protocol effect. | SPEC_09_SOCIAL_LAYER |
| **Poster Reputation** | Per-identity score shown on profiles. Decays when the community files spam attestations against a poster's content and recovers over time; attestations are weighted by the attester's own reputation. A displayed signal with no protocol privileges. | SPEC_09_SOCIAL_LAYER |
| **Space Health** | Protocol-level indicator of hosting coverage (active hosts, uptime, availability). | SPEC_09_SOCIAL_LAYER |

### Architectural Layers

| Term | Definition | Notes |
|------|------------|-------|
| **Authoritative Layer** | Bitcoin-like chain storing post metadata, signatures, PoW proofs. | Small, everyone verifies |
| **Content Layer** | BitTorrent-like P2P storage for actual media files. | Large, fetched on-demand |

---

## Client-Level Concepts

These are implementation choices that may vary between different Swimchain clients.

### UX Patterns

| Term | Definition | Notes |
|------|------------|-------|
| **Forum view** | Client renders spaces as threaded discussions with topic organization. | One valid presentation |
| **Feed view** | Client renders content as a chronological stream. | Another valid presentation |
| **Chat view** | Client renders spaces as real-time chat channels. | Another valid presentation |
| **Wiki view** | Client renders long-lived content as collaborative documents. | Another valid presentation |

**Important:** The protocol is **format-agnostic**. Clients can present the same protocol data (spaces, threads, posts) using any UX pattern. What no client can do is algorithmically curate content, because the protocol doesn't support it.

### Client Features

| Term | Definition | Notes |
|------|------------|-------|
| **Block list** | Client-side filtering of identities. | Not enforced by protocol |
| **Mute** | Client-side hiding of content. | Not enforced by protocol |
| **Reputation display** | How client shows user history/standing. | Varies by client |
| **Link preview** | Client fetches external URL metadata. | Protocol treats links as text |
| **Rich embeds** | Client renders external content inline. | Protocol doesn't support |

---

## Philosophy vs. Protocol

Some concepts are **philosophical stances** that guide design but are not protocol-enforced.

| Concept | Type | Meaning |
|---------|------|---------|
| **Active navigation** | Philosophy | Users choose where to go; no algorithmic curation. Enforced by protocol's lack of personalization. |
| **Friction is a feature** | Philosophy | PoW delays are intentional behavioral design. Enforced by PoW requirements. |
| **Let content die** | Philosophy | Decay is desirable, not a limitation. Enforced by decay mechanics. |
| **Forks over consensus** | Philosophy | Splitting is preferred to fighting. Enabled but not enforced by fork mechanics. |

---

## Common Misunderstandings

### "Forum model" vs. "Active navigation"

Early documentation used "forum model" to describe Swimchain's approach. This was clarified:

| Old Term | New Term | What It Means |
|----------|----------|---------------|
| Forum model | Active navigation | The philosophy that users navigate to spaces they choose, not that the protocol requires forum-like UX |

The protocol defines **spaces, threads, and posts**. How clients render these is their choice.

### "Everyone has everything" vs. "Space-scoped sync"

| Concept | Reality |
|---------|---------|
| "Everyone has the chain" | Everyone CAN have the chain; in practice, users sync spaces they join |
| "Full node" | Users store their branches, not necessarily all content |
| Fracturing | Binary splitting for storage optimization introduces small decentralization gap |

---

## Quick Reference

**Protocol enforces:**
- Spaces, posts, threads exist
- PoW is required to post
- Content decays over time
- Identities are keypairs
- Forks can happen
- HOSTING contribution is tracked (bandwidth served, uptime, peer requests)
- Hosting streaks and achievements are recorded
- Poster reputation is derived from community spam attestations

**Protocol does NOT enforce:**
- How content is displayed
- What UX pattern clients use
- Link handling behavior
- Filtering or blocking
- How clients display or compute their own reputation scores
- Badge/achievement display styling

---

*Document created: 2024-12-25*
*Last updated: 2025-12-25*
*Purpose: Clarify terminology alignment across documentation*

**Changelog:**
- 2025-12-25: Updated Social Layer to emphasize HOSTING as the primary contribution metric (not posting). Levels based on bandwidth served and uptime. Benefits are fair exchange for hosting work.
- 2025-12-25: Added Social Layer terms (swimmer levels, contribution tracking, benefits, streaks, achievements)
