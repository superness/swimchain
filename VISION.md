# Swimchain - Vision Document

**Website:** [swimchain.io](https://swimchain.io)

## The One-Paragraph Vision

**Swimchain is a space to socialize without advertisements, propaganda, or engagement farming.** Every user runs a node. There are no servers, no company, no algorithm. Content decays naturally without engagement. Posting requires proof-of-work friction. Communities can fork away from capture. If every developer disappeared tomorrow, the network would continue. This is not smaller Twitter—it's something fundamentally different: bounded storage (500MB target), ephemeral content, conversation over permanence, text and images over video, active navigation over algorithmic feeds.

---

## The Swimming Metaphor

The name "Swimchain" is not arbitrary. Swimming embodies everything this network is about:

```
┌─────────────────────────────────────────────────────────────────┐
│                     WHY SWIMMING?                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   EFFORT REQUIRED       LANES EXIST         EVERYONE'S IN      │
│   (No passive float)    (Communities)       (Shared pool)      │
│                                                                 │
│   You swim to post      Stay in your lane   No privileged      │
│   Every stroke costs    Boundaries matter   swimmers            │
│   Rest = sink           Different spaces    Same infrastructure │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Swimming Term | Swimchain Concept | Meaning |
|---------------|-------------------|---------|
| **Swimming** | Proof of Work | You put in effort to participate. No passive consumption. |
| **Lanes** | Spaces | Communities are lanes. "Stay in your lane" = respect boundaries. |
| **Pool** | Network | Everyone's in the same pool. Shared infrastructure. |
| **Strokes** | Posts | Each post is a stroke - effort that moves you forward. |
| **Drift** | Decay | Without effort, content drifts away and fades. |
| **Upstream** | Against decay | Engagement keeps content from drifting downstream. |
| **Diving in** | Joining | Active commitment to participate. |
| **Treading water** | Maintaining | Ongoing effort to stay present. |

**"Have you checked your swimchain?"** - A natural way to ask about activity.

See [GLOSSARY.md](GLOSSARY.md) for complete swimming terminology.

---

## Why We're Building This

We want a space to socialize without the hell of advertisements, propaganda, and engagement farming.

A space where we can find each other. Where content has permanence through the attention we give it. Where the experience is shared and referencable - we see the same things, not algorithmic fragments tailored to manipulate us individually.

Modern social media is hostile territory. Every platform eventually optimizes for extraction: your attention sold to advertisers, your emotions farmed for engagement, your communities manipulated by algorithms you can't see or control.

We're not building a business. We're building a place to exist online without being the product.

### No Infrastructure

A primary goal is to run zero infrastructure. No servers. No databases. No hosting.

This isn't just ideology - it's practical:
- Servers cost money (who pays forever?)
- Scaling costs more money
- Hosting content = legal liability
- Central servers = target for takedowns
- Running infrastructure = becoming the mega-node we reject

**The only sustainable model: users ARE the infrastructure.**

Every client is a node. The network exists because participants exist. No one maintains "the servers" because there are no servers. Like Bitcoin - Satoshi disappeared, the network kept running.

If you can't walk away and have it keep working, it's not decentralized.

---

## Anti-Vision (What We Reject)

These are the patterns we've seen fail or betray their stated goals:

| Pattern | Why It Fails |
|---------|--------------|
| VC-funded "decentralization" | Investors need returns, creating pressure to centralize and extract value |
| Mega-nodes | One entity controls infrastructure, making "decentralization" marketing fiction |
| Algorithmic feeds | Opaque systems optimized for engagement/ads, not user value |
| Platform-controlled moderation | Central authority becomes censorship vector and single point of failure |
| "Decentralize later" | Never happens. Centralized infrastructure is easier, so it stays |
| Advertising model | Requires data collection, engagement optimization, and corporate control |

### Case Studies in Failure

**Bluesky**: 99.99% of users on company infrastructure. Identity controlled by single PLC server. DMs routed through company servers. "Decentralization" is a future promise, not current reality.

**Mastodon**: Technically federated, but most users cluster on mega-instances. Running your own node requires significant technical expertise.

**Steemit/DeSo**: Blockchain-based but development and major infrastructure controlled by founding teams.

---

## Core Principles

1. **True decentralization**: Every client is a node. Everyone has the chain. No mega-nodes.
2. **No central authority**: No entity to contact about takedowns, trademarks, or censorship.
3. **No algorithm**: No hidden hand deciding what users see. Transparent protocol rules only.
4. **No ads**: No monetization pressure means no incentive to manipulate users.
5. **Protocol rules, not platform decisions**: Like Bitcoin's fee market - transparent physics, not opaque curation.
6. **Social first**: Contribution is visible, participation is recognized, community is the reward. This is social media—the social layer is protocol-level, not an afterthought.

---

## Architecture Concepts

### Active Navigation (Not Algorithmic Feeds)

**Important clarification:** The protocol is format-agnostic. Clients can render content as forums, feeds, chat interfaces, or any other UX pattern. What the protocol rejects is **algorithmic curation**—there is no hidden system deciding what users see.

The **navigation philosophy** (not a protocol constraint) is inspired by 2000s-era forums:

| Algorithmic Social Media | Swimchain Approach |
|--------------------|----------------------|
| Unified feed curated for you | Navigate to spaces you choose |
| Platform decides what you see | You decide where you go |
| Passive consumption | Active participation |
| Algorithmic discovery | Topic-based organization |
| Engagement metrics | Threads and replies |

**Why this matters:** A client could present Swimchain as a feed, a chat app, or a wiki—these are UX choices. What no client can do is algorithmically curate content because the protocol doesn't support it. The data structure (spaces, threads, posts) supports multiple presentation formats while preventing invisible manipulation.

### Proof of Work to Post (Swimming)

Every stroke requires effort. You can't fake swimming.

- **Purpose**: Spam prevention without central moderation
- **Mechanism**: Computational cost to create posts (each post is a stroke)
- **Benefit**: Economic disincentive for bad actors, no moderators needed
- **Metaphor**: Swimming upstream - you have to keep moving to stay in place

### Natural Content Decay (Drift)

Content drifts downstream without engagement. Stop swimming, start sinking.

- **Purpose**: Content moderation and storage management
- **Mechanism**: Content without engagement drifts away and eventually disappears
- **Key insight (December 2024)**: Decay is **adaptive, not fixed**
  - System targets a storage budget (default 500MB per user)
  - Decay rate adjusts to meet target
  - High activity → faster decay (prevent storage explosion)
  - Low activity → slower decay (content lives longer)
  - Half-life range: 1 day (minimum) to 30 days (maximum)
- **Benefit**:
  - Bad content rots away naturally
  - Chain doesn't grow infinitely
  - No one needs to "delete" anything
  - **Stale storage attacks defeated** - garbage can't sit for 30 days consuming space
  - Self-regulating system instead of hoping fixed parameters work

### Hybrid Architecture: Bitcoin Authority + BitTorrent Distribution

**Resolved December 2024:** Swimchain is not purely Bitcoin-like or purely BitTorrent-like. It's a hybrid:

| Layer | Model | Purpose |
|-------|-------|---------|
| **Authoritative Layer** | Bitcoin-like chain | PoW proof, signatures, timestamps, content hashes |
| **Content Layer** | BitTorrent-like P2P | Actual media files, retrieved from whoever has them |

**How they work together:**

```
AUTHORITATIVE RECORD (chain - small, verifiable)
{
  author: pubkey,
  space: "tech-projects",
  timestamp: 1703456789,
  pow_nonce: 847291,          // Proves work was done
  content_hash: "Qm7x9abc...", // Points to content
  signature: "sig..."
}

CONTENT BLOB (P2P - large, distributed)
Qm7x9abc... → 50MB video file
├── Stored by creator
├── Cached by viewers
└── Seeded by enthusiasts
```

**What this solves:**
- Chain is small (metadata only) → everyone can verify
- Content scales via seeding → no storage explosion
- PoW/signatures provide authority → immutable record
- Content availability depends on interest → natural decay
- You can prove "X posted Y at time Z" even if content blob is gone

### Recursive Block Architecture

**Resolved December 2024:** Swimchain uses a hierarchical block structure mirroring content organization. This is NOT traditional Bitcoin-style single-chain blocks, but a recursive tree:

```
                    ROOT BLOCK (CHAIN LEVEL)
                    ├── Contains: space block hashes
                    ├── PoW: sum of space block PoWs
                    └── Forms every ~30 seconds
                            │
            ┌───────────────┼───────────────┐
            │               │               │
      SPACE BLOCK     SPACE BLOCK     SPACE BLOCK
      (rust-lang)     (boston)        (fishing)
      ├── Contains:   ├── Contains:   ├── Contains:
      │   content     │   content     │   content
      │   block       │   block       │   block
      │   hashes      │   hashes      │   hashes
      └── PoW: sum    └── PoW: sum    └── PoW: sum
            │               │               │
     ┌──────┴──────┐       ...             ...
     │             │
CONTENT BLOCK  CONTENT BLOCK
(thread X)     (thread Y)
├── Actions    ├── Actions
└── PoW: sum   └── PoW: sum
```

**Key Insight: Mining IS Paying.** There is no distinction between "mining" and "paying for actions." Users mine to post, mine to engage, mine to persist content. PoW aggregates upward through the hierarchy:

| Action | PoW Cost | Aggregates To |
|--------|----------|---------------|
| Post | ~30s | Content block |
| Reply | ~15s | Content block |
| Engage (persist) | 60s total (pooled) | Content block |
| Content blocks | Sum of actions | Space block |
| Space blocks | Sum of content blocks | Root block |

**Pooled Engagement:** ALL engagement costs PoW. This prevents free self-persistence:
- Content persistence requires 60s total PoW (the "pool")
- Multiple users can contribute to the same pool
- Same user can contribute multiple times
- Sybils provide no advantage (total is fixed)
- When pool completes, decay timer resets

**Parent-Anchored Threading:** Related content stays together:
- New posts: branch assigned by content hash
- Replies: inherit parent's branch (thread stays together)
- Users sync branches containing their interactions
- Cross-branch references minimized

See SPEC_08_RECURSIVE_BLOCKS.md for full specification.

### Social Layer: Hosting is the Contribution

**Added December 2024, Updated December 2025:** The network needs HOSTING, not just activity. The Social Layer makes hosting contribution visible and rewarding—without creating an economy.

```
THE CORE EXCHANGE
═══════════════════════════════════════════════════════════════════════

What the network NEEDS:          What we REWARD:
├── Content to be HOSTED         ├── Hosting other people's content
├── Bandwidth to be SERVED       ├── Serving bandwidth to peers
├── Nodes to be ONLINE           ├── Being online when others need you
├── Peers to be AVAILABLE        ├── Keeping the network alive
└── This is infrastructure       └── NOT just "being active" or "posting"

THE DISTINCTION:
├── Chain contributions (posting, engaging):
│   └── Already have incentive (you want to participate) → No extra reward
│
└── Hosting contributions (serving, seeding):
    └── NO natural incentive → THIS is what the social layer rewards
```

**What Gets Tracked (Protocol-Level, Hosting-Focused):**
| Metric | Weight | Meaning |
|--------|--------|---------|
| Bandwidth served | **Primary** | GB of data you've served to peers |
| Content hosted × uptime | **Primary** | GB-hours of content you've stored |
| Uptime ratio | **Primary** | Time you've been available when needed |
| Peer requests served | Secondary | How many times you've helped other nodes |
| Posts kept alive | Secondary | Content you contributed engagement PoW to |

**Swimmer Levels (Based on HOSTING, not posting):**
| Level | Name | Hosting Requirements |
|-------|------|----------------------|
| 0 | New Swimmer 🏊 | Just joined |
| 1 | Regular 🏊‍♂️ | 7+ days, any bandwidth served |
| 2 | Resident 🏊‍♀️ | 30+ days, 10GB+ served lifetime, 50%+ uptime |
| 3 | Lifeguard 🛟 | 50GB+/month served, 70%+ uptime |
| 4 | Anchor ⚓ | 200GB+/month served, 90%+ uptime |
| 5 | Pool Keeper 🏛️ | 500GB+/month served, 95%+ uptime |

**Key insight**: An active poster with no hosting stays at Regular. A silent node that serves 500GB/month is a Pool Keeper.

**Benefits (Fair Exchange, Non-Transferable):**
| You Give | You Get | Rationale |
|----------|---------|-----------|
| Bandwidth (serving) | Reduced PoW (post faster) | Compute for compute |
| Storage (hosting) | Extended decay (content lives longer) | Keep content alive, yours lives longer |
| Uptime (availability) | Priority sync | Serve others, get served |
| Consistency (streaks) | Space creation rights | Earned capability |

**What This Is NOT:**
- ❌ Tokens, coins, or anything tradeable
- ❌ Rewards for posting or engagement
- ❌ Purchasable status or benefits
- ❌ "Mining" that creates value

**What This IS:**
- ✅ Reward for HOSTING, not content creation
- ✅ Fair exchange: give bandwidth → get faster posts
- ✅ Visible recognition for infrastructure contribution
- ✅ Identity that takes years to build, can't be bought, hurts to lose

**Space Health (Hosting Health):**
```
SPACE: /gardening
═══════════════════════════════════════════════════════════════════════

Health: ██████████░░ 85/100

📡 HOSTING STATUS:
├── Active hosts: 12 swimmers online now
├── Total hosting capacity: 892GB combined
├── Average uptime: 68%
└── Content availability: 99.2%

TOP HOSTS THIS WEEK:
├── @alice (47GB served, 73% uptime) 🥇
├── @bob (38GB served, 81% uptime) 🥈
└── @carol (29GB served, 65% uptime) 🥉
```

**Profile Display (Hosting Profile):**
```
@alice_gardener | 🛟 Lifeguard

📡 Last 30 days:
├── Bandwidth served: 67GB
├── Uptime: 73%
└── Posts kept alive: 47

💪 Earned benefits:
├── PoW reduction: 20%
└── Decay extension: 1.5x
```

See SPEC_09_SOCIAL_LAYER.md for full specification.

---

### Ephemeral Swimmers, Not Permanent Lifeguards

**Key insight:** Users are not "lifeguards on duty 24/7." They're swimmers who come and go.

| Traditional Pool | Swimchain Pool |
|------------------|----------------|
| Lifeguards always on duty | Swimmers come and go |
| Central pool management | Everyone's in the water |
| Pool stores everything | Store your lane's content |
| Pool runs the show | Swimming IS the infrastructure |

**Implications:**

1. **Content buoyancy is probabilistic** - Popular content has many swimmers keeping it afloat. Niche content may sink when no one's swimming.

2. **No "lifeguards" as infrastructure** - Just swimmers with different commitment levels. Someone swimming 24/7 is a dedicated swimmer, not a special class.

3. **Pool health = active swimmers** - If enough swimmers exist across timezones, someone's always keeping content afloat. Quiet lanes may have gaps.

4. **Supporting content is community choice** - A lane can have dedicated swimmers (always-on users). If no one volunteers, the lane goes quiet. That's a feature.

**Who keeps swimming?**
- Power users who want their content afloat
- Community leaders who want their lane active
- Enthusiasts who believe in the project
- Organizations with content to share

None of these are "The Swimchain Lifeguard." They're swimmers with reasons to keep going.

### Bootstrap and Introduction Points

**Clarified December 2024:** A common concern is "how do new users find the network?" The answer is **community introduction points**, which are NOT servers in any meaningful sense.

**A seed node is no different from a mobile phone that happens to be always connected.** The only difference is that you know its address in advance.

| Concept | What It Is | Centralization? |
|---------|------------|-----------------|
| **Authority Nodes** | Nodes with protocol privileges | ❌ Rejected |
| **Introduction Points** | Well-known addresses for discovery | ✅ Acceptable |

**Why introduction points are NOT centralization:**
- They have no protocol-level authority
- They cannot censor content
- They cannot exclude users
- Once connected, you never need them again
- Anyone can run one
- Multiple independent operators exist

**A website listing peer addresses is "infrastructure" in the same way a phone book is infrastructure.** It helps you find people; it doesn't control your conversations.

**The Six-Layer Discovery Stack:**
1. **Cached Peers** - Client remembers previous connections
2. **Local Discovery (mDNS)** - Find nodes on your LAN
3. **Social Bootstrap** - QR codes, links shared via messaging
4. **Community Introduction Points** - Well-known addresses (like a phone book)
5. **DHT Discovery** - Once connected, find more peers
6. **Peer Exchange** - Nodes share their peer lists

No single layer is required. If introduction points go down, social bootstrap works. If you have cached peers, you don't need anything else.

---

### Concrete Scenarios (Swimmers in the Pool)

**Jane - Morning Swimmer (7am)**
```
Jane dives in
├── Connects to 12 peers in her lanes
├── Checks: "What's new in college-friends lane?"
├── 3 peers kept last night's content afloat → Jane gets it
├── Posts a selfie (swims ~30 seconds on phone)
├── Broadcasts her strokes to nearby swimmers
└── Gets out of the pool, goes to work
```
*Content stayed afloat overnight because someone was treading water.*

**Bob - Casual Floater (lunch break)**
```
Bob wades in
├── Connects to 50 peers in finance-news lane
├── Reads stock reports for 20 minutes
├── Never posts anything (no strokes)
├── While floating, helps keep content buoyant
└── Other swimmers can grab content from him
```
*Bob contributed to pool health just by being present.*

**Albert - Deep Diver (Saturday)**
```
Albert dives deep
├── Creates post with video (50MB), images, links
├── Swims hard ~60 seconds (heavy content = more strokes)
├── His effort gets recorded in the chain
├── Video stored separately, content-addressed
├── Peers who view it help keep it afloat
└── Tomorrow: video available if someone who saw it is still swimming
```
*The chain proves Albert swam. The video floats if someone supports it.*

**The Availability Reality (What Floats, What Sinks)**
| Content Type | Buoyancy |
|--------------|----------|
| Popular post in active lane | High (many swimmers keeping it up) |
| Jane's selfie in small friends group | Medium (depends who's in the pool) |
| Albert's niche tech video | Low if tech lane is quiet |
| Content from dead lane | Sunk (drifted away, no swimmers) |

*This is a feature. If no one swims, content drifts. If people care, they keep it afloat.*

---

## Protocol vs. Client Separation

A critical architectural distinction: the **protocol** and **clients** are separate layers.

| Layer | What It Is | Who Controls |
|-------|------------|--------------|
| Protocol | The rules, chain format, how nodes communicate | No one (open spec) |
| Client | The app users download and use | Whoever builds it |

### Precedents

| Protocol | Clients |
|----------|---------|
| Bitcoin | Electrum, BlueWallet, Sparrow, many others |
| BitTorrent | qBittorrent, Transmission, Deluge |
| Email | Outlook, Thunderbird, Apple Mail |
| Matrix | Element, FluffyChat, others |

All decentralized protocols. All have polished clients. **The client can have great UX without requiring central infrastructure.**

### What the Client Does

```
User opens app
  └── App connects to peers (no server)
  └── App syncs chain (local storage)
  └── App displays content (local rendering)
  └── User creates post
        └── App does PoW locally
        └── App broadcasts to peers
        └── Done - no server involved
```

The user doesn't need to know they're running a node. They just know the app works.

### Client Spectrum

| Client Type | Target User | Features | Tradeoffs |
|-------------|-------------|----------|-----------|
| Power client | True believers | Full node, all settings, everything | Heavy, complex |
| Standard client | Regular users | Clean UX, sensible defaults | Still needs storage/sync |
| Lite client | Casual/mobile | Simplified, trusts other nodes for some data | Less decentralized |
| Onboarding client | New users | Tutorial mode, guided setup | Limited features initially |

### Implications

- **Multiple clients can exist** - competition at client level, cooperation at protocol level
- **Different clients for different users** - power users and casual users coexist
- **Gating is possible** - lite client for reading, standard for posting, power for fork creation
- **Anyone can build a client** - including ones you disagree with (that's freedom)
- **Protocol stays pure** - clients compete on UX, not on protocol compliance

The protocol is the law. Clients are how you experience it.

---

## Core Architecture: Fork-Friendly Chain Ecosystem

### Not One Blockchain - Many Forks

Swimchain is not "a blockchain" but an **ecosystem of forks**. This is a fundamental design choice that changes everything.

| Traditional Blockchain Model | Swimchain Fork Model |
|-----------------------------|------------------------|
| One chain, one canonical truth | Many forks, many communities |
| Forks are failures to resolve | Forks are features |
| Global consensus required | Consensus only within forks |
| 51% attack is existential | 51% attack kills one fork, others continue |
| Everyone on same network | Communities choose their fork |

### Why Forks Solve the 51% Problem

Traditional 51% attack:
1. Attacker gains majority hashpower
2. Controls block production
3. Can spam, censor, rewrite history
4. Network is captured - everyone suffers

Fork-friendly response:
1. Attacker gains majority on one fork
2. Community forks away
3. New fork can exclude attacker
4. Attacker controls an abandoned chain
5. **Attacker "wins" but loses**

### Forks as Community Boundaries

Forks might BE the communities:
- Each fork is a community with shared values/rules
- Forking is how communities separate
- No need for central governance on "the network"
- Evolution happens through forking

### Fork Migration as Moderation

This adds another layer to the self-moderation stack:

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| PoW friction | Spam cost | Individual posts |
| Decay | Entropy | Content persistence |
| Client discretion | Local filtering | Personal experience |
| Space migration | Community moves | Within a fork |
| **Fork migration** | Chain-level escape | Entire community leaves |

### New Forks Can Evolve

When a community forks:
- Can exclude known bad actors at protocol level
- Can adjust PoW difficulty
- Can change decay parameters
- Can inherit content selectively
- Can experiment with new rules

This is **evolution through forking** - successful rule changes propagate as communities adopt them.

### Open Questions About Forks

- How do identities work across forks?
- Can content exist on multiple forks simultaneously?
- How do users discover forks?
- Is there a "genesis" fork or all equal from start?
- Can forks communicate or bridge?
- How is fork history/lineage tracked?

---

## Threat Model: Propagandists and Advertisers

### Primary Threat Actors

The real attackers aren't random vandals - they're actors with resources and real incentives:

| Actor | Goal | Resources | ROI |
|-------|------|-----------|-----|
| **Propagandists** | Control narratives, shape opinion | State-level (unlimited) | Political power |
| **Advertisers** | Force visibility for products | Corporate budgets (large) | Sales |

Both will spend significant resources to control attention.

### Defense Against Advertisers

Already addressed through architecture:
- No feed to inject into
- No metrics to prove ROI
- No entity to pay for placement
- No targeting capability
- **Result: Advertising is economically irrational**

### Defense Against Propagandists

Harder - they don't need measurable ROI. But:
- No algorithmic amplification - can't boost their content
- Equal footing - just another voice, can't shout louder
- Decay - without organic engagement, content fades
- No targeting - can't identify vulnerable audiences
- Fork escape - communities can migrate away from captured chains

**They can speak, but they can't force anyone to listen.**

### The 51% Propaganda Attack

A state actor could 51% capture a fork:
1. Gain majority hashpower (states can afford this)
2. Control block production
3. Fill chain with propaganda
4. Keep it alive indefinitely

**Defense through forking:**
1. Community recognizes capture
2. Community forks to new chain
3. New fork can exclude attacker identities
4. Attacker controls abandoned chain
5. Repeat as necessary

### The Core Assumption: Active Users

**This defense only works if users actively curate their space.**

This is not a weakness - it's the design.

| Traditional Social Media | Swimchain |
|--------------------------|-------------|
| Platform protects passive users | Users protect themselves |
| Moderation is someone else's job | Moderation is participation |
| Consume without effort | No passive consumption |
| "Someone should do something" | You are the someone |

**Every design choice assumes active users:**
- Friction → requires commitment to post
- Active navigation → requires choosing where to go, not scrolling
- Decay → requires engagement to preserve
- Fork migration → requires community action
- No algorithm → requires choosing what to see

**This is social media for participants, not consumers.**

Passive users who want content delivered while they scroll have Instagram. Swimchain is for people willing to actively maintain their communities.

This matches reality: real communities require active participation to stay healthy. Swimchain doesn't pretend otherwise.

---

## Open Questions

### Space/Community Creation
- Can anyone create a space?
- Is there a cost (PoW? stake?) to create spaces?
- How do spaces get discovered?
- Can spaces have different rules/parameters?

### Identity
- Anonymous? Pseudonymous? Reputation-based?
- How are identities created and managed?
- Can you prove continuity of identity over time?

### Content Types
- Text only? Images? Video?
- If media: on-chain or content-addressed off-chain storage?
- How does media affect chain size and sync time?

### Decay Mechanics
- What's the decay function? Linear? Exponential?
- Is decay reversible if old content gets rediscovered?
- Do replies/threads decay independently or together?
- What counts as "interaction" for preventing decay?

### Proof of Work Details
- What's the difficulty target?
- Static or dynamic difficulty?
- How does this work on mobile devices with limited CPU?
- Different PoW requirements for different actions (post vs reply vs space creation)?

### Chain Size and Scaling
- How large will the chain grow?
- Pruning strategy for decayed content?
- Sync time for new nodes?
- Minimum hardware requirements?

### Bootstrap Problem
- How do first users find each other without a central server?
- Initial node discovery mechanism?
- How do you grow without a "mastodon.social" equivalent?

### Economic Model
- Who pays for development if there's no company?
- Sustainable without tokens/speculation?
- How do contributors get compensated (if at all)?

---

## Moderation Analysis: Self-Regulating Properties

### Initial Concern (Resolved December 2024)

The original concern was that an attacker with hashrate could keep their content alive by self-interacting for free, effectively "mining" visibility.

**This is now addressed by requiring PoW for ALL engagement.** See SPEC_03 Section 7 and SPEC_08 for full details.

### Engagement Costs PoW

**ALL engagement costs PoW.** This prevents free self-persistence:

| Without Engagement PoW | With Engagement PoW |
|------------------------|---------------------|
| Post costs PoW, self-interact free | ALL actions cost PoW |
| Attacker persists forever at no ongoing cost | Attacker pays 60s monthly per content |
| Sybils spread load for free | Sybils pay same total (pool model) |
| Economically viable abuse | Economically irrational abuse |

**The pooled engagement model:**
- Content persistence requires 60s total PoW (the "pool")
- Pool can have any number of contributors
- Same person can contribute multiple times
- Sybils provide zero advantage (total is fixed)
- Incomplete pools = work is lost

### Self-Regulation Layers (Updated)

1. **PoW cost for posting**: Spam is expensive to create (~30s per post)
2. **PoW cost for persistence**: Keeping spam alive costs ongoing compute (~60s monthly per content)
3. **Decay**: Unengaged content disappears without costly intervention
4. **Client discretion**: Nodes can refuse to accept/propagate content
5. **Migration**: Communities abandon polluted spaces
6. **No forced visibility**: No feed pushing content to users

### Attack Scenario Analysis (Updated)

**Attack**: Flood a space with spam, keep it alive with hashrate

**Response (with engagement PoW)**:
- Initial cost: 30s PoW per spam post
- Monthly persistence: 60s PoW per spam post
- 1000 spam posts = 500 min initial + 1000 min monthly
- Community can migrate, attacker "wins" empty space
- Community can client-side filter, attacker never seen
- Result: **Attacker fighting entropy with ongoing resource expenditure for zero reward**

**Attack**: Create private space for free storage abuse

**Response (with engagement PoW)**:
- Post 1000 files: 500 min initial PoW
- Monthly persistence: 1000 min PoW
- Compare to actual hosting: $0.10/month
- Result: **Economically irrational vs. actual hosting**

**Attack**: Create Sybil accounts to split engagement cost

**Response (with pooled engagement)**:
- Pool requires 60s TOTAL
- 100 Sybils × 0.6s = 60s total
- 1 identity × 60s = 60s total
- Result: **Same cost regardless of identity count**

### Key Insight: Client Discretion

Not every post needs to be accepted as a "transaction." Clients running their nodes can:
- Ignore content from certain identities
- Refuse to propagate content that doesn't meet their criteria
- Implement their own filtering policies

This is analogous to Bitcoin nodes having different mempool policies. The protocol is permissionless, but participation in propagation is voluntary.

### Reframing "Persistence"

Rather than "preventing bad content from staying alive," the model is:
- **Storage is finite, pay to persist**
- Users engaging with content are "paying" for its persistence
- Artificial persistence (self-interaction) costs resources but gains nothing without organic discovery
- The system self-regulates through economic incentives

### The Fundamental Deterrent: Advertising Is Pointless

The biggest deterrent isn't that advertising is *hard* - it's that advertising is *economically irrational*.

| Traditional Social Media | Swimchain |
|--------------------------|-------------|
| Pay platform for guaranteed eyeballs | No one to pay, no guarantees |
| Algorithm forces ads into feeds | No feed, no forcing |
| Metrics prove ROI to advertisers | No tracking, no metrics |
| Users are the product being sold | No one selling users |
| Attention is monetizable | Attention cannot be purchased |

**The advertising model requires:**
- Guaranteed delivery → **Not possible**
- Forced visibility → **Not possible**
- Measurable outcomes → **Not possible**
- Entity to negotiate/pay → **Doesn't exist**

Even if someone CAN post promotional content (pay PoW, keep it alive), there's no ROI because:
1. No guaranteed visibility - users navigate to spaces they choose
2. No targeting - no data collection, no user profiles
3. No metrics - no way to prove ads were seen or effective
4. No entity to pay - can't buy placement that doesn't exist

**This removes the demand side of the advertising equation, not just raises supply costs.**

It's like putting up a billboard in a desert. Technically possible, economically pointless.

This is an architectural decision, not a policy. The system doesn't forbid advertising - it makes advertising irrational.

### Proof of Work as Intentional Friction (Every Stroke Costs Energy)

Swimming is not effortless. That's the point.

#### The Device Disparity Problem

Computing power varies enormously across devices (some people swim faster):

| Device | Relative Power | Post Time |
|--------|---------------|-----------|
| Gaming PC / GPU | 100x | Seconds |
| Modern laptop | 10x | ~10 seconds |
| Old laptop | 1x | ~30 seconds |
| Modern phone | 0.5x | ~1 minute |
| Old phone | 0.1x | Several minutes |

This seems like a problem: how do you set difficulty fairly?

#### Reframing: Friction Is The Feature

**This is not a bug - it's the design.**

| Engagement-Optimized (Traditional) | Friction-Designed (Swimchain) |
|-----------------------------------|--------------------------------|
| Remove all barriers to posting | Barriers are intentional |
| Instant gratification | Delayed gratification |
| Maximize posts per minute | Quality over quantity |
| Addiction by design | Intentionality by design |
| "Get users to post more" | "Get users to post *better*" |

**Benefits of mandatory waiting:**
- Reduces impulse posting
- Encourages reflection before posting
- Self-selects for committed users
- Discourages doomscrolling
- Creates natural pauses
- More thoughtful content

**The device gap matters less when everyone waits.** Whether it's 5 seconds or 60 seconds, the key is that it's *never instant*. The commitment threshold exists for everyone.

**Mobile being harder is acceptable:**
- This isn't a "check while walking" experience
- Desktop-first is a valid design choice
- Discourages addictive usage patterns

#### Action-Based Difficulty Scaling (Different Strokes)

Different actions require different effort - like different swimming strokes:

| Action | PoW Cost | Rationale | Swimming Analogy |
|--------|----------|-----------|------------------|
| Create space | High | Prevent space spam | Building a new lane |
| Create post | Medium | Main content gate | A full lap |
| Reply | Lower | Encourage discussion | A few strokes |
| Interact/persist | Minimal | Keep content alive | Treading water |

This creates a hierarchy where creating new things costs more than participating in existing things. Just like opening a new lane requires more effort than swimming in an existing one.

---

## Risks and Challenges

### Technical Risks

| Risk | Description | Mitigation Ideas |
|------|-------------|------------------|
| Chain bloat | Social media generates massive data vs Bitcoin | Decay helps, but media is heavy |
| Mobile viability | Full node on phone may be impractical | Light client mode? Trade-off with decentralization |
| PoW exclusion | Computational cost may exclude low-resource users | Adjustable difficulty? Risk of wealth-based access |
| Sync time | New users wait hours/days to sync full chain | Checkpoint system? Trust trade-offs |

### Social/Adoption Risks

| Risk | Description | Mitigation Ideas |
|------|-------------|------------------|
| Network effects | Users go where other users are | ??? (fundamental chicken-egg problem) |
| UX expectations | Users expect modern social media UX | Accept different audience; users who prefer active navigation exist |
| Content discovery | No algorithm means no discovery | Topic organization, word of mouth |
| Empty spaces | New communities feel dead | Decay might make this worse initially |

### Moderation Risks

| Risk | Description | Mitigation Ideas |
|------|-------------|------------------|
| Illegal content | CSAM, terrorism content, etc. | PoW cost + decay + community flagging? |
| Harassment persistence | Content may live long enough to harm | Decay helps but not instant |
| Spam evolution | Attackers with resources can overcome PoW | Dynamic difficulty adjustment |
| No recourse | Victims can't appeal to anyone | Feature or bug depending on perspective |

### Legal/External Risks

| Risk | Description | Mitigation Ideas |
|------|-------------|------------------|
| App store rejection | Apple/Google may refuse apps for unmoderated network | Web-only? Sideloading? |
| ISP blocking | Governments could pressure ISPs | Tor integration? Encrypted protocols? |
| Creator liability | Even without entity, creators could face pressure | Anonymous development? Multiple jurisdictions? |

---

## Comparison: What This Is and Isn't

### This IS like:
- **Bitcoin** (chain authority, PoW as friction, no central authority) - for the authoritative layer
- **BitTorrent** (content-addressed, seeded by interest, no central server) - for the content layer
- **Classic forums** (user-navigated spaces, not algorithmic feeds) - for the navigation philosophy
- **Email/Matrix** (protocol-based, anyone can run a client, no single owner) - for the ecosystem model

### The Hybrid Model

| Aspect | Closest Analogy |
|--------|----------------|
| Post records | Bitcoin transactions (signed, timestamped, immutable) |
| Media content | BitTorrent files (content-addressed, seeded) |
| Navigation | Active discovery (spaces, threads, not algorithmic feeds) |
| Identity | PGP/Bitcoin (keypair-based, pseudonymous) |
| Network | BitTorrent DHT (peer discovery, ephemeral participants) |

### This is NOT like:
- **Bluesky** (centralized implementation of "decentralized" protocol - company runs everything)
- **Mastodon** (federated but with mega-nodes dominating)
- **Reddit** (centralized platform, company controls everything)
- **Discord** (centralized servers despite community organization)
- **IPFS alone** (no authority layer - anyone can claim to have posted anything)

---

## Success Criteria

What would success look like?

- [ ] Network functions with zero central infrastructure
- [ ] Any user can sync and participate with reasonable hardware
- [ ] Spam is economically infeasible without central moderation
- [ ] Content moderation happens through protocol rules (decay, PoW)
- [ ] No single entity can be pressured to censor or shut down
- [ ] Users choose their experience through space selection

---

## Accessibility and Power User Requirements

### The Honest Problem

Swimchain, as currently conceived, has significant accessibility barriers. This section acknowledges them directly rather than handwaving.

### Technical Knowledge Requirements

| Requirement | Traditional Social | Swimchain |
|-------------|-------------------|-------------|
| Account creation | Email + password | Key generation, backup |
| Understanding the system | Minimal | Forks, spaces, decay, PoW |
| Recovery | "Forgot password" link | Lose keys = lose identity |
| Software | Download app | Run a node |
| Maintenance | None | Sync, storage management |

**Current design assumes users who:**
- Can manage cryptographic keys
- Understand (roughly) how blockchains work
- Can run software on their own hardware
- Will read documentation

This is a small percentage of the population.

### Hardware Requirements

**Full node model requires:**
- Storage: Chain size (unknown but significant)
- CPU: PoW computation for posting
- Bandwidth: Sync with network
- Uptime: Regular sync or fall behind

**Who this excludes:**
- Users with only phones
- Users with old/limited hardware
- Users with metered/slow internet
- Users in regions with unreliable power/connectivity

### Cognitive Load

**Without algorithmic curation, users must:**
- Decide which spaces to join
- Navigate to content (not fed to them)
- Understand decay (why content disappears)
- Recognize attacks/capture (no platform protecting them)
- Make decisions about forks

**This requires:**
- Time investment
- Ongoing attention
- Active decision-making

**Who this excludes:**
- Casual users
- Users with cognitive disabilities affecting executive function
- Users who want "background" social media
- Anyone not willing to invest significant mental energy

### Economic Barriers

| Cost | Description |
|------|-------------|
| Hardware | Computer capable of running node |
| Electricity | PoW computation, always-on device |
| Bandwidth | Data for syncing |
| Time | Learning curve, ongoing maintenance |

**This is not free in any sense.**

### Disability Considerations

| Disability Type | Potential Barriers |
|-----------------|-------------------|
| Visual | Space navigation with screen readers |
| Motor | PoW timing if interaction required |
| Cognitive | Complex mental model, active curation |
| Attention | No algorithmic engagement = may lose users who need external structure |

**Question: Is there a way to make this more accessible without reintroducing centralization?**

Possible approaches:
- Excellent documentation and onboarding
- Client-side accessibility features (doesn't compromise protocol)
- Helper tools that don't require trust
- Community support structures

### The Tradeoff Acknowledgment

**Honest statement:** Swimchain trades accessibility for decentralization.

This is not an accident. Many accessibility features in traditional social media come from:
- Central servers handling complexity
- Algorithmic curation reducing choice burden
- Platform managing identity and recovery
- Mobile-first design

We're removing these. The accessibility cost is real.

**The question for the team:** Is this acceptable? Are there mitigations that don't compromise core principles?

---

## Thesis Statements for Team Discussion

These are positions that should be debated. Each represents a stance implicit in the current design. Refined through analysis with argument structures, counterarguments, and evidence plans.

---

### Thesis 1: Exclusion by Design (Score: 8.0/10)

**Statement:** "True decentralization is inherently exclusive: Swimchain's technical barriers—cryptographic key management, proof-of-work computation, and full-node operation—simultaneously enable censorship-resistance and self-select for users capable of maintaining network integrity. This exclusivity is not a failure to achieve accessibility, but the architectural cost of genuine decentralization."

**Argument Outline:**

1. **The Accessibility-Decentralization Tradeoff**: Every accessibility feature in traditional social media (password recovery, algorithmic curation, mobile-first design) requires centralized infrastructure. Swimchain cannot offer these without reintroducing the central authority it rejects.

2. **Self-Selection as Quality Control**: Technical barriers function as commitment filters. Users who manage cryptographic keys, sync blockchains, and invest computational resources demonstrate the active participation the design requires.

3. **Historical Precedent**: Usenet and Bitcoin itself all began with technically exclusive communities that shaped protocol norms before broader adoption tools emerged. Premature mass accessibility often precedes value extraction.

**Counterarguments:**
- Technical exclusivity correlates with socioeconomic privilege (access to hardware, education, stable internet)
- Network effects require critical mass; "too small to function" is a real failure mode
- Claiming exclusion is "by design" may rationalize what is actually a limitation

**Evidence Needed:**
- Digital divide research on global technology access patterns
- Case studies of Bitcoin's evolution from cypherpunk tool to mainstream adoption
- Mastodon/Bluesky adoption demographics and usage patterns

**Key Question:** Is there a point where "small and committed" becomes "too small to function"?

---

### Thesis 2: Friction Is Good (Score: 8.4/10) ★ Strongest

**Statement:** "The computational and temporal costs of proof-of-work posting function as a behavioral intervention that disrupts the dopamine-driven engagement loops of modern social media. Swimchain's 'slowness' is a therapeutic feature, not a usability failure—reintroducing the deliberation that characterized pre-algorithm discourse before platforms optimized for addiction."

**Argument Outline:**

1. **Interrupting Impulse Cycles**: The 10-60 second PoW delay creates a mandatory cooling-off period that interrupts the stimulus-response pattern of instant posting. This structural pause reduces reactive, low-quality content.

2. **Effort Investment Creates Value**: Behavioral economics demonstrates that effort investment increases perceived value (IKEA effect). Posts that cost computational work are treated more seriously by both creators and readers.

3. **Reclaiming Attention from Exploitation**: Engagement-optimized platforms treat friction as the enemy because friction reduces extractable engagement. Swimchain inverts this: friction is the defense against attentional exploitation.

**Counterarguments:**
- Friction filters by persistence and resources, not by quality of thought
- Some valuable content is spontaneous; not all reflection improves expression
- Users may simply pre-compose posts and batch-submit, circumventing the behavioral intervention

**Evidence Needed:**
- Addiction psychology research on variable reward schedules and social media usage
- Behavioral economics literature on cooling-off periods and impulse reduction
- Comparative studies of discourse quality in high-friction vs. low-friction environments

**Key Question:** How much friction is enough? Is there such thing as too much?

---

### Thesis 3: Forks Over Consensus (Score: 8.0/10)

**Statement:** "Fork migration represents a collective exit-right that makes Swimchain communities more resilient than platforms requiring global consensus. The ability to leave—with community, history, and identity intact—neutralizes the power of capture and transforms governance from political struggle into evolutionary competition between rule-sets."

**Argument Outline:**

1. **Exit as Power Redistribution**: Drawing on Hirschman's exit/voice/loyalty framework, Swimchain makes exit cheap. When leaving costs nothing, authority cannot coerce compliance, and bad governance loses its community rather than controlling it.

2. **Evolutionary Selection of Rules**: Forks that experiment with better parameters (decay rates, PoW difficulty, moderation norms) attract users. Successful innovations propagate as other communities adopt them. This is governance by natural selection, not by political victory.

3. **51% Attack Immunity**: A captured fork is an abandoned fork. State-level attackers may gain hashpower majority, but they "win" an empty chain while the community reconstitutes elsewhere. The threat of exit makes capture economically irrational.

**Counterarguments:**
- Epistemic fragmentation: easy exit prevents communities from developing conflict-resolution capacity
- Echo chambers intensify when disagreement triggers departure rather than dialogue
- Cross-fork communication and identity become fragmented, reducing network value

**Evidence Needed:**
- Political philosophy on exit rights (Hirschman, Tiebout competition)
- Blockchain governance studies on fork outcomes (Bitcoin/Bitcoin Cash, Ethereum/Ethereum Classic)
- Case studies of forum migrations when platforms change policies

**Key Question:** How do we prevent forks from becoming isolated filter bubbles?

---

### Thesis 4: No Safety Net (Score: 7.2/10)

**Statement:** "Platform-mediated safety is structurally impossible without reintroducing the central authority that enables censorship. Swimchain's model of user-managed experience is not an abdication of protection but an honest acknowledgment that decentralized safety requires active community participation rather than passive reliance on platform intervention."

**Argument Outline:**

1. **The Central Authority Paradox**: Any entity capable of protecting users from harassment is equally capable of censoring political speech. Platform safety and platform control are the same power exercised differently. Swimchain cannot offer one without enabling the other.

2. **Community-Layer Protection**: Safety exists at the community layer through migration, client-side filtering, and reputation systems—mechanisms that don't require central enforcement. These require active participation, matching the design's assumption of engaged users.

3. **Honest vs. Theatrical Safety**: Traditional platform safety is partly theater—policies inconsistently enforced, moderation decisions opaque, protection failing when most needed. Swimchain's model is honest about what it can and cannot provide.

**Counterarguments:**
- Harassment victims often cannot "just fork away" from coordinated attacks
- "Personal responsibility" rhetoric disproportionately burdens those who face more targeted abuse
- Decentralized systems have historically failed to protect marginalized users

**Evidence Needed:**
- Platform moderation studies on effectiveness and consistency of enforcement
- Research on coordinated harassment campaigns and victim experiences
- Comparative analysis of protection outcomes across platform types

**Key Question:** Are we building something that only works for privileged users who face less targeted abuse?

---

### Thesis 5: Mobile as Full Participant (Score: Revised)

**Original Position ("Desktop Is Enough") - Rejected**

The original thesis that desktop-first is a principled design choice was rationalization, not philosophy. Mobile is necessary.

**Initial Assumption - Also Rejected**

The assumption that mobile *must* make decentralization compromises imports Bitcoin's limitations without considering Swimchain's design.

**Why Bitcoin Can't Run on Phones:**
- Chain is 500GB+ and grows forever
- Mining is competitive, requires specialized hardware
- No mechanism to limit growth

**Why Swimchain Is Different:**
- **Decay keeps chain size bounded** - old content disappears, chain doesn't grow infinitely
- **PoW is friction, not mining** - no competition, no specialized hardware needed
- **No financial incentive** - no reason to optimize with ASICs

If decay works as designed, a modern phone with 128GB storage could hold the entire chain. Modern phone CPUs can handle friction-level PoW - it's just waiting, not competing.

**Actual Mobile Considerations (App Development, Not Protocol Compromises):**

| Consideration | Solution |
|---------------|----------|
| Battery during PoW | Background processing, compute while charging |
| Sync when app closed | Background fetch (standard mobile pattern) |
| Data usage | Sync on WiFi by default, user choice |
| Heat during PoW | Longer duration, lower intensity |

These are app development problems, not reasons to compromise decentralization.

**Revised Position:** Mobile can be a full node. The decay mechanism specifically enables this by bounding chain size. No compromise on decentralization is required - just good mobile app development.

**Key Questions:**
- What chain size does decay actually produce at scale?
- What's the PoW duration on typical mobile hardware?
- Can background sync keep mobile nodes current?

**These are empirical questions to test, not philosophical positions to debate.**

---

### Thesis 6: No Growth Imperative (Score: 7.4/10)

**Statement:** "Growth optimization is the mechanism by which VC-funded platforms betray their stated values, transforming from tools of connection into engines of extraction. Swimchain's explicit rejection of growth as a metric is not anti-ambition but structural protection against the incentive corruptions that historically transform idealistic platforms into surveillance capitalism."

**Argument Outline:**

1. **Growth Pressure as Corruption Mechanism**: VC funding requires returns, returns require monetization, monetization requires user data extraction and engagement maximization. This causal chain is well-documented across platform after platform.

2. **Sustainable Small Over Unsustainable Large**: A small, committed community with aligned incentives is more valuable than a large, passive user base requiring constant engagement manipulation to remain monetizable.

3. **The Facebook Trajectory**: Every major platform followed the same arc: idealistic founding → VC funding → growth pressure → value extraction. Swimchain prevents this by having no entity to receive funding, no metrics to optimize, no one to pressure.

**Counterarguments:**
- Networks require critical mass to function; "too small to matter" is a failure mode
- Development requires resources; without growth-driven funding, how is work sustained?
- Small networks may be more vulnerable to capture by small groups of bad actors

**Evidence Needed:**
- Platform studies documenting the growth → monetization → corruption trajectory
- Zuboff's surveillance capitalism thesis and supporting case studies
- Open source sustainability research on non-growth-driven development models

**Key Question:** What is the alternative development model? Who writes code, who pays, how is work sustained?

---

### Thesis 7: Let Content Die (Score: 7.6/10)

**Statement:** "Content decay through disengagement functions as an organic moderation system that resolves the storage-permanence tradeoff while avoiding the epistemological problem of human moderators deciding truth. However, this introduces a new challenge: when survival depends on engagement, popular persistence risks replicating algorithmic engagement-value conflation in structural form."

**Argument Outline:**

1. **Organic Moderation Without Moderators**: Decay delegates content persistence decisions to the community through engagement. No human authority decides what stays—the network decides through collective attention, avoiding the truth-arbiter problem.

2. **Storage Constraints as Design Feature**: A social network generates orders of magnitude more content than Bitcoin's transaction chain. Decay is not just moderation—it's technical necessity made philosophically coherent.

3. **Self-Critical Acknowledgment**: Content that survives is content that receives engagement. This may not be content worth preserving. Swimchain must acknowledge that decay can replicate attention-economy logic at the structural level.

**Counterarguments:**
- Historically important content often has small audiences; decay punishes niche value
- "Engagement equals persistence" is the same logic that makes algorithmic feeds toxic
- Users may expect their content to persist regardless of audience size

**Evidence Needed:**
- Digital preservation literature on what is lost when content disappears
- Attention economy research on the relationship between engagement and value
- Storage constraint analyses for social media at blockchain scale

**Key Question:** Does "content people care about survives" replicate the same problems we're trying to escape?

---

### Thesis 8: Anonymity Over Accountability (Score: 7.2/10)

**Statement:** "Pseudonymous identity with persistent reputation represents a third path between real-name accountability (which enables targeting and harassment) and pure anonymity (which enables consequence-free abuse). This middle ground preserves privacy while building stake—but requires cryptographic solutions to the Sybil problem that remain technically challenging."

**Argument Outline:**

1. **Real Names Enable Targeting**: Real-name policies, sold as "accountability," primarily enable harassers to find victims' workplaces, families, and physical locations. Pseudonymity breaks this link while preserving identity continuity.

2. **Reputation Without Legal Identity**: A persistent pseudonym can accumulate reputation across time and interactions. Stake in reputation creates consequences for bad behavior without requiring real-world vulnerability.

3. **Honest Technical Challenges**: The Sybil problem (one person, many identities) undermines reputation systems. Swimchain must acknowledge this challenge and pursue cryptographic solutions like proof-of-personhood or stake-weighted identity.

**Counterarguments:**
- Pseudonymous coordination can enable harassment campaigns while protecting perpetrators
- Sybil attacks allow bad actors to manufacture false consensus or reputation
- "Persistent pseudonym" is only as persistent as key security; identity theft becomes total

**Evidence Needed:**
- Identity studies on real-name vs. pseudonymous vs. anonymous discourse patterns
- Cryptographic research on Sybil resistance and proof-of-personhood
- Case studies of harassment under different identity regimes

**Key Question:** What prevents one person from running many identities and gaming reputation?

---

## Meta-Analysis: Swimchain as Arguable Project

**Core Tensions:** Swimchain makes explicit tradeoffs that most platforms hide:

| Tension | Choice Made |
|---------|-------------|
| Decentralization vs. Accessibility | Decentralization |
| Friction vs. Usability | Friction |
| Exit vs. Voice | Exit (forks) |
| Freedom vs. Safety | Freedom |
| Principles vs. Adoption | Principles |

**What Makes These Good Thesis Topics:**
1. No objectively "correct" answer—values-dependent
2. Empirical components are genuinely uncertain
3. Real-world consequences for different choices
4. Force confrontation with uncomfortable tradeoffs
5. Connect to broader debates about technology, society, freedom

**The positions collectively form a coherent philosophical framework that honestly confronts its tradeoffs rather than obscuring them.**

---

## Additional Concerns to Address

### Bootstrap Problem

How does the network start?
- No users = no content = no reason to join
- Can't rely on "mastodon.social" equivalent
- Need critical mass for each fork
- First-mover has to be committed without reward

### Key Management

Identity tied to cryptographic keys:
- Lose keys = lose identity forever
- No "forgot password"
- Backup responsibility on user
- Target for theft/hacking

### Onboarding Curve

New users must understand:
- What a fork is and how to choose one
- What spaces are and how to find them
- How PoW works and why posting takes time
- How decay works and what it means
- How to manage their identity/keys

**This is a lot before posting "hello world."**

### Content While Decaying

Decay isn't instant:
- Harmful content exists for some time before fading
- Window of harm before entropy takes over
- Coordinated attacks could time decay
- "Temporary" harm is still harm

### Cross-Fork Identity

If forks are separate chains:
- Is identity portable?
- Can you prove you're "the same person" across forks?
- What happens to reputation when communities split?
- Can content reference identity across forks?

### Legal Ambiguity

No central entity, but:
- Developers exist somewhere
- Users exist somewhere
- Illegal content laws vary by jurisdiction
- "No one controls it" isn't a legal defense

### Development Sustainability

No company, no tokens:
- Who writes the code?
- Who fixes bugs?
- How is development funded?
- What prevents developer capture?

---

## Team Decisions (Resolved December 2024)

### Decision 1: Target User

**Question:** Who specifically are we building for?

**Decision:** Technical users first, with path to broader adoption.

**Rationale:**
- Early adopters must be technical enough to run clients, manage keys
- Like early Bitcoin: cypherpunks first, then gradually broader
- UX investment happens at client layer, not protocol layer
- ~10K committed users may be sufficient for viable network
- Thesis 05 suggests 100 communities × 100 members = healthy ecosystem

**Not decided:** Whether to target specific communities (privacy advocates, free speech, crypto users) vs. general technical users.

---

### Decision 2: Minimum Viable Decentralization

**Question:** What's the acceptable trust level for clients?

**Decision:** Progressive trust with eventual verification.

**Rationale:**
- Users are ephemeral participants, not persistent nodes
- Day 1: Trust headers + peers for content (can post immediately)
- Over time: Verify chain for spaces you care about
- Decay bounds chain size → eventual full verification is realistic
- No "light clients that never verify" - everyone can verify eventually
- "Trust temporarily, verify eventually, always have the option" is acceptable

**Key insight:** This is NOT "centralized trust." It's acknowledging that verification is a process, not an instant state. The chain is small enough (due to decay) that catching up is realistic.

---

### Decision 3: Illegal Content (CSAM)

**Question:** Protocol-level stance on CSAM?

**Decision:** Hash blocklists at protocol level (Option B from research).

**Rationale:**
- Legal research concludes CSAM hash detection is **non-negotiable** for legal operation
- Even infrastructure (ISPs, CDNs) blocks known CSAM hashes
- Protocol-neutral would create legal liability for node operators
- Hash matching is a reasonable compromise:
  - Not content moderation (no human decisions on speech)
  - Matches known illegal content (database maintained by NCMEC/IWF)
  - Minimal centralization (hash database, not content decisions)

**Implementation:** Nodes refuse to store/relay content matching known CSAM hashes. Distributed hash database updated from recognized sources.

---

### Decision 4: Development Sustainability

**Question:** How is development funded long-term?

**Decision:** Open source + grants (Option A/B hybrid) with explicit rejection of foundation model.

**Rationale:**
- Foundation model creates central target (Tornado Cash precedent)
- Volunteer open source worked for Bitcoin Core
- Grants from EFF, Mozilla, crypto foundations provide resources without capture
- No protocol-level fees (adds complexity, deters adoption)
- Accept slower development in exchange for no central entity to pressure

**Open question:** How to fund ongoing development as project matures. May need revisiting.

---

### Decision 5: View-to-Host Content Model

**Question:** How do users participate in content distribution?

**Decision:** View-to-host only. Users only cache and serve content they explicitly viewed.

**Rationale (Resolved December 2024):**
- **Consent-based hosting:** Users only host content they chose to see
- **No bandwidth abuse:** Can't be flooded with unwanted content
- **Spam immunity:** Don't view spam = don't download spam
- **Liability protection:** Only host what you consented to view
- **No special roles:** All nodes are equal participants, no "relay" class

**What this means:**
- Chain records: Everyone syncs (tiny, unavoidable)
- Content blobs: Fetch only when viewing
- Serving: Serve from your cache (what you viewed)
- Background: Can serve cached content, never proactively fetch

**What we rejected:**
- "Aggressive relayers" or "power users" as a protocol role
- Prefetching content for spaces you follow
- Any proactive content distribution
- RELAY capability flag (removed from protocol)

**Trade-off accepted:** Content availability depends on viewers existing. If no one views content, it becomes unavailable. The chain record (proof it existed) persists, but the content blob requires at least one viewer/seeder.

**UX implication:** Clients should honestly show availability: "You're the only seeder" or "5 peers have this content."

---

## Next Steps

See **ROADMAP.md** for the detailed implementation plan with 25+ milestones across 5 phases.

**Development Phases:**
1. **Phase 0:** Foundation (project setup, data structures)
2. **Phase 1:** Single-Node Prototype (identity, PoW, decay, recursive blocks, engagement pools, storage, branching)
3. **Phase 2:** Networking (wire protocol, TCP transport, peer discovery, chain sync, gossip)
4. **Phase 3:** Content Distribution (addressing, chunking, retrieval, caching, seeding)
5. **Phase 4:** Integration & Testing (end-to-end flows, multi-node network, mobile simulation)
6. **Phase 5:** Client Interface (CLI, API layer)

**Key Questions to Answer Through Prototyping:**
1. **Recursive blocks**: Does the three-level hierarchy (root → space → content) work correctly?
2. **Pooled engagement**: Does 60s total PoW pooling prevent Sybil attacks?
3. **Parent-anchored threading**: Do threads stay together correctly?
4. **Automatic branching**: Does binary fracturing keep storage bounded?
5. **Mobile viability**: Can phones be full participants with decay-bounded chains?
6. **PoW timing**: What's the actual delay on various devices?
7. **Sync time**: How quickly can new nodes bootstrap?

**The "Pied Piper Parallel"**

This architecture is strikingly similar to Pied Piper's "new internet" from Silicon Valley:
- Every device is a node
- No central servers
- Content-addressed storage
- Scales with users

**What Swimchain has that Pied Piper didn't:**
- Decay as the "compression algorithm" (keeps storage bounded)
- PoW as spam prevention (not just technical merit)
- Forks as escape valves (communities can leave)
- No growth imperative (not trying to out-convenience Instagram)
- Explicit rejection of VC funding (no pressure to compromise)

---

## Bounded Storage: A First-Class Constraint

**Resolved December 2024:** Storage must be bounded by design, not as an afterthought.

### The Design Target

```
USER PROFILE: Joe
├── Visits ~12 content branches
├── Device: 10-year-old smartphone (2015 era)
├── Available storage: ~500MB for app + data
├── Network: potentially slow/metered
└── Must work.
```

**If it doesn't work on modest hardware, we've failed.**

### Why This Matters

We are NOT building modern social media at smaller scale. We are building something fundamentally different:

| Modern Social Media | Swimchain |
|---------------------|-------------|
| Billions of users, petabytes of content | Thousands of users, gigabytes of content |
| Permanent archives | Ephemeral by design |
| Data retention obligations | What data officer? |
| Scale is the goal | Scale is not the goal |
| Growth solves problems | Growth creates problems |

### Space-Scoped Sync

Users do NOT sync "everything." They sync spaces they participate in:

| Level | What You Store | Size |
|-------|----------------|------|
| Global index | Space metadata (names, activity hints) | Tiny (~20MB) |
| Space content | Posts/media for spaces you've joined | Variable per space |
| Your content | What you created | Your responsibility |

**Joining a space = consenting to participate in that space's content distribution.**

### Binary Fracturing for Storage Optimization

When a space grows too large, it fractures:

```
PURPOSE OF FRACTURING

Problem: Space grows, users don't need all of it
Solution: Binary split by content hash
Result: User syncs the branch(es) containing their interactions
Benefit: Storage bounded, sync time bounded
```

**How it works:**

```
SPACE: "rust-lang" (grown too large)

        ┌─────────────────┐
        │   rust-lang     │
        │    (root)       │
        └────────┬────────┘
                 │
        ┌────────┴────────┐
        │                 │
   ┌────┴────┐       ┌────┴────┐
   │  LEFT   │       │  RIGHT  │
   │ (50%)   │       │ (50%)   │
   └─────────┘       └─────────┘

Content hash determines branch placement.
User syncs branches where their interactions live.
```

**Sync strategy:**

| What You Do | What Gets Synced |
|-------------|------------------|
| Post in space | Your post's branch |
| Reply to someone | Their post's branch (if different) |
| View a thread | Branches containing that thread |
| Browse casually | Fetch on-demand, don't persist |

### Does Fracturing Break Decentralization?

**Honest answer:** It introduces a small gap.

| Scenario | Assessment |
|----------|------------|
| Content in your branches | You have it, serve it, no dependency |
| Content in other branches | Fetch from whoever synced that branch |
| Dead branches (no active users) | Content unavailable (decayed in practice) |

**Why this is acceptable:**
- Gap is at branch level, not content level (can't discriminate)
- Engaged content has distributed availability
- Dead content becomes unavailable (matches decay philosophy)
- Interaction creates sync (if you engage, you join distribution)

### Organic Community Formation (Behavioral Branching)

**Added January 2026:** Beyond hash-based fracturing for storage, Swimchain supports behavioral branching—automatic community formation based on interaction patterns.

```
TWO TYPES OF BRANCHING
═══════════════════════════════════════════════════════════════════════

HASH-BASED (Storage Optimization):
├── Trigger: Branch exceeds 50MB
├── Method: Binary split by content hash
├── Purpose: Keep storage bounded
└── Result: Random distribution of content

BEHAVIORAL (Community Formation):
├── Trigger: Interaction cluster detected
├── Method: Social graph analysis
├── Purpose: Natural community boundaries
└── Result: Tight-knit groups get their own space
```

**How behavioral branching works:**

When a group of users interact primarily with each other, the network recognizes this and organically forms a new community space:

```
DETECTION METRICS (computable from chain data):

engagement_diversity = unique_engagers / total_engagements
external_interaction = engagements_from_outside_cluster / total
internal_cohesion = within_cluster_interactions / total_interactions

IF engagement_diversity < 0.3     // Tight-knit group
   AND external_interaction < 0.2 // Mostly internal
   AND internal_cohesion > 0.8    // Strong community bonds
   AND cluster_size >= 3          // Not just one person
   AND age > 7 days               // Sustained pattern
THEN trigger_community_formation(cluster)
```

**This is NOT punishment—it's recognition:**

| Old Framing (Wrong) | New Framing (Right) |
|---------------------|---------------------|
| "Isolate bad actors" | "Recognize communities" |
| "Quarantine spam" | "Natural space formation" |
| "Hide from view" | "Discoverable subcommunity" |
| Punitive | Organizational |

**The flow:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Space: /tech                                                        │
│                                                                     │
│ Users Alice, Bob, Carol mostly interact with each other             │
│ They discuss niche topic X that others in /tech don't engage with   │
│ High internal engagement, low external interaction                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Threshold reached, consensus achieved
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Space: /tech                    Space: /tech/topic-x-community      │
│ (lighter, focused)              (new organic space)                 │
│                                                                     │
│ Main discussions                Alice, Bob, Carol continue here     │
│ continue here                   Discoverable by anyone              │
│                                 Their own organic community         │
└─────────────────────────────────────────────────────────────────────┘
```

**Consensus requirement:**

Community formation is recorded ON-CHAIN to maintain network consistency:

1. **Detection**: Any node can compute behavioral metrics from chain data
2. **Proposal**: Metrics included in block proposal
3. **Verification**: Other nodes verify metrics match their chain view
4. **Consensus**: Block acceptance = community formation is official
5. **Enforcement**: All nodes recognize the new community space

This uses existing block consensus—no new mechanism needed. Same data, same algorithm = same conclusion for all nodes.

**Spam as a special case:**

The same mechanism handles spam naturally:

| Scenario | Detection | Result |
|----------|-----------|--------|
| Legitimate tight-knit community | High internal engagement, multiple participants | New discoverable space |
| Spammer self-engaging | 100% self-interaction, single participant | "Community" of one—undiscoverable |

The spammer does all the work (PoW, identity aging, self-engagement) and ends up alone in their own space that nobody visits or discovers. They're not punished—they got exactly what they built.

**Benefits:**

| Benefit | Mechanism |
|---------|-----------|
| Block reduction | Tight clusters don't bloat parent space |
| Natural organization | Community boundaries emerge organically |
| Discoverable | New spaces are listed, joinable |
| Not punitive | Just "you're cohesive enough for your own place" |
| Anti-spam side-effect | Self-referential clusters become lonely spaces |
| Consensus-based | All nodes agree on community boundaries |

See SPEC_13_ORGANIC_BRANCHING.md for full specification.

### The Storage Math

```
JOE'S 12 BRANCHES (~500MB total)

├── local/boston (50MB)
├── hobbies/fishing (30MB)
├── tech/android (40MB)
├── sports/red-sox (60MB)
├── family/private (10MB)
├── humor/dad-jokes (15MB)
├── news/local (25MB)
├── food/recipes (35MB)
├── cars/honda-civic (20MB)
├── gaming/mobile (45MB)
├── music/classic-rock (30MB)
├── photography/beginners (40MB)
└── TOTAL: ~400MB content + app overhead

Fits on 2015 smartphone. ✓
```

---

## Content Types and Realistic Sizes

**Resolved December 2024:** We must be honest about media sizes.

### Reality Check

```
TEXT POST
├── 1000 characters + metadata: ~2KB
└── Negligible

IMAGE (typical)
├── Compressed JPEG: 200KB - 500KB
├── With aggressive compression: ~300KB average
└── Manageable

VIDEO
├── 5 minutes at 480p: 25-50MB
├── 30 seconds: 5-10MB
├── This breaks the model at scale
```

### The Video Problem

One active video poster can blow a branch's storage budget with 2-3 videos.

### Tiered Content Model

| Tier | Type | On-Chain | Limits | Decay | PoW Cost |
|------|------|----------|--------|-------|----------|
| 1 | Text | Yes | Practically unlimited | 30 days | Base |
| 2 | Images | Yes | 500KB max, compressed | 30 days | 2× base |
| 3 | Video | Yes | 60 sec max, 480p, 5MB max | 7 days | 10× base |

**Video is expensive and ephemeral by design.** This aligns with "friction is a feature."

---

## External URLs: The Tension

### The Problem

```
Allow external URLs:
├── Video problem solved (link to wherever)
├── Storage stays bounded
├── BUT: dependency on external infrastructure
├── BUT: those external sources can be controlled, monetized
└── YouTube link today → "sign in to view" tomorrow

Disallow external URLs:
├── Truly self-contained
├── No external dependencies
├── BUT: no video (or very limited)
├── BUT: text + images only
```

### The Advertising Vector

External links create a funnel to monetized platforms:
- User posts: "Check out this cool thing [external link]"
- External site has ads, tracking, paywalls
- Swimchain becomes advertising distribution
- Ironic.

### The Pragmatic Reality

People will share links anyway. They'll paste URLs in text. We can't prevent this without content filtering (which = central authority).

### Resolution: Links Are Just Text

```
NO SPECIAL LINK HANDLING IN PROTOCOL

├── You can type "https://..." in a post
├── Client may render as clickable (client choice)
├── No embedding, no previews in protocol
├── Swimchain doesn't "know" about external content
└── Just text that happens to be a URL
```

**This means:**
- People can share links (can't stop them)
- No external dependencies in protocol
- No rich embeds encouraging link-centric behavior
- The community IS the content, not what they link to

### What Is Swimchain?

| Option | Description |
|--------|-------------|
| A place where content lives | Self-contained, limited media |
| A place to discuss things elsewhere | External links central |
| **Our choice** | Content lives here, links exist but aren't privileged |

**Swimchain is a place for conversation, not a link aggregator.**

Discussion is primary, links are references. "Here's a video [link]. What do you think?" The conversation happens on Swimchain. The video lives elsewhere.

---

## Storage Summary

| Constraint | Target |
|------------|--------|
| Total per user | ≤500MB |
| Branches synced | ~12 typical |
| Per-branch size | ~30-50MB (bounded by decay + fracturing) |
| Initial sync | <5 minutes on slow connection |
| Hardware target | 2015 smartphone |
| Video | Severely constrained, fast decay |
| External links | Just text, no protocol support |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [GLOSSARY.md](GLOSSARY.md) | Swimming terminology and protocol concepts |
| [WORKSTREAMS.md](WORKSTREAMS.md) | Execution roadmap and workstream tracking |
| [ROADMAP.md](ROADMAP.md) | Implementation phases and milestones |
| [MARKETING.md](MARKETING.md) | Positioning, audiences, and honest messaging |
| [specs/](specs/) | Technical protocol specifications |

---

*Document started: 2024-12-24*
*Last updated: 2026-01-08*
*Status: Vision complete, specifications complete, ready for implementation*

**Changelog:**
- 2026-01-08: Added Organic Community Formation (SPEC_13) - behavioral branching based on interaction patterns, natural community boundaries, spam as self-isolation.
- 2025-12-25: Added Social Layer (SPEC_09) - hosting-based contribution rewards, swimmer levels, non-economic benefits. Added MARKETING.md reference.
- 2024-12-25: Added recursive block architecture, pooled engagement PoW, parent-anchored threading. Updated moderation analysis to reflect engagement PoW requirement.
- 2024-12-25: Added bounded storage, fracturing, content types, external URLs.
