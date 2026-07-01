# Synthesis: Community Attestation Mechanisms

## Status: COMPLETE

```json
{
  "topic": "Community Attestation Mechanisms",
  "executive_summary": "Community attestation provides a viable path to decentralized moderation that aligns strongly with Swimchain's core values. The research validates that threshold-based attestation (N-of-M from independent sources) is robust against gaming, with prior art from Stack Overflow (6 flags), Wikipedia (3-revert rule), and HN (karma-weighted flagging) demonstrating effectiveness at scale. Swimchain's proposed 3-attester threshold with tree deduplication is well-calibrated and represents a novel enhancement over existing systems.\n\nThe critical insight is that social cost is the correct Sybil resistance mechanism for social platforms. Unlike computational or economic costs (which can be purchased or parallelized), social capital accumulates through genuine participation and cannot be automated. Swimchain's design—requiring 30 days + 10GB hosting contribution for attestation eligibility—creates meaningful investment that prior art shows is effective.\n\nAccelerated decay (4-hour half-life) rather than instant deletion is a novel contribution that provides counter-attestation windows, reduces false positive permanence, and maintains transparency. The asymmetric threshold design (3 to flag, 5 Lifeguards to counter) protects legitimate content while preventing gaming. Key remaining gaps include state actor resistance, cross-fork reputation portability, and dynamic threshold calibration under real-world conditions.",
  "approach_categories": [
    {
      "category": "Centralized Platform Moderation",
      "approaches": ["Stack Overflow Flagging", "Reddit Moderation", "Hacker News Karma System"],
      "general_tradeoffs": "Proven at scale with sophisticated mechanisms (weighted flagging, privilege escalation, automated detection). However, all require central review bottlenecks or appointed moderators vulnerable to capture. Stack Overflow's 2023 moderator strike and Reddit's API crisis demonstrate fragility. HN's single-moderator model is explicitly a benevolent dictator pattern."
    },
    {
      "category": "Federated Platform Moderation",
      "approaches": ["Mastodon Instance Blocking", "Matrix Room ACLs", "Email Sender Reputation"],
      "general_tradeoffs": "High decentralization with node/instance autonomy. Email reputation proves this scales to billions of messages. Mastodon blocklists show consensus-based coordination works. Key limitation: binary blocking (Mastodon) or weakest-link compliance (Matrix ACLs). Email's multi-factor reputation is strongest model."
    },
    {
      "category": "Consensus-Based Moderation",
      "approaches": ["Wikipedia Edit Wars & Protection", "Token Curated Registries", "DAO Governance"],
      "general_tradeoffs": "Transparent decision-making with community ownership. Wikipedia shows consensus is slow but durable. DAOs demonstrate threshold-based voting works. Key risks: whale manipulation (TCRs), governance extraction (DAOs), and social capital concentration (Wikipedia editor aristocracy)."
    },
    {
      "category": "Cryptoeconomic Security",
      "approaches": ["Proof of Work", "Proof of Stake", "Identity Verification (World ID)", "Web of Trust"],
      "general_tradeoffs": "2024 research confirms the Sybil Vulnerability Trilemma: no system can be permissionless, Sybil-resistant, and free simultaneously. PoW/PoS make attacks economically infeasible but favor wealth. Web of trust creates social cost that cannot be parallelized—most aligned with social platform goals."
    },
    {
      "category": "Distributed Content Detection",
      "approaches": ["CSAM Hash Matching", "Perceptual Hashing", "Blocklist Gossip"],
      "general_tradeoffs": "Hash matching achieves ~99.9% accuracy at massive scale (billions of files). Challenge is maintaining blocklists without central authority like NCMEC. AI-generated content is rapidly outpacing detection—CSAM reports doubled in first 8 months of 2025."
    }
  ],
  "comparison_matrix": {
    "dimensions": ["decentralization", "privacy", "scalability", "complexity", "maturity"],
    "approaches": [
      {
        "name": "Stack Overflow Weighted Flagging",
        "scores": {
          "decentralization": "low",
          "privacy": "medium",
          "scalability": "high",
          "complexity": "medium",
          "maturity": "high"
        }
      },
      {
        "name": "Mastodon Consensus Blocklists",
        "scores": {
          "decentralization": "high",
          "privacy": "medium",
          "scalability": "high",
          "complexity": "medium",
          "maturity": "medium"
        }
      },
      {
        "name": "Email Multi-Factor Reputation",
        "scores": {
          "decentralization": "high",
          "privacy": "low",
          "scalability": "high",
          "complexity": "high",
          "maturity": "high"
        }
      },
      {
        "name": "Wikipedia Graduated Protection",
        "scores": {
          "decentralization": "medium",
          "privacy": "low",
          "scalability": "high",
          "complexity": "high",
          "maturity": "high"
        }
      },
      {
        "name": "Web of Trust (Sponsor Trees)",
        "scores": {
          "decentralization": "high",
          "privacy": "medium",
          "scalability": "medium",
          "complexity": "medium",
          "maturity": "low"
        }
      },
      {
        "name": "DAO Threshold Voting",
        "scores": {
          "decentralization": "high",
          "privacy": "low",
          "scalability": "medium",
          "complexity": "high",
          "maturity": "medium"
        }
      },
      {
        "name": "Hash-Based Blocklists",
        "scores": {
          "decentralization": "low",
          "privacy": "medium",
          "scalability": "high",
          "complexity": "low",
          "maturity": "high"
        }
      }
    ]
  },
  "swimchain_incompatible": [
    {
      "approach": "Appointed Moderators (Reddit model)",
      "reason": "Creates power dynamics and capture vulnerability. Violates THESIS_04 (no special moderator roles). Subreddit capture is documented. Users cannot exit with communities."
    },
    {
      "approach": "Stake-Weighted Voting (Steemit model)",
      "reason": "Creates plutocracy where whales dominate. Violates decentralization principle. Steemit proved this fails—whale voting experiments showed removing whale influence improved distribution. Led to Hive fork."
    },
    {
      "approach": "Central Arbitration (Wikipedia ArbCom model)",
      "reason": "Requires trusted central authority incompatible with true decentralization. Creates single point of failure and capture target. Swimchain's fork mechanism provides exit rather than resolution."
    },
    {
      "approach": "Anonymous Posting (4chan model)",
      "reason": "Enables 11% hate speech rate. Without persistent identity, reputation has no consequences. Violates Swimchain's pseudonymity-with-reputation model. Direct contributor to real-world violence."
    },
    {
      "approach": "Token-Based Curation (TCR model)",
      "reason": "Economic stake creates wealth bias. Whale manipulation documented. Swimchain uses contribution-based access (hosting = stake) which is more aligned with social platform goals than financial stake."
    },
    {
      "approach": "Invisible Algorithmic Penalties (HN model)",
      "reason": "~20% of HN front-page stories penalized with no transparency. Opaque moderation creates distrust. Works only because of single trusted moderator—antithetical to decentralization."
    }
  ],
  "recommendations": {
    "primary": {
      "approach": "Threshold-Based Attestation with Tree Deduplication and Accelerated Decay",
      "rationale": "This combines the strongest patterns from prior art while addressing their limitations:\n\n1. **3-attester threshold** is well-validated (SO uses 6, Wikipedia uses 3RR, literature consensus is 3-5). Creates coordination cost without being too slow.\n\n2. **Tree deduplication** is a novel enhancement. Prior art (BrightID, graph analysis) detects Sybils post-hoc; Swimchain builds deduplication into attestation counting, preventing attacks at protocol level.\n\n3. **Accelerated decay (4-hour half-life)** is superior to instant deletion. Provides counter-attestation window, maintains transparency, reduces false positive permanence. No prior art uses this approach—it's a genuine innovation.\n\n4. **Counter-attestation at 5 Lifeguards** creates asymmetric protection. Higher threshold for reversal prevents gaming while allowing legitimate defense. Prior art (HN vouch mechanism) validates the pattern but often lacks explicit thresholds.\n\n5. **Contribution-backed authority** (30 days + 10GB hosting) prevents purchased influence. Prior art shows token-based systems vulnerable to whale manipulation; hosting contribution is more aligned.\n\n6. **Behavioral specificity** (SpamReason enum) protects minority viewpoints. Reddit research proves opinion-based moderation creates political bias and echo chambers.",
      "implementation_level": "protocol",
      "tradeoffs_accepted": [
        "Some spam may persist longer than instant-delete systems (4 hours vs immediate)",
        "May be too slow for very active spam campaigns at scale",
        "Counter-attestation requires Lifeguard+ level, limiting who can defend content",
        "State actors with 18-24 month infiltration campaigns remain unsolved",
        "Cold start problem for new networks with few qualified attesters"
      ],
      "open_questions": [
        "What is the optimal decay acceleration factor? 4-hour half-life is empirical guess",
        "How does the system behave at 1M+ users with 5000 flags/day?",
        "Is fast recovery (+10 per counter-attestation) correctly calibrated?",
        "Should weighted attestation be optional per-fork or protocol-level?",
        "How to handle edge cases where 3 attesters exist but all from small network segment?"
      ]
    },
    "alternatives": [
      {
        "approach": "Weighted Attestation by Swimmer Level",
        "when_to_use": "For communities wanting to give experienced contributors more influence. One PoolKeeper (2.5) + one Lifeguard (1.5) = 4.0 exceeds threshold without requiring 3 separate attesters.",
        "tradeoffs": "Increases complexity. Risk of power concentration among high-level users. May reduce accessibility for normal community members. Should be optional per-fork."
      },
      {
        "approach": "Dynamic Thresholds Based on Network Health",
        "when_to_use": "At scale (100K+ users) when flag volume increases or during abuse waves. Raise threshold from 3 to 4-5 when recent_flag_rate > 5%.",
        "tradeoffs": "More complex to implement. Adds governance decision about adjustment triggers. Could be gamed by creating fake 'normal' period before attack. Recommend implementing after learning from testnet."
      },
      {
        "approach": "Private Attestations (HN-style hidden flags)",
        "when_to_use": "For communities where public attestation creates drama or retaliation concerns. Flags visible to counter-attesters but not to content author or general public.",
        "tradeoffs": "Reduces transparency, which conflicts with decentralization values. May reduce accountability for bad-faith flaggers. Could be client-level option rather than protocol change."
      }
    ],
    "rejected": [
      {
        "approach": "Single-attester action",
        "reason": "Too easily gamed. One actor can target any content. Prior art universally requires multiple independent signals."
      },
      {
        "approach": "Equal counter-attestation threshold (3 to flag, 3 to counter)",
        "reason": "Creates symmetrical gaming. Attacker and defender have equal burden. Asymmetric threshold (5 vs 3) protects legitimate content."
      },
      {
        "approach": "Instant deletion on threshold",
        "reason": "No recovery window for false positives. Prior art (SO, Reddit) shows significant false positive rates. Accelerated decay is more forgiving."
      },
      {
        "approach": "Content-type attestation (opinions, controversial topics)",
        "reason": "Reddit research proves opinion-based moderation leads to political bias. SpamReason enum explicitly limits to behavioral categories (spam, harassment, illegal). Protects minority viewpoints."
      },
      {
        "approach": "Centralized blocklist distribution",
        "reason": "Single source creates capture vulnerability. Must use consensus-based multi-source approach (like Mastodon's Oliphant/Seirdy lists requiring multiple confirmations)."
      }
    ]
  },
  "implementation_notes": {
    "dependencies": [
      "Sponsor tree infrastructure (already in SPEC for identity/Sybil resistance)",
      "Swimmer level system (30-day aging, hosting contribution thresholds)",
      "Content decay system (half-life mechanism)",
      "Distributed blocklist gossip protocol (SPEC_12 §4.6)"
    ],
    "complexity_estimate": "medium",
    "prototype_questions": [
      "Simulate collusion: Can 3 coordinated actors from different sponsor trees consistently game the system? What's the investment required?",
      "Simulate false positive rates: What percentage of legitimate content gets flagged in adversarial conditions? How quickly does counter-attestation restore normal decay?",
      "Simulate scale: At 100K users with 5000 flags/day (15,000 attestations needed), is 0.3 attestations per Resident per day achievable?",
      "Test recovery calibration: Is +10 per counter-attestation the right amount? Does it adequately compensate for false positive damage?",
      "Test tree deduplication: How do attestations behave when network has few sponsor trees? Edge case where 3 attesters exist but 2 share a tree?",
      "Test distributed blocklist convergence: How long until 95% of nodes agree on blocklist entries via Merkle root gossip?"
    ]
  },
  "remaining_gaps": [
    "State actor resistance: 18-24 month infiltration campaigns with patient Sybil investment remain unsolved. Swimchain's 270 account-day requirement raises the bar but determined nation-states have resources.",
    "Cross-fork reputation portability: If a community forks, how do attestation histories and reputation transfer? No prior art provides clean solution.",
    "AI-generated content: CSAM reports doubled in 8 months (2024-2025). Attestation systems designed for human-speed abuse may not scale to AI-generated manipulation.",
    "Recovery rate calibration: +10 per counter-attestation is empirical guess. Needs testnet data to validate whether this adequately compensates false positive victims.",
    "Minority protection within communities: Attestation can silence lone dissenters. Fork-as-exit doesn't help individuals who can't convince others to join.",
    "Coordination mechanisms: How do potential counter-attesters discover content that needs defense? No push notification for 'content being flagged that you might want to vouch for.'",
    "Legal liability for blocklist maintainers: If distributed blocklist incorrectly flags legal content as CSAM, who is liable? Decentralization may not provide legal protection."
  ]
}
```

## Key Patterns from Prior Art

### 1. Threshold-Based Action Triggers
Multiple independent attestations required before consequences apply. This is the most validated pattern across all prior art:
- Stack Overflow: 6 flags trigger automatic deletion
- Wikipedia: 3-revert rule limits edit wars
- Swimchain: 3 attesters from different sponsor trees

**Swimchain Enhancement**: Tree deduplication is novel. Prior art counts raw attestation numbers; Swimchain counts unique sponsor tree roots, preventing Sybil rings.

### 2. Graduated Response vs Binary Action
Accelerated decay rather than instant deletion:
- Wikipedia: Protection levels (semi-protected, fully protected)
- HN: Rank reduction rather than removal
- Swimchain: 4-hour half-life acceleration

**Why This Matters**: Reduces false positive damage, provides counter-attestation window, maintains audit trail.

### 3. Contribution-Backed Authority
Moderation power tied to demonstrated investment:
- Wikipedia: 30 days + 500 edits for Extended Confirmed Protection
- Stack Overflow: Reputation thresholds unlock privileges
- Swimchain: 30 days + 10GB hosting for attestation eligibility

**Key Insight**: Hosting contribution as stake is more aligned than economic stake for social platforms. Cannot be purchased.

### 4. Fork as Exit Valve
Ultimate protection against moderation capture:
- Hive from Steem: 2x more daily users post-fork
- Mastodon: Instance migration
- Swimchain: Fork with customizable attestation rules

**Critical Requirement**: Identity and content must be portable. Hive succeeded because users kept their accounts.

### 5. Behavioral Specificity
Only objective categories trigger consequences:
- Swimchain: SpamReason enum (Advertising, Repetitive, OffTopic, Harassment, Illegal)
- NOT: "controversial", "offensive", "wrong opinion"

**Reddit Research Finding**: Political bias in moderation creates echo chambers. Opinion-based moderation leads to commenters with different views than moderators being more likely removed.

## Comparison with Prior Art

| Feature | Stack Overflow | Mastodon | Swimchain |
|---------|---------------|----------|-------------|
| Threshold | 6 flags | Binary block | 3 attesters |
| Deduplication | No | No | Tree-based |
| Consequence | Deletion | Defederation | Accelerated decay |
| Counter-mechanism | Mod review | Instance migration | Counter-attestation |
| Authority basis | Reputation | Admin appointment | Hosting contribution |
| Recovery | Mod decision | New instance | Fast recovery + gradual |

## Validation of Swimchain Design

The research strongly validates Swimchain's existing design choices:

1. **3-attester threshold** ✓ - Aligned with literature consensus of 3-5 for informal mechanisms
2. **Tree deduplication** ✓ - Novel enhancement addressing known Sybil ring weakness
3. **Accelerated decay** ✓ - Superior to instant deletion per false positive research
4. **Counter-attestation at 5** ✓ - Asymmetric protection validated by vouch mechanisms
5. **Contribution-based access** ✓ - Avoids whale manipulation seen in token systems
6. **Behavioral specificity** ✓ - Prevents political bias documented in Reddit research
7. **Fork-as-exit** ✓ - Proven by Hive fork success

## Risks and Mitigations

| Risk | Mitigation | Residual Risk |
|------|------------|---------------|
| Coordinated false flagging | Tree deduplication, counter-attestation, privilege loss | Well-funded 3+ tree coordination remains possible |
| Sybil attestation | Sponsor tree roots must differ, 30-day aging | 270+ account-day investment still achievable |
| Attestation fatigue | 10/day limit per identity | Distributed attack by many accounts |
| Revenge flagging | Cannot attest within sponsor chain, pattern detection | Indirect revenge via friends |
| Majority tyranny | Behavioral specificity, fork-as-exit | Minorities within communities still vulnerable |

## Implementation Priority

1. **Core attestation mechanism** - 3 threshold, tree deduplication, accelerated decay
2. **Counter-attestation** - 5 Lifeguard threshold, fast + gradual recovery
3. **Rate limiting** - 10/day, privilege suspension after 3 countered flags
4. **Distributed blocklist** - Gossip protocol for illegal content hashes
5. **Optional weighted attestation** - Level-based weights for forks that want it

---

*Synthesis completed: 2025-12-27*
*Status: COMPLETE - Ready for specification integration*
