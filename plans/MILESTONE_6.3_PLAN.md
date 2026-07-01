# Implementation Plan: Milestone 6.3 - Search/Reader Client (Web Gateway)

## Overview

Build a web gateway that provides discovery and read-only access to ChainSocial content. The gateway serves as an entry point for new users who want to browse content before downloading a full client.

**Key Principles:**
- READ-ONLY - no posting, no identity creation, no engagement
- Transparent ranking - no hidden algorithms, fixed weights documented
- Multiple operators - anyone can run a gateway (decentralized)
- SEO-first - server-side rendering for search engine crawlability
- Conversion funnel - strong CTAs to download full client

---

## IMPLEMENTATION_PLAN:

### STEP 1: Project Setup - Web Gateway Directory
**DELIVERABLE:** Project scaffolding and architecture

**ACTIONS:**
- Create `web-gateway/` directory at project root
- Initialize Next.js 14 with App Router (selected for established SSR, good SEO)
- Configure TypeScript strict mode
- Add dependencies: `@chainsocial/core`, `react`, `next`
- Create environment configuration system
- Set up gateway-to-node WebSocket connection pattern

**FILES_AFFECTED:**
- `web-gateway/package.json` - create
- `web-gateway/tsconfig.json` - create
- `web-gateway/next.config.js` - create
- `web-gateway/.env.example` - create
- `web-gateway/src/lib/node-connection.ts` - create
- `web-gateway/src/types/gateway.ts` - create

**DATA STRUCTURES:**
```typescript
// web-gateway/src/types/gateway.ts
interface GatewayConfig {
  nodeUrl: string;              // ws://localhost:9736
  gatewayName: string;          // "ChainSocial Gateway"
  gatewayUrl: string;           // "https://read.example.com"
  syncWindowHours: number;      // Default: 720 (30 days)
  rateLimitPerMinute: number;   // Default: 60
  cacheTtlSeconds: number;      // Default: 60
}

interface NodeConnectionState {
  connected: boolean;
  lastBlockHeight: number;
  lastBlockTime: number;
  peerCount: number;
}
```

**VERIFICATION:**
- [ ] `npm install` succeeds
- [ ] `npm run build` produces `.next` directory
- [ ] `npm run dev` starts on port 3000
- [ ] TypeScript compiles without errors

---

### STEP 2: Search Ranking Algorithm Implementation
**DELIVERABLE:** Full-text search with transparent ranking

**ACTIONS:**
- Create ranking algorithm with fixed, documented weights
- Implement score breakdown for transparency
- Create normalization functions for each factor
- Document algorithm in `docs/search-ranking.md`

**FILES_AFFECTED:**
- `web-gateway/src/lib/search/ranking.ts` - create
- `web-gateway/src/lib/search/normalize.ts` - create
- `web-gateway/src/types/search.ts` - create
- `docs/search-ranking.md` - create

**ALGORITHM (from CLIENT_DESIGN.md Section 7.4):**
```typescript
// Ranking weights - FIXED, no personalization, no hidden factors
const RANKING_WEIGHTS = {
  TEXT_RELEVANCE: 0.40,    // 40% - keyword matches in title/body
  HEAT_DECAY: 0.25,        // 25% - current survival probability
  ENGAGEMENT_POOL: 0.20,   // 20% - pool completeness + contributors
  RECENCY: 0.15,           // 15% - time since post/engagement
} as const;

interface ScoreBreakdown {
  textRelevance: number;    // 0-100 normalized
  heatDecay: number;        // 0-100 normalized
  engagementPool: number;   // 0-100 normalized
  recency: number;          // 0-100 normalized
  total: number;            // Weighted combination
}

// TEXT_RELEVANCE calculation:
// - Title matches: 3x weight
// - Body matches: 1x weight
// - Exact phrase: +10 bonus
// - Normalize to 0-100

// HEAT_DECAY calculation (from SPEC_02):
// - survival_probability = 0.5^(effective_decay_time / half_life)
// - half_life = 7 days (604800 seconds)
// - decay_floor = 48 hours (172800 seconds)
// - Score = survival_probability * 100

// ENGAGEMENT_POOL calculation:
// - Pool seconds contribution: (contributedSeconds / 60) * 100
// - Contributor bonus: log2(max(1, contributorCount)) * 5
// - Normalize to 0-100

// RECENCY calculation:
// - Time since post decay: exp(-hours_since_post / 168) * 70
// - Time since engagement decay: exp(-hours_since_engagement / 72) * 30
// - Sum normalized to 0-100
```

**DATA STRUCTURES:**
```typescript
// web-gateway/src/types/search.ts
interface SearchResult {
  contentId: string;           // sha256:...
  spaceId: string;             // sp1...
  author: string;              // cs1...
  title: string;
  bodyPreview: string;         // First 200 chars
  createdAt: number;           // UNIX timestamp seconds
  lastEngagement: number;
  totalScore: number;          // 0-100
  breakdown: ScoreBreakdown;   // Transparency!
  survivalProbability: number; // 0-1
  isDecayed: boolean;
  pool: PoolSummary | null;
  replyCount: number;
}

interface SearchQuery {
  keywords: string[];          // ["async", "traits"]
  exactPhrase: string | null;  // "stable in Rust"
  exclusions: string[];        // ["deprecated"]
  filters: SearchFilters;
}

interface SearchFilters {
  spaceId: string | null;
  author: string | null;
  timeRange: 'any' | 'today' | 'week' | 'month' | 'year';
  minHeat: number;             // 0-100, default 0
  minEngagement: number;       // 0-60 seconds, default 0
  includeDecaying: boolean;    // Default true
}
```

**VERIFICATION:**
- [ ] Unit test: Weights sum to exactly 1.0
- [ ] Unit test: Sample content with known values produces expected score
- [ ] Unit test: Score breakdown visible in result object
- [ ] Unit test: 100% heat content scores higher than 50% heat (other factors equal)
- [ ] docs/search-ranking.md explains algorithm clearly

---

### STEP 3: Search Index and Query Engine
**DELIVERABLE:** Full-text search with transparent ranking

**ACTIONS:**
- Implement search index using lunr.js (client-side, no external service)
- Create query parser supporting: keywords, "exact phrase", -exclusion, space:filter
- Implement filter application pipeline
- Create index refresh strategy (on new content from node)

**FILES_AFFECTED:**
- `web-gateway/src/lib/search/index.ts` - create
- `web-gateway/src/lib/search/query-parser.ts` - create
- `web-gateway/src/lib/search/filters.ts` - create
- `web-gateway/package.json` - add lunr dependency

**ALGORITHM:**
```typescript
// Query parsing examples:
// "async traits" → keywords: ["async", "traits"]
// "async \"stable in Rust\"" → keywords: ["async"], exactPhrase: "stable in Rust"
// "async -deprecated" → keywords: ["async"], exclusions: ["deprecated"]
// "async space:rust-lang" → keywords: ["async"], filters.spaceId: "rust-lang"

interface QueryParseResult {
  keywords: string[];
  exactPhrase: string | null;
  exclusions: string[];
  filters: Partial<SearchFilters>;
}

// Index configuration:
// - ref: contentId
// - fields: title (boost: 3), body, spaceName, author
// - Update on node events: ContentEvent.NewPost, ContentEvent.NewReply
```

**VERIFICATION:**
- [ ] Unit test: Query "async traits" returns content with both words
- [ ] Unit test: Query `"stable in Rust"` only returns exact phrase matches
- [ ] Unit test: Query `-deprecated` excludes matching content
- [ ] Integration test: Filter `space:rust-lang` limits to that space
- [ ] Integration test: Combined query + filters work correctly

---

### STEP 4: Advanced Search Filters UI
**DELIVERABLE:** Advanced search filters (space, heat, time, engagement)

**ACTIONS:**
- Create SearchBox component with autocomplete
- Create SearchFilters component with all filter options
- Persist filter state in URL query parameters for shareability
- Add sort options: Relevance, Heat, Engagement, Newest, Most replies

**FILES_AFFECTED:**
- `web-gateway/src/components/SearchBox.tsx` - create
- `web-gateway/src/components/SearchFilters.tsx` - create
- `web-gateway/src/app/search/page.tsx` - create
- `web-gateway/src/hooks/useSearchParams.ts` - create

**UI COMPONENTS (from CLIENT_DESIGN.md Section 7.3):**
```typescript
// URL format: /search?q=async+traits&space=rust-lang&heat=50&time=week&sort=relevance
interface SearchPageParams {
  q: string;                   // Query string
  space?: string;              // Space filter (sp1... or name)
  author?: string;             // Author filter (cs1...)
  heat?: '25' | '50' | '75' | '90';
  time?: 'today' | 'week' | 'month' | 'year';
  engagement?: '20' | '40' | '60';
  sort?: 'relevance' | 'heat' | 'engagement' | 'newest' | 'replies';
  decaying?: 'true' | 'false';
}

// Filter controls layout:
// [Space selector ▼] [Heat: ○Any ○25% ○50% ●75% ○90%]
// [Time: ○Any ○Today ●Week ○Month ○Year]
// [Engagement: ○Any ○20s ○40s ○60s] [✓ Include decaying]
// [Sort by: Relevance ▼]
```

**VERIFICATION:**
- [ ] All filter controls render and respond to changes
- [ ] Changing filter updates URL query params
- [ ] Page reload preserves filter state from URL
- [ ] Combined filters reduce result count appropriately
- [ ] Sort options change result ordering

---

### STEP 5: Space Discovery and Browsing
**DELIVERABLE:** Space discovery and browsing

**ACTIONS:**
- Create space listing page with search
- Create individual space view with post list
- Map SPEC_04 SpaceActivitySummary to UI components
- Add space metrics display (post count, participants, health)

**FILES_AFFECTED:**
- `web-gateway/src/app/spaces/page.tsx` - create
- `web-gateway/src/app/spaces/[spaceId]/page.tsx` - create
- `web-gateway/src/components/SpaceCard.tsx` - create
- `web-gateway/src/components/SpaceActivitySummary.tsx` - create
- `web-gateway/src/types/space.ts` - create

**DATA STRUCTURES (from SPEC_04):**
```typescript
interface SpaceActivitySummary {
  spaceId: string;             // sp1-prefixed address
  name: string;
  description: string;
  postCount: number;           // Total posts ever
  activePosts: number;         // Posts not yet decayed
  uniqueParticipants: number;  // Distinct identities
  lastActivity: number;        // Timestamp of most recent post
  decayHealth: number;         // 0-100, rough measure of decay pressure
  averageHeat: number;         // Average heat of active posts
}
```

**VERIFICATION:**
- [ ] Space listing loads and displays spaces
- [ ] Space search filters list correctly
- [ ] Individual space page shows posts with heat indicators
- [ ] Search within space works
- [ ] Space metrics display correctly

---

### STEP 6: Identity Search
**DELIVERABLE:** Identity search

**ACTIONS:**
- Create identity search within search UI
- Create user profile page at /u/{address}
- Display identity with cs1-prefixed address formats
- Show identity activity summary (posts, spaces)

**FILES_AFFECTED:**
- `web-gateway/src/app/u/[address]/page.tsx` - create
- `web-gateway/src/components/IdentityCard.tsx` - create
- `web-gateway/src/components/AddressDisplay.tsx` - create
- `web-gateway/src/lib/search/identity.ts` - create
- `web-gateway/src/types/identity.ts` - create

**DATA STRUCTURES (from SPEC_01):**
```typescript
// Address formats:
// Full: cs1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m (42 chars)
// Short: cs1q9x7...2k4m
// Very short: ...2k4m

interface IdentityProfile {
  address: string;             // Full cs1-prefixed address
  firstSeen: number;           // Block timestamp of first post
  postCount: number;
  replyCount: number;
  activeSpaces: string[];      // Space IDs where identity has posted
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  type: 'post' | 'reply';
  contentId: string;
  spaceId: string;
  title: string;
  timestamp: number;
  heat: number;
}
```

**VERIFICATION:**
- [ ] Searching `cs1q` returns matching addresses
- [ ] Profile page at /u/{address} shows posts
- [ ] Address display with copy button works
- [ ] Invalid address shows 404 page
- [ ] Activity list shows posts and replies

---

### STEP 7: Read-Only Post/Thread View
**DELIVERABLE:** Read-only post/thread view

**ACTIONS:**
- Create single post page at /s/{space}/{postId}
- Implement read-only ReplyTree (no engage buttons)
- Create heat indicator with 5 visual states (from CLIENT_DESIGN)
- Add decay visualization via CSS opacity/saturation
- Show pool state as read-only information

**FILES_AFFECTED:**
- `web-gateway/src/app/s/[space]/[postId]/page.tsx` - create
- `web-gateway/src/components/ReadOnlyReplyTree.tsx` - create
- `web-gateway/src/components/HeatIndicator.tsx` - create
- `web-gateway/src/components/PoolDisplay.tsx` - create
- `web-gateway/src/components/DecayVisualizer.tsx` - create
- `web-gateway/src/styles/decay.css` - create

**HEAT VISUALIZATION (from CLIENT_DESIGN.md Section 2.1):**
```css
/* 5 visual states */
.heat-full    { opacity: 1.0; filter: none; }                              /* 80-100% */
.heat-warm    { opacity: 0.95; filter: saturate(0.9); }                    /* 60-79% */
.heat-cooling { opacity: 0.85; filter: saturate(0.8); }                    /* 20-59% */
.heat-fading  { opacity: 0.70; filter: saturate(0.6) grayscale(0.2); }     /* 5-19% */
.heat-decayed { opacity: 0.55; filter: saturate(0.4) grayscale(0.4); }     /* <5% */

/* Visual degradation increases as heat decreases */
/* Show "Fading" badge for <20% heat */
/* Show estimated time until decay */
```

**VERIFICATION:**
- [ ] Thread renders with all replies (recursive tree)
- [ ] Heat indicator shows correct visual state
- [ ] Decaying content shows visual degradation
- [ ] No "Reply" or "Engage" buttons (read-only)
- [ ] Pool shows contributor count and progress (read-only)
- [ ] Deep reply threading (10+ levels) renders correctly

---

### STEP 8: Download Client CTAs
**DELIVERABLE:** "Download client" CTAs

**ACTIONS:**
- Create DownloadCTA component with variants (banner, inline, footer)
- Add CTAs to all content pages
- Create /about page explaining ChainSocial
- Add contextual messaging ("Want to reply?")

**FILES_AFFECTED:**
- `web-gateway/src/components/DownloadCTA.tsx` - create
- `web-gateway/src/components/DownloadBanner.tsx` - create
- `web-gateway/src/app/about/page.tsx` - create
- `web-gateway/src/components/GatewayLayout.tsx` - create

**CTA PATTERNS (from CLIENT_DESIGN.md Section 8.3):**
```typescript
interface DownloadCTAProps {
  variant: 'banner' | 'inline' | 'footer';
  context?: 'post' | 'space' | 'profile' | 'search';
}

// Contextual messages:
// post: "Want to reply? Download ChainSocial"
// space: "Want to join this community? Download ChainSocial"
// profile: "Create your own identity"
// search: "Want to participate? Download ChainSocial"

// CTA content:
// - "This is a read-only gateway"
// - "Download to participate:"
// - [Mobile App] [Desktop App]
// - "Reply to posts, Engage content, Create your own posts"
// - Links to download page + about page
```

**VERIFICATION:**
- [ ] Every content page has visible CTA
- [ ] About page explains ChainSocial philosophy
- [ ] Download links present (can be placeholder URLs)
- [ ] CTA messaging varies by context
- [ ] Banner dismissible but footer always visible

---

### STEP 9: SEO-Friendly Rendering
**DELIVERABLE:** SEO-friendly rendering

**ACTIONS:**
- Ensure all pages are server-side rendered
- Add Open Graph meta tags for link previews
- Add JSON-LD structured data (DiscussionForumPosting schema)
- Create robots.txt and dynamic sitemap
- Add semantic HTML structure

**FILES_AFFECTED:**
- `web-gateway/src/lib/seo.ts` - create
- `web-gateway/src/components/SEOHead.tsx` - create
- `web-gateway/src/lib/structured-data.ts` - create
- `web-gateway/public/robots.txt` - create
- `web-gateway/src/app/sitemap.xml/route.ts` - create
- `web-gateway/src/app/layout.tsx` - modify

**SEO IMPLEMENTATION:**
```typescript
// Open Graph tags for each page type:
interface PageSEO {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  ogType: 'article' | 'website' | 'profile';
  canonicalUrl: string;
}

// JSON-LD for posts:
interface PostStructuredData {
  "@context": "https://schema.org";
  "@type": "DiscussionForumPosting";
  headline: string;
  author: {
    "@type": "Person";
    identifier: string;  // cs1 address
  };
  datePublished: string;  // ISO 8601
  dateModified: string;
  discussionUrl: string;
  text: string;
  interactionStatistic: {
    "@type": "InteractionCounter";
    interactionType: "https://schema.org/CommentAction";
    userInteractionCount: number;  // Reply count
  };
}

// Sitemap: Dynamic generation from active content
// Include: /s/{space}, /s/{space}/{post}, /spaces, /about
// Exclude: Low heat content (<10%)
```

**VERIFICATION:**
- [ ] View source shows pre-rendered HTML content
- [ ] Open Graph tags in `<head>` for all pages
- [ ] JSON-LD validates at Google Rich Results Test
- [ ] robots.txt allows crawling
- [ ] Sitemap XML is valid and includes active content
- [ ] Content titles/descriptions appear correctly in link previews

---

### STEP 10: Multiple Gateway Operator Support
**DELIVERABLE:** Multiple gateway operator support

**ACTIONS:**
- Create environment-based configuration system
- Add health check endpoint at /api/health
- Implement rate limiting per IP
- Create Docker configuration
- Write operator documentation

**FILES_AFFECTED:**
- `web-gateway/src/lib/config/gateway.ts` - create
- `web-gateway/src/app/api/health/route.ts` - create
- `web-gateway/src/middleware.ts` - create (rate limiting)
- `web-gateway/Dockerfile` - create
- `web-gateway/docker-compose.yml` - create
- `docs/gateway-operation.md` - create

**CONFIGURATION (from CLIENT_DESIGN.md Section 8.5):**
```typescript
interface GatewayOperatorConfig {
  // Node connection
  nodeWebsocketUrl: string;     // Default: ws://localhost:9736

  // Gateway identity
  gatewayName: string;          // "My ChainSocial Gateway"
  gatewayUrl: string;           // "https://read.example.com"

  // Sync settings
  syncWindowHours: number;      // Default: 720 (30 days)
  maxContentAgeDays: number;    // Default: 30

  // Rate limiting
  rateLimitPerMinute: number;   // Default: 60
  rateLimitBurst: number;       // Default: 10

  // Cache
  cacheTtlSeconds: number;      // Default: 60
}

// Environment variables:
// NODE_WEBSOCKET_URL=ws://localhost:9736
// GATEWAY_NAME="ChainSocial Gateway"
// GATEWAY_URL=https://read.example.com
// SYNC_WINDOW_HOURS=720
// RATE_LIMIT_PER_MINUTE=60
// CACHE_TTL_SECONDS=60
```

**VERIFICATION:**
- [ ] Gateway starts with only NODE_WEBSOCKET_URL configured
- [ ] Health check endpoint returns node connection status
- [ ] Rate limiting returns 429 when exceeded
- [ ] Docker container builds successfully
- [ ] Docker container runs and serves requests
- [ ] Operator documentation is complete and clear

---

## TEST_PLAN:

### TEST 1: Search Text Relevance
**CRITERION:** Search returns relevant results
**METHOD:** Integration test
**INPUT:** Create 3 posts:
- "Rust async traits stable"
- "Rust performance tips"
- "Python async await"
Query: "async traits"
**EXPECTED:**
- Post 1 ranks highest (both keywords in title)
- Post 3 second (async keyword)
- Post 2 last (only partial match)

### TEST 2: Transparent Ranking Display
**CRITERION:** Ranking factors are transparent
**METHOD:** Unit test + integration test
**INPUT:** Any search result
**EXPECTED:** Result object contains:
```json
{
  "breakdown": {
    "textRelevance": 67,
    "heatDecay": 82,
    "engagementPool": 75,
    "recency": 45
  }
}
```
- Breakdown values are non-zero for non-empty factors
- docs/search-ranking.md explains each factor

### TEST 3: SEO Crawlability
**CRITERION:** Content is crawlable by search engines
**METHOD:** Integration test
**INPUT:** HTTP GET `/s/rust-lang/post-123`
**EXPECTED:**
- Response contains post body text in HTML (not just JS)
- `<meta property="og:title">` present
- `<script type="application/ld+json">` present and valid
- No JavaScript-only rendering

### TEST 4: Non-User Browsing
**CRITERION:** Non-users can browse content
**METHOD:** Integration test
**INPUT:** Access gateway without any auth/cookies/session
**EXPECTED:**
- `/spaces` returns 200 with space list
- `/s/rust-lang` returns 200 with post list
- `/s/rust-lang/post-123` returns 200 with post content
- `/u/cs1q...` returns 200 with profile
- No login prompts or auth requirements

### TEST 5: Conversion Funnel (CTAs)
**CRITERION:** Clear path to full participation
**METHOD:** Integration test
**INPUT:** Navigate to any post page
**EXPECTED:**
- Page contains "Download" link/button
- Page contains text about "reply" or "participate"
- CTA links are functional
- About page accessible from CTA

---

## DOCUMENTATION TO CREATE:

1. **docs/search-ranking.md** - Full algorithm documentation
   - Explain each factor with examples
   - Show weight breakdown
   - Clarify: "no personalization, no advertising influence"

2. **docs/gateway-operation.md** - Operator guide
   - System requirements
   - Configuration options
   - Docker deployment
   - Health monitoring
   - Rate limiting tuning
   - Multiple gateway coordination

---

## RISKS:

| Risk | Mitigation |
|------|------------|
| Node connection instability | Implement reconnection logic with exponential backoff; cache content aggressively |
| Search performance with large index | Use lunr.js lazy loading; paginate results; consider indexedDB for browser caching |
| SSR performance under load | Next.js ISR (Incremental Static Regeneration) for popular pages; aggressive caching |
| Rate limit bypass attempts | Use IP-based limiting; consider fingerprinting for persistent abuse |
| Stale content display | Show "last synced" timestamp; clear cache on node reconnection |

---

## DEPENDENCIES:

**From Milestone 6.1 (Core Library):**
- `@chainsocial/core` package for decay calculations
- WASM bindings (identity address validation)

**From Milestone 6.2 (Forum Client):**
- Reference UI patterns (HeatIndicator, ReplyTree styling)
- Type definitions (Thread, Reply, PoolState)

**External Dependencies:**
- Next.js 14 (App Router, SSR)
- lunr.js (full-text search)
- React 18

---

## ESTIMATED_COMPLEXITY: Medium

**REASON:**
- Most UI patterns exist in forum-client and can be adapted
- Search ranking algorithm is well-specified in CLIENT_DESIGN.md
- Next.js provides robust SSR infrastructure
- Main challenges:
  - Integrating with node for real-time data
  - Optimizing search index for performance
  - Ensuring proper SSR for all dynamic content

The complexity is manageable because:
1. Core data structures are defined (SPEC_02, SPEC_04)
2. UI patterns exist in forum-client reference
3. Ranking algorithm is fully specified with fixed weights
4. Next.js handles SSR complexity

---

## FILE SUMMARY:

### New Files to Create (28 files):

```
web-gateway/
├── package.json
├── tsconfig.json
├── next.config.js
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── public/
│   └── robots.txt
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Homepage with search
│   │   ├── about/page.tsx
│   │   ├── search/page.tsx
│   │   ├── spaces/page.tsx
│   │   ├── spaces/[spaceId]/page.tsx
│   │   ├── s/[space]/[postId]/page.tsx
│   │   ├── u/[address]/page.tsx
│   │   ├── sitemap.xml/route.ts
│   │   └── api/health/route.ts
│   ├── components/
│   │   ├── SearchBox.tsx
│   │   ├── SearchFilters.tsx
│   │   ├── SpaceCard.tsx
│   │   ├── SpaceActivitySummary.tsx
│   │   ├── IdentityCard.tsx
│   │   ├── AddressDisplay.tsx
│   │   ├── HeatIndicator.tsx
│   │   ├── ReadOnlyReplyTree.tsx
│   │   ├── PoolDisplay.tsx
│   │   ├── DecayVisualizer.tsx
│   │   ├── DownloadCTA.tsx
│   │   ├── DownloadBanner.tsx
│   │   ├── GatewayLayout.tsx
│   │   └── SEOHead.tsx
│   ├── lib/
│   │   ├── node-connection.ts
│   │   ├── config/gateway.ts
│   │   ├── seo.ts
│   │   ├── structured-data.ts
│   │   └── search/
│   │       ├── ranking.ts
│   │       ├── normalize.ts
│   │       ├── index.ts
│   │       ├── query-parser.ts
│   │       ├── filters.ts
│   │       └── identity.ts
│   ├── hooks/
│   │   └── useSearchParams.ts
│   ├── types/
│   │   ├── gateway.ts
│   │   ├── search.ts
│   │   ├── space.ts
│   │   └── identity.ts
│   ├── styles/
│   │   └── decay.css
│   └── middleware.ts

docs/
├── search-ranking.md
└── gateway-operation.md
```

---

[DECISION: plan_ready]
