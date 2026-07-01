# Research Spike: Sybil Resistance

## Status: DRAFT

## Executive Summary

Swimchain faces a fundamental tension: its pseudonymous identity model (Ed25519 keypairs) enables anyone to create unlimited identities, creating vulnerability to Sybil attacks where one actor manufactures false consensus, games reputation, or overwhelms governance. The research reveals that no perfect solution exists—all approaches trade off between decentralization, privacy, and Sybil resistance. This is explicitly acknowledged in THESIS_07_PSEUDONYMITY.md as an "ongoing challenge, not a solved problem."

The most promising path for Swimchain combines multiple complementary mechanisms that align with its core values: (1) the existing per-post PoW already raises the cost of sustained Sybil activity; (2) temporal graduation (age-weighted reputation) disadvantages newly-minted Sybil accounts; (3) social graph analysis can detect coordinated Sybil patterns without central authority; and (4) Rate Limiting Nullifier (RLN) enables cryptographic enforcement of rate limits while preserving privacy. Critically, Swimchain must reject any approach requiring trusted third parties, biometric collection, or central identity verification—these violate the protocol's foundational principles.

The recommended strategy embraces the "Cost of Forgery" principle: legitimate participation should be cheap across any single dimension, but bulk identity creation becomes expensive when costs compound across time (temporal limits), computation (PoW), social capital (graph verification), and optionally stake (for governance). This layered defense accepts that well-resourced attackers may still create Sybils, but makes large-scale attacks economically irrational for most threat actors while preserving the protocol's decentralization and privacy guarantees.

## Research Question

How do we prevent one person from running many identities and gaming reputation or overwhelming the network with fake nodes?

## Context

Swimchain uses pseudonymous identities (Ed25519 keypairs). Anyone can generate unlimited keypairs. This creates the Sybil problem: a single actor can create thousands of identities to:
- Manufacture false consensus
- Game reputation systems
- Spam the network despite PoW costs (if they have resources)
- Dominate space governance through fake votes

### Relevant Theses
- **THESIS_01_EXCLUSION.md** - Technical barriers as filters
- **THESIS_07_PSEUDONYMITY.md** - Pseudonymity vs. accountability tradeoffs

### Relevant Specs
- **SPEC_01_IDENTITY.md** - Current identity design, including FirstAppearance tracking
- **SPEC_03_PROOF_OF_WORK.md** - PoW as partial Sybil defense

## Prior Art Analysis

### Proof of Personhood (PoP) Systems

These systems attempt to cryptographically prove unique humanness. They offer strong Sybil resistance but vary dramatically in decentralization and privacy. Biometric approaches are highly centralized and invasive. Social graph approaches are more decentralized but vulnerable to coordinated attacks.

#### Worldcoin (Iris Scanning)

- **How it works**: Uses custom hardware ("Orbs") to scan users' irises and generate a unique biometric hash. The hash is stored centrally to prevent duplicate registrations.
- **Decentralization**: Low. Requires proprietary hardware infrastructure and central database of biometric hashes.
- **Trust assumptions**: Trust Worldcoin Foundation to operate honestly, not misuse biometric data, and maintain infrastructure indefinitely.
- **Pros**: Strongest known Sybil resistance; difficult to fake iris patterns; one-time verification.
- **Cons**: Massive privacy invasion; centralized infrastructure; hardware dependency; excludes users without Orb access.
- **Real-world outcomes**: Millions of signups but controversy over data practices; regulatory pushback in multiple countries.
- **Swimchain applicability**: **Incompatible**. Violates core principles of decentralization, privacy, and no central authority.

#### BrightID (Social Graph Verification)

- **How it works**: Users connect to others they know in person and verify each other. Graph analysis identifies likely unique humans based on connection patterns.
- **Decentralization**: High. No central authority; graph analysis is distributed.
- **Trust assumptions**: Trust that real-world social connections are hard to fake at scale; trust seed nodes that initialize the graph.
- **Pros**: No biometrics; no central database; leverages existing social relationships; open source.
- **Cons**: Bootstrapping problem for isolated users; vulnerable to coordinated Sybil rings; requires ongoing social verification.
- **Real-world outcomes**: Used by Gitcoin and other projects; effective for Web3 community but limited mainstream adoption.
- **Swimchain applicability**: **Compatible as optional layer**. Aligns with decentralization values; could be integrated for spaces requiring stronger Sybil resistance.

#### Proof of Humanity (Video + Vouching)

- **How it works**: Users submit video of themselves and are vouched for by existing verified humans. Disputes are resolved through decentralized court (Kleros).
- **Decentralization**: Medium. Uses decentralized dispute resolution but requires video storage infrastructure.
- **Trust assumptions**: Trust vouchers are honest; trust Kleros court system for disputes.
- **Pros**: No biometric database; human-readable verification; decentralized dispute resolution.
- **Cons**: Privacy-invasive (face video required); slow onboarding; vulnerable to AI deepfakes; vouching can be gamed.
- **Real-world outcomes**: Smaller adoption than BrightID; UBI token distribution use case.
- **Swimchain applicability**: **Incompatible**. Video requirement violates pseudonymity principles; face exposure creates real-world targeting risk.

#### Gitcoin Passport (Multi-factor Scoring)

- **How it works**: Aggregates "stamps" from multiple identity sources (Twitter, GitHub, BrightID, etc.) into a composite score indicating likelihood of unique human.
- **Decentralization**: Medium. No single authority, but depends on external platforms for stamp verification.
- **Trust assumptions**: Trust external platforms (Twitter, GitHub) haven't been Sybiled; trust scoring algorithm weights.
- **Pros**: Flexible; users choose which stamps to provide; no single point of failure.
- **Cons**: Complexity; depends on centralized platforms; gaming through stamp farming; score thresholds are subjective.
- **Real-world outcomes**: Widely used for Gitcoin grants quadratic funding; iterating on scoring mechanisms.
- **Swimchain applicability**: **Partially compatible**. External platform dependency is problematic, but the multi-factor principle is sound.

### Stake-Based Identity

Economic stake creates skin in the game that can be slashed for misbehavior. Highly effective for financial systems but creates plutocratic dynamics where wealthy actors can afford more identities.

#### Ethereum Validators (32 ETH Stake)

- **How it works**: Validators must stake 32 ETH (~$60,000+) to participate in consensus. Misbehavior results in slashing (stake destruction).
- **Decentralization**: High for protocol; stake requirement limits participation.
- **Trust assumptions**: Trust that slashing conditions are correctly implemented; trust economic incentives align behavior.
- **Pros**: Strong economic guarantees; self-enforcing; no external dependencies.
- **Cons**: High barrier creates plutocracy; wealthy can run multiple validators; stake pools concentrate power.
- **Real-world outcomes**: Ethereum has ~1M validators; liquid staking pools dominate.
- **Swimchain applicability**: **Partially compatible for governance**. Could work for optional stake-weighted voting in spaces, but should not be mandatory for participation.

#### Security Deposits for Identity

- **How it works**: Users deposit tokens to create identity; deposit returned after good behavior period or slashed for violations.
- **Decentralization**: High if deposit mechanism is on-chain.
- **Trust assumptions**: Trust that slashing conditions can be objectively verified.
- **Pros**: Reversible investment (unlike PoW); scales cost with identity count.
- **Cons**: Wealth barrier; requires liquid token market; slashing requires objective misbehavior detection.
- **Real-world outcomes**: Used in various DeFi protocols for participant bonding.
- **Swimchain applicability**: **Compatible as optional layer** for governance contexts, not base identity.

### Web of Trust / Social Graph Analysis

Leverage existing social relationships to verify identity. Naturally decentralized and privacy-preserving. Vulnerable to collusion and Sybil rings where attackers create interconnected fake identities.

#### PGP Web of Trust

- **How it works**: Users sign each other's public keys, creating a graph of attestations. Trust propagates through multiple signature paths.
- **Decentralization**: High. Fully peer-to-peer; no central authority.
- **Trust assumptions**: Trust that signers verify identity before signing; trust in transitive trust chains.
- **Pros**: Completely decentralized; long-established model; no infrastructure requirements.
- **Cons**: Rarely used in practice; key signing parties are niche; bootstrap problem; trust chains hard to evaluate.
- **Real-world outcomes**: Largely failed for mainstream adoption; survives in specific communities.
- **Swimchain applicability**: **Conceptually aligned** but practically limited. The trust-graph model informs social graph analysis approaches.

#### Keybase (Social Proofs)

- **How it works**: Users cryptographically link their Keybase identity to external accounts (Twitter, GitHub, domains) by posting proofs.
- **Decentralization**: Medium. Open protocol but company-operated key server.
- **Trust assumptions**: Trust external platforms; trust Keybase infrastructure.
- **Pros**: Flexible proof types; human-readable verification; cross-platform identity.
- **Cons**: Depends on centralized platforms; Keybase itself centralized (acquired by Zoom).
- **Real-world outcomes**: Popular in crypto community; concerns after Zoom acquisition.
- **Swimchain applicability**: **Approach is sound** but external platform dependencies problematic. Could inform optional social proof mechanism.

#### Retroactive Reputation / Proven History

- **How it works**: Identity credibility derives from observable history of contributions, interactions, and behavior over time.
- **Decentralization**: High. No authority required; history is self-evident.
- **Trust assumptions**: Trust that historical data is authentic and unforgeable.
- **Pros**: Natural fit for pseudonymous systems; rewards sustained contribution; no onboarding friction.
- **Cons**: New users disadvantaged; history can be manufactured slowly; requires time investment.
- **Real-world outcomes**: How most online communities naturally work (karma, post count, etc.).
- **Swimchain applicability**: **Highly compatible**. Already implicit in FirstAppearance tracking; formalize as age-weighted reputation.

### Rate Limiting Approaches

Limit what new/unverified accounts can do rather than preventing their creation. Simple to implement but easily circumvented individually. Temporal approaches are decentralization-compatible.

#### IP-Based Rate Limiting

- **How it works**: Limit requests per IP address; block IPs showing suspicious behavior.
- **Decentralization**: Low. Requires central coordination to share IP blocklists.
- **Trust assumptions**: Trust IP as proxy for identity (violated by VPNs, Tor, NAT).
- **Pros**: Simple to implement; widely understood.
- **Cons**: Easily circumvented; punishes shared IPs; blocks Tor/VPN users; requires coordination.
- **Real-world outcomes**: Standard for centralized services; ineffective against motivated attackers.
- **Swimchain applicability**: **Incompatible as sole defense**. Violates decentralization; punishes privacy-conscious users.

#### Phone Number Verification

- **How it works**: Require SMS verification to create account; assume phone numbers are scarce and tied to individuals.
- **Decentralization**: Low. Depends on telecom infrastructure; SMS gateways are centralized.
- **Trust assumptions**: Trust that phone numbers are hard to acquire in bulk (violated by SIM farms).
- **Pros**: Familiar to users; moderate friction.
- **Cons**: Centralized; links to real identity; SIM farms exist cheaply; excludes users without phones.
- **Real-world outcomes**: Standard for centralized platforms; increasingly circumvented.
- **Swimchain applicability**: **Incompatible**. Requires central authority; links pseudonymous identity to real-world identity.

#### Temporal Limits (Graduated Trust)

- **How it works**: New accounts have limited capabilities that expand over time. Trust increases with age and positive behavior.
- **Decentralization**: High. Each node can independently compute account age.
- **Trust assumptions**: Trust that Sybil attackers cannot easily age large numbers of accounts.
- **Pros**: No external dependencies; naturally disadvantages Sybils; rewards sustained participation.
- **Cons**: Legitimate new users face friction; patient attackers can pre-age accounts.
- **Real-world outcomes**: Common pattern (Reddit karma gates, Wikipedia editing restrictions).
- **Swimchain applicability**: **Highly compatible**. Already have FirstAppearance tracking; extend to age-weighted capabilities.

### Cryptographic Approaches

Enable proving properties (membership, rate compliance) without revealing identity. Preserve privacy while enabling enforcement. Cutting-edge technology with implementation complexity.

#### Rate Limiting Nullifier (RLN)

- **How it works**: Users generate ZK proofs that they haven't exceeded rate limits. Exceeding limits reveals private key, enabling slashing. Works without central tracking.
- **Decentralization**: High. No central rate tracker; cryptographic enforcement.
- **Trust assumptions**: Trust ZK proof system is sound; trust slashing mechanism works.
- **Pros**: Privacy-preserving; no central authority; self-enforcing; designed for spam prevention.
- **Cons**: Cutting-edge tech; implementation complexity; requires ZK infrastructure; relatively immature.
- **Real-world outcomes**: Developed for Waku messaging protocol; increasing adoption in privacy-focused projects.
- **Swimchain applicability**: **Highly compatible**. Best privacy-preserving rate limiting available. Recommended for future integration once technology matures.

#### Anonymous Credentials

- **How it works**: Users obtain credentials from issuers, then prove credential possession without revealing identity or linkable information.
- **Decentralization**: Medium. Requires trusted credential issuers.
- **Trust assumptions**: Trust credential issuers don't create fraudulent credentials.
- **Pros**: Strong privacy; unlinkable presentations; selective disclosure.
- **Cons**: Requires credential infrastructure; issuer is trust point.
- **Real-world outcomes**: Academic research; some government ID pilots.
- **Swimchain applicability**: **Potentially compatible** if credential issuers are decentralized. Could enable proving membership in verified groups.

#### Ring Signatures

- **How it works**: Signer proves they're one member of a group without revealing which member.
- **Decentralization**: High. No central authority; purely cryptographic.
- **Trust assumptions**: Trust ring members are legitimate.
- **Pros**: Strong privacy; no linkability between signatures.
- **Cons**: Ring size limits; computational overhead; group management complexity.
- **Real-world outcomes**: Used in Monero for transaction privacy.
- **Swimchain applicability**: **Conceptually aligned** for anonymous voting or group attestations. Implementation complexity may not be justified.

### Computational Cost Approaches

Already partially implemented in Swimchain. Makes bulk identity creation expensive. Egalitarian (everyone waits) but resource-intensive.

#### Identity Creation PoW

- **How it works**: Require proof of work to register new identity; difficulty calibrated to take meaningful time/computation.
- **Decentralization**: High. No authority required; each node verifies.
- **Trust assumptions**: Trust that PoW is properly calibrated; ASIC resistance important for fairness.
- **Pros**: No external dependencies; scales cost linearly with Sybil count; egalitarian.
- **Cons**: Punishes legitimate users equally; energy consumption; mobile device limitations.
- **Real-world outcomes**: Hashcash email spam prevention; Swimchain's current per-post PoW.
- **Swimchain applicability**: **Already implemented** for posts (SPEC_03). Optional extension for identity creation (SPEC_01 Section 3.4).

#### Per-Action PoW

- **How it works**: Require PoW for each significant action (post, reply, vote), not just identity creation.
- **Decentralization**: High. Self-enforcing.
- **Trust assumptions**: Trust difficulty is balanced for legitimate use.
- **Pros**: Makes sustained Sybil activity expensive; no need to prevent identity creation.
- **Cons**: User experience friction; mobile device limitations.
- **Real-world outcomes**: Swimchain's current approach for posts.
- **Swimchain applicability**: **Already core to design**. The foundation of Swimchain's Sybil economics.

## Comparative Analysis

| Approach | Decentralization | Privacy | Sybil Resistance | Complexity | Maturity |
|----------|-----------------|---------|------------------|------------|----------|
| Worldcoin (Iris Scanning) | Low | Low | High | High | Medium |
| BrightID (Social Graph) | High | Medium | Medium | Medium | Medium |
| Proof of Humanity (Video) | Medium | Low | Medium | High | Medium |
| Gitcoin Passport (Multi-factor) | Medium | Medium | Medium | High | Medium |
| Stake-Based Identity | High | High | High | Medium | High |
| PGP Web of Trust | High | Medium | Low | Medium | High |
| Temporal Limits / Age Weighting | High | High | Medium | Low | High |
| Rate Limiting Nullifier (RLN) | High | High | Medium | High | Low |
| Identity Creation PoW | High | High | Medium | Low | High |
| Social Graph Analysis (Detection) | High | Medium | Medium | Medium | Medium |

**Legend**: High/Medium/Low represent relative assessments within the Sybil resistance solution space.

## Patterns Identified

### Pattern 1: Cost of Forgery

The most robust Sybil defenses make legitimate participation cheap on any single dimension, but bulk identity creation expensive when costs compound across multiple dimensions. Swimchain can stack: time (temporal limits) + computation (PoW) + social capital (graph verification) + optional stake (governance). Each dimension is individually surmountable, but the combination creates prohibitive total cost.

### Pattern 2: Defense in Depth

No single mechanism provides complete Sybil resistance. The most successful systems layer multiple approaches, each catching different attack vectors. Swimchain should combine protocol-level mechanisms (PoW, temporal limits) with community-level mechanisms (vouching, graph analysis) and client-level mechanisms (filtering, detection algorithms).

### Pattern 3: Asymmetric Enforcement

Effective approaches create asymmetry where enforcement cost is low for verifiers but attack cost is high for Sybils. PoW exemplifies this: verification is O(1) but creation is O(difficulty). Temporal limits are similar: checking age is trivial but aging accounts takes wall-clock time that cannot be accelerated.

### Pattern 4: Accept Imperfection

All successful systems accept that some Sybils will exist. The goal is making attacks economically irrational, not mathematically impossible. A system that allows 1% Sybil rate but preserves decentralization and privacy is better than one achieving 0.01% Sybil rate through centralization.

### Pattern 5: Community-Level Flexibility

Different contexts require different Sybil resistance levels. A casual discussion space tolerates more Sybil risk than a voting mechanism allocating resources. Successful systems allow communities to set their own thresholds rather than mandating uniform protocol-level requirements.

### Pattern 6: Time as Defense

Patient attackers can defeat most defenses given enough time. But time itself is a scarce resource. Temporal limits force attackers to choose between immediate impact (detectable Sybil cluster) and slow infiltration (limited accounts, long waits). This trade-off disadvantages most attack scenarios.

## Approaches Incompatible with Swimchain

| Approach | Why Incompatible |
|----------|------------------|
| Worldcoin / Biometric Verification | Requires centralized biometric collection. Violates THESIS_01 (no central authority), THESIS_07 (privacy through pseudonymity), and SPEC_01_IDENTITY anti-pattern ID-A01 (no real-name verification). |
| Phone Number Verification | Requires centralized telecom infrastructure. Creates linkage to real-world identity. Violates VISION.md principle of no central authority to contact. |
| KYC / Government ID Verification | Directly contradicts THESIS_07's argument that real-name policies "primarily create vulnerability for honest users." Violates SPEC_01_IDENTITY ID-A01. |
| IP-Based Rate Limiting (as sole defense) | Easily circumvented with VPNs/Tor. Requires coordinated IP tracking violating decentralization. Punishes privacy-conscious legitimate users. |
| Central Identity Registry | Violates SPEC_01_IDENTITY requirement ID-H03 (no central authority for identity verification) and VISION.md's no mega-nodes principle. |
| Platform-Managed Reputation Scores | Centralized reputation creates trust dependency. Per SPEC_01_IDENTITY, ReputationSummary is explicitly "NOT authoritative." |
| Key Rotation with Reputation Transfer | Explicitly rejected in SPEC_01_IDENTITY anti-pattern ID-A07: "MUST NOT allow key rotation while preserving reputation (this would enable Sybil attacks)." |

## Recommendations

### Primary Recommendation

**Approach**: Layered Defense: PoW + Temporal Graduation + Social Graph Analysis + Optional Stake

**Rationale**: This approach combines multiple mechanisms that are individually imperfect but collectively robust. Each layer addresses different attack vectors while remaining compatible with Swimchain's core values:

1. **Existing PoW per post** (SPEC_03) already makes sustained Sybil activity expensive. A Sybil attacker must invest computation for each account's activity, scaling linearly with attack size.

2. **Identity creation PoW** (optional, per SPEC_01_IDENTITY Section 3.4) raises the cost of batch identity generation. Current spec sets 20-bit difficulty (~seconds on modern hardware). This prevents casual Sybil creation while remaining accessible.

3. **Temporal graduation** leverages Swimchain's existing FirstAppearance tracking (SPEC_01_IDENTITY Section 3.8). Age-weighted reputation means newly-created Sybil identities have minimal weight. Communities can filter by account age. This aligns with THESIS_07's "throwaway accounts have no weight" principle.

4. **Social graph analysis** can detect Sybil clusters through behavioral patterns—accounts that only interact with each other, coordinated posting, unusual relationship structures. This can be implemented at client level without protocol changes, preserving decentralization.

5. **Optional stake for governance** allows spaces that use voting to require economic commitment without mandating it protocol-wide. This addresses the specific threat of governance capture mentioned in THESIS_07.

The "Cost of Forgery" principle unifies these: legitimate participation costs little on any single dimension, but Sybil attacks face compounding costs across time × computation × social capital × optional stake. Well-resourced attackers can still create Sybils, but at costs that make attacks economically irrational for most scenarios.

**Implementation Level**: Protocol + Client

- **Protocol layer**: PoW requirements (existing), FirstAppearance tracking (existing), identity creation PoW (specified but optional)
- **Client layer**: Age-weighted filtering, social graph analysis algorithms, stake-gated governance UI
- **Community layer**: Space-specific thresholds, vouching requirements, stake requirements for governance

**Tradeoffs Accepted**:
- New legitimate users face friction before full participation (temporal limits disadvantage them)
- Social graph analysis is privacy-invasive at some level (behavior patterns are observable)
- Well-resourced state actors can still execute Sybil attacks (but at significant ongoing cost)
- No mechanism provides provable unique-human guarantee (all are probabilistic)
- Community-level gating may create fragmented onboarding experiences

**Open Questions**:
- What's the optimal identity creation PoW difficulty that balances accessibility with Sybil resistance?
- How should age weighting decay over time? (Linear, logarithmic, stepped thresholds?)
- What graph analysis algorithms work best for decentralized Sybil detection without central coordination?
- Should stake requirements for governance be protocol-specified or purely space-level?
- How do temporal limits interact with fork migration? (Does age reset on new forks?)

### Alternative Approaches

#### Rate Limiting Nullifier (RLN) Integration

**When to use**: When Swimchain needs cryptographically-enforced rate limiting that preserves anonymity. Particularly valuable for spaces with high spam risk. Best adopted after the protocol is stable and there's implementation bandwidth for ZK proofs.

**Tradeoffs**: High implementation complexity. Requires ZK-SNARK infrastructure. Relatively immature technology with smaller ecosystem. But provides the strongest privacy guarantees of any rate-limiting approach.

#### BrightID Integration (Optional)

**When to use**: For spaces or governance contexts that want stronger Sybil resistance and users who are willing to complete social verification. Should be opt-in, not protocol-mandated. Useful for high-stakes voting or resource allocation.

**Tradeoffs**: Adds external dependency (BrightID network). Requires users to complete verification process. Social graph vulnerable to coordinated attacks. But most decentralized of the proof-of-personhood options.

#### Progressive PoW Difficulty

**When to use**: When a single identity shows Sybil-like behavior patterns (rapid sequential posts, coordinated activity with new accounts). Difficulty increases for suspicious patterns, making continued attack more expensive.

**Tradeoffs**: Risks false positives on legitimate power users. Requires defining "suspicious" behavior (subjective). But provides dynamic response to active attacks without blacklisting.

#### Community Vouching / Invitation Systems

**When to use**: For spaces that prioritize community cohesion over open access. Existing members vouch for new participants. Natural fit for the forum model and community-layer trust.

**Tradeoffs**: Creates barriers for newcomers. Can become exclusionary. Vulnerable to colluding vouchers. But leverages existing social capital and is fully decentralized.

### Explicitly Rejected Approaches

#### Mandatory Proof of Personhood

**Why rejected**: Any protocol-level requirement for unique human verification would require either biometrics (privacy violation), central registry (decentralization violation), or social verification (accessibility barrier). Per THESIS_01, such barriers should exist for functional reasons, not ideological ones. PoP doesn't enhance Swimchain's core function enough to justify the cost.

#### Universal Stake Requirement

**Why rejected**: Requiring economic stake for participation creates wealth-based access tiers, violating THESIS_01's concern about socioeconomic barriers and VISION.md's anti-pattern of "PoW exclusion" creating "wealth-based access." Stake should be optional for governance, not mandatory for existence.

#### Retroactive Punishment via Slashing

**Why rejected**: Slashing mechanisms require stake that may not exist, and risk punishing legitimate users who are false-positive identified as Sybils. Also creates incentive for attackers to use minimal stake per identity, defeating the purpose.

#### Central Sybil Detection Service

**Why rejected**: Any centralized Sybil detection creates a single point of failure and potential censorship vector. Violates VISION.md's "no entity to contact about takedowns" principle. Detection must be distributed and client-level.

#### Identity Linking Across Platforms

**Why rejected**: Requiring external platform accounts (Twitter, GitHub, etc.) creates dependencies on centralized services and reduces privacy. While Keybase-style proofs can be useful, they must be optional and not grant protocol-level privileges.

## Implementation Considerations

### Dependencies

- **SPEC_01_IDENTITY FirstAppearance tracking** (already specified) - foundation for temporal graduation
- **SPEC_03_PROOF_OF_WORK infrastructure** - identity creation PoW is optional extension
- **SPEC_04_SPACES** - community-level Sybil resistance policies
- **Content propagation layer** - for client-level filtering of suspicious patterns
- **Reputation computation** (currently client-defined per SPEC_01_IDENTITY) - for age weighting

### Complexity

**Estimate**: Medium

The primary recommendation builds on existing protocol features (PoW, FirstAppearance). The main implementation work is:
- Client-level age-weighting algorithms (straightforward)
- Graph analysis for Sybil detection (moderate complexity)
- Space-level stake gating (if desired) (moderate complexity)
- RLN integration (high complexity, future phase)

### Prototype Questions

1. What identity PoW difficulty achieves 30-60 second solve time on reference mobile hardware?
2. How effective is age weighting alone? Simulate Sybil attack with 1000 new accounts vs 100 established.
3. What graph metrics best detect Sybil clusters? (Clustering coefficient, betweenness centrality, etc.)
4. Does RLN integration add unacceptable latency to post submission?
5. How do Sybil costs compare to estimated attacker budgets for various threat actors?

## Remaining Gaps

1. **Exact calibration of identity PoW difficulty** for various device classes (mobile, desktop, low-power)
2. **Formal specification of age-weighted reputation calculation** (currently deferred to community layer)
3. **Graph analysis algorithm specification** for client-level Sybil detection
4. **Fork migration semantics** for temporal limits—does identity age reset on new forks?
5. **RLN maturity assessment** for near-term vs. future integration decision
6. **Economic modeling** of Sybil attack costs vs. attacker incentives for Swimchain-specific threats
7. **Bootstrapping problem** for first users on a new fork establishing credibility
8. **Privacy implications** of graph analysis on user behavior patterns
9. **Accessibility implications** of identity PoW for users with limited hardware

## References

### Proof of Personhood Systems
- Worldcoin: https://worldcoin.org/
- BrightID: https://www.brightid.org/
- Proof of Humanity: https://proofofhumanity.id/
- Gitcoin Passport: https://passport.gitcoin.co/

### Stake-Based Systems
- Ethereum Proof of Stake: https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/
- Polkadot NPoS: https://wiki.polkadot.network/docs/learn-staking

### Web of Trust
- PGP Web of Trust: https://www.gnupg.org/gph/en/manual/x547.html
- Keybase: https://keybase.io/

### Cryptographic Approaches
- Rate Limiting Nullifier (RLN): https://rate-limiting-nullifier.github.io/rln-docs/
- Semaphore (ZK identity): https://semaphore.appliedzkp.org/

### Academic References
- "Sybil Attacks" - Douceur, 2002
- "SybilGuard: Defending Against Sybil Attacks via Social Networks" - Yu et al., 2006

### Swimchain Context
- THESIS_01_EXCLUSION.md - Technical barriers philosophy
- THESIS_07_PSEUDONYMITY.md - Pseudonymity vs. accountability
- SPEC_01_IDENTITY.md - Identity design including FirstAppearance
- SPEC_03_PROOF_OF_WORK.md - PoW specification
- VISION.md - Core principles and anti-patterns

---

*Research completed: 2025-12-24*
*Status: DRAFT - Ready for team review*
