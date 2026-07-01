# Search Client Design

A Google-style search interface for discovering content across the Swimchain network.

## Overview

The search-client provides a unified search experience across all blockchain content:
- **Spaces** - Find communities by name, description, topic
- **Threads** - Search post titles and content
- **Replies** - Deep search into discussion threads
- **Users** - Find identities by display name or public key

## Data Model Mapping

| Search Concept | Swimchain Entity |
|----------------|------------------|
| Document | Thread/Reply/Space |
| Author | Identity public key |
| Category | Space |
| Tags | Space topics, content keywords |
| Timestamp | Block timestamp |
| Engagement | Reaction counts, reply counts |

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  🏊 Swimchain Search                              [Identity] [☰]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                     ┌─────────────────────────────┐                 │
│                     │ 🔍 Search posts, spaces...  │                 │
│                     └─────────────────────────────┘                 │
│                                                                     │
│              [All]  [Spaces]  [Threads]  [Replies]  [Users]         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Trending Searches                                            │   │
│  │ • cryptocurrency discussions  • rust programming             │   │
│  │ • swimchain tutorials        • decentralized apps            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Recent Searches                    [Clear History]           │   │
│  │ • "how to create space"  • "identity management"             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Search Results View

```
┌─────────────────────────────────────────────────────────────────────┐
│  🏊 Swimchain Search                              [Identity] [☰]    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 🔍 rust async programming                              [×]   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [All]  [Spaces]  [•Threads•]  [Replies]  [Users]                   │
│                                                                     │
│  About 47 results (0.23 seconds)                                    │
│                                                                     │
│  ┌─ Filters ──────────────────────────────────────────────────┐    │
│  │ Time: [Any ▾]  Space: [Any ▾]  Sort: [Relevance ▾]         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 📄 THREAD                                                    │   │
│  │ Understanding Async/Await in Rust                            │   │
│  │ sp1programming... • alice.swim • 2 days ago                  │   │
│  │                                                              │   │
│  │ A comprehensive guide to **async** **programming** in       │   │
│  │ **Rust**. We'll cover tokio, futures, and common patterns...│   │
│  │                                                              │   │
│  │ 💬 23 replies  ❤️ 45  👍 12                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 📄 THREAD                                                    │   │
│  │ Tokio vs async-std: Which to Choose?                         │   │
│  │ sp1rustdev... • bob.swim • 5 days ago                        │   │
│  │                                                              │   │
│  │ Comparing the two major **async** runtimes for **Rust**...   │   │
│  │                                                              │   │
│  │ 💬 67 replies  ❤️ 89  👍 34                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 💬 REPLY  in "Rust Error Handling Best Practices"            │   │
│  │ charlie.swim • 1 week ago                                    │   │
│  │                                                              │   │
│  │ When dealing with **async** code, you need to be careful     │   │
│  │ about error propagation. In **Rust**, the ? operator...      │   │
│  │                                                              │   │
│  │ ↳ View in thread                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ────────────────────────────────────────────────────────────────  │
│  [1] [2] [3] [4] [5] ... [10]  Next →                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Space Search Results

```
┌─────────────────────────────────────────────────────────────────────┐
│  [All]  [•Spaces•]  [Threads]  [Replies]  [Users]                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 🏠 SPACE                                                     │   │
│  │ Rust Programming                                             │   │
│  │ sp1abc123...                                                 │   │
│  │                                                              │   │
│  │ A community for Rust developers. Discuss the language,       │   │
│  │ share projects, ask questions, and help others learn.        │   │
│  │                                                              │   │
│  │ 📝 1,234 threads  👥 567 members  🔥 Active                  │   │
│  │                                                              │   │
│  │ [View Space]  [Follow]                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 🏠 SPACE                                                     │   │
│  │ Async Rust Patterns                                          │   │
│  │ sp1def456...                                                 │   │
│  │                                                              │   │
│  │ Deep dives into async/await patterns, tokio internals,       │   │
│  │ and building high-performance async applications.            │   │
│  │                                                              │   │
│  │ 📝 234 threads  👥 89 members  📈 Growing                    │   │
│  │                                                              │   │
│  │ [View Space]  [Follow]                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## User Search Results

```
┌─────────────────────────────────────────────────────────────────────┐
│  [All]  [Spaces]  [Threads]  [Replies]  [•Users•]                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 👤 USER                                                      │   │
│  │ alice.swim                                                   │   │
│  │ sw1alice789...                                               │   │
│  │                                                              │   │
│  │ Rust enthusiast, async expert, Swimchain core contributor.   │   │
│  │                                                              │   │
│  │ 📝 456 posts  💬 1,234 replies  ⭐ 5,678 reactions received  │   │
│  │                                                              │   │
│  │ [View Profile]  [Message]  [Follow]                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Advanced Search Syntax

Support Google-like search operators:

| Operator | Example | Description |
|----------|---------|-------------|
| `"..."` | `"exact phrase"` | Match exact phrase |
| `author:` | `author:alice` | Filter by author name/key |
| `space:` | `space:programming` | Filter by space |
| `type:` | `type:thread` | Filter by content type |
| `before:` | `before:2024-01-01` | Content before date |
| `after:` | `after:2024-06-01` | Content after date |
| `has:` | `has:media` | Content with attachments |
| `-` | `-spam` | Exclude term |
| `OR` | `rust OR golang` | Match either term |
| `replies:` | `replies:>10` | Min reply count |
| `reactions:` | `reactions:>50` | Min reaction count |

### Example Queries

```
rust async "error handling" author:alice
→ Posts by alice about rust async error handling

type:space programming -beginner
→ Programming spaces, excluding beginner ones

blockchain after:2024-01-01 replies:>20
→ Popular blockchain discussions from 2024

"swimchain tutorial" has:media
→ Tutorials with images/media attached
```

---

## Component Architecture

### Phase 1: Core Search

```
src/
├── components/
│   ├── SearchBar.tsx           # Main search input with suggestions
│   ├── SearchSuggestions.tsx   # Autocomplete dropdown
│   ├── SearchFilters.tsx       # Filter controls
│   ├── SearchResults.tsx       # Results container
│   ├── ResultCard/
│   │   ├── ThreadResult.tsx    # Thread result card
│   │   ├── ReplyResult.tsx     # Reply result card
│   │   ├── SpaceResult.tsx     # Space result card
│   │   └── UserResult.tsx      # User result card
│   ├── Pagination.tsx          # Page navigation
│   └── SearchHistory.tsx       # Recent searches
├── hooks/
│   ├── useSearch.ts            # Main search hook
│   ├── useSearchSuggestions.ts # Autocomplete
│   ├── useSearchHistory.ts     # Local history
│   └── useRpc.tsx              # Shared RPC hook
├── lib/
│   ├── rpc.ts                  # RPC client (shared)
│   ├── queryParser.ts          # Parse advanced syntax
│   └── highlighter.ts          # Highlight matches in results
├── pages/
│   ├── Home.tsx                # Search homepage
│   └── Results.tsx             # Search results page
└── stores/
    └── searchStore.ts          # Search state management
```

### Phase 2: Enhanced Features

```
src/
├── components/
│   ├── AdvancedSearch.tsx      # Advanced search modal
│   ├── SavedSearches.tsx       # Saved search queries
│   ├── SearchAlerts.tsx        # Notifications for new matches
│   └── TrendingSearches.tsx    # Popular searches
├── hooks/
│   ├── useSavedSearches.ts     # Persist saved queries
│   └── useSearchAlerts.ts      # Alert subscriptions
└── pages/
    └── Alerts.tsx              # Manage search alerts
```

---

## RPC Methods Required

### Existing Methods (reuse from forum-client)
- `get_space_info` - Space details
- `get_thread` - Thread content
- `get_replies` - Reply content
- `get_identity_info` - User profiles

### New Search Methods

```typescript
// Full-text search across all content types
interface SearchParams {
  query: string;
  types?: ('space' | 'thread' | 'reply' | 'user')[];
  spaceId?: string;
  author?: string;
  afterTimestamp?: number;
  beforeTimestamp?: number;
  hasMedia?: boolean;
  minReplies?: number;
  minReactions?: number;
  sortBy?: 'relevance' | 'recent' | 'reactions' | 'replies';
  limit?: number;
  offset?: number;
}

interface SearchResult {
  id: string;
  type: 'space' | 'thread' | 'reply' | 'user';
  score: number;           // Relevance score
  highlights: {            // Matched text snippets
    title?: string;
    content?: string;
    name?: string;
  };
  // Type-specific data
  data: SpaceInfo | ThreadInfo | ReplyInfo | UserInfo;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  took_ms: number;
  suggestions?: string[];  // "Did you mean..."
}

// RPC method
rpc_search(params: SearchParams): Promise<SearchResponse>

// Autocomplete suggestions
rpc_search_suggest(prefix: string, limit?: number): Promise<string[]>

// Trending searches (last 24h)
rpc_trending_searches(limit?: number): Promise<string[]>
```

---

## Hooks

### useSearch

```typescript
interface UseSearchResult {
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;
  took: number;

  search: (query: string, filters?: SearchFilters) => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

function useSearch(): UseSearchResult {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [offset, setOffset] = useState(0);

  const search = useCallback(async (q: string, f?: SearchFilters) => {
    setQuery(q);
    setFilters(f || {});
    setOffset(0);

    const parsed = parseQuery(q); // Handle advanced syntax
    const response = await rpcSearch({
      ...parsed,
      ...f,
      offset: 0,
      limit: 20,
    });

    setResults(response.results);
  }, []);

  const loadMore = useCallback(async () => {
    const newOffset = offset + 20;
    const response = await rpcSearch({
      query,
      ...filters,
      offset: newOffset,
      limit: 20,
    });

    setResults(prev => [...prev, ...response.results]);
    setOffset(newOffset);
  }, [query, filters, offset]);

  return { results, search, loadMore, ... };
}
```

### useSearchSuggestions

```typescript
function useSearchSuggestions(prefix: string, debounceMs = 200) {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (prefix.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const results = await rpcSearchSuggest(prefix, 8);
      setSuggestions(results);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [prefix, debounceMs]);

  return suggestions;
}
```

### useSearchHistory

```typescript
function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('search-history');
    if (stored) setHistory(JSON.parse(stored));
  }, []);

  const addToHistory = useCallback((query: string) => {
    setHistory(prev => {
      const filtered = prev.filter(q => q !== query);
      const updated = [query, ...filtered].slice(0, 20);
      localStorage.setItem('search-history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('search-history');
  }, []);

  return { history, addToHistory, clearHistory };
}
```

---

## Query Parser

Parse advanced search syntax into structured params:

```typescript
// src/lib/queryParser.ts

interface ParsedQuery {
  terms: string[];           // Plain search terms
  phrases: string[];         // "exact phrases"
  author?: string;
  space?: string;
  type?: string;
  before?: number;
  after?: number;
  hasMedia?: boolean;
  minReplies?: number;
  minReactions?: number;
  excludeTerms: string[];
}

function parseQuery(input: string): ParsedQuery {
  const result: ParsedQuery = {
    terms: [],
    phrases: [],
    excludeTerms: [],
  };

  // Extract quoted phrases
  const phraseRegex = /"([^"]+)"/g;
  let match;
  while ((match = phraseRegex.exec(input)) !== null) {
    result.phrases.push(match[1]);
  }
  input = input.replace(phraseRegex, '');

  // Extract operators
  const operatorRegex = /(\w+):(\S+)/g;
  while ((match = operatorRegex.exec(input)) !== null) {
    const [, op, value] = match;
    switch (op) {
      case 'author':
        result.author = value;
        break;
      case 'space':
        result.space = value;
        break;
      case 'type':
        result.type = value;
        break;
      case 'before':
        result.before = Date.parse(value);
        break;
      case 'after':
        result.after = Date.parse(value);
        break;
      case 'has':
        if (value === 'media') result.hasMedia = true;
        break;
      case 'replies':
        result.minReplies = parseComparison(value);
        break;
      case 'reactions':
        result.minReactions = parseComparison(value);
        break;
    }
  }
  input = input.replace(operatorRegex, '');

  // Extract exclusions
  const excludeRegex = /-(\S+)/g;
  while ((match = excludeRegex.exec(input)) !== null) {
    result.excludeTerms.push(match[1]);
  }
  input = input.replace(excludeRegex, '');

  // Remaining words are search terms
  result.terms = input.trim().split(/\s+/).filter(Boolean);

  return result;
}

function parseComparison(value: string): number {
  // Handle >10, <5, >=20, etc.
  const match = value.match(/^([<>]=?)(\d+)$/);
  if (match) {
    return parseInt(match[2], 10);
  }
  return parseInt(value, 10);
}
```

---

## Result Highlighting

Highlight matched terms in search results:

```typescript
// src/lib/highlighter.ts

function highlightMatches(
  text: string,
  terms: string[],
  phrases: string[]
): string {
  let result = text;

  // Highlight phrases first (they're longer)
  for (const phrase of phrases) {
    const regex = new RegExp(`(${escapeRegex(phrase)})`, 'gi');
    result = result.replace(regex, '**$1**');
  }

  // Then highlight individual terms
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    result = result.replace(regex, '**$1**');
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

---

## Routes

```typescript
// src/App.tsx

<Routes>
  {/* Search home - big search bar, trending, history */}
  <Route path="/" element={<Home />} />

  {/* Search results with query in URL */}
  <Route path="/search" element={<Results />} />
  {/* Example: /search?q=rust+async&type=thread&sort=recent */}

  {/* Advanced search builder */}
  <Route path="/advanced" element={<AdvancedSearch />} />

  {/* Saved searches (requires identity) */}
  <Route path="/saved" element={<SavedSearches />} />

  {/* Search alerts (requires identity) */}
  <Route path="/alerts" element={<Alerts />} />

  {/* Deep links to content (redirect to forum-client) */}
  <Route path="/space/:spaceId" element={<RedirectToForum />} />
  <Route path="/thread/:threadId" element={<RedirectToForum />} />
  <Route path="/user/:userId" element={<RedirectToForum />} />
</Routes>
```

---

## State Management

```typescript
// src/stores/searchStore.ts

interface SearchState {
  // Current search
  query: string;
  filters: SearchFilters;
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;

  // Pagination
  offset: number;
  hasMore: boolean;

  // UI state
  activeTab: 'all' | 'spaces' | 'threads' | 'replies' | 'users';
  sortBy: 'relevance' | 'recent' | 'reactions' | 'replies';

  // History & suggestions
  recentSearches: string[];
  suggestions: string[];
}

const searchStore = create<SearchState>((set, get) => ({
  query: '',
  filters: {},
  results: [],
  total: 0,
  loading: false,
  error: null,
  offset: 0,
  hasMore: false,
  activeTab: 'all',
  sortBy: 'relevance',
  recentSearches: [],
  suggestions: [],

  search: async (query: string) => {
    set({ loading: true, query, offset: 0 });

    try {
      const parsed = parseQuery(query);
      const { activeTab, sortBy, filters } = get();

      const response = await rpcSearch({
        ...parsed,
        ...filters,
        types: activeTab === 'all' ? undefined : [activeTab],
        sortBy,
        limit: 20,
        offset: 0,
      });

      set({
        results: response.results,
        total: response.total,
        hasMore: response.results.length < response.total,
        loading: false,
        error: null,
      });

      // Add to history
      const { recentSearches } = get();
      const updated = [query, ...recentSearches.filter(q => q !== query)].slice(0, 20);
      set({ recentSearches: updated });
      localStorage.setItem('search-history', JSON.stringify(updated));

    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Search failed'
      });
    }
  },

  loadMore: async () => {
    const { query, filters, results, offset, activeTab, sortBy } = get();
    const newOffset = offset + 20;

    const response = await rpcSearch({
      ...parseQuery(query),
      ...filters,
      types: activeTab === 'all' ? undefined : [activeTab],
      sortBy,
      limit: 20,
      offset: newOffset,
    });

    set({
      results: [...results, ...response.results],
      offset: newOffset,
      hasMore: results.length + response.results.length < response.total,
    });
  },
}));
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search bar |
| `Enter` | Submit search |
| `↑` / `↓` | Navigate suggestions |
| `Esc` | Clear search / close suggestions |
| `Tab` | Accept suggestion |
| `Ctrl+Enter` | Open first result |
| `1-9` | Open Nth result |

---

## Implementation Phases

### Phase 1: Basic Search (Week 1)
- [ ] SearchBar component with input
- [ ] Basic RPC search integration
- [ ] Results list with ThreadResult, SpaceResult cards
- [ ] Type tabs (All, Spaces, Threads, Replies, Users)
- [ ] Basic pagination

### Phase 2: Advanced Features (Week 2)
- [ ] Query parser for advanced syntax
- [ ] Search filters UI
- [ ] Result highlighting
- [ ] Sort options
- [ ] URL-based search state

### Phase 3: Suggestions & History (Week 3)
- [ ] Autocomplete suggestions
- [ ] Search history (localStorage)
- [ ] Trending searches
- [ ] "Did you mean..." suggestions

### Phase 4: Saved Searches & Alerts (Week 4)
- [ ] Saved search queries
- [ ] Search alerts (notify on new matches)
- [ ] Export search results

---

## Styling

Google-inspired clean design:

```css
/* Variables */
:root {
  --search-bg: #ffffff;
  --search-border: #dfe1e5;
  --search-shadow: 0 1px 6px rgba(32, 33, 36, 0.28);
  --result-title: #1a0dab;
  --result-url: #006621;
  --result-snippet: #545454;
  --highlight-bg: #fff9c4;
}

/* Search bar */
.search-bar {
  max-width: 584px;
  margin: 0 auto;
  background: var(--search-bg);
  border: 1px solid var(--search-border);
  border-radius: 24px;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-bar:hover,
.search-bar:focus-within {
  box-shadow: var(--search-shadow);
  border-color: transparent;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
}

/* Result cards */
.result-card {
  padding: 16px 0;
  border-bottom: 1px solid #ebebeb;
}

.result-title {
  color: var(--result-title);
  font-size: 18px;
  text-decoration: none;
}

.result-title:hover {
  text-decoration: underline;
}

.result-url {
  color: var(--result-url);
  font-size: 14px;
  margin: 4px 0;
}

.result-snippet {
  color: var(--result-snippet);
  font-size: 14px;
  line-height: 1.58;
}

.result-snippet strong {
  background: var(--highlight-bg);
  font-weight: 600;
}

/* Type tabs */
.search-tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid #ebebeb;
  margin-bottom: 16px;
}

.search-tab {
  padding: 12px 0;
  color: #5f6368;
  font-size: 14px;
  cursor: pointer;
  border-bottom: 3px solid transparent;
}

.search-tab.active {
  color: #1a73e8;
  border-bottom-color: #1a73e8;
}
```

---

## Mobile Considerations

- Full-width search bar on mobile
- Swipeable type tabs
- Infinite scroll instead of pagination
- Voice search button (if browser supports)
- Filter sheet slides up from bottom

---

## Performance Optimizations

1. **Debounced suggestions** - 200ms delay before fetching
2. **Search result caching** - Cache recent queries in memory
3. **Lazy load result details** - Fetch full content on hover/click
4. **Virtual scrolling** - For very long result lists
5. **Prefetch next page** - Load page 2 while viewing page 1

---

## Search Indexing (Backend Consideration)

For efficient search, the Rust node should maintain:

1. **Inverted index** - Term → Document IDs
2. **Trigram index** - For partial/fuzzy matching
3. **Field-specific indexes** - Title, content, author
4. **Timestamp index** - For date range queries

Consider using `tantivy` (Rust full-text search library) for indexing.

---

## Future Enhancements

- **Semantic search** - Understand query intent
- **Spelling correction** - "Did you mean..."
- **Related searches** - Suggestions based on results
- **Search within results** - Refine current result set
- **Image search** - Find content by attached images
- **Code search** - Syntax-aware code snippet search
