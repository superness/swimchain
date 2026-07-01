# Swimchain Search Ranking

This document explains how search results are ranked in Swimchain web gateways. The ranking algorithm is **fully transparent** - there are no hidden factors, no personalization, and no algorithmic opacity.

## Philosophy

Swimchain rejects the pattern of platforms using opaque, personalized algorithms to maximize engagement. Instead, we use a fixed, transparent ranking formula that every user can understand and verify.

**Key Principles:**
1. **No personalization** - Everyone sees the same ranking for the same query
2. **No engagement optimization** - We don't optimize to keep you scrolling
3. **Transparent weights** - All factors and their weights are documented
4. **Verifiable** - The algorithm is open source and can be independently verified

## Ranking Factors

Search results are scored based on four factors, each weighted as follows:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Text Relevance** | 40% | How well the content matches your search query |
| **Heat (Decay State)** | 25% | Content's current survival probability |
| **Engagement Pool** | 20% | Progress toward the 60-second engagement threshold |
| **Recency** | 15% | How recently the content was created |

### Text Relevance (40%)

Text relevance measures how well the content matches your search query. We use [lunr.js](https://lunrjs.com/) for full-text search with the following field weights:

- **Title**: 3.0x boost (highest priority)
- **Body**: 1.0x (standard weight)
- **Space name**: 1.5x (medium priority)
- **Author address**: 0.5x (for identity search)

The raw lunr.js score is normalized to 0-100.

### Heat/Decay (25%)

Heat represents the content's survival probability based on Swimchain's decay mechanics (see [SPEC_02](../specs/SPEC_02_CONTENT_DECAY.md)).

- 100%: Content is fully healthy, recently engaged
- 50%: One half-life has passed without engagement
- 6.25%: Four half-lives, content will decay soon
- 0%: Content has decayed and is no longer available

This factor rewards content that the community is actively preserving.

### Engagement Pool (20%)

Each post has an engagement pool that requires 60 seconds of contributed proof-of-work to complete. This factor rewards content that users are actively engaging with.

- 0%: No engagement (empty pool)
- 50%: Pool is half complete (30 seconds contributed)
- 100%: Pool is complete (60 seconds contributed)

Unlike "likes" or "upvotes" which are free, Swimchain engagement costs computational work. This makes gaming the system expensive.

### Recency (15%)

Recency uses exponential decay with a 24-hour half-life:

- Brand new (0 hours): 100%
- 24 hours old: ~50%
- 48 hours old: ~25%
- 7 days old: ~0.4%

This gives newer content a boost while still allowing older, highly-relevant content to surface.

## Score Calculation

The final score is calculated as:

```
TotalScore = (TextRelevance × 0.40) + (Heat × 0.25) + (Engagement × 0.20) + (Recency × 0.15)
```

All component scores are normalized to 0-100, so the final score is also 0-100.

## Example Breakdown

Here's an example score breakdown for a search result:

```
Total Score: 68.3/100

Breakdown:
  Text Match:  85% × 40% = 34.0
  Heat:        70% × 25% = 17.5
  Engagement:  50% × 20% = 10.0
  Recency:     45% × 15% =  6.8
```

## Sort Options

Users can sort by different factors:

| Sort | Description |
|------|-------------|
| **Relevance** | Default. Uses the weighted total score. |
| **Heat** | Sort by survival probability, highest first. |
| **Engagement** | Sort by pool progress, most engaged first. |
| **Newest** | Sort by creation time, newest first. |
| **Most Replies** | Sort by reply count, most discussed first. |

Note that changing the sort order doesn't change the underlying scores - it just reorders results by a different factor.

## Filters

Users can also filter results:

| Filter | Options |
|--------|---------|
| **Space** | Limit to a specific space |
| **Heat** | Any, >25%, >50%, >75%, >90% |
| **Engagement** | Any, >20s, >40s, Complete (60s) |
| **Time** | Any, Today, Week, Month, Year |
| **Include Decaying** | Show/hide content below 20% heat |

## URL Parameters

All filters and sort options are encoded in the URL for shareability:

```
/search?q=rust+async&space=rust-lang&minHeat=50&sort=relevance
```

This means you can share a search URL and others will see exactly the same results (modulo content changes over time).

## Transparency Commitment

We commit to:

1. **Document all changes** to the ranking algorithm in this file
2. **Never add hidden factors** - all ranking inputs are visible
3. **Never personalize** results based on user history or identity
4. **Keep the algorithm simple** - complexity enables opacity

## Implementation

The ranking algorithm is implemented in:

- `web-gateway/src/lib/search/ranking.ts` - Core ranking logic
- `web-gateway/src/lib/search/normalize.ts` - Score normalization utilities
- `web-gateway/src/types/search.ts` - Type definitions including weights

## History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12 | Initial ranking algorithm |

---

*This document is part of Swimchain's transparency commitment. If you find any discrepancy between this document and the actual implementation, please report it.*
