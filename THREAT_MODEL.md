# Swimchain Threat Model (Who's Fouling the Pool?)

Some swimmers don't play fair. This document catalogs how we keep the pool clean.

This document catalogs attack vectors, threat actors, and defensive mechanisms for Swimchain. It complements [USER_PROFILES.md](./USER_PROFILES.md) which defines legitimate swimmers.

---

## Threat Model Philosophy

Swimchain's security model is fundamentally different from traditional platforms:

| Traditional Pool (Platform) | Swimchain Pool |
|-----------------------------|----------------|
| Lifeguards protect swimmers | Swimmers protect themselves |
| Pool management enforces rules | Pool physics enforce constraints |
| Trust the lifeguards | Trust the water |
| Kick out bad swimmers | Make bad swimming expensive |
| Hidden rule enforcement | Transparent pool rules |

**Core principle:** We don't prevent fouling—we make it economically irrational.

---

## Threat Actor Categories

### 1. Spammers (Economic Motivation)

**Profile:**
- Goal: Force visibility for products/services
- Resources: Low to Medium budget
- Technical skill: Low to Medium
- Persistence: Gives up when ROI is negative

**Attack Vectors:**
| Vector | Description | Difficulty | Impact |
|--------|-------------|------------|--------|
| Mass posting | Flood spaces with promotional content | Medium | Medium |
| Cross-posting | Same content across many spaces | Medium | Low |
| Fake engagement | Self-persist spam content | Medium | Low |
| Identity farming | Create many identities for spam | Medium | Low |

**Defenses:**
| Defense | Mechanism | Effectiveness |
|---------|-----------|---------------|
| **PoW cost** | ~30s per post makes mass posting expensive | High |
| **Engagement PoW** | 60s pooled PoW to persist content | High |
| **Decay** | Unengaged spam disappears | High |
| **No metrics** | Can't prove ROI to advertisers | Very High |
| **No targeting** | Can't identify valuable audiences | Very High |

**Economic Analysis:**
```
Traditional spam:
├── Cost: $0.001 per post
├── Reach: Guaranteed (algorithmic amplification)
├── ROI: Measurable (click tracking)
└── Verdict: Profitable at scale

Swimchain spam:
├── Cost: ~30s CPU time per post + 60s/month to persist
├── Reach: Only those who navigate to space (no amplification)
├── ROI: Unmeasurable (no tracking)
└── Verdict: Economically irrational
```

**Residual Risk:** LOW - Spam is self-defeating due to economic incentives.

---

### 2. Propagandists (Political Motivation)

**Profile:**
- Goal: Control narratives, shape public opinion
- Resources: State-level (unlimited budget)
- Technical skill: High (nation-state APT level)
- Persistence: Very high (strategic objective)

**Attack Vectors:**
| Vector | Description | Difficulty | Impact |
|--------|-------------|------------|--------|
| Narrative flooding | Mass coordinated posting | High | Medium |
| 51% hashrate attack | Control block production on fork | Very High | High |
| Sybil army | Many fake identities pushing same narrative | High | Medium |
| Astroturfing | Fake organic community support | Medium | Medium |
| Content persistence | Keep propaganda alive with PoW | High | Low |

**Defenses:**
| Defense | Mechanism | Effectiveness |
|---------|-----------|---------------|
| **No amplification** | Can't boost content algorithmically | High |
| **Equal footing** | Just another voice, no special privileges | High |
| **Decay** | Must continuously pay to persist | Medium |
| **Fork escape** | Communities fork away from captured chains | Very High |
| **No targeting** | Can't micro-target vulnerable users | High |
| **Active navigation** | Users choose what to see | High |

**51% Attack Analysis:**
```
Attacker controls majority hashrate on a fork:
├── Can control block production
├── Can fill chain with propaganda
├── Can keep it alive indefinitely
│
Community response:
├── Recognizes capture
├── Forks to new chain
├── Excludes attacker identities
└── Attacker controls abandoned chain

Result: Attacker "wins" but loses
└── Captured chain has no users
└── Real community continues elsewhere
```

**Residual Risk:** MEDIUM - Can speak but can't force anyone to listen. Fork escape is ultimate defense.

---

### 3. Harassers (Personal Motivation)

**Profile:**
- Goal: Target specific individuals, cause harm
- Resources: Low to Medium
- Technical skill: Varies
- Persistence: High against specific targets

**Attack Vectors:**
| Vector | Description | Difficulty | Impact |
|--------|-------------|------------|--------|
| Targeted posting | Hostile content about victim | Low | High (to victim) |
| Doxxing | Reveal victim's real identity | Medium | Very High |
| Coordinated pile-on | Multiple accounts target victim | Medium | High |
| Cross-space harassment | Follow victim across spaces | Low | Medium |
| Content preservation | Keep harmful content alive | Medium | Medium |

**Defenses:**
| Defense | Mechanism | Effectiveness |
|---------|-----------|---------------|
| **Pseudonymity** | Real identity not exposed by default | Medium |
| **Decay** | Harmful content eventually fades | Low |
| **Space migration** | Victim can move to new space | Medium |
| **Fork escape** | Community can fork away from harassers | High |
| **Client filtering** | Block content from specific identities | Medium |
| **PoW cost** | Harassment has CPU cost | Low |

**Honest Assessment:**
```
Harassment is the hardest threat to address:
├── Victims can't just "fork away" from coordinated attacks
├── Decay provides window of harm before fading
├── Client filtering requires victim to take action
├── No central authority to intervene
└── Platform can't "ban" harassers

Reality:
├── Swimchain trades user protection for decentralization
├── This disproportionately affects vulnerable users
├── Mitigation is at community layer, not protocol layer
└── This is an explicit design tradeoff
```

**Residual Risk:** HIGH - Decentralization inherently limits victim protection.

---

### 4. Content Abusers (Illegal Content)

**Profile:**
- Goal: Store/distribute CSAM, terrorist content, etc.
- Resources: Low
- Technical skill: Low to Medium
- Persistence: High (criminal motivation)

**Attack Vectors:**
| Vector | Description | Difficulty | Impact |
|--------|-------------|------------|--------|
| Illegal posting | Post CSAM/terrorist content | Low | Very High |
| Steganography | Hide illegal content in images | Medium | High |
| Private spaces | Create "hidden" spaces for sharing | Low | High |
| Persistence abuse | Pay PoW to keep illegal content alive | Medium | High |

**Defenses:**
| Defense | Mechanism | Effectiveness |
|---------|-----------|---------------|
| **Hash blocklists** | Protocol blocks known CSAM hashes | High |
| **Decay** | Unengaged content disappears | Medium |
| **Client refusal** | Nodes refuse to store/relay flagged content | High |
| **No discovery** | Can't be "recommended" by algorithm | Medium |
| **Legal pressure** | Operators in jurisdictions with CSAM laws | Medium |

**Hash Blocklist Implementation:**
```
Protocol-level CSAM defense:
├── Nodes maintain hash blocklist from NCMEC/IWF
├── Content matching known hashes rejected at network layer
├── Not "moderation" - no human decisions about speech
├── Matches known illegal content only
└── Minimal centralization (hash database, not content decisions)

Limitation:
├── Only catches known content
├── New content not in database passes through
├── Steganography may evade detection
└── Defense is at distribution layer, not creation
```

**Residual Risk:** MEDIUM - Hash blocklists catch most known content. Novel content harder to address.

---

### 5. State Actors (Governmental)

**Profile:**
- Goal: Shutdown network, identify users, control discourse
- Resources: Unlimited (government budget + legal authority)
- Technical skill: Very High (NSA/GCHQ level)
- Persistence: Indefinite (strategic objective)

**Attack Vectors:**
| Vector | Description | Difficulty | Impact |
|--------|-------------|------------|--------|
| Legal pressure | Demand takedowns, user data | Low | Low (no central entity) |
| ISP blocking | Block protocol at network level | Medium | Medium |
| Developer arrest | Arrest protocol developers | Medium | Low (open source) |
| Infrastructure seizure | Seize seed nodes, introduction points | Medium | Low |
| Traffic analysis | De-anonymize users via metadata | High | High |
| 51% attack | Control a fork with state resources | Medium | Medium |

**Defenses:**
| Defense | Mechanism | Effectiveness |
|---------|-----------|---------------|
| **No central entity** | Nothing to sue, subpoena, or seize | Very High |
| **Open source** | Code continues without original developers | High |
| **Decentralized infrastructure** | No single point of failure | High |
| **Fork escape** | State controls one fork, community forks | High |
| **Tor integration** | Optional traffic anonymization | Medium |
| **Encrypted protocol** | Content encrypted in transit | High |

**Legal Reality:**
```
Traditional platform under pressure:
├── Government demands takedown
├── Platform complies or faces sanctions
├── Content removed, user banned
└── Government wins

Swimchain under pressure:
├── Government demands takedown
├── No entity to receive demand
├── No mechanism to comply
├── Government can:
│   ├── Block ISPs (users use VPN/Tor)
│   ├── Arrest developers (open source continues)
│   ├── Seize nodes (others exist)
│   └── 51% attack (community forks)
└── Government faces technical impossibility
```

**Residual Risk:** MEDIUM - Network is resilient but individual users may be vulnerable to targeted attacks.

---

### 6. Sybil Attackers (Identity Abuse)

**Profile:**
- Goal: Create many fake identities to game the system
- Resources: Medium
- Technical skill: Medium
- Persistence: Medium

**Attack Vectors:**
| Vector | Description | Difficulty | Impact |
|--------|-------------|------------|--------|
| Identity farming | Create thousands of fake identities | Low | Medium |
| Fake consensus | Many identities push same narrative | Medium | Medium |
| Reputation gaming | Fake identities vouch for each other | Medium | High |
| Engagement manipulation | Split persistence PoW across identities | Low | Low |
| Space capture | Many identities "take over" a space | Medium | Medium |

**Defenses:**
| Defense | Mechanism | Effectiveness |
|---------|-----------|---------------|
| **PoW per identity** | Creating identities costs compute | Low |
| **Pooled engagement** | Total PoW is fixed regardless of identity count | Very High |
| **Temporal analysis** | New identities have less weight | Medium |
| **Graph analysis** | Detect coordination patterns | Medium |
| **Rate Limiting Nullifiers** | Limit actions per epoch | High |

**Pooled Engagement Defense:**
```
Without pooled engagement:
├── Content needs 60 interactions to persist
├── Attacker creates 60 Sybils
├── Each Sybil provides 1 free interaction
└── Attacker persists content for free

With pooled engagement:
├── Content needs 60s TOTAL PoW to persist
├── 1 identity × 60s = 60s total
├── 60 identities × 1s each = 60s total
├── 600 identities × 0.1s each = 60s total
└── Same cost regardless of identity count
```

**Residual Risk:** LOW - Sybils provide no advantage for persistence. Reputation gaming remains a concern.

---

### 7. Storage Abusers (Resource Exhaustion)

**Profile:**
- Goal: Use network for free storage/hosting
- Resources: Low
- Technical skill: Low to Medium
- Persistence: Medium (until caught or bored)

**Attack Vectors:**
| Vector | Description | Difficulty | Impact |
|--------|-------------|------------|--------|
| Free hosting | Post large files, self-persist | Medium | Low |
| Chain bloat | Fill chain with junk data | High | Medium |
| Private backup | Create private space for personal storage | Low | Low |
| Bandwidth abuse | Request content repeatedly | Low | Low |

**Defenses:**
| Defense | Mechanism | Effectiveness |
|---------|-----------|---------------|
| **Engagement PoW** | 60s monthly to persist content | Very High |
| **Decay** | Unused content disappears | Very High |
| **Content limits** | 500KB images, 5MB video max | High |
| **Fast video decay** | 7 days vs 30 days for other content | High |
| **Space-scoped sync** | Only sync what you participate in | Medium |

**Economic Analysis:**
```
Storage abuse attempt:
├── Post 1000 files (500KB each = 500MB)
├── Initial PoW: 1000 × 30s = 500 minutes
├── Monthly persistence: 1000 × 60s = 1000 minutes
├── Compare: Actual hosting costs ~$0.10/month for 500MB
└── Result: Massively more expensive than real hosting
```

**Residual Risk:** VERY LOW - Protocol makes abuse economically irrational.

---

### 8. Competitor/Saboteur (Platform Motivation)

**Profile:**
- Goal: Discredit Swimchain, drive users to alternative
- Resources: Medium to High (corporate budget)
- Technical skill: Medium
- Persistence: High (business objective)

**Attack Vectors:**
| Vector | Description | Difficulty | Impact |
|--------|-------------|------------|--------|
| Negative PR | Publicize worst content on Swimchain | Low | Medium |
| False flag | Create offensive content, screenshot, blame platform | Low | Medium |
| Astroturfing | Fake users complaining about experience | Low | Low |
| Feature parity attacks | Copy features, claim Swimchain is obsolete | Low | Low |
| Regulatory pressure | Lobby for laws that harm decentralized protocols | Medium | High |

**Defenses:**
| Defense | Mechanism | Effectiveness |
|---------|-----------|---------------|
| **Honest tradeoffs** | Pre-documented limitations prevent surprise | Medium |
| **Open source** | Anyone can verify claims | High |
| **Community response** | Users can counter narratives | Medium |
| **Regulatory resilience** | No central entity to regulate | High |
| **Fork survival** | Even if "Swimchain" dies, protocol continues | Very High |

**Residual Risk:** MEDIUM - Reputation attacks are hard to prevent but limited in impact on committed users.

---

## Attack Scenario Walkthroughs

### Scenario 1: Spam Campaign

**Attacker:** Marketing company paid to promote product

**Attack:**
1. Create 100 identities (PoW: 100 × 30s = 50 minutes)
2. Post promotional content in 50 spaces (PoW: 50 × 30s = 25 minutes)
3. Self-persist with Sybils (PoW: 60s total per content = 60 minutes)
4. Total: ~135 minutes of compute

**Result:**
- 50 spam posts exist for ~30 days
- No guaranteed visibility (users navigate, don't see feed)
- No metrics to prove campaign worked
- Can't bill client for "impressions"
- Client: "This is useless, use Facebook"

**Verdict:** Attack succeeds technically, fails economically.

---

### Scenario 2: State Censorship Attempt

**Attacker:** Authoritarian government

**Attack:**
1. Identify dissidents on Swimchain (traffic analysis)
2. Demand platform remove content
3. Find no platform to demand from
4. Block protocol at ISP level
5. Attempt 51% attack on dissident community's fork

**Result:**
- Dissidents use VPN/Tor
- 51% attack captures one fork
- Community forks to new chain, excludes state identities
- State controls empty chain
- Dissidents continue on new fork

**Verdict:** State can impose friction but cannot achieve shutdown.

---

### Scenario 3: Harassment Campaign

**Attacker:** Coordinated harassment group

**Attack:**
1. Identify victim across spaces
2. Create content targeting victim
3. Follow victim to new spaces
4. Persist harassment content

**Result:**
- Victim experiences harassment
- Content persists while attackers pay PoW
- Victim can:
  - Client-side block attacker identities
  - Migrate to new space
  - Community can fork
- Attackers can follow but must pay ongoing PoW

**Verdict:** Attack succeeds in causing harm. Defense is migration/filtering, not prevention.

**Honest Acknowledgment:** This is Swimchain's weakest point. Decentralization limits victim protection.

---

### Scenario 4: CSAM Distribution

**Attacker:** Criminal distributing illegal content

**Attack:**
1. Post CSAM to network
2. Self-persist to keep alive

**Result:**
- Content matching known hashes blocked at network layer
- Novel content passes through temporarily
- Community flagging triggers hash addition
- Client nodes refuse to store/relay
- Content isolated to criminal's own node
- Legal pressure on criminal's jurisdiction

**Verdict:** Hash blocklists catch known content. Novel content requires community response.

---

### Scenario 5: Chain Takeover

**Attacker:** Well-resourced entity (state or corporation)

**Attack:**
1. Acquire majority hashrate on target fork
2. Control block production
3. Censor transactions, fill with propaganda
4. Maintain control indefinitely

**Result:**
- Attacker controls block production
- Community recognizes capture
- Community forks to new chain
- New fork excludes attacker identities
- Attacker controls abandoned chain with no users

**Verdict:** Pyrrhic victory. Attack costs resources, gains nothing of value.

---

## Defense Layers Summary

| Layer | Mechanism | Threats Addressed |
|-------|-----------|-------------------|
| **Economic** | PoW cost, no ROI metrics | Spam, advertising |
| **Temporal** | Decay, persistence cost | Storage abuse, old harassment |
| **Cryptographic** | Signatures, hash blocklists | Impersonation, CSAM |
| **Social** | Community migration, fork escape | Capture, propaganda |
| **Client** | Local filtering, blocking | Personal harassment |
| **Architectural** | No central entity, open source | Legal pressure, shutdown |

---

## Residual Risk Summary

| Threat | Residual Risk | Mitigation Gap |
|--------|---------------|----------------|
| Spam | LOW | None significant |
| Propaganda | MEDIUM | Can speak, just can't amplify |
| Harassment | HIGH | Decentralization limits protection |
| Illegal content | MEDIUM | Novel content not in hash lists |
| State actors | MEDIUM | Individual users may be targeted |
| Sybils | LOW | Pooled engagement defeats |
| Storage abuse | VERY LOW | Economically irrational |
| Sabotage | MEDIUM | Reputation attacks possible |

---

## Recommendations

### For Protocol Development

1. **Implement hash blocklists** at network layer (non-negotiable for CSAM)
2. **Strengthen graph analysis** to detect coordinated Sybil behavior
3. **Add optional Tor support** for traffic anonymization
4. **Document harassment limitations** honestly in user-facing materials

### For Client Development

1. **Easy blocking** of identities at client level
2. **Content warnings** for potentially harmful content
3. **Migration tools** to help users move between spaces
4. **Clear onboarding** about what protection exists (and doesn't)

### For Community

1. **Establish norms** for community response to harassment
2. **Create support structures** for targeted users
3. **Document fork procedures** for community escape
4. **Build trust networks** for identity validation

---

*Document created: 2025-12-25*
*Last updated: 2025-12-25*
