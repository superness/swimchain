# Research Spike: Sponsorship Economics

## Status: DRAFT

## Executive Summary

Sponsorship economics represent Swimchain's core Sybil resistance mechanism, and extensive prior art strongly validates this approach. This research investigates whether sponsorship creates sustainable trust chains that resist Sybil attacks, maintain decentralization, scale with network growth, and survive sponsor failures.

The central insight from prior art is that social capital is uniquely resistant to automation and parallelization. Unlike computational proofs (parallelizable), monetary stakes (purchasable), or biometrics (centralized), genuine trust relationships cannot be manufactured at scale. Systems like Lobste.rs (10+ years of high-quality discussion with invitation-only access), private BitTorrent trackers (contribution-based tiered access), and PGP's web of trust demonstrate that social vouching works when combined with appropriate friction and accountability.

Swimchain's design synthesizes lessons from these predecessors while addressing their limitations. The key innovations are: (1) contribution-based sponsorship rights borrowing from private tracker ratio requirements, (2) explicit consequence propagation with graduated penalties validated by Ostrom's Nobel Prize-winning commons governance research, and (3) time-decaying trust preventing "build trust, then abuse" attacks. The 30-day Resident requirement before sponsorship rights aligns with Lobste.rs's 70-day restrictions and private tracker class requirements.

The primary risk is genesis distribution: all trust flows from the initial 100 identities. Prior art (BrightID seeds, blockchain genesis blocks) confirms this bootstrapping challenge has no perfect solution, only tradeoffs. The recommended hybrid selection process (team + contributors + community) distributes initial trust while maintaining coordination capacity. Secondary concerns include newcomer on-ramps (validated as critical by every successful invitation system) and orphan handling (novel to Swimchain, no direct precedent).

## Research Question

Does sponsorship create sustainable trust chains that:
- Resist Sybil attacks?
- Maintain decentralization?
- Scale with network growth?
- Survive sponsor failures?

## Context

Swimchain's sponsorship model is the primary mechanism for identity creation after the genesis phase. Unlike open registration (trivially Sybil-attacked), centralized registration (censorable single point of failure), or proof-of-stake (plutocracy risk), sponsorship requires existing trusted members to vouch for newcomers. This creates a web of accountability where the cost of attack is measured in social capital and contribution time rather than money or computation.

The sponsorship tree is public, enabling community self-policing. Sponsors bear consequences when their sponsees misbehave, creating incentives for careful vetting. However, this friction must be balanced against newcomer accessibility: without on-ramps for people without existing connections, the network ossifies.

This research examines whether Swimchain's specific design choices (contribution tiers, penalty structure, consequence propagation) are validated by prior art and identifies gaps requiring further investigation.

## Prior Art Analysis

### Web of Trust Systems

#### PGP Web of Trust
- **How it works**: Decentralized trust model where users sign each other's public keys. Trust propagates through a network of cryptographic signatures. Users assign trust levels (complete, marginal) to other keys. A key is valid if signed by at least one completely trusted key or two marginally trusted keys. The "strong set" forms the largest collection of strongly connected keys.
- **Decentralization**: High (no central authority)
- **Trust assumptions**: Users can accurately assess trustworthiness; trust transitivity is meaningful; physical key signing parties ensure authenticity; users maintain their keys and trust databases.
- **Pros**: No central authority needed; trust is cryptographically verifiable; users control their own trust decisions; resistant to single points of failure.
- **Cons**: Only ~325,000 of 2.7 million keys were signed (poor adoption); requires technical sophistication; social graph exposure is a privacy concern; no consequence propagation for bad vouches; Sequoia, PGP, and GnuPG implement different semantics.
- **Real-world outcomes**: Limited adoption despite decades of availability. Research found the WoT is only similar to a scale-free network with different hub properties. New users struggle to get trusted without existing connections. Sequoia (2024+) models WoT as a flow network to improve compatibility.
- **Swimchain applicability**: Strong precedent for sponsor-based trust. Swimchain improves on PGP by adding consequence propagation (sponsors bear costs for bad sponsees) and contribution requirements (must earn sponsorship rights). Key lesson: need on-ramps for newcomers.

#### Lobste.rs Invitation System
- **How it works**: New users must be invited by existing members. The full invitation tree is public, showing who invited whom. New users (first 70 days) cannot send invites, submit new domains, flag content, or use certain tags. No limit on invitations per user. Moderators can disable invite privileges or ban users when sponsees misbehave.
- **Decentralization**: Low (centralized moderation)
- **Trust assumptions**: Existing users can judge who will contribute positively; public accountability (visible tree) deters bad invites; users want to protect their reputation; community has some way to initially bootstrap.
- **Pros**: High-quality discussion maintained for 10+ years; spam effectively controlled without captchas; voting rings detectable through tree analysis; new user restrictions limit blast radius; accountability creates self-policing.
- **Cons**: IRC knowledge required to get invites without knowing someone; previous invitation queue removed due to spam; no formal consequence propagation (just informal moderator action); centralized moderation decisions.
- **Real-world outcomes**: Successfully maintained high-quality tech discussion community for over a decade with slow, steady growth. The system worked by creating "a chain of accountability that could break down as it grows but has a good chance of working out in the long term."
- **Swimchain applicability**: Strong validation of invitation trees working long-term. Swimchain formalizes what Lobste.rs does informally: consequence propagation and contribution requirements. The 70-day new user restriction maps to Swimchain's tiered swimmer levels.

#### Proof of Humanity Protocol
- **How it works**: Ethereum-based registry using social vouching. Users submit video and are vouched for by existing members. Disputes resolved through Kleros decentralized court system. Built by Kleros and Democracy Earth.
- **Decentralization**: High (on-chain, decentralized dispute resolution)
- **Trust assumptions**: Vouchers can verify video authenticity; Kleros courts provide fair dispute resolution; video evidence is sufficient for humanity proof; community will participate in dispute resolution.
- **Pros**: Fully on-chain and decentralized; no specialized hardware required; dispute resolution handles edge cases; privacy-friendly compared to KYC.
- **Cons**: Video requirement has privacy implications; dispute resolution adds friction; voucher liability unclear; complex registration process.
- **Real-world outcomes**: Functioning registry with active users. The Kleros court system handles disputes. Model demonstrates that social vouching can work on-chain at scale.
- **Swimchain applicability**: Similar vouching model. Swimchain adds contribution requirements (must be Resident+ to sponsor) and explicit consequence propagation (sponsors bear penalties for sponsee misbehavior). PoH's video requirement could inform Swimchain's identity verification.

#### BrightID
- **How it works**: Social graph-based proof of unique humanity. Users create connections via the BrightID app. Connections are signed and synced to IDChain (Ethereum PoA chain). SybilRank algorithm analyzes graph structure to estimate anti-Sybil scores. Trusted "seed" identities anchor the analysis. Applications verify uniqueness via API.
- **Decentralization**: Medium (depends on seed selection and IDChain)
- **Trust assumptions**: Social connections indicate real relationships; graph analysis can distinguish real users from Sybils; seed identities are trustworthy; users will build genuine connection networks.
- **Pros**: No biometrics or KYC required; privacy-preserving (names/photos not stored centrally); decentralized verification; works with diverse identity sources.
- **Cons**: Sybil attackers might create disconnected validated clusters; graph analysis makes assumptions about attacker behavior; requires active participation in connection building; seed identity selection is critical.
- **Real-world outcomes**: Used by Gitcoin and other projects. GroupSybilRank algorithm processes connection graphs to detect Sybils. Acknowledged limitation: cannot detect all sophisticated Sybil attacks with manufactured social connections.
- **Swimchain applicability**: Validates social graph for Sybil resistance. Swimchain's sponsorship tree is simpler than BrightID's general graph but shares the same insight: social capital is harder to manufacture than computational proof. BrightID's seed identity concept maps to Swimchain's genesis identities.

### Contribution-Based Access Systems

#### Private BitTorrent Trackers
- **How it works**: Members must be invited by existing members who meet ratio requirements (upload/download bandwidth). Users must maintain minimum share ratios (often 0.7-1.05) or face restrictions/bans. User classes are tiered by contribution metrics (GiB uploaded, torrents uploaded, membership duration, ratio). Higher classes unlock more privileges including invite rights.
- **Decentralization**: Low (centralized tracker administration)
- **Trust assumptions**: Inviters will only invite trustworthy users; ratio requirements ensure reciprocal contribution; personalized announce URLs create accountability; trackers communicate to blacklist bad users across sites.
- **Pros**: Strong incentive alignment via ratio requirements; contribution-based class system rewards good behavior; free leech events help new users build ratios; cross-tracker blacklists deter abuse; elite communities with high content quality.
- **Cons**: Centralized tracker administration; ratio gaming possible with seedboxes; invite trading black markets exist; requires sustained resource contribution.
- **Real-world outcomes**: Created tight-knit communities with excellent content quality. OrPheus requires 10GB+ upload and 0.7+ ratio for Member class. PassthePopcorn requires 500GB upload, 1.05+ ratio, and 50 torrents for Elite. These contribution requirements map directly to Swimchain's swimmer levels.
- **Swimchain applicability**: Direct inspiration for contribution-based access. Private tracker ratio requirements (ongoing contribution to maintain privileges) mirror Swimchain's requirement to maintain hosting levels. Class-based invite limits prevent invite farming.

#### DAO Reputation-Weighted Governance
- **How it works**: Token holders delegate voting power to representatives. Some systems use reputation alongside tokens. Delegation types include weighted/capped, dynamic (real-time reassignment), and reputation/community-based. Proof of Reputation (PoR) calculates voting power from work contributed.
- **Decentralization**: Medium (varies by implementation)
- **Trust assumptions**: Delegatees will vote in delegators' interests; reputation accurately reflects contribution quality; delegation improves participation efficiency; whales can be balanced via weighting.
- **Pros**: Improves voter participation; experts can represent less-informed members; reputation systems reward good behavior; quadratic voting reduces whale dominance.
- **Cons**: Less than 10% of token holders typically vote; reputation systems may conflict with anonymity; gaming, collusion, and implementation complexity; voter apathy leads to power concentration.
- **Real-world outcomes**: Tally powers 10x more onchain DAOs than alternatives, secures $30B+. Research shows delegation with reputation checks can balance influence. Ongoing challenge: voter fatigue and governance complexity.
- **Swimchain applicability**: Swimchain's swimmer levels are contribution-based reputation tiers. Sponsorship capacity (invites per level) mirrors delegation power. Key insight: contribution-based reputation avoids plutocracy but adds complexity.

### Consequence Propagation Systems

#### Ethereum Proof of Stake Slashing
- **How it works**: Validators stake 32 ETH and earn rewards for honest behavior. Slashable offenses (double voting, surround voting, double proposing) trigger immediate 1 ETH penalty, 36-day exit period with stake bleeding, and correlation penalty (3x the % of stake involved). Validators are forced to exit and cannot rejoin without re-entering the activation queue.
- **Decentralization**: High (protocol-level enforcement)
- **Trust assumptions**: Validators are economically rational; slashing penalties exceed attack profits; detection of slashable offenses is reliable; network can verify slashing evidence.
- **Pros**: Clear, deterministic penalty structure; correlation penalty deters coordinated attacks; economic incentives align with network security; extremely low slashing rate (<0.04% of validators).
- **Cons**: Most slashing is unintentional (infrastructure errors); penalties can be extreme (entire stake in coordinated attack); economic barrier to participation (32 ETH); no recovery mechanism for honest mistakes.
- **Real-world outcomes**: As of February 2024, only 414 validators slashed out of ~1.17 million deposited (0.04%). Most slashing is accidental due to running same key on multiple clients. Correlation penalty has never been significantly triggered, suggesting either effective deterrence or lack of coordinated attacks.
- **Swimchain applicability**: Validates graduated penalty approach. Swimchain's 7/30/90-day penalties are less harsh than PoS slashing but similar in structure. Key insight: most Ethereum slashing is accidental, suggesting Swimchain should have recovery mechanisms for honest sponsorship mistakes.

#### Ostrom's Graduated Sanctions
- **How it works**: Nobel Prize-winning research on common pool resource management. Successful commons use graduated sanctions: first offense gets minimal penalty (reminder), subsequent offenses escalate. Sanctions are context-dependent and applied by community members accountable to users. Key design principle: consequences match seriousness and context.
- **Decentralization**: High (community self-governance)
- **Trust assumptions**: Community members can monitor each other; light initial sanctions improve long-term cooperation; graduated approach prevents resentment from harsh first penalties; rules match local conditions.
- **Pros**: Empirically validated across diverse commons (meadows, forests, irrigation); light first sanctions avoid resentment; graduation allows behavior correction; self-governance without external authority.
- **Cons**: Requires community monitoring capacity; may not work for anonymous participants; context-dependency complicates universal rules.
- **Real-world outcomes**: 2023/2024 research experimentally confirmed: graduated sanctioning outperforms strict sanctioning for long-term cooperation. Endogenous choice of sanction type improves outcomes. The "reminder" function of light first sanctions is crucial.
- **Swimchain applicability**: Direct theoretical foundation. Swimchain's 7-day (spam) → 30-day (abuse) → permanent (illegal) penalty structure implements Ostrom's graduated sanctions. The specification's recovery mechanisms also align with Ostrom's emphasis on proportionality.

#### Delegated Proof of Stake (DPoS)
- **How it works**: Token holders vote for delegates/witnesses who produce blocks. Delegates are elected based on stake-weighted votes. Misbehaving delegates lose income, have stake locked, and reputation scored. Election is continuous - delegates can be removed quickly. Used in EOS (21 delegates), Lisk, Tron.
- **Decentralization**: Medium (small delegate sets)
- **Trust assumptions**: Token holders will vote for competent delegates; reputation incentivizes honest behavior; continuous elections allow rapid response to bad behavior; small delegate sets can maintain consensus.
- **Pros**: High throughput (limited validator set); reputation creates non-economic stake; democratic delegate selection; bad actors quickly replaced.
- **Cons**: Plutocracy risk (whales dominate voting); small delegate sets risk centralization; vote buying possible; voter apathy leads to entrenched delegates.
- **Real-world outcomes**: EOS governance faced criticism for whale dominance and collusion. However, the reputation mechanism works: delegates do care about community standing. The threat of losing income and reputation deters most misbehavior.
- **Swimchain applicability**: Validates reputation-as-stake concept. Swimchain sponsors similarly stake reputation rather than money. Key difference: Swimchain uses social rather than token-weighted influence, avoiding plutocracy.

### Sybil Resistance Approaches

#### Gitcoin Passport
- **How it works**: Aggregates verifiable credentials ("stamps") from web2 (Google, Discord, Twitter) and web3 (BrightID, Proof of Humanity, ENS) sources. Each stamp has a weight; scores sum to a Unique Humanity Score. Recommended threshold is 20 for Sybil defense. Onchain stamps use Ethereum Attestation Service.
- **Decentralization**: Medium (depends on stamp sources)
- **Trust assumptions**: Multiple weak signals combine to strong signal; stamp weights can be calibrated correctly; diverse platforms are harder to Sybil simultaneously; users have existing web2/web3 identities.
- **Pros**: Flexible - users choose which stamps to collect; composable - multiple Sybil resistance methods combined; incremental - adding stamps progressively proves humanity; platform-agnostic integration.
- **Cons**: Depends on external platforms (centralized services); weight calibration is complex (Dec 2024 reweight); excludes people without web2/web3 presence; no consequence for vouching for Sybils.
- **Real-world outcomes**: Widely adopted in Web3 ecosystem. Stamp weights range from 0.516 (Discord) to 16.021 (BinanceBABT). Identity staking offers 14.18 points. Periodically reweighted based on abuse patterns.
- **Swimchain applicability**: Different approach: Gitcoin aggregates existing signals while Swimchain creates new sponsorship relationships. Swimchain could integrate as a Gitcoin stamp source. Key insight: weighted aggregation can work but requires ongoing calibration.

#### Worldcoin/World ID
- **How it works**: Uses custom Orb hardware to scan iris biometrics. Creates unique IrisCode that proves person hasn't registered before. Zero-knowledge proofs verify uniqueness without revealing identity. Aims for universal proof of personhood.
- **Decentralization**: Low (centralized hardware and company)
- **Trust assumptions**: Orb hardware is correctly built; iris patterns are unique and stable; biometric data is securely handled; ZK proofs provide sufficient privacy.
- **Pros**: Strong proof of unique humanity; ZK proofs can preserve privacy in verification; no need for social connections; works for anyone with an iris.
- **Cons**: Custom hardware creates trust dependency; major privacy concerns (regulatory bans in Spain, Portugal); exploitation concerns in developing countries; biometric data is permanent - cannot be revoked; centralized company controls system.
- **Real-world outcomes**: Regulatory crackdowns in 2024: Spain and Portugal ordered data collection halt. Argentina fined >$1M for unfair terms. Vitalik Buterin and Edward Snowden both criticized centralization and privacy risks. ~300,000 enrollments in some regions before bans.
- **Swimchain applicability**: Counter-example showing why Swimchain avoids biometrics. Swimchain's social sponsorship is revocable, doesn't require specialized hardware, and doesn't create permanent biometric database. Worldcoin's regulatory troubles validate decentralized approach.

#### SybilGuard/SybilLimit (Academic)
- **How it works**: Social graph-based Sybil detection using random walks. Honest users are densely connected; Sybil clusters have limited connections to honest region. SybilGuard uses O(√n) state per node. SybilLimit achieves near-optimal bound on Sybil acceptance per attack edge.
- **Decentralization**: High (each node runs locally)
- **Trust assumptions**: Social graphs have limited attack edges; honest region is well-connected; Sybil clusters have sparse honest connections; random walks mix faster in honest region.
- **Pros**: Provable bounds on Sybil admission; decentralized (each node runs locally); works with existing social graphs; near-optimal theoretical performance.
- **Cons**: Requires accurate social graph; assumes specific graph properties; may not detect sophisticated attacks; academic - limited real-world deployment.
- **Real-world outcomes**: Foundational academic work (2006-2008) that inspired BrightID and other practical systems. Key insight that Sybil resistance requires social graph analysis is now widely accepted.
- **Swimchain applicability**: Theoretical foundation for sponsorship trees. Swimchain's linear chain detection uses similar intuition: suspicious sponsorship patterns (high depth, low breadth) indicate manufactured trust. Graph analysis can complement explicit sponsorship.

### Decentralized Moderation Systems

#### Fediverse/ActivityPub Defederation
- **How it works**: Instances default to federating with all others. Instance operators can block specific instances (defederation) to prevent content flow. Users can block instances personally. Shared blocklists (Seirdy, Gardenfence, Oliphant, IFTAS DNI) help coordinate. Allowlist federation inverts model - only federate with approved instances.
- **Decentralization**: High (each instance decides)
- **Trust assumptions**: Instance admins can judge other instances; defederation threat deters bad behavior; shared blocklists are trustworthy; nuclear option is sufficient for worst cases.
- **Pros**: Truly decentralized - no global authority; each community sets own standards; defederation is reversible; allows community diversity.
- **Cons**: Average 82.3 days to defederate even controversial instances; no graduated sanctions - binary block/allow; inconsistent enforcement across instances; spam attacks exploited open registrations (Feb 2024).
- **Real-world outcomes**: 800+ servers joined Fedipact to block Threads preemptively. February 2024 spam attack highlighted vulnerabilities of open registration. Mastodon recommends approval mode + CAPTCHA for spam defense.
- **Swimchain applicability**: Shows limits of pure defederation. Swimchain's sponsorship provides graduated response (not just block/allow) and individual accountability (not just instance-level). Fediverse spam attacks validate need for registration friction.

#### Bluesky/Mastodon Account Controls
- **How it works**: Bluesky developing automated detection for fake/spam accounts. Goal: detect and delete within seconds of report. 2024: 66,308 accounts removed by moderators, 35,842 by automation. Mastodon uses approval mode, CAPTCHAs, and disposable email blocking. Both face cross-network spam via bridges.
- **Decentralization**: Medium (centralized moderation decisions)
- **Trust assumptions**: Automated detection can identify spam patterns; moderators can process reports quickly; CAPTCHAs/approval create sufficient friction; cross-network federation can be managed.
- **Pros**: Fast response to spam (seconds for automated); lower barrier to entry than invitation systems; can operate at scale; iterative improvement of detection.
- **Cons**: Cat-and-mouse with spammers; cross-network bridges create attack vectors; centralized moderation decisions; no accountability chain for bad actors.
- **Real-world outcomes**: May 2024 "vote Trump" spam hit Bluesky via Nostr bridge - Nostr's easy account creation enabled the attack. Bluesky's 2024 moderation report shows automation handled ~35% of removals. Mastodon's February 2024 spam attack hit servers with open registration.
- **Swimchain applicability**: Shows limitations of post-hoc moderation. Swimchain's sponsorship creates pre-registration friction, preventing spam rather than reacting to it. Key insight: open registration + bridges creates attack surface that sponsorship addresses.

### Trust Decay Mechanisms

#### Blockchain Reputation Decay Systems
- **How it works**: Time-decay (aging) weights recent transactions higher than historical ones. Reputation scores may combine initial stake-based reputation with cumulative trust from behavior. BRBC (Blockchain Reputation-Based Consensus) requires minimum reputation to participate. Hierarchical models use decayed historical trust plus corrected objective trust.
- **Decentralization**: Medium (varies by implementation)
- **Trust assumptions**: Recent behavior is more predictive than distant past; decay prevents gaming via dormant accounts; reputation can be meaningfully quantified; thresholds can be calibrated correctly.
- **Pros**: Prevents "shelf and return" attacks; aligns incentives with ongoing contribution; adaptive to behavior changes; defense against reputation farming.
- **Cons**: No decay can lead to monopolization (RepuCoin); calibrating decay rate is difficult; may unfairly penalize intermittent participation; complex to implement correctly.
- **Real-world outcomes**: Research shows RepuCoin's no-decay model could enable monopolization and collusion. BRBC uses reputation thresholds + random judge selection for security. Decay is recognized as essential for long-term system health.
- **Swimchain applicability**: Validates Swimchain's decay approach. Content decay (SPEC mentions accelerated decay penalty) aligns with this research. Key insight: systems without decay become gameable; systems with excessive decay discourage participation.

### Identity Linking Systems

#### Keybase Social Proofs
- **How it works**: Users cryptographically prove ownership of social media accounts by posting signed statements. Keys are published on keybase.io with Merkle tree verification. Supports Twitter, GitHub, Reddit, HN, websites, and crypto addresses. Client-side verification of signatures against published proofs.
- **Decentralization**: Low (centralized service)
- **Trust assumptions**: Social platforms won't forge posts; users maintain control of linked accounts; Keybase servers are honest about Merkle roots; key management is secure.
- **Pros**: Cryptographically verifiable proofs; links multiple identities to single key; no central trust for verification (client-side); over 100,000 users joined.
- **Cons**: Keybase is VC-backed centralized company; no active development since April 2023; key services deprecated (wallet 2023, public hosting 2023); broken functionality reported in 2025.
- **Real-world outcomes**: Integrated with Mastodon in 2019. Acquired by Zoom in 2020. Effectively abandoned by 2024 with no new development. Shows risk of depending on centralized service for decentralized identity.
- **Swimchain applicability**: Warning example: centralized identity services can be abandoned. Swimchain's sponsorship tree is self-contained - doesn't depend on external platforms. However, Keybase's proof concept could inspire Swimchain identity linking.

#### Ethereum Attestation Service (EAS)
- **How it works**: Free, open protocol for on-chain attestations. Users register schemas, then make attestations following them. Uses EIP-712 for secure, human-readable signing. Supports on-chain (immutable, gas costs) and off-chain (IPFS, lower cost, better privacy) attestations. Merkle trees enable private data attestations with selective disclosure.
- **Decentralization**: High (protocol-level, no central authority)
- **Trust assumptions**: Attesters are credible for their domain; schemas capture meaningful relationships; blockchain provides immutability; users understand what they're attesting to.
- **Pros**: Flexible - any attestation type; privacy options via off-chain and Merkle proofs; composable across ecosystem; standards-based (EIP-712).
- **Cons**: No built-in consequence for false attestations; gas costs for on-chain attestations; requires existing on-chain identity; schema design is complex.
- **Real-world outcomes**: Growing adoption for credentials, identity, and ownership proofs. Gitcoin Passport uses EAS for onchain stamps. Future trends include W3C VC compatibility and ZK primitives for private compliance.
- **Swimchain applicability**: Potential infrastructure for Swimchain attestations. Sponsorship could be recorded as EAS attestations. Peer attestations for contribution could use EAS schemas. Key consideration: EAS doesn't include consequence propagation.

## Comparative Analysis

| Approach | Decentralization | Privacy | Sybil Resistance | Newcomer Access | Consequence Propagation | Maturity |
|----------|-----------------|---------|------------------|-----------------|------------------------|----------|
| PGP Web of Trust | High | Low | Medium | Low | Low | High |
| Lobste.rs Invitation | Low | Low | High | Medium | Medium | High |
| Private BitTorrent Trackers | Low | Medium | High | Low | Medium | High |
| Ethereum PoS Slashing | High | Medium | High | Low | High | High |
| Ostrom's Graduated Sanctions | High | High | Medium | High | High | High |
| BrightID | Medium | Medium | Medium | Medium | Low | Medium |
| Gitcoin Passport | Medium | Medium | Medium | High | Low | Medium |
| Worldcoin/World ID | Low | Low | High | High | Low | Low |
| Fediverse Defederation | High | High | Low | High | Low | High |
| **Swimchain Sponsorship** | **High** | **Medium** | **High** | **Medium** | **High** | **Low** |

## Patterns Identified

### Pattern 1: Contribution-Based Access Tiers
Multiple systems gate privileges on demonstrated contribution over time. Private trackers require ratio maintenance; Lobste.rs has 70-day new user restrictions; DPoS requires stake for delegation capacity. Swimchain's swimmer levels (NewSwimmer → PoolKeeper) directly implement this pattern. The 30-day Resident requirement for sponsorship aligns with private tracker and Lobste.rs precedents.

### Pattern 2: Graduated Sanctions
Effective governance uses escalating penalties: warnings → restrictions → removal. Harsh first penalties create resentment; proportional escalation allows correction while deterring abuse. Swimchain's 7-day (spam) → 30-day (abuse) → permanent (illegal) structure directly implements Ostrom's research-validated pattern. 2023/2024 experimental research confirmed this approach outperforms strict first-offense penalties.

### Pattern 3: Reputation/Social Capital as Stake
Social systems use reputation rather than monetary stake. DPoS delegates stake reputation on behavior. Lobste.rs sponsors risk invite privileges. BrightID seeds anchor trust graphs. Swimchain's core innovation: sponsors stake reputation, not money. This avoids plutocracy while creating meaningful accountability.

### Pattern 4: Time Decay for Trust
Recent behavior is weighted higher than historical. Prevents "shelf and return" attacks where dormant accounts resurface. Addresses reputation farming where users build trust then abuse it. Swimchain's contribution-based levels require ongoing hosting. Dormant sponsors lose level. Accelerated decay as penalty further implements this pattern.

### Pattern 5: Public Accountability Trees
Visible sponsorship/invitation chains create accountability. Lobste.rs' public tree deters bad invites. PGP web of trust is auditable. Transparency enables community self-policing. Swimchain's sponsorship tree is public. Linear chain detection uses visible structure. Public accountability is a feature, not a bug.

### Pattern 6: Consequence Propagation with Decay
Consequences flow through trust networks but attenuate with distance. 1-hop sponsors bear most responsibility; distant relationships bear little. Matches intuition about moral responsibility. Swimchain's explicit 2-hop limit aligns with network science research showing trust decays rapidly beyond 3 hops.

### Pattern 7: Genesis/Seed Problem
All trust networks need initial anchors. BrightID has seeds, blockchains have genesis blocks, Lobste.rs started with founders. The question is how to prevent founder capture. Swimchain's 100 genesis identities with hybrid selection (team + contributors + community) addresses this. Multiple roots prevent single-point capture.

### Pattern 8: On-Ramps for Newcomers
Closed systems need entry mechanisms. Lobste.rs has IRC/queue, private trackers have recruitment threads, Proof of Humanity has open registration with vouching. Without on-ramps, systems ossify. Swimchain's PublicSponsorshipOffer mechanism addresses this directly. Probationary sponsorship reduces sponsor risk for unknown newcomers.

## Approaches Incompatible with Swimchain

| Approach | Why Incompatible |
|----------|------------------|
| Worldcoin/World ID Biometrics | Violates pseudonymity value (permanent biometric linkage), requires centralized hardware trust (custom Orb), creates irrevocable identity (biometrics can't be reset). Regulatory crackdowns (Spain, Portugal, Argentina) demonstrate societal rejection. |
| Centralized KYC/Registration | Violates true decentralization (central authority controls access), violates user self-protection (platform as gatekeeper), creates single point of failure/censorship. Antithetical to "forks over consensus" - can't fork from centralized identity provider. |
| Token-Weighted Voting/Access | Creates plutocracy where wealthy actors dominate. Violates decentralization by concentrating power. Social capital (contribution, sponsorship) is more egalitarian than monetary stake. EOS's whale-dominated governance demonstrates failure mode. |
| Open Registration | Provides zero Sybil resistance. February 2024 Mastodon spam attack and May 2024 Bluesky bridge attack demonstrate catastrophic failure of open registration. Violates "friction is intentional" principle. |
| Platform-Dependent Identity (Keybase Model) | Centralized services get abandoned (Keybase: no development since April 2023, key features deprecated). Creates external dependency that violates decentralization. Swimchain's self-contained sponsorship tree avoids this failure mode. |
| Deep Consequence Propagation (>2 hops) | Beyond 2 hops, relationship is too attenuated for meaningful accountability. Punishing great-great-sponsors is unfair and creates excessive caution. Network science research confirms trust becomes negligible beyond 3-4 hops. |
| Harsh First Penalties | Ostrom's research (validated experimentally in 2023/2024) shows graduated sanctions outperform strict first penalties. Light initial sanctions allow behavior correction and prevent resentment. Ethereum's slashing data shows most violations are accidental. |
| Non-Decaying Trust/Reputation | Systems without time decay become gameable through "shelf and return" attacks (build trust, go dormant, return to abuse). RepuCoin research shows no-decay enables monopolization and collusion. Ongoing contribution requirements are essential. |

## Recommendations

### Primary Recommendation

**Approach**: Contribution-Based Sponsorship with Graduated Consequence Propagation

**Rationale**: This synthesis of private tracker contribution tiers, Lobste.rs accountability trees, and Ostrom's graduated sanctions represents the strongest Sybil resistance compatible with Swimchain's values. Key elements:

1. **30-day Resident requirement before sponsorship rights** matches proven patterns from private trackers and Lobste.rs
2. **Tiered sponsorship capacity** (Lifeguard: 1/month, Anchor: 3/month, PoolKeeper: unlimited) prevents invite farming while rewarding contribution
3. **7-day/30-day/90-day graduated penalties** implement Ostrom's experimentally-validated approach
4. **2-hop consequence propagation with decay** (100%→50%→negligible) aligns with network science research showing trust attenuates rapidly beyond 2-3 hops
5. **Public sponsorship tree** enables community self-policing, validated by Lobste.rs's 10+ year success

**Implementation Level**: Protocol

**Tradeoffs Accepted**:
- Higher barrier to entry than open systems - newcomers need sponsors
- Public sponsorship tree exposes social graph (privacy cost for accountability)
- Contribution requirements exclude users with limited resources
- Genesis distribution creates temporary centralization during bootstrap
- Specific penalty percentages (100%/50%/negligible) are untested - may need calibration

**Open Questions**:
- What is the optimal decay rate for contribution requirements during inactivity?
- How should cross-fork reputation work when behavior differs between forks?
- What threshold for linear chain detection minimizes false positives while catching attacks?
- Should penalty stacking be linear or sublinear for multiple offenses?

### Alternative Approaches

#### Probationary Sponsorship for Newcomers
**When to use**: When sponsors want to help newcomers but don't know them well. PublicSponsorshipOffer mechanism where sponsors advertise availability. Probationary period (60 days) with reduced consequence propagation to sponsor.

**Tradeoffs**: Slightly weakens accountability chain but provides essential on-ramp. Every successful invitation system (Lobste.rs IRC, private tracker recruitment) has newcomer mechanisms. Without this, growth stalls.

#### Orphan Adoption by PoolKeepers
**When to use**: When sponsors become inactive or are revoked. PoolKeeper-level users can "adopt" orphaned branches, taking on sponsorship responsibility without original penalty inheritance.

**Tradeoffs**: Novel mechanism without direct precedent. Adds protocol complexity. But necessary for network resilience - sponsor failure shouldn't strand legitimate users.

#### Contribution-Accelerated Penalty Recovery
**When to use**: When penalized sponsors demonstrate good faith through exceptional contribution. 2× normal hosting during penalty → 50% time reduction.

**Tradeoffs**: Reduces penalty harshness, which could encourage risk-taking. But Ethereum slashing data shows most violations are accidental - recovery mechanisms prevent punishing honest mistakes too severely.

### Explicitly Rejected Approaches

| Approach | Why Rejected |
|----------|--------------|
| Monetary Stake for Sponsorship | Creates plutocracy where wealthy actors can sponsor more. Violates Swimchain's egalitarian values. Social capital (demonstrated contribution) is the appropriate stake, not financial capital. |
| Deep Consequence Propagation (>2 hops) | Beyond 2 hops, relationship is too attenuated for meaningful accountability. Punishing great-great-sponsors is unfair and creates excessive caution. Network science research confirms trust becomes negligible beyond 3-4 hops. |
| Harsh First Penalties | Ostrom's research (validated experimentally in 2023/2024) shows graduated sanctions outperform strict first penalties. Light initial sanctions allow behavior correction and prevent resentment. Ethereum's slashing data shows most violations are accidental. |
| Automatic Punishment for Linear Chains | Linear sponsorship patterns may indicate attack trees but also legitimate mentorship chains. Flagging for review is appropriate; automatic punishment creates false positives. No deployed precedent for automatic linear chain detection. |
| Non-Decaying Trust/Reputation | Systems without time decay become gameable through "shelf and return" attacks (build trust, go dormant, return to abuse). RepuCoin research shows no-decay enables monopolization and collusion. Ongoing contribution requirements are essential. |

## Implementation Considerations

- **Dependencies**: Identity layer (SPEC_10) must be complete before sponsorship tree can be built; content hosting infrastructure needed for contribution measurement; penalty enforcement requires content moderation framework; genesis distribution process must precede network launch.

- **Complexity**: Medium - well-understood patterns from prior art, but novel combination. Core data structures are straightforward (sponsorship tree, penalty tracking). Contribution measurement requires hosting verification infrastructure.

- **Protocol vs. Client Components**:
  - **Protocol level**: Sponsorship tree structure and cryptographic signatures; contribution measurement (hosting verification); penalty enforcement and propagation; genesis identity validation; orphan status tracking.
  - **Client level**: PublicSponsorshipOffer discovery and presentation; sponsorship request UI/UX; penalty notification and status display; tree visualization (optional); contribution tracking dashboard.

- **Prototype questions**:
  - What tree shapes emerge under various growth assumptions? (Monte Carlo simulation)
  - What is the false positive rate for linear chain detection at different thresholds?
  - How do orphan cascades propagate when major sponsors fail?
  - What contribution levels are achievable for average users? (usability testing)
  - How quickly can attackers reach Lifeguard level under adversarial assumptions?

- **Launch sequence**:
  1. Implement sponsorship data structures and cryptographic validation
  2. Build contribution measurement infrastructure
  3. Execute genesis distribution process (hybrid selection)
  4. Enable basic sponsorship (Lifeguard+ can invite)
  5. Add penalty enforcement and propagation
  6. Implement PublicSponsorshipOffer for newcomer on-ramp
  7. Monitor tree health metrics (depth distribution, orphan rate)
  8. Tune parameters based on observed behavior

## Remaining Gaps

- **Cross-fork reputation handling** - No prior art addresses behavior differences between forks. If a user misbehaves on Fork A but behaves on Fork B, how should Fork B treat their reputation?

- **Penalty calibration** - Specific penalty percentages (100%→50%→negligible) are based on intuition, not empirical validation. May need adjustment after observing real-world behavior.

- **Linear chain detection thresholds** - The 0.8 linearity score threshold is untested. May produce false positives for legitimate mentorship chains or miss sophisticated attacks.

- **Orphan handling mechanisms** - Novel to Swimchain with no direct precedent. Need real-world validation of edge cases (mass orphaning, nested orphan chains).

- **Social pressure dynamics** - "Please sponsor me" requests may create informal obligations outside the protocol. This social layer is hard to anticipate.

- **Contribution measurement across heterogeneous nodes** - Users with different bandwidth capabilities (asymmetric connections) may have difficulty meeting hosting requirements.

- **Recovery from false-positive penalties** - Need defined appeals process for sponsors incorrectly penalized due to sponsee behavior that was later exonerated.

- **Genesis identity sunset** - Should genesis status ever expire or diminish? Current design treats genesis as permanent, but this creates lasting asymmetry.

## References

### Academic Sources
- Ostrom, E. (1990). *Governing the Commons*. Cambridge University Press.
- Yu, H., Kaminsky, M., Gibbons, P. B., & Flaxman, A. (2006). "SybilGuard: Defending Against Sybil Attacks via Social Networks." ACM SIGCOMM.
- Yu, H., Gibbons, P. B., Kaminsky, M., & Xiao, F. (2008). "SybilLimit: A Near-Optimal Social Network Defense against Sybil Attacks." IEEE S&P.
- 2023/2024 experimental validation of graduated sanctions: https://journals.sagepub.com/doi/10.1177/10434631231219608

### System Documentation
- Lobste.rs About Page: https://lobste.rs/about
- Ethereum Slashing Documentation: https://ethereum.org/developers/docs/consensus-mechanisms/pos/rewards-and-penalties/
- BrightID: https://www.brightid.org/
- Gitcoin Passport: https://go.gitcoin.co/passport
- Proof of Humanity: https://proofofhumanity.id
- Ethereum Attestation Service: https://attest.org/

### Analysis and Commentary
- Vitalik Buterin on biometric identity: https://vitalik.eth.limo/general/2023/07/24/biometric.html
- Consensys on Ethereum slashing: https://consensys.io/blog/understanding-slashing-in-ethereum-staking-its-importance-and-consequences
- Carnegie Endowment on Fediverse defederation: https://carnegieendowment.org/research/2025/03/fediverse-social-media-internet-defederation/
- PGP Web of Trust analysis: https://www.inderscienceonline.com/doi/abs/10.1504/IJBIS.2023.134956

### Private Tracker References
- https://www.downloadprivacy.com/how-to-torrent/private-trackers
- https://inviteforum.com/threads/user-classess-benefits-on-private-trackers.665/

---

*Research completed: 2025-12-27*
*Status: DRAFT - Ready for team review*
