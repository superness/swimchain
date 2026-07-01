# Research Spike: Community Attestation Mechanisms

## Status: DRAFT

## Executive Summary

Community attestation provides a viable path to decentralized moderation that aligns strongly with Swimchain's core values. This research examines how threshold-based attestation (N-of-M from independent sources) can provide effective spam/abuse detection, resist gaming and collusion, treat legitimate content fairly, and scale with network growth.

The research validates that Swimchain's proposed 3-attester threshold with sponsor tree deduplication is well-calibrated based on prior art. Stack Overflow uses 6 flags for automatic deletion, Wikipedia enforces a 3-revert rule, and academic literature consensus is 3-5 for informal moderation mechanisms. Swimchain's tree deduplication—counting attestations from the same sponsor tree as one—is a novel enhancement that addresses known Sybil ring vulnerabilities in existing systems.

The critical insight is that **social cost is the correct Sybil resistance mechanism for social platforms**. Unlike computational costs (Proof of Work) or economic costs (Proof of Stake), social capital cannot be purchased, parallelized, or automated. Swimchain's design—requiring 30 days + 10GB hosting contribution for attestation eligibility—creates meaningful investment that prior art shows is effective. Accelerated decay (4-hour half-life) rather than instant deletion is a genuine innovation that provides counter-attestation windows, reduces false positive permanence, and maintains transparency.

## Research Question

Can community attestation provide:
- Effective spam/abuse detection?
- Resistance to gaming and collusion?
- Fair treatment of legitimate content?
- Scalability with network growth?

## Context

Swimchain requires a moderation mechanism that operates without central authority while preventing abuse. Traditional platforms rely on appointed moderators (Reddit), reputation-gated flagging (Stack Overflow), or instance-level administration (Mastodon). All of these create power concentration incompatible with Swimchain's decentralization values.

The attestation mechanism must work within Swimchain's existing architecture:
- **Sponsor trees**: Identity Sybil resistance through social vouching chains
- **Swimmer levels**: Progressive trust based on age and contribution (Resident → Lifeguard → Anchor → PoolKeeper)
- **Content decay**: Natural ephemerality with heat-based half-life extension
- **Fork capability**: Exit mechanism for communities that disagree with network-wide policies

## Prior Art Analysis

### Centralized Platform Moderation

#### Stack Overflow Flagging System

- **How it works**: Users with 15+ reputation can flag posts as spam, offensive, or low-quality. Users get 10 general flags/day plus 1 per 1,000 reputation (max 100). Spam/offensive flags limited to 5/day. Six flags within 2 days trigger automatic deletion by the Community user. Flag weight system: users who flag accurately gain bronze/silver/gold/deity whistle levels and their flags carry more weight. Automated 'Unfriendly Robot' system flags comments (UR-V2 achieved 72% acceptance rate on 35,341 flags). SmokeDetector/Charcoal system aims for 0% false negative rate on spam, accepting some false positives.
- **Decentralization**: None. Central moderators make final decisions.
- **Trust assumptions**: Reputation system accurately reflects user quality; algorithmic detection complements human review.
- **Pros**: Weighted flagging reduces gaming; threshold hiding works before review; privilege loss deters abuse; automated systems scale.
- **Cons**: Central review creates bottleneck; significant false positive rate on duplicates; 2023 moderator strike showed fragility; 77% decline in new questions since 2022 attributed to hostile moderation culture.
- **Real-world outcomes**: System became notorious for hostile, condescending responses to newcomers. 2023 moderator strike saw 70% of SO moderators stop work over AI policy disputes. Critics compare it to 'Stanford Prison Experiment' where moderators earned reputation by 'culling interactions'.
- **Swimchain applicability**: Threshold hiding → accelerated decay parallel is strong. Weighted flagging by level is applicable. Privilege loss mechanism translates directly. **Key lesson**: Avoid central review bottleneck and hostile culture that emerged from gamification of moderation.

#### Reddit Community Moderation

- **How it works**: Subreddit moderators (appointed, not elected) enforce rules. 3% of all content removed in H1 2024 (1.6% by volunteer mods, 1.5% by admins). 22.5% of non-spam removals are policy violations. Bots augment volunteer moderators. Only 1.2% of communities had AI-specific rules as of Nov 2024. r/politics (8.5M subscribers) is one of world's largest political forums with active mod research partnerships.
- **Decentralization**: Low. Appointed moderators create power dynamics.
- **Trust assumptions**: Appointed moderators are trustworthy; community can migrate away from bad mods; platform admins provide backstop.
- **Pros**: Community-specific rules work well; scale achieved through volunteer labor; subreddits can experiment with different approaches.
- **Cons**: Political bias in moderation documented (commenters with different views than mods more likely removed); volunteer burnout is real; subreddit capture happens; report queue overwhelm possible.
- **Real-world outcomes**: Michigan study of 600M comments found political bias in removal decisions. 365.4M weekly active users Q3 2024. Research shows moderation is 'ripe environment for unconscious bias'. AI flagging achieves 88% accuracy vs 72% for manual alone, but creates more work through verification requirements.
- **Swimchain applicability**: No appointed moderators aligns with Swimchain's decentralization goals. Distributed moderation through attestation is the alternative. Fork-away prevents capture. **Key insight**: Political/opinion content must not trigger consequences (behavioral specificity).

#### Hacker News Flagging

- **How it works**: Users with 31+ karma can flag submissions. Users with 501+ karma can downvote comments. Flags act as 'super downvote'—enough flags strongly reduce rank or kill submission. 31+ karma users can also vouch for [dead] content to restore it. One full-time moderator (dang). All comments start at 1 point, minimum -4. Comment scores hidden from non-authors to prevent bandwagoning.
- **Decentralization**: Low. Single implementation with single moderator.
- **Trust assumptions**: High-karma users are trustworthy; single moderator can handle edge cases; karma correlates with community values.
- **Pros**: Weighted flagging works; private flags reduce drama; karma threshold prevents new-user gaming; vouch mechanism allows recovery.
- **Cons**: Single implementation (central); topics around diversity 'flagged to death' despite being on-topic; decline in active contributors noted in 2024; ~20% of front-page stories penalized with no transparency.
- **Real-world outcomes**: 2024 analysis shows decline in active contributors. Diversity topics frequently flagged to death despite being on-topic; moderators occasionally unkill but 'rarely sticks'. AI discussions surged past software development topics in 2023.
- **Swimchain applicability**: Weight attestation by swimmer level (Resident=1.0, Lifeguard=1.5, Anchor=2.0, PoolKeeper=2.5). Consider private attestations to reduce drama. Level threshold for attestation (Resident+). Vouch/counter-attestation mechanism is directly applicable. **Key lesson**: Even weighted systems can suppress legitimate minority viewpoints.

### Federated Platform Moderation

#### Mastodon Instance Moderation

- **How it works**: Each instance sets own moderation policies. Moderation always applied locally—admins cannot affect users on other servers. Blocklists (.csv files) shared between administrators. Instance suspension removes account publicly but data retained 30 days for appeals. Community-based moderation where servers limit/filter content types. 10M+ registered users by mid-2024, 1.5M active monthly.
- **Decentralization**: High. Each instance is autonomous.
- **Trust assumptions**: Instance admins are trusted by their users; blocklist curation is done responsibly; federation maintains network health.
- **Pros**: Small, closely related communities deal with unwanted behavior more effectively; no single global policy required; users choose their trust model.
- **Cons**: Cross-instance coordination is hard; blocking is binary (all or nothing per instance); instance shopping for content happens; automatic blocklist importing risks unintended consequences.
- **Real-world outcomes**: Post-Twitter migration (Oct 2022) caused challenges distinct from large commercial platforms. Research found tension between centralization and decentralization cuts across network. 2024 study found blocking can isolate entire communities, useful for toxic content but 'false positives can be consequential'. Mastodon 4.5 (Nov 2025) added quote posts with user consent controls.
- **Swimchain applicability**: No instances (everyone on same network)—different architecture. Client-level filtering instead of instance blocking. Attestation provides shared signal across network. Forks as ultimate escape valve mirrors instance migration. **Key lesson**: Binary blocking is too coarse; graduated response (accelerated decay) is better.

### Consensus-Based Moderation

#### Wikipedia Edit Wars & Protection

- **How it works**: Anyone can edit, anyone can revert. Three-revert rule (3RR): no more than 3 reverts in 24 hours on single page. Extended Confirmed Protection (ECP) requires 30+ days registered and 500+ edits. Dispute resolution through Request for Comment (RfC). Arbitration Committee handles escalated disputes. 2024 research identified 217 articles on contributor conflict, with 34 studies on conflict causes/resolution.
- **Decentralization**: Medium. Administrators still hold special powers.
- **Trust assumptions**: Consensus can be reached through discussion; protection levels fairly applied; arbitration committee is neutral.
- **Pros**: Consensus is slow but durable; protection levels (rate limiting) help; academic research shows banning problematic editors often hinders consensus.
- **Cons**: Pure open-editing is chaotic; administrators still central; sock puppets causing significant disruption (2025 finding); edit wars escalate on contentious topics.
- **Real-world outcomes**: 2025: 14 editors barred from Palestine-Israel pages, sock puppets identified as 'ongoing issue causing significant disruption'. English Wikipedia had ~130 billion page views in 2024. Research shows increasing neutral/trustworthy agents decreases consensus time; equal opposing views = longest duration.
- **Swimchain applicability**: Content immutability (no edits, decay instead) avoids edit war problem entirely. Attestation as alternative to protection levels. Decay IS the consensus mechanism. Age/contribution thresholds (30 days, 10GB) parallel Wikipedia's 30 days/500 edits.

### Cryptoeconomic Security

#### Blockchain Sybil Resistance Mechanisms

- **How it works**: Multiple approaches: Proof of Work (computational cost), Proof of Stake (economic stake), Identity Verification (World ID with biometrics), Web of Trust (social vouching like BrightID, Circles UBI). 2024 research reviewed 21,799 records, identifying 483 relevant mechanisms. Identity-augmented PoS (IdAPoS) combines PoS with trustless reputation.
- **Decentralization**: Varies by mechanism.
- **Trust assumptions**: Varies—computational cost is real, stake is at risk, identities are unique.
- **Pros**: PoW/PoS make attacks economically infeasible; multi-layered approaches 5x more effective than individual strategies; social cost cannot be parallelized.
- **Cons**: 2024 'Sybil Vulnerability Trilemma': no system can be permissionless, Sybil-resistant, and free simultaneously; graph-based detection struggles with small Sybil rings; web of trust centralizes around hub individuals; PoS vulnerable to long-range attacks.
- **Real-world outcomes**: Research shows combined strategies extend takeover time by ~5x. World ID uses biometric (eye scan) with zero-knowledge proofs. BrightID/Circles UBI use social graph vouching but vulnerable to interconnected fake personas. Polkadot pursuing Proof of Personhood without KYC.
- **Swimchain applicability**: Sponsor tree design directly addresses web of trust vulnerabilities. Tree deduplication prevents interconnected Sybil clusters. 270 account-days investment requirement creates significant social cost. **Key insight**: Social cost is the right Sybil resistance for social platforms (not computational or economic).

#### Token Curated Registries (TCRs)

- **How it works**: Participants use tokens to vote on which entries should be included/excluded from registry. Democratizes curation process. Smart contracts manage governance. Used for curating quality/reliable data in Web3. 2024 research on memo.cash found platform action count (not hate speech) was most crucial factor in user muting decisions.
- **Decentralization**: High.
- **Trust assumptions**: Token holders have aligned incentives; economic stake creates honest behavior; majority rule produces quality outcomes.
- **Pros**: Decentralized curation without central authority; economic incentives for honest participation; mitigates bias of centralized moderation.
- **Cons**: Economic stake required (wealth bias); majority can tyrannize minority; complex tokenomics; vulnerable to whale manipulation.
- **Real-world outcomes**: Web3 social media DApp market estimated at $500M in 2025 with 30% CAGR. Farcaster uses hybrid on-chain/off-chain model. Bluesky uses AT Protocol with user-controlled algorithms. Research found user-controlled moderation on memo.cash mostly driven by activity volume, not content quality.
- **Swimchain applicability**: Swimchain uses contribution-based access rather than token staking—avoids wealth bias. Attestation power from hosting contribution, not economic stake. **Key learning**: Avoid tokenomics complexity; contribution = stake is more aligned with social platform goals.

#### DAO Governance Voting Systems

- **How it works**: Collective decision-making through proposals where members vote using governance tokens. As of 2024: $24.5B total treasury, 11.1M token holders, 13,000+ DAOs. Reputation-based systems award points for contributions/participation. 2024 research identified whale problem (power concentration) and collusion issue (fraudulent collaboration) as key challenges.
- **Decentralization**: High.
- **Trust assumptions**: Token/reputation distribution is fair; voters are informed; smart contracts execute faithfully.
- **Pros**: Transparent voting records; no single point of control; reputation systems encourage participation.
- **Cons**: Governance extraction vulnerability identified; delegation monopolies replicate centralized structures; reputation metrics can be manipulated; small number of delegates often control majority.
- **Real-world outcomes**: Research shows 'governance extraction through technical proposals' as critical vulnerability. Reputation-based delegation systems have uncertain efficacy because 'reputational metrics can be manipulated'. Multi-layered threshold mechanisms proposed to reduce communication delay.
- **Swimchain applicability**: Attestation threshold (3 Residents) is a voting threshold mechanism. Counter-attestation (5 Lifeguards) is higher threshold for reversal. Graduated consequences by hop distance mirrors voting weight decay. **Key insight**: Reputation systems must be contribution-backed to resist manipulation.

### Distributed Content Detection

#### CSAM Hash Matching & Blocklists

- **How it works**: Two types: cryptographic (exact match only) and perceptual (detects altered/similar content). NCMEC provides 5M+ hash values to tech companies. Google contributes ~74% of industry hash sharing platform. Safer by Thorn processed 112.3B images/videos in 2024, matched 6.4M files. AWS reports ~99.9% accuracy matching against NCMEC database.
- **Decentralization**: Low. NCMEC is central authority.
- **Trust assumptions**: NCMEC database is authoritative; hash matching is accurate; companies implement honestly.
- **Pros**: High accuracy (~99.9%); scales to billions of files; perceptual hashing catches modifications; industry coordination works.
- **Cons**: Centralized database (NCMEC); AI-generated CSAM doubled 2024→2025; Apple sued for $1.2B over false positive concerns; privacy implications of scanning.
- **Real-world outcomes**: 4.16M CSAM files detected via Safer in 2024. AI-generated CSAM reports more than doubled in first 8 months of 2025 vs 2024. DNSFilter expanded blocklist capabilities. Ofcom recommends perceptual hashing in Illegal Content Codes of Practice.
- **Swimchain applicability**: Distributed blocklist gossip protocol (§4.6 in SPEC_12) directly applicable. Hash-based blocking is protocol-level, not platform decision. **Challenge**: Maintaining blocklist without NCMEC-like central authority. **Solution**: 3 attestations + Merkle root sync + eventual consistency.

### Social Sybil Resistance

#### Web of Trust Identity Systems

- **How it works**: Users vouch for others' identities. Proof of Humanity (PoH) by Kleros requires video verification, deposit, and vouching from existing users. BrightID/Circles UBI use social graph validation. Trust propagation via shortest path algorithms. 2024 research (SybilPSIoT) uses Bayesian inference for trust path evaluation.
- **Decentralization**: High.
- **Trust assumptions**: Vouchers accurately represent human uniqueness; social graph reflects real relationships; graph analysis can detect Sybils.
- **Pros**: Social cost cannot be parallelized, automated, or purchased; trust propagation mirrors natural community formation; no central identity authority required.
- **Cons**: Bootstrapping difficult; vulnerable to interconnected fake personas; centralizes around hub individuals; excludes those outside major social circles.
- **Real-world outcomes**: Proof of Humanity operational with video+vouching requirements. BrightID gaining traction in Web3. Research shows graph-based detection struggles with 'sophisticated small-scale Sybil rings'. Polkadot's PoP aims to be 'human passport for internet' without KYC.
- **Swimchain applicability**: Sponsor tree design is a web of trust implementation. Tree deduplication addresses the 'interconnected fake personas' vulnerability. Consequence propagation creates accountability that pure vouching lacks. **Key enhancement**: Combining vouching with contribution requirements (10GB hosting) prevents pure social gaming.

## Comparative Analysis

| Approach | Decentralization | Privacy | Scalability | Complexity | Maturity |
|----------|------------------|---------|-------------|------------|----------|
| Stack Overflow Weighted Flagging | Low | Medium | High | Medium | High |
| Reddit Appointed Moderators | Low | Medium | High | Low | High |
| Hacker News Karma Flagging | Low | High | Medium | Low | High |
| Mastodon Consensus Blocklists | High | Medium | High | Medium | Medium |
| Wikipedia Graduated Protection | Medium | Low | High | High | High |
| Web of Trust (Sponsor Trees) | High | Medium | Medium | Medium | Low |
| DAO Threshold Voting | High | Low | Medium | High | Medium |
| Token Curated Registries | High | Low | Medium | High | Medium |
| Hash-Based Blocklists | Low | Medium | High | Low | High |

## Patterns Identified

### Pattern 1: Threshold-Based Action Triggers

Multiple independent attestations required before action taken. This is the most validated pattern across all prior art:

- Stack Overflow: 6 flags trigger automatic deletion
- Wikipedia: 3-revert rule limits edit wars
- Swimchain: 3 attesters from different sponsor trees

**Swimchain Enhancement**: Tree deduplication is novel. Prior art counts raw attestation numbers; Swimchain counts unique sponsor tree roots, preventing Sybil rings at the protocol level rather than detecting them post-hoc.

### Pattern 2: Graduated Response vs Binary Action

Rather than instant deletion, content faces graduated consequences:

- Wikipedia: Protection levels (semi-protected, fully protected)
- HN: Rank reduction rather than removal
- Swimchain: 4-hour half-life acceleration

**Why This Matters**: Reduces false positive damage, provides counter-attestation window, maintains audit trail and transparency.

### Pattern 3: Contribution-Backed Authority

Moderation power tied to demonstrated investment:

- Wikipedia: 30 days + 500 edits for Extended Confirmed Protection
- Stack Overflow: Reputation thresholds unlock privileges
- Swimchain: 30 days + 10GB hosting for attestation eligibility

**Key Insight**: Hosting contribution as stake is more aligned than economic stake for social platforms. Cannot be purchased.

### Pattern 4: Fork as Exit Valve

Ultimate protection against moderation capture:

- Hive from Steem: 2x more daily users post-fork after whale-influenced hostile takeover
- Mastodon: Instance migration when disagreeing with admin policies
- Swimchain: Fork with customizable attestation rules

**Critical Requirement**: Identity and content must be portable. Hive succeeded because users kept their accounts and content.

### Pattern 5: Behavioral Specificity

Only objective behavioral categories trigger consequences—not opinions:

- Swimchain: SpamReason enum (Advertising, Repetitive, OffTopic, Harassment, Illegal)
- NOT: "controversial", "offensive", "wrong opinion"

**Reddit Research Finding**: Michigan study of 600M comments found political bias in moderation creates echo chambers. Opinion-based moderation leads to commenters with different views than moderators being more likely removed.

### Pattern 6: Sybil Deduplication

Prevent gaming by requiring attestations from independent sources:

- Swimchain: Sponsor tree deduplication counts attestations from same tree as 1
- BrightID: Graph analysis for Sybil detection
- SybilGuard/SybilLimit: Random walk algorithms

**Novel Contribution**: Prior art uses graph analysis post-hoc; Swimchain builds deduplication into attestation counting, preventing Sybil attacks at protocol level.

### Pattern 7: Recovery Mechanisms

False positives need recovery paths:

- HN: Vouch mechanism allows 31+ karma users to restore [dead] content
- Wikipedia: Admin can undelete, protection can be removed
- Swimchain: Counter-attestation (5 Lifeguards) + fast recovery (+10 immediate per counter) + gradual recovery (1/day)

**Gap Addressed**: Prior art often lacks explicit recovery mechanisms or makes recovery entirely discretionary.

### Pattern 8: Consequence Propagation with Decay

Accountability chains where sponsors bear consequences for sponsee behavior, with decay over distance:

- Swimchain: 100% → 50% → negligible over sponsor chain hops
- Web of trust: Path decay in trust propagation
- BrightID: Trust score diminishes with graph distance

**Novel Application**: Network science research validates 2-3 hop propagation limit. Creates skin-in-the-game for sponsors without punishing distant connections.

## Approaches Incompatible with Swimchain

| Approach | Why Incompatible |
|----------|------------------|
| Appointed Moderators (Reddit model) | Creates power dynamics and capture vulnerability. Violates THESIS_04 (no special moderator roles). Subreddit capture is documented. Users cannot exit with communities. |
| Stake-Weighted Voting (Steemit model) | Creates plutocracy where whales dominate. Steemit proved this fails—whale voting experiments showed removing whale influence improved distribution. Led to Hive fork. |
| Central Arbitration (Wikipedia ArbCom) | Requires trusted central authority incompatible with true decentralization. Creates single point of failure and capture target. |
| Anonymous Posting (4chan model) | Enables 11% hate speech rate. Without persistent identity, reputation has no consequences. Direct contributor to real-world violence. |
| Token-Based Curation (TCR model) | Economic stake creates wealth bias. Whale manipulation documented. Contribution-based access is more aligned. |
| Invisible Algorithmic Penalties (HN model) | ~20% of front-page stories penalized with no transparency. Opaque moderation creates distrust. Works only because of single trusted moderator. |
| Single-Attester Action | Too easily gamed. One actor can target any content. Prior art universally requires multiple independent signals. |
| Instant Deletion on Threshold | No recovery window for false positives. Prior art shows significant false positive rates. |
| Opinion-Based Attestation Categories | Reddit research proves this leads to political bias and echo chambers. Must use behavioral categories only. |

## Recommendations

### Primary Recommendation

**Approach**: Threshold-Based Attestation with Tree Deduplication and Accelerated Decay

**Rationale**: This combines the strongest patterns from prior art while addressing their limitations:

1. **3-attester threshold** is well-validated (SO uses 6, Wikipedia uses 3RR, literature consensus is 3-5). Creates coordination cost without being too slow.

2. **Tree deduplication** is a novel enhancement. Prior art (BrightID, graph analysis) detects Sybils post-hoc; Swimchain builds deduplication into attestation counting, preventing attacks at protocol level.

3. **Accelerated decay (4-hour half-life)** is superior to instant deletion. Provides counter-attestation window, maintains transparency, reduces false positive permanence. No prior art uses this approach—it's a genuine innovation.

4. **Counter-attestation at 5 Lifeguards** creates asymmetric protection. Higher threshold for reversal prevents gaming while allowing legitimate defense. Prior art (HN vouch mechanism) validates the pattern but often lacks explicit thresholds.

5. **Contribution-backed authority** (30 days + 10GB hosting) prevents purchased influence. Prior art shows token-based systems vulnerable to whale manipulation; hosting contribution is more aligned.

6. **Behavioral specificity** (SpamReason enum) protects minority viewpoints. Reddit research proves opinion-based moderation creates political bias and echo chambers.

**Implementation Level**: Protocol

**Tradeoffs Accepted**:
- Some spam may persist longer than instant-delete systems (4 hours vs immediate)
- May be too slow for very active spam campaigns at scale
- Counter-attestation requires Lifeguard+ level, limiting who can defend content
- State actors with 18-24 month infiltration campaigns remain unsolved
- Cold start problem for new networks with few qualified attesters

**Open Questions**:
- What is the optimal decay acceleration factor? 4-hour half-life is empirical guess
- How does the system behave at 1M+ users with 5000 flags/day?
- Is fast recovery (+10 per counter-attestation) correctly calibrated?
- Should weighted attestation be optional per-fork or protocol-level?
- How to handle edge cases where 3 attesters exist but all from small network segment?

### Alternative Approaches

#### Weighted Attestation by Swimmer Level

**When to use**: For communities wanting to give experienced contributors more influence.

**How it works**: One PoolKeeper (2.5 weight) + one Lifeguard (1.5 weight) = 4.0, exceeding the 3.0 threshold without requiring 3 separate attesters.

```rust
fn level_weight(level: SwimmerLevel) -> f64 {
    match level {
        Resident => 1.0,
        Lifeguard => 1.5,
        Anchor => 2.0,
        PoolKeeper => 2.5,
    }
}
```

**Tradeoffs**: Increases complexity. Risk of power concentration among high-level users. May reduce accessibility for normal community members. Should be optional per-fork.

#### Dynamic Thresholds Based on Network Health

**When to use**: At scale (100K+ users) when flag volume increases or during abuse waves.

**How it works**: Raise threshold from 3 to 4-5 when `recent_flag_rate > 5%`.

```rust
fn get_spam_threshold(network_size: u32, recent_flag_rate: f64) -> u32 {
    if network_size > 10000 && recent_flag_rate > 0.05 {
        4  // Raise threshold if lots of flagging
    } else if network_size < 1000 {
        2  // Lower threshold for small network
    } else {
        3  // Default
    }
}
```

**Tradeoffs**: More complex to implement. Adds governance decision about adjustment triggers. Could be gamed by creating fake 'normal' period before attack. Recommend implementing after learning from testnet.

#### Private Attestations (HN-style)

**When to use**: For communities where public attestation creates drama or retaliation concerns.

**How it works**: Flags visible to counter-attesters but not to content author or general public.

**Tradeoffs**: Reduces transparency, which conflicts with decentralization values. May reduce accountability for bad-faith flaggers. Could be client-level option rather than protocol change.

### Explicitly Rejected Approaches

| Approach | Why Rejected |
|----------|--------------|
| Single-attester action | Too easily gamed. One actor can target any content. Prior art universally requires multiple independent signals. |
| Equal counter-attestation threshold (3 to flag, 3 to counter) | Creates symmetrical gaming. Attacker and defender have equal burden. Asymmetric threshold (5 vs 3) protects legitimate content. |
| Instant deletion on threshold | No recovery window for false positives. Prior art (SO, Reddit) shows significant false positive rates. Accelerated decay is more forgiving. |
| Content-type attestation (opinions, controversial topics) | Reddit research proves opinion-based moderation leads to political bias. SpamReason enum explicitly limits to behavioral categories. |
| Centralized blocklist distribution | Single source creates capture vulnerability. Must use consensus-based multi-source approach. |

## Implementation Considerations

### Dependencies
- Sponsor tree infrastructure (already in SPEC for identity/Sybil resistance)
- Swimmer level system (30-day aging, hosting contribution thresholds)
- Content decay system (half-life mechanism)
- Distributed blocklist gossip protocol (SPEC_12 §4.6)

### Complexity
Medium. Core attestation mechanism builds on existing sponsor tree and swimmer level infrastructure. Counter-attestation adds state tracking. Distributed blocklist is the most complex new component.

### Prototype Questions

1. **Simulate collusion**: Can 3 coordinated actors from different sponsor trees consistently game the system? What's the investment required (account-days, GB hosted)?

2. **Simulate false positive rates**: What percentage of legitimate content gets flagged in adversarial conditions? How quickly does counter-attestation restore normal decay?

3. **Simulate scale**: At 100K users with 5000 flags/day (15,000 attestations needed), is 0.3 attestations per Resident per day achievable? What participation rate is required?

4. **Test recovery calibration**: Is +10 per counter-attestation the right amount? Does it adequately compensate for false positive damage during the accelerated decay window?

5. **Test tree deduplication edge cases**: How do attestations behave when network has few sponsor trees? What happens when 3 attesters exist but 2 share a tree?

6. **Test distributed blocklist convergence**: How long until 95% of nodes agree on blocklist entries via Merkle root gossip?

### Gaming Vector Analysis

| Attack | Defense | Residual Risk |
|--------|---------|---------------|
| False flag coordination | Tree deduplication, counter-attestation, privilege loss | Well-funded 3+ tree coordination remains possible |
| Sybil attestation | Sponsor tree roots must differ, 30-day aging, 10GB hosting | 270+ account-day investment still achievable by patient actors |
| Attestation fatigue | 10/day limit per identity | Distributed attack by many accounts |
| Revenge flagging | Cannot attest within sponsor chain, pattern detection | Indirect revenge via friends |
| Majority tyranny | Behavioral specificity, fork-as-exit | Minorities within communities still vulnerable |

## Remaining Gaps

1. **State actor resistance**: 18-24 month infiltration campaigns with patient Sybil investment remain unsolved. Swimchain's 270 account-day requirement raises the bar but determined nation-states have resources.

2. **Cross-fork reputation portability**: If a community forks, how do attestation histories and reputation transfer? No prior art provides clean solution.

3. **AI-generated content**: CSAM reports doubled in 8 months (2024-2025). Attestation systems designed for human-speed abuse may not scale to AI-generated manipulation.

4. **Recovery rate calibration**: +10 per counter-attestation is empirical guess. Needs testnet data to validate whether this adequately compensates false positive victims.

5. **Minority protection within communities**: Attestation can silence lone dissenters. Fork-as-exit doesn't help individuals who can't convince others to join.

6. **Coordination mechanisms**: How do potential counter-attesters discover content that needs defense? No push notification for 'content being flagged that you might want to vouch for.'

7. **Legal liability for blocklist maintainers**: If distributed blocklist incorrectly flags legal content as CSAM, who is liable? Decentralization may not provide legal protection.

## References

### Stack Overflow
- https://stackoverflow.blog/2020/06/25/how-does-spam-protection-work-on-stack-exchange/
- https://stackoverflow.blog/2020/04/09/the-unfriendly-robot-automatically-flagging-unwelcoming-comments/
- https://boingboing.net/2025/06/02/how-stack-overflows-moderation-system-led-to-its-own-downfall.html
- https://news.ycombinator.com/item?id=36287439

### Reddit
- https://pubsonline.informs.org/doi/10.1287/isre.2021.0036
- https://michiganross.umich.edu/news/new-study-reddit-explores-how-political-bias-content-moderation-feeds-echo-chambers
- https://citizensandtech.org/2024/04/community-moderation-reddit-politics/
- https://besedo.com/blog/reddit-content-moderation-stats/

### Wikipedia
- https://en.wikipedia.org/wiki/Wikipedia:Protection_policy
- https://en.wikipedia.org/wiki/Wikipedia:Edit_warring
- https://www.spokesman.com/stories/2025/mar/07/edit-wars-on-middle-east-page-raise-tensions-on-wi/
- https://www.researchgate.net/publication/51917633_Edit_Wars_in_Wikipedia

### Mastodon
- https://docs.joinmastodon.org/admin/moderation/
- https://dl.acm.org/doi/fullHtml/10.1145/3614419.3644016
- https://policyreview.info/articles/analysis/content-moderation-challenges
- https://arxiv.org/html/2506.05522

### Hacker News
- https://github.com/minimaxir/hacker-news-undocumented
- https://blog.osm-ai.net/2024/04/01/hn-part-1.html
- https://news.ycombinator.com/item?id=19601353
- https://en.wikipedia.org/wiki/Hacker_News

### Blockchain/Crypto
- https://www.mdpi.com/1999-4893/16/1/34
- https://mni.is/news_en/16220/blockchains-biggest-threat-how-new-defenses-are-crushing-sybil-attacks-in-2024/
- https://www.tandfonline.com/doi/full/10.1080/17445760.2024.2352740
- https://www.sciencedirect.com/science/article/abs/pii/S1389128621003893

### DAO Governance
- https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2024.1405516/full
- https://www.researchgate.net/publication/381214311_Analyzing_Voting_Power_in_Decentralized_Governance_Who_controls_DAOs
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5018833
- https://www.rapidinnovation.io/post/dao-governance-models-explained-token-based-vs-reputation-based-systems

### Web of Trust
- https://medium.com/@gwrx2005/proof-of-personhood-sybil-resistant-decentralized-identity-with-privacy-e74d750ca2a3
- https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/cmu2.12734
- https://blog.polis.global/identities-in-a-web-of-trust-v1-0/
- https://ont.io/news/1092/Exploring-Trust-and-Identity-in-Web3-Proof-of-Humanity-and-Reputation-Systems

### CSAM Detection
- https://safer.io/resources/hashing-and-matching-is-core-to-proactive-csam-detection/
- https://safety.google/intl/en_us/stories/hash-matching-to-help-ncmec/
- https://d1.awsstatic.com/legal/trust-and-safety-center/aws-eu-dsa-transparency-report.pdf

---

*Research completed: 2025-12-27*
*Status: DRAFT - Ready for team review*
