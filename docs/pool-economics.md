# Pool Economics and Attack Analysis

> Reference: SPEC_03 §7.5 (Attack Resistance), SPEC_08 §8 (Attack Scenarios)

This document analyzes the economic properties of the Engagement Pool System and demonstrates its resistance to common attack vectors.

## Core Principle: Mining IS Paying

In Swimchain, there is **no distinction between mining and paying**. Content persistence requires ongoing Proof of Work investment:
- Authors cannot self-persist for free
- All engagement has real computational cost
- Community values content through PoW contribution

This creates a natural economic equilibrium where content survives only if:
- The community values it enough to contribute 60s total PoW monthly, OR
- The author values it enough to pay 60s themselves

## Sybil Resistance

**Key insight:** Pool completion measures TOTAL work, not per-identity work.

| Scenario | Work per Identity | Identities | Total Work |
|----------|-------------------|------------|------------|
| Single contributor | 60s | 1 | **60s** |
| Split equally | 6s | 10 | **60s** |
| Many small | 0.6s | 100 | **60s** |
| Minimum contributions | 1s | 60 | **60s** |

**Result:** Identity count is irrelevant. No advantage to Sybils.

The pool doesn't care HOW the 60 seconds is distributed across contributors. Creating 100 fake identities to each contribute 0.6 seconds costs exactly the same total PoW as one identity contributing 60 seconds.

**Implementation verification:** See `test_sybil_equivalence` in `src/content/pool.rs:713`

```rust
#[test]
fn test_sybil_equivalence() {
    // 100 identities × 0.6s each = 60s total
    // 1 identity × 60s = 60s total
    // Both scenarios complete the pool with identical total work
}
```

## Attack Scenario Analysis

### Attack 1: Private Space Storage Abuse

**Attack:** Use Swimchain private space as personal file storage (1000 files).

| Phase | Calculation | PoW Cost |
|-------|-------------|----------|
| Initial upload | 1000 files × 30s per post | 500 minutes |
| Monthly persistence | 1000 files × 60s per pool | 1000 minutes/month |

**Total monthly cost:** ~17 hours of compute time

**Comparison to traditional hosting:**
- AWS S3: ~$0.023/GB/month + $0.09/1000 requests
- Traditional cloud: ~$0.10/month for equivalent storage
- Swimchain pool: ~$0.50-1.00 in energy costs

**Result:** Economically irrational. The attacker pays 100x+ more than traditional cloud hosting for equivalent storage. The PoW cost makes Swimchain inefficient as a general-purpose file hosting service.

### Attack 2: Sybil Attack on Pools

**Attack:** Create multiple identities to reduce per-identity cost.

```
Pool requires: 60s TOTAL work
Strategy A: 1 identity × 60s = 60s total
Strategy B: 100 identities × 0.6s each = 60s total

Total PoW cost: IDENTICAL
```

**Why it fails:**
1. Pool measures aggregate work, not work per identity
2. Creating identities doesn't reduce total PoW requirement
3. Identity creation itself costs PoW (though minimal compared to engagement)
4. No "volume discount" for multiple contributors

**Result:** Zero advantage to Sybils. The pool completion requirement is work-measured, not identity-measured.

### Attack 3: Self-Persistence (Author Hoarding)

**Attack:** Author persists own content indefinitely to build large personal content library.

| Action | PoW Cost |
|--------|----------|
| Initial post | 30s |
| Monthly engagement pool (author alone) | 60s |

**For 100 posts:**
- Initial creation: 100 × 30s = 50 minutes
- Monthly maintenance: 100 × 60s = 100 minutes/month

**Result:** Expensive and doesn't scale. An author maintaining 1000 posts would spend ~16+ hours of compute monthly. This makes large-scale content hoarding economically prohibitive.

### Attack 4: Pool Sniping (Free-Riding)

**Attack:** Wait until a pool is almost complete (59s), then add 1s to claim participation.

**Why it's not a problem:**
1. All contributors are recorded - the 59s contributors get proper credit
2. The 1s contributor still paid 1s of real PoW work
3. No special reward for "completing" the pool vs contributing earlier
4. Late contribution still benefits the content's persistence

**Result:** Not exploitable. Contributing late still costs real PoW, and attribution is preserved.

### Attack 5: Pool Griefing (Denial of Service)

**Attack:** Create many pools for content to fragment contributions.

**Why it fails:**
1. Pool ID is deterministic from (content, window_start, initiator)
2. Contributors choose which pool to support based on existing contributions
3. Creating pools costs nothing, but completing them costs 60s each
4. Rational contributors coordinate on the pool most likely to complete

**Result:** Ineffective. Pool creation is cheap, but completion is expensive. Griefing just wastes the attacker's pool creation overhead.

## Why Incomplete Pools Lose All Work

**Design rationale for sunk cost:**

1. **Prevents gaming:** If partial work carried over, attackers could extend decay timers cheaply by contributing small amounts to never-completing pools.

2. **Simplifies economics:** Binary outcome (complete or lost) makes economic analysis tractable. No complex partial credit calculations.

3. **Encourages realistic assessment:** Contributors should only participate if they believe the pool will complete. This creates natural selection for content the community actually values.

4. **Creates skin in the game:** Contributors must genuinely believe the content is worth preserving, not just add token amounts hoping for partial credit.

**The alternative (partial credit) enables:**
- Cheap decay timer extensions via small contributions
- Gaming by repeatedly creating small pools that never complete
- Complex incentive calculations around "how much is enough"
- Reduced signal about community content valuation

## Economic Equilibrium

Content persistence creates a natural market:

```
Content survives when:
  Community PoW contribution ≥ 60s per decay cycle

Content dies when:
  No one values it enough to contribute 60s total
```

This creates **organic content curation** without:
- Central moderators deciding what stays
- Popularity contests (views don't matter, PoW does)
- Pay-to-play dynamics (can't buy persistence with money)
- Bot manipulation (bots must pay real PoW too)

### Value Signal

Pool completion is a genuine value signal:
- Someone (or a group) spent 60s of compute
- They did so knowing the work could be lost
- The content was worth that cost to them

This is more meaningful than "likes" or "upvotes" which cost nothing.

## Comparison to Traditional Hosting

| Metric | Swimchain Pool | Cloud Hosting |
|--------|------------------|---------------|
| Monthly cost (per content) | 60s PoW (~$0.01 energy) | $0.10+ |
| Scaling | Linear per content | Economies of scale |
| Decentralized | Yes | No |
| Censorship resistant | Yes | No |
| Requires identity | Pseudonymous | Usually real ID |
| Payment method | Computation | Money |
| Abuse resistance | PoW cost | ToS + moderation |

**Key trade-off:** Swimchain is more expensive per-item than cloud hosting, but offers decentralization and censorship resistance that cloud hosting cannot provide.

## Attack Cost Summary

| Attack | Cost to Attacker | Benefit Gained | Economically Rational? |
|--------|------------------|----------------|------------------------|
| Private space abuse | ~17 hr/month | File storage | **No** (100x cloud cost) |
| Sybil pool attack | Same total PoW | None | **No** (no advantage) |
| Self-persistence farm | Linear in content count | Content persists | **No** (doesn't scale) |
| Pool sniping | 1s minimum PoW | Participation credit | **No** (still costs PoW) |
| Pool griefing | Pool creation overhead | Fragmented contributions | **No** (completion still costs 60s) |

## Implementation Notes

### Minimum Contribution Enforcement

The 1-second minimum (`MIN_CONTRIBUTION_SECS`) prevents:
- Spam with zero-work "contributions"
- Cheap pool discovery attacks
- Contribution record bloat

### Window Enforcement

The 10-minute window (`POOL_WINDOW_MS`) ensures:
- Pools resolve in bounded time
- Contributors can coordinate efficiently
- Stale pools don't accumulate

### Content-Specific PoW

Target formula: `sha256(content_hash || pool_id || prev_block_hash)`

This prevents:
- Reusing PoW across different content
- Pre-computing generic PoW to apply later
- Transferring PoW between pools

## References

- `specs/SPEC_03_PROOF_OF_WORK.md` §7.5 (Attack Resistance)
- `specs/SPEC_08_RECURSIVE_BLOCKS.md` §8 (Attack Scenarios)
- `research/RESEARCH_01_SYBIL_RESISTANCE.md` (Pattern 1: Cost of Forgery)
- [Engagement Pool System](engagement-pools.md) (Implementation details)
- [Content & Decay Engine](content-decay.md) (What pools protect against)
