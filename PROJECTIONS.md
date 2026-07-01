# Swimchain - Storage and Scale Projections

## Overview

This document projects storage requirements and content availability at various network scales. These projections inform architecture decisions about seed nodes, mobile participation, and content distribution strategy.

**Key Insight:** Swimchain's friction-by-design fundamentally changes usage patterns compared to engagement-optimized platforms.

---

## Activity Assumptions

### Why Swimchain Users Post Less

| Factor | Effect |
|--------|--------|
| PoW friction (10-60 seconds per post) | Eliminates impulsive posting |
| Active navigation (navigate to spaces) | No infinite scroll dopamine loop |
| No engagement optimization | No notifications pushing "post more" |
| Decay awareness | Users know ephemeral, post deliberately |

### Comparative Activity Levels

| Platform | Posts/User/Day | Model |
|----------|----------------|-------|
| Twitter | 5-10 | Addiction-optimized |
| Reddit | 0.5-2 | Semi-optimized |
| Pre-algorithm platforms | 0.1-0.5 | Deliberate participation |
| **Swimchain** | **0.2-0.5** | Friction by design |

**We use 0.3 posts/user/day as baseline.**

---

## Chain Layer Projections

The chain contains metadata only - post records, not content blobs.

### Post Record Size

```
Post record structure:
├── author:      32 bytes (pubkey)
├── space:       32 bytes (hash)
├── timestamp:    8 bytes
├── pow_nonce:    8 bytes
├── content_hash: 32 bytes (points to content blob)
├── signature:   64 bytes
├── parent:      32 bytes (for replies)
├── type:         1 byte
└── flags:        1 byte
Total: ~210 bytes per post
```

### Chain Size By Scale

| Users | Posts/Day | Chain Growth/Day | Chain/Year | After Decay |
|-------|-----------|------------------|------------|-------------|
| 12 | 4 | 840 bytes | 300 KB | < 1 MB |
| 100 | 30 | 6.3 KB | 2.3 MB | < 5 MB |
| 1,000 | 300 | 63 KB | 23 MB | < 50 MB |
| 10,000 | 3,000 | 630 KB | 230 MB | < 500 MB |
| 100,000 | 30,000 | 6.3 MB | 2.3 GB | < 5 GB |
| 1,000,000 | 300,000 | 63 MB | 23 GB | < 50 GB |

**Conclusion: Chain size is manageable at all projected scales.** Even at 1 million users, the chain fits on a phone.

---

## Content Layer Projections

Content blobs (text, images, video) are stored separately from the chain.

### Content Size Assumptions

| Content Type | Size Range | Frequency (% of posts) |
|--------------|------------|------------------------|
| Text only | 500 bytes - 2 KB | 60-80% |
| With image | 100 KB - 1 MB | 15-35% |
| With video | 5 MB - 50 MB | 0-5% |

**Conservative estimate:** 20% of posts have images, 2% have video.

### Content Size By Scale (With Decay)

Assuming 30-day half-life and steady state reached:

| Users | Content Growth/Day | Steady State Content |
|-------|-------------------|---------------------|
| 12 | 2 MB | < 500 MB |
| 100 | 20 MB | ~5 GB |
| 1,000 | 200 MB | ~50 GB |
| 10,000 | 2 GB | ~500 GB |
| 100,000 | 20 GB | ~5 TB |
| 1,000,000 | 200 GB | ~50 TB |

---

## Seed Node Architecture

### What Seeds Are and Aren't

| Seeds ARE | Seeds ARE NOT |
|-----------|---------------|
| Known entry points | Full content mirrors |
| Chain sync sources | Required for content |
| DHT bootstrap nodes | Authorities |
| Optional content caches | Single points of failure |

### Seed Node Requirements

| Component | Size | Notes |
|-----------|------|-------|
| Chain (full) | < 5 GB even at 1M users | Always stored |
| Peer database | < 10 MB | Known peers |
| DHT state | < 100 MB | Content location index |
| Content cache | 10-100 GB (configurable) | Optional, partial |
| **Total** | **15-110 GB** | Modest requirements |

### Content Caching Strategy

Seeds don't need all content. They cache strategically:

```
SEED CONTENT BUDGET (example: 50 GB)
├── Popular content (top 1000 posts): 20 GB (40%)
│   └── Replicated across ALL seeds for robustness
├── Recent content (last 7 days): 15 GB (30%)
│   └── Replicated across ALL seeds for freshness
└── Space focus (subscribed spaces): 15 GB (30%)
    └── Different per seed, creates distributed coverage
```

### Overlap Model for Robustness

```
NETWORK: 500 GB total content (10K users)

Seed A (50 GB)        Seed B (50 GB)        Seed C (50 GB)
├── Chain ✓           ├── Chain ✓           ├── Chain ✓
├── Popular ✓         ├── Popular ✓         ├── Popular ✓
├── Recent ✓          ├── Recent ✓          ├── Recent ✓
└── /tech, /crypto    └── /gaming, /art     └── /local, /music

Popular + Recent = Same on all seeds (guaranteed availability)
Space focus = Distributed (coverage without duplication)
```

| Seeds Online | Popular/Recent | Niche Spaces |
|--------------|----------------|--------------|
| All 3 | ✓ ✓ ✓ | Covered by at least 1 |
| Any 2 | ✓ ✓ | Mostly covered |
| Any 1 | ✓ | Partial coverage |
| None | From users only | From users only |

**Network degrades gracefully.** Content availability decreases but doesn't cliff.

---

## Content Retrieval Flow

```
User requests content hash Qm7x9abc...

STEP 1: Check local cache
└── If found → Done (instant)

STEP 2: Query connected peers
└── If found → Fetch → Cache → Done

STEP 3: Query DHT
├── Returns: [peer_A, peer_B, seed_C]
├── Connect to closest/fastest
├── Fetch content
└── Cache locally (user becomes seeder)

STEP 4: Content not found
└── Show: "Content unavailable - no seeders online"
└── (Honest, expected for old/unpopular content)
```

### Availability By Content Type

| Content Type | Expected Availability | Why |
|--------------|----------------------|-----|
| Popular (viral) | Very high | Many caches, seed priority |
| Recent (< 7 days) | High | Seeds cache recent, users active |
| Active space | Medium-high | Space members cache |
| Niche/old | Low | Depends on dedicated seeders |
| Decayed | None | Chain record removed |

---

## Mobile Device Participation

### Storage Budgets By Device

| Device Type | Realistic Budget | Can Handle |
|-------------|------------------|------------|
| Budget phone | 1-5 GB | Chain + subscribed spaces |
| Flagship phone | 10-20 GB | Chain + most active content |
| Tablet | 20-50 GB | Near-full participation |
| Laptop | 50-200 GB | Full participation |
| Desktop | 200 GB+ | Full + archival |

### What Mobile Can Do At Each Scale

| Scale | Phone Capability |
|-------|-----------------|
| 12 users | Full node (everything fits) |
| 100 users | Full node (still fits) |
| 1,000 users | Chain + subscribed spaces |
| 10,000 users | Chain + top spaces only |
| 100,000+ users | Chain + selective caching |

**Chain always fits.** The question is content caching capacity.

### Mobile-Specific Considerations

| Concern | Mitigation |
|---------|-----------|
| Battery (PoW) | Background compute, queue for charging |
| Bandwidth | WiFi-only sync option |
| Storage | Space subscription limits |
| Heat | Lower intensity, longer PoW duration |

---

## The Real Scaling Challenge

**Storage is not the problem.** The numbers work.

**The challenge is content availability coordination:**

1. **Who decides to seed old content?**
   - Authors keep their own content alive
   - Space volunteers (like channel ops)
   - Third-party pinning services (not protocol-level)

2. **What happens to content no one seeds?**
   - It becomes unavailable
   - Eventually decays from chain too
   - This is honest and expected

3. **How do users understand availability?**
   - UI shows "X peers have this"
   - "Content unavailable" is a valid state
   - Set expectations: this isn't centralized cloud storage

---

## Projections Summary

### What's Clearly Manageable

| Component | Status | Notes |
|-----------|--------|-------|
| Chain size | ✓ | < 50 GB even at 1M users |
| Seed requirements | ✓ | 50-100 GB total per seed |
| Mobile chain sync | ✓ | Always fits on phones |
| Popular content availability | ✓ | Multiple caches ensure access |

### What Needs Validation

| Component | Question | How to Validate |
|-----------|----------|-----------------|
| Actual posting rate | Is 0.3 posts/day realistic? | User behavior testing |
| Media mix | What % images/video? | Early user observation |
| Decay effectiveness | Does half-life math hold? | Simulation |
| DHT performance | How quickly find content? | Network testing |
| Seeder coordination | Will communities maintain? | Social experiment |

### What Remains Uncertain

| Uncertainty | Impact | Mitigation |
|-------------|--------|-----------|
| User behavior patterns | Could be 10x more or less | Start small, observe |
| Video policy | Could explode storage | Consider limits or exclusion |
| Long-tail availability | Niche content may die | Accept as feature, not bug |

---

## Media Policy Recommendation

Based on projections, recommend:

| Content Type | Policy | PoW Multiplier |
|--------------|--------|---------------|
| Text | Unlimited | 1x |
| Images | Max 1 MB each, max 4/post | 2x |
| Video | Max 10 MB (30s @ 720p) or exclude | 5x |

**Higher PoW for larger content** prevents storage abuse while allowing legitimate use.

---

## Next Steps

1. **Build decay simulator** - Validate steady-state projections
2. **DHT performance testing** - Content discovery latency
3. **User behavior observation** - Real posting patterns in test network
4. **Media policy decision** - Allow video or not?

---

*Document created: 2024-12-25*
*Status: Initial projections, pending validation*
