# Swimchain Thesis Topics

Feed these to the pipeline one at a time or as a batch.

---

## Topic 1: Exclusion by Design

A decentralized social network requires users to run nodes, manage cryptographic keys, and understand concepts like forks and proof-of-work. This excludes most people. Is this acceptable?

**Core tension:** Decentralization vs. accessibility

---

## Topic 2: Friction Is Good

Posting requires proof-of-work computation that takes 10-60 seconds. This is intentional friction to reduce impulsive posting and spam. Is deliberate slowness a valid design choice for social media?

**Core tension:** Quality/intentionality vs. usability

---

## Topic 3: Forks Over Consensus

Instead of one network with global consensus, communities can fork into separate chains. Disagreement leads to splitting rather than fighting for control. Is fragmentation healthy?

**Core tension:** Community autonomy vs. network unity

---

## Topic 4: No Safety Net

There is no platform to report harassment to. No moderators. No appeals process. Users must protect themselves through filtering, migration, and community action. Is this acceptable?

**Core tension:** Freedom/decentralization vs. user protection

---

## Topic 5: No Growth Imperative

The project explicitly rejects growth as a goal. No VC funding, no monetization, no engagement optimization. Small and sustainable is preferred over large and corrupted. Is rejecting growth viable?

**Core tension:** Principles vs. critical mass

---

## Topic 6: Let Content Die

Content that doesn't receive engagement gradually decays and disappears. This is organic moderation and storage management. But it means unpopular content dies regardless of value. Is decay the right model?

**Core tension:** Organic moderation vs. preservation

---

## Topic 7: Pseudonymity Over Accountability

Users have persistent pseudonymous identities (public keys) but no real-name verification. This protects privacy but enables consequence-free abuse. Where should the balance be?

**Core tension:** Privacy vs. accountability

---

## Topic 8: Sponsorship Trees

Every identity (except genesis founders) requires a sponsor who vouches for them. If a sponsee misbehaves, the sponsor faces consequences. This creates accountability through social chains but fundamentally gates access.

**Core tension:** Accountability vs. openness

**Detailed analysis:** See THESIS_08_SPONSORSHIP_TREES.md

---

## Topic 9: Hosting as Proof of Work

Instead of burning CPU cycles, participation is earned by hosting content that others view. This transforms waste into useful infrastructure but requires running persistent nodes.

**Core tension:** Useful work vs. participation barriers

**Detailed analysis:** See THESIS_09_HOSTING_AS_WORK.md

---

## Topic 10: Attestation-Driven Decay

Community members can accelerate content decay through attestations. This enables responsive abuse mitigation but introduces a form of distributed content judgment.

**Core tension:** Community response vs. content neutrality

**Detailed analysis:** See THESIS_10_ATTESTATION_DECAY.md

---

## Topic 11: No Video Ever

Video is permanently excluded from the protocol. Images are allowed to everyone, subject to a 500KB size cap and proof-of-work. This is architectural, not temporary: video economics are incompatible with full-node-per-user decentralization.

**Core tension:** Viability vs. expressiveness

**Detailed analysis:** See THESIS_11_TEXT_ONLY_LAUNCH.md

**Status:** RESOLVED - No video; images allowed to everyone within the size cap

---

## Context (if pipeline needs it)

Swimchain is a concept for truly decentralized social media where:
- Every user runs a full node (no central servers) - **everyone's in the pool**
- Proof-of-work is required to post (spam prevention through friction) - **every stroke costs energy**
- Content decays without engagement (organic moderation) - **stop swimming, start sinking**
- Communities can fork into separate chains (escape from capture) - **build your own pool**
- No company, no ads, no algorithm
- Active navigation (navigate to lanes) not algorithmic feeds (content pushed to you)

**The Swimming Metaphor:**
| Swimming Term | Swimchain Concept |
|---------------|-------------------|
| Swimming | Proof of Work (effort to participate) |
| Lanes | Spaces (stay in your lane) |
| Pool | The network (everyone's in it together) |
| Strokes | Posts (each one takes effort) |
| Drift | Decay (content fades without engagement) |
| Diving in | Joining a space |
| Treading water | Maintaining presence |
