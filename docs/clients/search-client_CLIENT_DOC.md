# Swimchain Search Client - Client Documentation

## Overview

The Swimchain Search Client is a Google-style search interface for discovering content across the Swimchain decentralized network. It provides full-text search capabilities for threads, spaces, replies, and users with advanced query syntax, autocomplete suggestions, and result highlighting.

**Target Users**: End users seeking to discover and explore content on the Swimchain network.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

## Architecture

### Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 18.2.0 |
| Language | TypeScript 5.3.0 |
| Build Tool | Vite 5.0.0 |
| Styling | CSS Modules with CSS Variables (dark theme) |
| State | React Context API + Custom Hooks |
| Routing | react-router-dom 6.20.0 |
| Testing | Vitest with React Testing Library |
| Crypto | @noble/curves, @noble/hashes (Ed25519) |

### Directory Structure

```
search-client/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── ResultCard/       # Search result card components
│   │   │   ├── ThreadResult.tsx
│   │   │   ├── SpaceResult.tsx
│   │   │   ├── ReplyResult.tsx
│   │   │   ├── UserResult.tsx
│   │   │   └── ResultCard.css
│   │   ├── SearchBar.tsx
│   │   ├── SearchResults.tsx
│   │   ├── SearchFilters.tsx
│   │   ├── Pagination.tsx
│   │   └── index.ts
│   ├── pages/                # Page components (routes)
│   │   ├── Home.tsx          # Search homepage
│   │   ├── Results.tsx       # Search results page
│   │   └── IdentityPage.tsx  # Identity management
│   ├── hooks/                # Custom React hooks
│   │   ├── useRpc.tsx        # RPC connection context
│   │   ├── useSearch.ts      # Main search state
│   │   ├── useSearchHistory.ts
│   │   ├── useSearchSuggestions.ts
│   │   ├── useParentRpcConfig.ts
│   │   └── index.ts
│   ├── lib/                  # Utilities and helpers
│   │   ├── rpc.ts            # Swimchain RPC client
│   │   ├── queryParser.ts    # Advanced search syntax parser
│   │   ├── highlighter.ts    # Search term highlighting
│   │   └── index.ts
│   ├── types/                # TypeScript type definitions
│   │   └── index.ts
│   ├── styles/               # Global styles
│   │   └── globals.css
│   ├── App.tsx               # Main app with routing
│   └── main.tsx              # Entry point with providers
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

### Provider Stack

```
React.StrictMode
└── ErrorBoundary
    └── SwimchainProvider (WASM initialization)
        └── RpcProvider (Connection management)
            └── IdentityProvider (Authentication)
                └── BrowserRouter
                    └── Routes
```

### Entry Points

- **Main**: `src/main.tsx`
- **App**: `src/App.tsx`
- **Routes**:
  - `/` - Home (search landing page)
  - `/search` - Results page with query params
  - `/identity` - Identity management page
  - `/space/:spaceId` - Redirect to forum-client
  - `/thread/:threadId` - Redirect to forum-client
  - `/user/:userId` - Redirect to forum-client

## Features

### 1. Full-Text Search
**Description**: Search across all content types on the Swimchain network with relevance-ranked results.
**User Flow**:
1. Enter search query in the search bar
2. Press Enter or click the search button
3. View results organized by type (All, Spaces, Threads, Replies, Users)
4. Click on result cards to navigate to content

**Components**: `SearchBar`, `SearchResults`, `useSearch`
**Status**: Complete

---

### 2. Advanced Search Syntax
**Description**: Google-style search operators for precise filtering.

**Supported Operators**:
| Operator | Example | Description |
|----------|---------|-------------|
| `"phrase"` | `"exact match"` | Match exact phrase |
| `author:` | `author:alice` | Filter by author |
| `space:` | `space:programming` | Filter by space |
| `type:` | `type:thread` | Filter by content type (thread, reply, space, user) |
| `before:` | `before:2024-01-01` | Content created before date |
| `after:` | `after:2024-06-01` | Content created after date |
| `has:media` | `has:media` | Content with attachments |
| `-term` | `-spam` | Exclude term from results |
| `replies:>N` | `replies:>10` | Minimum reply count |
| `reactions:>N` | `reactions:>50` | Minimum reaction count |

**Relative Date Formats**: `today`, `yesterday`, `7d`, `1w`, `1m`, `1y`

**Components**: `queryParser.ts`
**Status**: Complete

---

### 3. Search Autocomplete
**Description**: Real-time suggestions as you type with debounced API calls.
**User Flow**:
1. Start typing in the search bar
2. After 2+ characters, suggestions appear
3. Use arrow keys to navigate, Enter to select
4. Tab to autocomplete the selected suggestion

**Components**: `SearchBar`, `useSearchSuggestions`
**Status**: Complete

---

### 4. Search History
**Description**: Locally persisted search history with quick access.
**User Flow**:
1. Previous searches are shown when focusing empty search bar
2. Click on history item to re-execute search
3. Clear history from the home page

**Storage**: `localStorage['search-history']` (max 20 items)
**Components**: `useSearchHistory`, `Home`
**Status**: Complete

---

### 5. Trending Searches
**Description**: Display trending search topics from the network.
**Components**: `useTrendingSearches`, `Home`
**Fallback**: Static trending topics on API error
**Status**: Complete

---

### 6. Result Type Tabs
**Description**: Filter results by content type with tabbed navigation.
**Tabs**: All, Spaces, Threads, Replies, Users
**Components**: `SearchResults`
**Status**: Complete

---

### 7. Sort Options
**Description**: Sort results by different criteria.
**Options**:
- Relevance (default)
- Most Recent
- Most Reactions
- Most Replies

**Components**: `SearchFilters`, `useSearch`
**Status**: Complete

---

### 8. Search Term Highlighting
**Description**: Highlight matched search terms in result titles and snippets.
**Implementation**: React-safe highlighting using `highlightToReactParts()` which returns an array of text segments with highlight flags, avoiding `dangerouslySetInnerHTML`.
**Components**: `highlighter.ts`, Result card components
**Status**: Complete

---

### 9. Identity Management
**Description**: Create and manage cryptographic identity with PoW spam prevention.
**User Flow**:
1. Navigate to `/identity`
2. Generate new keypair
3. Complete Proof-of-Work mining (difficulty 20)
4. Save identity to localStorage
5. Identity is used for RPC signature authentication

**Components**: `IdentityPage`, identity hooks from `@swimchain/frontend`
**Status**: Complete

---

### 10. Deep Link Redirects
**Description**: Handle deep links to content by redirecting to forum-client.
**Routes**:
- `/space/:spaceId` → forum-client
- `/thread/:threadId` → forum-client
- `/user/:userId` → forum-client

**Components**: `RedirectToForum` (in App.tsx)
**Status**: Complete

---

### 11. Desktop Integration
**Description**: Support for Tauri desktop app and iframe embedding.
**Features**:
- Tauri auth via backend cookie file
- Parent frame RPC config via postMessage
- Automatic detection and connection

**Components**: `useParentRpcConfig`, `rpc.ts`
**Status**: Complete

## Components Reference

### SearchBar
**Location**: `src/components/SearchBar.tsx`
**Purpose**: Main search input with autocomplete dropdown and keyboard navigation.

**Props**:
| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| initialQuery | string | No | `''` | Initial search query |
| onSearch | (query: string) => void | Yes | - | Search submit callback |
| placeholder | string | No | `'Search posts, spaces, users...'` | Input placeholder |
| large | boolean | No | `false` | Use large homepage style |
| autoFocus | boolean | No | `false` | Auto-focus on mount |

**Keyboard Navigation**:
- `ArrowUp/Down` - Navigate suggestions
- `Enter` - Select suggestion or submit
- `Escape` - Close suggestions
- `Tab` - Autocomplete selected suggestion

**Usage**:
```tsx
<SearchBar
  initialQuery="rust programming"
  onSearch={(query) => navigate(`/search?q=${query}`)}
  placeholder="Search..."
  large
  autoFocus
/>
```

---

### SearchResults
**Location**: `src/components/SearchResults.tsx`
**Purpose**: Container for displaying search results with tabs, filters, and pagination.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| results | SearchResult[] | Yes | Array of search results |
| total | number | Yes | Total result count |
| loading | boolean | Yes | Loading state |
| error | string \| null | Yes | Error message |
| took | number | Yes | Search time in ms |
| query | string | Yes | Current search query |
| activeTab | SearchTab | Yes | Active result type tab |
| sortBy | SearchSortOption | Yes | Current sort order |
| onTabChange | (tab: SearchTab) => void | Yes | Tab change handler |
| onSortChange | (sort: SearchSortOption) => void | Yes | Sort change handler |
| onLoadMore | () => void | Yes | Pagination handler |
| hasMore | boolean | Yes | More results available |
| page | number | Yes | Current page number |
| searchTerms | string[] | Yes | Terms for highlighting |
| searchPhrases | string[] | Yes | Phrases for highlighting |

**Usage**:
```tsx
<SearchResults
  results={results}
  total={total}
  loading={loading}
  error={error}
  took={took}
  query={query}
  activeTab={activeTab}
  sortBy={sortBy}
  onTabChange={setActiveTab}
  onSortChange={setSortBy}
  onLoadMore={loadMore}
  hasMore={hasMore}
  page={page}
  searchTerms={terms}
  searchPhrases={phrases}
/>
```

---

### ThreadResult
**Location**: `src/components/ResultCard/ThreadResult.tsx`
**Purpose**: Display a thread/post search result card with highlighted title, metadata, and snippet.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| result | SearchResult | Yes | Search result with ThreadInfo data |
| searchTerms | string[] | Yes | Terms for highlighting |
| searchPhrases | string[] | Yes | Phrases for highlighting |

**Displays**: Type badge, title, space/author/time metadata, content snippet, reply/reaction counts, media indicator

---

### SpaceResult
**Location**: `src/components/ResultCard/SpaceResult.tsx`
**Purpose**: Display a space/community search result card.
**Props**: Same as ThreadResult
**Displays**: Type badge, name, space ID, description, thread/member counts, active status

---

### ReplyResult
**Location**: `src/components/ResultCard/ReplyResult.tsx`
**Purpose**: Display a reply/comment search result card.
**Props**: Same as ThreadResult
**Displays**: Type badge, parent thread context, author/time, content, reaction count

---

### UserResult
**Location**: `src/components/ResultCard/UserResult.tsx`
**Purpose**: Display a user/identity search result card.
**Props**: Same as ThreadResult
**Displays**: Type badge, avatar, name, verified badge, bio, post/reply/reaction stats

---

### SearchFilters
**Location**: `src/components/SearchFilters.tsx`
**Purpose**: Filter controls for sort order.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| sortBy | SearchSortOption | Yes | Current sort option |
| onSortChange | (sort: SearchSortOption) => void | Yes | Sort change handler |
| dateRange | 'any' \| 'day' \| 'week' \| 'month' \| 'year' | No | Date range filter |
| onDateRangeChange | (range: ...) => void | No | Date range handler |

---

### Pagination
**Location**: `src/components/Pagination.tsx`
**Purpose**: Page navigation with "Load More" functionality.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| page | number | Yes | Current page number |
| total | number | Yes | Total result count |
| resultsPerPage | number | Yes | Results per page (20) |
| onLoadMore | () => void | Yes | Load more handler |

## Hooks Reference

### useRpc
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Provides RPC client connection to the Swimchain node with automatic reconnection and identity-based signature authentication.

**Returns**:
```typescript
{
  rpc: SwimchainRpc | null;      // RPC client instance
  connected: boolean;            // Connection status
  connecting: boolean;           // Currently connecting
  error: string | null;          // Connection error
  nodeInfo: {                    // Node metadata
    version: string;
    network: string;
    peerCount: number;
  } | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
}
```

**Features**:
- Auto-connects on mount
- Retries every 5 seconds on failure
- Detects identity changes and reconnects
- Parent frame config support (desktop-app iframe)
- Tauri integration

**Usage**:
```tsx
const { rpc, connected, error } = useRpc();

if (!connected) {
  return <div>Connecting to node...</div>;
}

const results = await rpc.search({ query: 'test' });
```

---

### useSearch
**Location**: `src/hooks/useSearch.ts`
**Purpose**: Main search state management with query parsing, pagination, and result caching.

**Returns**:
```typescript
{
  // Results
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;
  took: number;               // Search time in ms

  // Current search state
  query: string;
  parsedQuery: ParsedQuery | null;
  filters: SearchFilters;
  activeTab: SearchTab;       // 'all' | 'spaces' | 'threads' | 'replies' | 'users'
  sortBy: SearchSortOption;

  // Actions
  search: (query: string, filters?: SearchFilters) => Promise<void>;
  setActiveTab: (tab: SearchTab) => void;
  setSortBy: (sort: SearchSortOption) => void;
  loadMore: () => Promise<void>;
  clear: () => void;

  // Pagination
  hasMore: boolean;
  page: number;
}
```

**Features**:
- Query parsing with `parseQuery()`
- Pagination (20 results per page)
- Request cancellation with AbortController
- Auto re-search on tab/sort change
- Adds queries to search history

**Usage**:
```tsx
const { results, loading, search, setActiveTab } = useSearch();

// Execute search
await search('rust programming type:thread');

// Change tab
setActiveTab('threads');
```

---

### useSearchHistory
**Location**: `src/hooks/useSearchHistory.ts`
**Purpose**: Local search history management persisted to localStorage.

**Returns**:
```typescript
{
  history: string[];
  addToHistory: (query: string) => void;
  removeFromHistory: (query: string) => void;
  clearHistory: () => void;
}
```

**Storage**: `localStorage['search-history']`
**Max Items**: 20 (oldest removed when exceeded)

**Usage**:
```tsx
const { history, addToHistory, clearHistory } = useSearchHistory();

// Add search to history
addToHistory('rust programming');

// Display recent searches
history.slice(0, 5).map(query => <HistoryItem query={query} />);
```

---

### useSearchSuggestions
**Location**: `src/hooks/useSearchSuggestions.ts`
**Purpose**: Debounced autocomplete suggestions from the node.

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| prefix | string | - | Current search input |
| debounceMs | number | 200 | Debounce delay |
| minLength | number | 2 | Minimum prefix length |

**Returns**:
```typescript
{
  suggestions: string[];
  loading: boolean;
  error: string | null;
}
```

**Usage**:
```tsx
const { suggestions, loading } = useSearchSuggestions(query, 200, 2);
```

---

### useTrendingSearches
**Location**: `src/hooks/useSearchSuggestions.ts`
**Purpose**: Fetch trending searches from the node.

**Returns**:
```typescript
{
  trending: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
```

**Fallback**: Static trending topics on error:
- cryptocurrency
- rust programming
- decentralized apps
- web3 development
- blockchain tutorials

---

### useNetworkStatus
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Fetch and poll network synchronization status.

**Returns**:
```typescript
{
  status: SyncStatus | null;
  loading: boolean;
  error: string | null;
}
```

**Polling**: Every 10 seconds

---

### useParentRpcConfig
**Location**: `src/hooks/useParentRpcConfig.ts`
**Purpose**: Receive RPC config from parent frame (desktop-app wrapper).

**Returns**: `ParentRpcConfig | null`
```typescript
interface ParentRpcConfig {
  rpcEndpoint: string;
  rpcAuth: string;
}
```

**Message Type**: `SWIMCHAIN_RPC_CONFIG`

## State Management

### Context Providers

#### SwimchainProvider (from @swimchain/frontend)
**Purpose**: Initialize WASM and provide loading state
**Wraps**: Entire application
**Props**: `fallback`, `onLoad`, `onError`

#### RpcProvider
**Purpose**: Provide RPC client to component tree
**Location**: `src/hooks/useRpc.tsx`
**Access**: `useRpc()` hook

#### IdentityProvider (from @swimchain/frontend)
**Purpose**: Provide identity context for authentication
**Access**: `useIdentityContext()` hook

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Search Data Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Types → SearchBar                                          │
│                  │                                               │
│                  ├── useSearchSuggestions (debounced)            │
│                  │       └── rpc.searchSuggest()                 │
│                  │                                               │
│                  └── onSearch(query)                             │
│                          │                                       │
│                          ▼                                       │
│                    useSearch hook                                │
│                          │                                       │
│            ┌─────────────┼─────────────┐                         │
│            │             │             │                         │
│            ▼             ▼             ▼                         │
│    parseQuery()    buildSearchParams  addToHistory               │
│            │             │                                       │
│            └─────────────┼─────────────┘                         │
│                          │                                       │
│                          ▼                                       │
│                   rpc.search(params)                             │
│                          │                                       │
│                          ▼                                       │
│               Swimchain Node (HTTP RPC)                          │
│                          │                                       │
│                          ▼                                       │
│               SearchResponse                                     │
│                          │                                       │
│                          ▼                                       │
│              SearchResults Component                             │
│                  │                                               │
│     ┌────────────┼────────────┬────────────┐                     │
│     ▼            ▼            ▼            ▼                     │
│ ThreadResult SpaceResult ReplyResult UserResult                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### State Locations

| State | Location | Persistence |
|-------|----------|-------------|
| RPC connection | RpcProvider context | Memory |
| Search results | useSearch hook | Memory |
| Search history | useSearchHistory | localStorage |
| Identity | IdentityProvider | localStorage |
| Parent config | Global variable | Memory |

## RPC Integration

### SwimchainRpc Class
**Location**: `src/lib/rpc.ts`
**Authentication**: Ed25519 signature-based auth using identity keypair.

**Signature Format**:
```
message = "swimchain-rpc:" + method + ":" + sha256(params_json) + ":" + timestamp
```

**Headers**:
- `X-CS-Identity`: Public key (hex)
- `X-CS-Timestamp`: Unix timestamp
- `X-CS-Signature`: Ed25519 signature (hex)

### Methods Used

| Method | Purpose | Component |
|--------|---------|-----------|
| `get_info` | Get node info (version, network, peers) | RpcProvider |
| `get_sync_status` | Get sync status | useNetworkStatus |
| `get_peers` | Get peer list | useNetworkStatus |
| `search` | Full-text search | useSearch |
| `search_suggest` | Autocomplete suggestions | useSearchSuggestions |
| `trending_searches` | Get trending queries | useTrendingSearches |
| `get_content` | Get content details | (available) |
| `get_space_info` | Get space details | (available) |
| `get_identity_info` | Get user details | (available) |

### Network Configurations

```typescript
// Local testnet (default)
const LOCAL_TESTNET = { endpoint: 'http://127.0.0.1:19736' };

// Local regtest
const LOCAL_REGTEST = { endpoint: 'http://127.0.0.1:29736' };

// Local mainnet
const LOCAL_MAINNET = { endpoint: 'http://127.0.0.1:9736' };

// Remote testnet seeds
const TESTNET_SEED_SF = { endpoint: 'http://64.225.115.108:8736' };
const TESTNET_SEED_NYC = { endpoint: 'http://104.236.106.124:8736' };
```

## Styling Guide

### Theme
The search client uses a dark theme with CSS custom properties defined in `src/styles/globals.css`.

### Key CSS Variables
```css
:root {
  --color-bg-primary: #0f0f1a;
  --color-bg-secondary: #1a1a2e;
  --color-text-primary: #ffffff;
  --color-text-secondary: #808080;
  --color-accent-primary: #00d4ff;
  --color-accent-secondary: #7b68ee;
  --color-accent-tertiary: #ff6b6b;
  --color-error: #f44336;
  --radius-sm: 4px;
  --radius-md: 8px;
}
```

### Component Styling
Each component has a co-located CSS file:
- `SearchBar.css`
- `SearchResults.css`
- `SearchFilters.css`
- `Pagination.css`
- `ResultCard/ResultCard.css`
- `Home.css`
- `Results.css`
- `IdentityPage.css`

## Testing

### Running Tests
```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Test Stack
- **Test Runner**: Vitest
- **DOM Library**: Happy DOM
- **Testing Library**: @testing-library/react, @testing-library/user-event

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_USE_REMOTE_SEED` | Use remote testnet seed instead of local node | `false` |
| `VITE_FORUM_CLIENT_URL` | URL for forum-client deep link redirects | `http://localhost:5173` |

### Build Configuration
- **Vite**: Fast development server and optimized production builds
- **TypeScript**: Strict mode enabled
- **Target**: ES2020+ browsers

## Type Definitions

### Core Types
```typescript
type SearchResultType = 'space' | 'thread' | 'reply' | 'user';
type SearchSortOption = 'relevance' | 'recent' | 'reactions' | 'replies';
type SearchTab = 'all' | 'spaces' | 'threads' | 'replies' | 'users';
```

### SearchResult
```typescript
interface SearchResult {
  id: string;
  type: SearchResultType;
  score: number;
  highlights: SearchHighlights;
  data: SpaceInfo | ThreadInfo | ReplyInfo | UserInfo;
}
```

### Content Types
```typescript
interface SpaceInfo {
  spaceId: string;
  name: string;
  description?: string;
  threadCount: number;
  memberCount: number;
  lastActivity: number;
  isActive: boolean;
}

interface ThreadInfo {
  contentId: string;
  spaceId: string;
  spaceName?: string;
  authorId: string;
  authorName?: string;
  title: string;
  body: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  reactionCount: number;
  hasMedia: boolean;
}

interface ReplyInfo {
  contentId: string;
  parentId: string;
  threadId: string;
  threadTitle?: string;
  spaceId: string;
  spaceName?: string;
  authorId: string;
  authorName?: string;
  body: string;
  createdAt: number;
  reactionCount: number;
}

interface UserInfo {
  identityId: string;
  displayName?: string;
  bio?: string;
  postCount: number;
  replyCount: number;
  reactionsReceived: number;
  createdAt: number;
  isVerified: boolean;
}
```

### StoredIdentity
```typescript
interface StoredIdentity {
  address: string;       // cs1... bech32m address
  publicKey: string;     // Hex-encoded public key
  seed: string;          // Hex-encoded private key
  createdAt: number;     // UNIX timestamp
  powSolution?: {
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}
```

## Known Issues & Limitations

1. **No offline mode**: Requires active connection to Swimchain node
2. **No result caching**: Results are fetched fresh on each search (no client-side cache)
3. **Date range filter UI**: Props exist in SearchFilters but not fully wired to Results page
4. **Network status display**: Hook exists (`useNetworkStatus`) but no UI component rendered
5. **Result card actions**: View buttons rendered but rely on deep link redirects to forum-client

## Future Improvements

1. **Result caching**: Add client-side caching for recently viewed results
2. **Saved searches**: Allow users to save frequent searches
3. **Advanced filters UI**: Expose date range and other filters in the UI
4. **Search analytics**: Track popular searches locally
5. **Offline support**: Cache recent results for offline viewing
6. **Voice search**: Add voice input for search queries
7. **Search within results**: Filter current results without new RPC call
8. **Export results**: Allow exporting search results to JSON/CSV
9. **Keyboard shortcuts**: Add `/` to focus search for power users
10. **Unit tests**: Add tests for query parser and highlighter utilities
