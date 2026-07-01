# Research Spike: Contribution-Based Access Economics

## Status: DRAFT

## Executive Summary

This research investigates whether hosting work can replace CPU-based proof-of-work as the basis for post authorization in Swimchain. The core question addresses maintaining spam resistance, Sybil resistance, attack resistance, economic viability, and decentralization while shifting from "wasted work" to "useful contribution."

Prior art analysis strongly validates the contribution-based approach. Systems like BitTorrent private trackers (achieving 65 seeders per leecher vs 4.6 in public trackers), Filecoin (1.5 exabytes across 3,000 providers), Storj (13,500+ nodes globally), and Helium (350,000+ hotspots in 80+ countries) demonstrate that contribution-based access works at scale when measuring REAL contribution. The critical insight from prior art is that **ongoing contribution requirements outperform historical credit accumulation**—BitTorrent ratio enforcement creates better incentive alignment than Reddit karma or tradeable tokens, which face gaming and manipulation.

The primary recommendation is to implement contribution-based swimmer levels with peer attestation as designed, enhanced with variance checking from Proof of Backhaul research and attesters from different sponsorship trees for fraud detection. Swimchain's proposed thresholds (10GB/50GB/200GB/500GB) align well with comparable systems. The unique viewer requirement is the key differentiator preventing self-serving attacks—similar to Helium's witness requirement. The "no credit economy" design choice (swimmer levels, not tradeable tokens) is well-supported by prior art demonstrating that systems allowing credit accumulation face manipulation that ongoing-contribution systems avoid.

## Research Question

Can hosting work replace CPU work as the basis for post authorization while maintaining:
- **Spam resistance** - preventing low-cost flooding attacks
- **Sybil resistance** - preventing identity multiplication attacks
- **Attack resistance** - ensuring attack costs exceed benefits
- **Economic viability** - sustainable without external funding
- **Decentralization** - no central authority required

## Context

Swimchain's current SPEC_03 proposes using Argon2id memory-hard proof-of-work for post authorization. This approach is cryptographically verifiable and fully decentralized, but produces no useful value—CPU cycles are wasted generating proofs that serve only as friction.

The contribution-based alternative proposes replacing this with hosting requirements: users demonstrate network contribution by serving content to other users, and their "swimmer level" (determined by bandwidth contributed) unlocks posting capabilities. This aligns individual incentives with network health while maintaining spam resistance.

**Important distinction:** This is NOT a token/credit economy. Users don't accumulate transferable "credits." Instead, their swimmer level (based on ongoing contribution) determines their posting capacity. There's no balance to display, no currency to trade—just "have you contributed enough to unlock this action?"

This approach aligns with Swimchain's core values:
- **True decentralization**: Peer attestation replaces centralized tracking
- **Friction as intentional feature**: Contribution requirement creates meaningful barrier
- **Forks over consensus**: Each space can set own thresholds
- **No growth imperative**: No tokens, no speculation, no accumulation

## Prior Art Analysis

### CPU Proof of Work

#### Hashcash Email PoW
- **How it works**: Email senders compute a partial hash collision before sending. The computational cost is trivial for legitimate users sending few emails but prohibitive for spammers sending millions. A token is included as an X-Hashcash header containing date, recipient address, and nonce satisfying the difficulty target.
- **Decentralization**: Full - no central authority needed, recipients verify proofs independently.
- **Trust assumptions**: Recipients must verify proofs; difficulty must be calibrated correctly.
- **Pros**: Simple to implement, cryptographically verifiable, no central authority.
- **Cons**: Never achieved widespread adoption; hardware disparity creates inequality (developing countries with older hardware disadvantaged); ASICs can solve 1000x faster than CPUs; doesn't scale.
- **Real-world outcomes**: Never widely deployed for email. Cambridge researchers concluded "proof-of-work proves not to work"—even 1-13% impact on legitimate users was unacceptable. However, became the conceptual foundation for Bitcoin mining.
- **Swimchain applicability**: Validates the core concept of computational friction but demonstrates that pure CPU PoW faces hardware disparity and ASIC resistance challenges. Swimchain's current use of Argon2id memory-hardness addresses ASIC concerns but still wastes energy.

#### Argon2id Memory-Hard Functions
- **How it works**: Memory-hard password hashing function requiring significant RAM (64 MiB typical) along with CPU time. Uses data-independent memory access for side-channel resistance combined with data-dependent access for GPU/ASIC resistance. Winner of the 2015 Password Hashing Competition, standardized in RFC 9106.
- **Decentralization**: Full - parameters are standardized and verification is deterministic.
- **Trust assumptions**: Parameters must be chosen correctly; verification requires single computation.
- **Pros**: ASIC-resistant due to memory requirements; IETF standardized with wide implementation; tunable memory/time/parallelism parameters; WebAssembly support for browsers.
- **Cons**: 2-3x slowdown in WebAssembly vs native; memory requirements may challenge older mobile devices; still has hardware disparity (compressed but not eliminated); verification takes 50-200ms.
- **Real-world outcomes**: Widely adopted for password hashing—surpassed scrypt in GitHub adoption by 2024. Not commonly used for anti-spam PoW in practice, though RFC 9106 explicitly lists PoW as a valid use case.
- **Swimchain applicability**: Swimchain's current SPEC_03 uses Argon2id with 64 MiB memory, providing strong ASIC resistance. The research question is whether contribution-based access can provide equivalent or better spam resistance with useful work instead.

### Contribution-Based Access

#### BitTorrent Private Tracker Ratio Enforcement
- **How it works**: Private BitTorrent communities track upload-to-download ratios for each user. Users must maintain acceptable ratios to remain members. New users often admitted only if vouched for by existing members. Ratios enforced by tracker software.
- **Decentralization**: Low - centralized tracker infrastructure.
- **Trust assumptions**: Tracker accurately records bandwidth; tracker is honest and available; upload statistics self-reported.
- **Pros**: 3-5x faster download speeds vs public trackers; 65 seeders per leecher vs 4.6 in public; strong incentive alignment for contribution; community self-policing through vouching.
- **Cons**: Centralized tracker infrastructure is censorable and failure-prone; reputation siloed and non-portable across trackers; upload statistics exploitable; fast peers dominate while slow peers struggle.
- **Real-world outcomes**: Dramatically improved performance in private communities. However, research shows ratio enforcement can lead to system-wide "crunches" or "crashes" where the system seizes due to too little or too much credit. Limited peers can gain high reputation and attract most opportunities.
- **Swimchain applicability**: Strongly validates contribution-based access concept. Swimchain's swimmer levels are similar but use peer attestation instead of centralized tracker, levels aren't transferable credits, and require ongoing contribution not just historical ratio. **Key learning**: avoid credit accumulation that can crash.

#### Filecoin Proof of Spacetime
- **How it works**: Storage providers must continuously prove they're storing committed data. WindowPoSt challenges arrive every 24 hours per sector, requiring zk-SNARK proofs within 30 minutes. Failure results in slashing. Providers earn block rewards for successful proofs.
- **Decentralization**: High - blockchain consensus with cryptographic verification.
- **Trust assumptions**: Cryptographic proofs are sound; blockchain consensus is secure; storage providers have collateral at stake.
- **Pros**: Cryptographically verifiable storage proofs; 1.5 exabytes stored across ~3,000 providers; enterprise adoption (CERN, Smithsonian, NASA); 40% cost reduction achieved through optimization.
- **Cons**: Complex proof generation requiring specialized hardware; high barrier to entry; 7.5 hour finality (being reduced); token economics create speculation incentives.
- **Real-world outcomes**: Successfully running since 2020 mainnet. Q4 2024 saw 399% QoQ increase in base fees. Over 2,000 clients onboarded, 508 with datasets over 1,000 TiB.
- **Swimchain applicability**: Validates proof-of-contribution at scale but with differences: Filecoin proves storage exists, Swimchain would prove bandwidth served. Filecoin uses zk-SNARKs (computationally expensive); Swimchain proposes peer attestation (simpler but requires trust in attesters).

#### Storj Decentralized Storage
- **How it works**: Node operators contribute unused disk space and bandwidth. Payment rates: $1.50/TB storage, $2.00/TB egress. Nodes are vetted for reliability over time, building reputation. Erasure coding ensures data availability.
- **Decentralization**: High - 13,500+ nodes globally with reputation-based selection.
- **Trust assumptions**: Reputation system accurately reflects reliability; erasure coding provides redundancy; payment oracle is honest.
- **Pros**: Uses existing unused capacity (no specialized hardware); 80% lower costs than major cloud providers; reputation-based node selection.
- **Cons**: Earnings are modest (~19 STORJ/month in some cases); not recommended to buy hardware specifically for Storj; reputation slow for new nodes.
- **Real-world outcomes**: Sustainable operation with growing enterprise adoption. Acquired Valdi (GPU cloud) and PetaGene in 2024.
- **Swimchain applicability**: Good model for contribution rewards that don't require specialized investment. Swimchain's approach is similar: use resources you already have (bandwidth) rather than buying dedicated hardware. **Key insight**: economics work when contributing excess capacity, not dedicated resources.

#### Arweave Storage Endowment
- **How it works**: Users pay for 200 years of storage upfront. Only 5% goes to miners immediately; 95% enters endowment. Endowment releases tokens when block rewards insufficient. Based on Kryder's law—storage costs decline exponentially (30.6% average annual decline over 50 years).
- **Decentralization**: High - decentralized network with 20+ replicas per file.
- **Trust assumptions**: Storage costs continue declining; miners remain incentivized by future endowment; network maintains replicas.
- **Pros**: No token reissued from endowment in 7 years; self-sustaining economic model; token supply shrinks with usage.
- **Cons**: Relies on long-term storage cost trends; one-time payment may not suit all use cases; requires faith in protocol survival.
- **Real-world outcomes**: Remarkable success—endowment has never needed to pay out. Token economics working as designed. Demonstrates contribution-based systems can achieve sustainability.
- **Swimchain applicability**: Different model (storage vs bandwidth) but validates that contribution-based economics can be self-sustaining. Swimchain uses ongoing contribution rather than one-time payment, avoiding the "faith in future" problem.

### Peer Attestation

#### Helium Proof of Coverage
- **How it works**: Hotspots beacon every 6 hours with cryptographic verification from ~12 nearby witnesses. Hardware authentication uses embedded ECC/RSA keys to prevent location spoofing. Economic security through high-value HNT stakes, with slashing for cheating. Density scaling penalizes over-saturation.
- **Decentralization**: High - 350,000+ hotspots across 80+ countries.
- **Trust assumptions**: Hardware attestation is trustworthy; witnesses are geographically distributed and honest; blockchain oracles are reliable.
- **Pros**: Massive scale (576 TB offloaded in Q4 2024, 555% QoQ increase); density scaling encourages geographic distribution; economic security makes cheating unprofitable.
- **Cons**: Gaming and spoofing remain persistent problems; complex anti-gaming measures needed continuously; requires hardware attestation; 2-of-3 oracle control creates some centralization.
- **Real-world outcomes**: Massive network growth but continuous battle against gaming. "Almost all gaming revolves around spoofing—falsifying hotspot locations." 2024 HIPs focused on PoC improvements and anti-gaming.
- **Swimchain applicability**: Highly relevant model. Swimchain's unique viewer requirement is similar to Helium's witness requirement—both require external validation of claimed contribution. **Key learning**: expect gaming attempts and design proactive countermeasures.

#### Proof of Backhaul
- **How it works**: Measures bandwidth of a prover's backhaul link in a decentralized, trustfree manner. Multiple challengers coordinate to send traffic that aggregates at the prover's link. Uses statistical analysis to verify claimed bandwidth is actually available.
- **Decentralization**: High - Byzantine fault tolerant with multiple independent challengers.
- **Trust assumptions**: Majority of challengers are honest; network timing is measurable; traffic aggregation works.
- **Pros**: First trustfree bandwidth measurement protocol; can measure up to 1000 Mbps with <8% error; 100ms measurement duration; works with corrupted challengers.
- **Cons**: Requires coordination among challengers; adds latency and complexity; smart contract integration needed.
- **Real-world outcomes**: Academic research published at NDSS 2024. Demonstrates feasibility of trustfree bandwidth verification.
- **Swimchain applicability**: Directly relevant to measurement challenge. Swimchain's peer attestation is simpler (relies on viewer confirmations) but less formally verified. Shows trustfree bandwidth measurement is possible with proper protocol design.

### Sybil Resistance Mechanisms

#### Proof of Humanity Vouching
- **How it works**: Users register with display name, photo, and video holding sign with their address. Existing users must vouch for new registrants. Disputes handled by Kleros decentralized court. Failed vouches affect voucher's standing.
- **Decentralization**: High - no central authority for identity verification.
- **Trust assumptions**: Video/photo verification is honest; vouchers have skin in the game; Kleros resolution is fair.
- **Pros**: No central authority; vouching creates accountability chains; economic incentives align with honesty; privacy-preserving through selective disclosure.
- **Cons**: Hard to get vouched without knowing anyone; Kleros juries can be inconsistent; requires community involvement; fake persona rings possible.
- **Real-world outcomes**: Active but faces challenges with verification quality and social barriers. Graph-based Sybil detection struggles with sophisticated small-scale rings.
- **Swimchain applicability**: Swimchain's sponsorship system is directly analogous. Key difference: Swimchain adds contribution requirements on top of vouching. Sponsor consequences create accountability chains similar to PoH.

#### SybilGuard Social Graph Defense
- **How it works**: Exploits the observation that malicious users can create many identities but few trust relationships. Disproportionately small "cut" in social graph between Sybil and honest nodes. Random walk algorithms bound identities a malicious user can create.
- **Decentralization**: High - leverages existing social relationships without central authority.
- **Trust assumptions**: Social graph reflects real trust; honest nodes form well-connected cluster; attackers cannot create many cross-cluster edges.
- **Pros**: No biometrics or central authority; leverages existing relationships; mathematically provable bounds; works without knowing who is honest.
- **Cons**: Struggles with sophisticated Sybil rings; may exclude people outside major social circles; requires dense social graph.
- **Real-world outcomes**: Academic success but practical challenges. Recommended to combine with other measures.
- **Swimchain applicability**: Swimchain's sponsorship trees create exactly this social graph structure. The unique viewer requirement adds contribution verification on top. Combining both approaches is stronger than either alone.

### Financial and Reputation Friction

#### Something Awful $10 Registration
- **How it works**: Forum requires $10 one-time registration fee since 2001. Ban evasion requires purchasing new account. Additional fees for customization.
- **Decentralization**: None - centralized administration.
- **Trust assumptions**: Central administration is fair; payment processor works; fee level calibrated correctly.
- **Pros**: Dramatically reduced drive-by trolling; "probably the smartest decision" for community quality; bad actors pay repeatedly ($150+ for serial evaders); simple and well-understood.
- **Cons**: Centralized control; selects for users with disposable income; doesn't scale to decentralized contexts.
- **Real-world outcomes**: Long-running success for community quality. Still operating 20+ years later.
- **Swimchain applicability**: Validates that friction improves community quality. Swimchain's contribution requirement is friction without financial barrier—you "pay" with bandwidth contribution rather than money, maintaining quality benefits while preserving accessibility.

#### Reddit Karma System
- **How it works**: Users earn karma from upvotes on posts and comments. Karma unlocks posting privileges in some subreddits. Algorithm kept secret to prevent gaming.
- **Decentralization**: None - centralized algorithm.
- **Trust assumptions**: Reddit's algorithm is fair; anti-manipulation detection works; community voting reflects quality.
- **Pros**: Enables graduated access based on contribution; simple to understand; incentives for quality content; subreddit-specific thresholds.
- **Cons**: Karma farming prevalent; bot manipulation widespread; creates echo chambers (dissent downvoted); images get more karma than substance; cat-and-mouse with manipulators.
- **Real-world outcomes**: Continuous battle against manipulation. Bots, vote brigading, and coordinated campaigns remain problems.
- **Swimchain applicability**: Swimchain's swimmer levels are similar to karma thresholds but based on objective contribution (bandwidth) rather than subjective voting. This eliminates echo chamber effects and makes gaming harder—you can't fake bandwidth served to real viewers.

### Gaming Attack Patterns

#### DeFi Airdrop Sybil Attacks
- **How it works**: Attackers create hundreds or thousands of wallets to farm airdrops. Each wallet performs minimum qualifying activity. On airdrop, attacker claims with all wallets and dumps tokens immediately.
- **Decentralization**: N/A - attack pattern analysis.
- **Trust assumptions**: N/A.
- **Pros**: Forces protocols to improve distribution mechanisms; community bounty hunting can identify clusters.
- **Cons**: Arbitrum Sybils captured ~50% of tokens; 80% of Apriori tokens claimed by single cluster of 5,800 wallets; even sophisticated filtering misses attacks; legitimate users caught in crackdowns.
- **Real-world outcomes**: Pervasive problem. LayerZero partnered with Nansen for cluster detection. Projects moving to fee-based distribution.
- **Swimchain applicability**: Swimchain's defenses address this directly: 7-day aging prevents instant Sybils; unique viewer requirement means Sybils can't self-serve; sponsorship trees create accountability; rate limits cap even high contributors.

### Alternative Work Mechanisms

#### Proof of Useful Work
- **How it works**: Miners perform computations serving real-world purposes (ML training, optimization problems) rather than arbitrary hash puzzles. Verification typically requires verifiable computation or trusted execution.
- **Decentralization**: Varies by implementation.
- **Trust assumptions**: Useful work is verifiable; work difficulty can be calibrated; results have actual value.
- **Pros**: Resources produce real value; potentially more energy-efficient per unit of value; aligns miner incentives with utility.
- **Cons**: Verification typically harder than generation; current mechanisms "fall short of promised utilities"; difficulty adjustment complex; may centralize around those with work to offer.
- **Real-world outcomes**: Academic research active but limited deployment. 2025 SoK paper concludes existing mechanisms fail essential consensus guarantees.
- **Swimchain applicability**: Swimchain's contribution-based access IS proof of useful work—hosting content that others want to view. Unlike research PoUW which struggles with verification, Swimchain's useful work (content serving) is verified by the act of serving itself.

## Comparative Analysis

| Approach | Decentralization | Privacy | Scalability | Complexity | Maturity |
|----------|------------------|---------|-------------|------------|----------|
| Argon2id CPU PoW | High | High | High | Low | High |
| BitTorrent Ratios | Low | Medium | High | Medium | High |
| Filecoin PoSt | High | Low | High | High | High |
| Helium PoC | High | Medium | High | Medium | Medium |
| Proof of Backhaul | High | High | Medium | High | Low |
| Proof of Stake | Medium | Low | High | Medium | High |
| Social Graph Defense | High | Medium | Medium | Medium | Medium |
| Financial Friction | None | Low | High | Low | High |
| Karma/Voting | None | Low | High | Low | High |

**Swimchain Requirements Alignment:**

| Requirement | Contribution-Based Access |
|-------------|---------------------------|
| Decentralization | ✓ Peer attestation, no central tracker |
| Privacy | ✓ Contribution measured, not identity revealed |
| Scalability | ✓ Linear with network size |
| Complexity | Medium - simpler than Filecoin, more complex than PoW |
| Maturity | Novel combination of proven components |

## Patterns Identified

### Pattern 1: Ongoing Contribution > Historical Accumulation

Systems requiring ongoing contribution (BitTorrent private trackers, Filecoin PoSt, Helium beacons) create better alignment than systems allowing historical accumulation (karma, token balances). When you must keep contributing to maintain status, incentives remain aligned with network health.

**Examples**: BitTorrent ratio enforcement, Filecoin continuous proving, Swimchain monthly GB thresholds, Helium 6-hour beacon intervals.

**Swimchain applicability**: Swimchain's Lifeguard/Anchor/PoolKeeper monthly thresholds enforce ongoing contribution. This is superior to a "credit" model where users accumulate posting rights.

### Pattern 2: Friction Calibration is Critical

Too little friction (free posting) enables spam. Too much friction (Hashcash email) excludes legitimate users. Cambridge research found even 1-13% impact on legitimate users was unacceptable. Successful systems (Something Awful, private trackers) find sweet spots.

**Examples**: Hashcash failed at 1-13% user impact; Something Awful succeeded at $10/account; BitTorrent ratio requirements vary by community.

**Swimchain applicability**: The 10GB/50GB/200GB/500GB thresholds need empirical testing during testnet to validate calibration.

### Pattern 3: Multi-Layer Sybil Resistance

No single mechanism prevents all Sybil attacks. Successful systems combine multiple approaches: social vouching + contribution requirements + aging + rate limits. Each layer catches different attack vectors.

**Examples**: Proof of Humanity (video + vouching + Kleros), Linea (GitHub + social + Coinbase), Swimchain (sponsorship + aging + unique viewers + rate limits).

**Swimchain applicability**: Swimchain correctly combines multiple mechanisms. Sponsorship creates accountability, aging prevents instant Sybils, unique viewers prevent self-serving, rate limits cap even successful attacks.

### Pattern 4: Objective Metrics > Subjective Voting

Reddit karma (subjective) is easily gamed and creates echo chambers. BitTorrent ratios (objective) are harder to fake. Contribution-based systems work better when the metric is measurable and meaningful.

**Examples**: Reddit karma easily gamed; BitTorrent ratio harder to fake; Filecoin storage proofs cryptographically verified.

**Swimchain applicability**: Bandwidth contribution is objective and verified by peer attestation. Superior to karma-style voting.

### Pattern 5: Verification Asymmetry Required

For PoW-style systems, verification must be much cheaper than generation. Argon2 achieves this (millions of attempts to solve, one to verify). Filecoin uses zk-SNARKs. Swimchain uses peer attestation.

**Swimchain applicability**: Peer attestation is asymmetric: serving content requires bandwidth, but verifying attestations is cheap. However, attestation system requires trust in attesters.

### Pattern 6: Gaming Arms Race is Inevitable

Helium, Reddit, DeFi airdrops—all face continuous gaming attempts. Even well-designed systems require ongoing countermeasures. The question is whether attack cost exceeds reward.

**Examples**: Helium 2024 HIPs focused on anti-gaming; Reddit "cat and mouse" with bots; DeFi Sybil clusters captured 50% of Arbitrum airdrop.

**Swimchain applicability**: Swimchain should expect gaming attempts. The economic analysis must ensure attack cost > attack reward. Continuous monitoring and adjustment will be needed.

## Approaches Incompatible with Swimchain

| Approach | Why Incompatible |
|----------|------------------|
| Token Economy | Violates "no growth imperative" thesis; creates speculation incentives that undermine contribution model |
| Proof of Stake | Creates plutocracy where wealth determines participation; capital barrier violates accessibility |
| Centralized Tracker | BitTorrent model is censorable and failure-prone; violates decentralization requirement |
| Karma/Voting Systems | Subjective metrics are gameable and create echo chambers; requires centralized algorithm |
| Financial Friction | Something Awful model selects for wealth, not commitment; centralized administration |
| Tradeable Credit Economy | Allows manipulation seen in BitTorrent credit trading; "no economy" principle |
| Reputation Decay Penalties | BitTorrent research shows can cause system "crashes"; better to not penalize absence |

## Recommendations

### Primary Recommendation

**Approach**: Contribution-Based Swimmer Levels with Peer Attestation

**Rationale**: Combines the proven effectiveness of contribution-based access (BitTorrent, Filecoin, Storj) with decentralized peer attestation (Helium model). Key innovations:
1. Ongoing contribution requirements prevent credit accumulation problems
2. Unique viewer requirement prevents self-serving attacks
3. Sponsorship tree accountability creates natural Sybil limits
4. Rate limits cap even maximum contributors

Prior art validates each component independently; Swimchain's combination is novel but built on proven mechanisms.

**Implementation Level**: Protocol

**Tradeoffs Accepted**:
- Approximate measurement (attestation) vs exact measurement (hash verification)
- Trust in attesters (mitigated by requiring attesters from different sponsorship trees)
- Bootstrap period vulnerability requiring grace mechanisms
- Bandwidth inequality (fast internet users level faster—acceptable since levels aren't tradeable)
- Mobile users may need alternative pathway to Regular level

**Open Questions**:
- Optimal threshold values (10GB/50GB/200GB/500GB) need testnet validation
- How to handle attestation variance checking at scale
- Mobile participation pathway: time-based vs bandwidth-based
- Cold start in new spaces without content to host

### Alternative Approaches

#### Hybrid CPU PoW + Contribution
**When to use**: During bootstrap phase when insufficient content exists to host.

**How it works**: Age-gated Argon2id PoW provides friction until contribution thresholds can be met.

**Tradeoffs**: Maintains complexity of both systems; PoW still wastes energy. However, provides fallback for new users who cannot immediately contribute.

#### Proof of Backhaul Integration
**When to use**: If gaming attempts prove more sophisticated than expected and simple peer attestation is insufficient.

**How it works**: Full cryptographic bandwidth verification using coordinated challenger traffic.

**Tradeoffs**: Significantly higher complexity; requires coordination among challengers; adds latency. However, provides cryptographically stronger bandwidth verification.

#### Time-Based Regular Level for Mobile
**When to use**: For mobile users who cannot provide sufficient bandwidth but have participated consistently.

**How it works**: Allow reaching Regular level through time/age rather than bandwidth alone.

**Tradeoffs**: Creates complexity in level determination; may require separate mobile pathway. However, prevents two-tier accessibility problem.

### Explicitly Rejected Approaches

| Approach | Why Rejected |
|----------|--------------|
| Token Economy for Rewards | Swimchain's "no growth imperative" thesis explicitly rejects tradeable tokens; speculation would undermine model |
| Stake-Based Posting Rights | Creates plutocracy; MIT research shows PoS increases wealth concentration; contradicts accessibility |
| Algorithmic Contribution Scoring | Any weighted algorithm creates gaming vectors; simple objective metrics are harder to game |
| Reputation Decay Without Contribution | BitTorrent research shows can cause system crashes; don't penalize absence, just stop leveling |

## Implementation Considerations

### Dependencies
- SPEC_09 peer attestation system for contribution measurement
- SPEC_11 swimmer level definitions
- Sponsorship tree infrastructure for Sybil resistance
- Content distribution system for hosting to occur

### Complexity
Medium - simpler than Filecoin's zk-SNARK proofs, more complex than pure PoW

### Recommended Parameters

```rust
// Swimmer level thresholds - validated against comparable systems
const RESIDENT_LIFETIME_GB: u64 = 10;      // 10 GB total served (achievable)
const LIFEGUARD_MONTHLY_GB: u64 = 50;      // 50 GB/month (active contributor)
const ANCHOR_MONTHLY_GB: u64 = 200;        // 200 GB/month (serious contributor)
const POOL_KEEPER_MONTHLY_GB: u64 = 500;   // 500 GB/month (elite contributor)

// Unique viewer requirements - prevents self-serving
const MIN_VIEWER_AGE_DAYS: u64 = 7;
const UNIQUE_VIEWER_WINDOW_SECS: u64 = 86400;  // 24h

// Posting capacity by level - rate limits even maximum contributors
const REGULAR_POSTS_PER_DAY: u32 = 5;
const RESIDENT_POSTS_PER_DAY: u32 = 20;
const LIFEGUARD_POSTS_PER_DAY: u32 = 50;  // Hard cap

// Grace period - bootstrap accommodation
const NEW_IDENTITY_GRACE_DAYS: u64 = 14;
```

### Prototype Questions
- What is the actual bandwidth served by typical users during normal usage?
- How quickly do users reach Resident level (10GB) under realistic conditions?
- Do attesters from different sponsorship trees provide sufficient fraud detection?
- What is the minimum viable grace period for new identities?
- Can mobile users realistically reach Regular level through time-based participation?

## Economic Analysis

### Cost Comparison

**CPU PoW costs (current SPEC_03):**
- Desktop: ~30 seconds × 150W = 1.25 Wh = ~$0.0002 per post
- Laptop: ~60 seconds × 50W = 0.83 Wh = ~$0.0001 per post
- Mobile: ~120 seconds × 5W = 0.17 Wh = ~$0.00003 per post

**Contribution threshold costs (to reach Resident level = 10GB served):**
- Bandwidth: 10 GB × $0.01-0.10/GB egress = $0.10-1.00
- **Cost to unlock 20 posts/day: $0.10-1.00** infrastructure contribution

**Key insight**: Reaching posting-enabled swimmer levels requires 50-500× more investment than CPU PoW per equivalent posting capacity. This dramatically increases attack costs.

### Attack Economics

**Spam flooding (1000 posts/day target):**

| Metric | CPU PoW | Contribution-Based |
|--------|---------|-------------------|
| Daily cost | ~$0.20 | ~$10-100 infrastructure |
| Monthly cost | ~$6 | ~$300-3000 |
| Setup time | Minutes | Weeks (build contribution) |
| Automated? | Yes | No (need real viewers) |
| Sustainable? | Yes (if hardware available) | No (viewers are finite) |
| Rate limited? | No | Yes (50 posts/day max) |

## Gaming Vector Analysis

### Self-Serving Attack (DeFi Airdrop Pattern)
**Method**: Create Sybil viewers to request content from yourself.

**Prior Art**: DeFi airdrops lost 50%+ to Sybil clusters doing exactly this.

**Swimchain Defenses**:
- Viewers must be >7 days old (prevents instant Sybils)
- Not in sponsorship tree (prevents family serving)
- Unique per 24h (prevents repeat requests)
- Sponsors face consequences for sponsored misbehavior

**Analysis**: Each Sybil needs a sponsor (who must be Anchor level = 200GB/month). 100 Sybils would require 100 Anchor-level sponsors or one PoolKeeper willing to burn reputation.

### View Collusion (BitTorrent Credit Trading Pattern)
**Method**: Two legitimate users agree to view each other's content.

**Prior Art**: BitTorrent private trackers that allowed credit trading faced manipulation.

**Swimchain Defenses**:
- Same viewer → same content → credits only once per 24h
- Pattern detection could flag suspicious bilateral patterns
- No "credit" to trade—just level status

**Analysis**: Small-scale collusion possible but limited in benefit since swimmer levels aren't transferable.

### Spoofing (Helium Pattern)
**Method**: False attestation claims ("I served content I didn't serve").

**Prior Art**: "Almost all Helium gaming revolves around spoofing—falsifying hotspot locations."

**Swimchain Defenses**:
- Attesters must be from different sponsorship trees
- Variance checking across multiple attesters
- Signed requests from viewers provide content hashes

**Analysis**: Swimchain's simpler attestation model is more vulnerable than Helium's hardware attestation but attacks are less profitable (social posting vs. crypto mining).

## Bootstrap Problem

**Issue**: New network has little content to host. How do early users reach swimmer levels?

**Solutions (Informed by Prior Art)**:
1. **Genesis identities at Lifeguard level** - Bitcoin precedent: early adopters got advantages
2. **14-day grace period for sponsored identities** - PoH allows period before full verification
3. **Lower thresholds during bootstrap** - Storj adjusted economics as network grew
4. **Hybrid PoW during cold start** - Maintain Argon2id as fallback during bootstrap

**Critical Insight**: No prior art solves bootstrap elegantly. This remains an open challenge. Proposed grace period is reasonable but creates vulnerability window. Mitigate by maintaining sponsorship accountability even during grace.

## Mobile Participation

**Issue**: Mobile users have limited bandwidth but contribute time and attention.

**Prior Art Learnings**:
- Storj: use excess capacity, don't buy dedicated hardware
- Something Awful: friction correlating with wealth creates exclusion
- Helium: density scaling accommodates different device capabilities

**Recommendation**: Allow reaching Regular level through time/age rather than bandwidth alone. Creates "slow path" for mobile users—Regular level (5 posts/day) achievable through consistent engagement even without high bandwidth.

**Tradeoff Accepted**: Creates complexity in level determination but prevents two-tier accessibility.

## Remaining Gaps

- No existing system combines contribution-based access with decentralized peer attestation at social media scale—Swimchain is novel here
- Mobile device contribution patterns are underexplored in prior art (most systems focus on desktop/server nodes)
- Long-term sustainability beyond 7 years is unproven (Arweave is the longest-running comparable system)
- Cross-space contribution portability if Swimchain spaces evolve into independent networks
- Optimal response to sophisticated gaming attempts that emerge post-launch

## References

### Primary Sources
- Hashcash: https://en.wikipedia.org/wiki/Hashcash, https://www.cl.cam.ac.uk/~rnc1/proofwork.pdf
- Argon2id: RFC 9106 (https://datatracker.ietf.org/doc/html/rfc9106)
- BitTorrent Trackers: https://phala.com/posts/kpersistent-bittorrent-trackers-a-research-perspective-on-portable-reputation, https://www.researchgate.net/publication/46418335_Incentivizing_Seeding_In_BitTorrent
- Filecoin: https://docs.filecoin.io/storage-providers/filecoin-economics/storage-proving, https://messari.io/report/state-of-filecoin-q4-2024
- Storj: https://www.storj.io/blog/sharing-storage-space-for-fun-and-profit
- Helium: https://docs.helium.com/iot/proof-of-coverage-roadmap/, https://messari.io/report/state-of-helium-q4-2024
- Arweave: https://www.arweave.com/blog/endowment-with-arweave

### Sybil Resistance
- Proof of Humanity: https://blog.humanode.io/exploring-anti-sybil-approaches-proof-of-humanity/
- SybilGuard: https://dl.acm.org/doi/10.1145/1151659.1159945
- Proof of Backhaul: https://www.ndss-symposium.org/ndss-paper/proof-of-backhaul-trustfree-measurement-of-broadband-bandwidth/ (NDSS 2024)

### Economic Analysis
- Proof of Stake Wealth Concentration: https://mitsloan.mit.edu/cfi/compounding-wealth-proof-stake-cryptocurrencies
- DeFi Sybil Attacks: https://cointelegraph.com/news/token-airdrops-targeted-farm-accounts-sybil-attacks

### Social Platforms
- Something Awful: https://www.vice.com/en/article/fuck-you-and-die-an-oral-history-of-something-awful/
- Reddit Karma: https://www.quora.com/What-are-the-negative-aspects-of-the-karma-system-on-Reddit

### Academic Research
- Proof of Useful Work SoK: https://eprint.iacr.org/2025/1814.pdf
- Argon2 Adoption Study: https://arxiv.org/pdf/2504.17121

---

*Research completed: 2025-12-27*
*Status: DRAFT - Ready for team review*
