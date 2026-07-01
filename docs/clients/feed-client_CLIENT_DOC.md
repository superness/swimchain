# Feed Client - Client Documentation

## Overview

The **Feed Client** (`@swimchain/feed-client`) is a social media-style curated feed application for the Swimchain decentralized network. It provides users with an aggregated view of content from spaces they follow, similar to Twitter/X or Reddit home feeds.

**Target Users:**
- End users who want a personalized content experience
- Users who follow multiple spaces and want unified viewing
- Mobile and desktop users seeking a familiar social media interface

**Key Capabilities:**
- Aggregated feed from followed spaces
- Space discovery and following
- PoW-validated identity creation
- Infinite scroll with client-side pagination
- Multi-layer caching (memory, localStorage, IndexedDB)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run tests
pnpm test

# Run linting
pnpm lint
```

**Default Development URL:** `http://localhost:5173`
**Default RPC Endpoint:** `localhost:19736` (testnet)

## Architecture

### Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Framework | React 18.2 | UI components |
| Language | TypeScript 5.3 | Type safety |
| Build Tool | Vite 5.0 | Fast development & bundling |
| Styling | Plain CSS + CSS Variables | BEM naming convention |
| State | React Context API | 3 providers (WASM, RPC, Identity) |
| Routing | react-router-dom 6.20 | Client-side routing |
| Testing | Vitest + React Testing Library | Unit & integration tests |

### Directory Structure

```
src/
├── components/         # Reusable UI components
│   ├── FeedCard.tsx       # Individual post card
│   ├── FeedList.tsx       # Scrollable feed container
│   ├── FollowButton.tsx   # Follow/unfollow with dropdown
│   ├── AddressDisplay.tsx # Address truncation + copy
│   ├── CreatePostFAB.tsx  # Floating action button
│   ├── IdentityCard.tsx   # User identity display
│   ├── PowProgress.tsx    # PoW mining progress
│   ├── ErrorBoundary.tsx  # Error catching
│   ├── Loading.tsx        # WASM init screen
│   └── index.ts           # Barrel exports
├── pages/              # Route page components
│   ├── Feed.tsx           # Main feed view
│   ├── Discover.tsx       # Space discovery
│   └── IdentityPage.tsx   # Identity management
├── hooks/              # Custom React hooks
│   ├── useRpc.tsx         # RPC client & data fetching
│   ├── useFeed.ts         # Feed aggregation
│   ├── useFeedPreferences.ts  # Follow/save preferences
│   ├── useStoredIdentity.ts   # Identity persistence
│   ├── useStoredKeypair.ts    # WASM keypair bridge
│   ├── useKeypair.ts      # Keypair generation
│   ├── usePow.ts          # PoW mining
│   ├── useParentRpcConfig.ts  # iframe config
│   └── index.ts           # Barrel exports
├── lib/                # Utilities and helpers
│   ├── rpc.ts             # SwimchainRpc class
│   ├── cache.ts           # Multi-layer caching
│   ├── action-pow.ts      # Action PoW utilities
│   └── encryption.ts      # Encryption helpers
├── providers/          # Context providers
│   ├── SwimchainProvider.tsx  # WASM loading
│   └── IdentityProvider.tsx   # Global identity
├── types/              # TypeScript definitions
│   ├── feed.ts            # Feed-specific types
│   └── index.ts           # Core types
├── wasm/               # WebAssembly modules
│   ├── loader.ts          # WASM loader
│   ├── chainsocial_wasm.js    # WASM bindings
│   ├── chainsocial_wasm.d.ts  # TypeScript declarations
│   └── chainsocial_wasm_bg.wasm  # WASM binary
├── styles/             # Global styles
│   ├── globals.css        # CSS variables & resets
│   └── app.css            # Layout & navigation
├── App.tsx             # Main app with router
├── main.tsx            # Entry point
└── vite-env.d.ts       # Vite type declarations
```

### Provider Hierarchy

```
main.tsx
└── React.StrictMode
    └── ErrorBoundary
        └── SwimchainProvider (WASM)
            ├── LoadingScreen (fallback)
            └── RpcProvider
                └── App
                    └── IdentityProvider
                        └── BrowserRouter
                            ├── Header
                            ├── Routes
                            │   ├── Feed
                            │   ├── Discover
                            │   ├── IdentityPage
                            │   └── ComingSoon (placeholders)
                            └── MobileNav
```

## Features

### Feed Aggregation
**Description**: Combines content from all followed spaces into a unified feed with deduplication
**User Flow**:
1. User navigates to home (`/`)
2. Feed fetches content from all non-muted followed spaces in parallel
3. Content deduplicated by ID and sorted by selected criteria
4. Posts displayed as cards with infinite scroll

**Components**: `Feed`, `FeedList`, `FeedCard`
**Hooks**: `useFeed`, `useFeedPreferences`
**Status**: Complete

---

### Feed Sorting & Filtering
**Description**: Sort by recency or engagement; filter by content source type
**User Flow**:
1. User clicks "Recent" or "Hot" toggle
2. Feed re-sorts without network refetch
3. User selects filter dropdown (All/Spaces/Users)
4. Feed filters client-side

**Components**: `Feed` (sort/filter controls)
**Hooks**: `useFeed({ sortOrder, filter })`
**Status**: Complete

---

### Infinite Scroll
**Description**: Automatic pagination as user scrolls
**User Flow**:
1. User scrolls toward bottom of feed
2. IntersectionObserver triggers 200px before end
3. Next page of content loaded automatically
4. New items appended seamlessly

**Components**: `FeedList` (observer setup)
**Hooks**: `useFeed().loadMore()`
**Status**: Complete

---

### Space Discovery
**Description**: Browse and search available spaces to follow
**User Flow**:
1. User navigates to `/discover`
2. Spaces loaded from network, sorted by activity
3. Search filters results in real-time
4. "Suggested" shows unfollowed spaces
5. "Following" shows tracked spaces

**Components**: `Discover`, `SpaceCard` (internal)
**Hooks**: `useSpaces()`, `useFeedPreferences()`
**RPC**: `listSpaces`
**Status**: Complete

---

### Follow/Unfollow Spaces
**Description**: Subscribe to space content for feed aggregation
**User Flow**:
1. User clicks "+ Follow" button
2. Button changes to "Following" with dropdown
3. Space added to preferences, content appears in feed
4. Dropdown allows Mute or Unfollow

**Components**: `FollowButton`
**Hooks**: `useFeedPreferences().followSpace()`, `useFollowSpace()`
**Status**: Complete

---

### Identity Creation with PoW
**Description**: Create cryptographic identity validated by proof-of-work mining
**User Flow**:
1. User navigates to `/identity`
2. Clicks "Generate Identity" - keypair created via WASM
3. Address preview shown (bech32m format: `cs1...`)
4. Clicks "Start Mining PoW"
5. Progress displayed (attempts, time, hash rate)
6. On completion, clicks "Save Identity"
7. Identity stored to localStorage

**Components**: `IdentityPage`, `PowProgress`, `AddressDisplay`
**Hooks**: `useKeypair`, `usePow`, `useIdentityContext`
**Status**: Complete

---

### Save Posts
**Description**: Bookmark posts locally for later viewing
**User Flow**:
1. User clicks bookmark icon on post card
2. Icon fills to indicate saved state
3. Post ID stored in preferences
4. Click again to unsave

**Components**: `FeedCard`
**Hooks**: `useFeedPreferences().savePost()`
**Status**: Complete (save works; `/saved` page is placeholder)

---

### Decay Indicators
**Description**: Visual representation of content freshness and survival probability
**User Flow**:
1. Each post shows colored decay bar
2. Green = Protected, Blue = Active, Yellow = Stale, Red = Decayed
3. Users can see which content needs engagement

**Components**: `FeedCard` (decay bar)
**Status**: Complete

---

### Post Creation (Placeholder)
**Description**: Create new posts (not yet implemented)
**User Flow**: FAB button navigates to `/compose` placeholder

**Components**: `CreatePostFAB`
**Status**: Placeholder

---

### User Profiles (Placeholder)
**Description**: View user profiles (not yet implemented)
**User Flow**: Profile links navigate to placeholder page

**Status**: Placeholder

## Components Reference

### FeedCard
**Location**: `src/components/FeedCard.tsx`
**Purpose**: Displays individual post with author info, content, media, and actions

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| item | `FeedItem` | Yes | Post data object |
| compact | `boolean` | No | Smaller card mode (default: false) |
| onSave | `(id: string) => void` | No | Save callback |
| onUnsave | `(id: string) => void` | No | Unsave callback |
| isSaved | `boolean` | No | Whether post is saved |

**Usage**:
```tsx
<FeedCard
  item={post}
  compact={false}
  isSaved={savedPosts.has(post.id)}
  onSave={(id) => savePost(id)}
  onUnsave={(id) => unsavePost(id)}
/>
```

**Features**:
- Avatar with initials (consistent color from author ID)
- Relative time display ("2h", "3d")
- Content truncation with expand/collapse
- Media grid (up to 4 images)
- Decay state indicator bar
- Reaction/reply/share/save buttons

---

### FeedList
**Location**: `src/components/FeedList.tsx`
**Purpose**: Scrollable container with infinite scroll via IntersectionObserver

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| items | `FeedItem[]` | Yes | Posts to display |
| loading | `boolean` | Yes | Initial loading state |
| error | `string \| null` | Yes | Error message |
| hasMore | `boolean` | Yes | More pages available |
| onLoadMore | `() => void` | Yes | Load next page callback |
| compact | `boolean` | No | Compact card mode |
| onSavePost | `(id: string) => void` | No | Save callback |
| onUnsavePost | `(id: string) => void` | No | Unsave callback |
| savedPosts | `Set<string>` | No | Set of saved post IDs |
| emptyStateType | `'no-follows' \| 'no-posts' \| 'error'` | No | Empty state variant |

**Usage**:
```tsx
<FeedList
  items={feedItems}
  loading={loading}
  error={error}
  hasMore={hasMore}
  onLoadMore={loadMore}
  savedPosts={savedPostIds}
  onSavePost={savePost}
  onUnsavePost={unsavePost}
/>
```

---

### FollowButton
**Location**: `src/components/FollowButton.tsx`
**Purpose**: Follow/unfollow button with dropdown for mute/unfollow options

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| isFollowing | `boolean` | Yes | Current follow state |
| isMuted | `boolean` | No | Current mute state |
| loading | `boolean` | No | Loading indicator |
| onToggleFollow | `() => void` | Yes | Toggle follow callback |
| onToggleMute | `() => void` | No | Toggle mute callback |
| size | `'small' \| 'medium' \| 'large'` | No | Button size |
| variant | `'default' \| 'outline'` | No | Visual variant |
| className | `string` | No | Additional CSS classes |

**Usage**:
```tsx
<FollowButton
  isFollowing={isFollowing}
  isMuted={isMuted}
  onToggleFollow={() => toggleFollow(spaceId)}
  onToggleMute={() => toggleMute(spaceId)}
/>
```

---

### AddressDisplay
**Location**: `src/components/AddressDisplay.tsx`
**Purpose**: Truncated address display with copy-to-clipboard

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| address | `string` | Yes | Full address (cs1...) |
| chars | `number` | No | Characters to show (default: 6) |
| showCopy | `boolean` | No | Show copy button (default: true) |
| className | `string` | No | Additional CSS classes |

**Usage**:
```tsx
<AddressDisplay address="cs1abc123..." chars={8} />
```

---

### PowProgress
**Location**: `src/components/PowProgress.tsx`
**Purpose**: Mining progress display with statistics and tips

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| attempts | `number` | Yes | Hash attempts so far |
| elapsedMs | `number` | Yes | Elapsed time in ms |
| difficulty | `number` | Yes | Target difficulty |
| onCancel | `() => void` | Yes | Cancel mining callback |

**Usage**:
```tsx
<PowProgress
  attempts={attempts}
  elapsedMs={elapsedMs}
  difficulty={20}
  onCancel={() => cancel()}
/>
```

---

### IdentityCard
**Location**: `src/components/IdentityCard.tsx`
**Purpose**: User identity display card with avatar and details

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| identity | `StoredIdentity` | Yes | User identity object |

**Usage**:
```tsx
<IdentityCard identity={identity} />
```

---

### CreatePostFAB
**Location**: `src/components/CreatePostFAB.tsx`
**Purpose**: Floating action button for creating posts

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| to | `string` | No | Route path (default: '/compose') |
| onClick | `() => void` | No | Click handler |
| tooltip | `string` | No | Tooltip text |
| visible | `boolean` | No | Show/hide (default: true) |

**Usage**:
```tsx
<CreatePostFAB visible={!isScrolling} />
```

---

### ErrorBoundary
**Location**: `src/components/ErrorBoundary.tsx`
**Purpose**: Catches React errors and provides recovery options

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| children | `ReactNode` | Yes | Child components |
| fallback | `ReactNode` | No | Custom fallback UI |

**Usage**:
```tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

### LoadingScreen
**Location**: `src/components/Loading.tsx`
**Purpose**: Full-screen loading during WASM initialization

**Props**: None

**Usage**:
```tsx
<SwimchainProvider fallback={<LoadingScreen />}>
  <App />
</SwimchainProvider>
```

## Hooks Reference

### useRpc
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Provides RPC client connection and data fetching hooks

**Returns**:
```typescript
interface RpcContextValue {
  rpc: SwimchainRpc | null;      // RPC client instance
  connected: boolean;             // Connection established
  connecting: boolean;            // Connection in progress
  error: string | null;           // Connection error
  nodeInfo: {
    version: string;
    network: string;
    peerCount: number;
  } | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
}
```

**Usage**:
```tsx
const { rpc, connected, error } = useRpc();

if (connected && rpc) {
  const spaces = await rpc.listSpaces();
}
```

**Additional Hooks in File**:
- `useNetworkStatus()` - Polls sync status (10s interval)
- `useSpaces()` - Cached space listing
- `useSpaceThreads(spaceId)` - Thread fetching with content polling
- `useThread(contentId)` - Single thread fetch
- `usePoolContribution()` - Engagement with PoW
- `usePostSubmit()` - Post creation
- `useMediaUpload()` - Media upload

---

### useFeed
**Location**: `src/hooks/useFeed.ts`
**Purpose**: Aggregates feed from followed sources with sorting and pagination

**Parameters**:
```typescript
interface UseFeedOptions {
  sortOrder?: 'recent' | 'hot';
  filter?: 'all' | 'spaces' | 'users';
}
```

**Returns**:
```typescript
interface UseFeedResult {
  items: FeedItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  isEmpty: boolean;
  hasFollows: boolean;
}
```

**Usage**:
```tsx
const { items, loading, hasMore, loadMore, refresh } = useFeed({
  sortOrder: 'recent',
  filter: 'all'
});
```

---

### useFeedPreferences
**Location**: `src/hooks/useFeedPreferences.ts`
**Purpose**: Manages followed sources and saved posts (per-user localStorage)

**Returns**:
```typescript
interface UseFeedPreferencesResult {
  preferences: FeedPreferences;
  loading: boolean;

  // Space management
  followSpace: (spaceId: string, name?: string) => void;
  unfollowSpace: (spaceId: string) => void;
  muteSpace: (spaceId: string, muted: boolean) => void;
  isFollowingSpace: (spaceId: string) => boolean;
  isSpaceMuted: (spaceId: string) => boolean;

  // User management
  followUser: (userPk: string, name?: string) => void;
  unfollowUser: (userPk: string) => void;
  muteUser: (userPk: string, muted: boolean) => void;
  isFollowingUser: (userPk: string) => boolean;
  isUserMuted: (userPk: string) => boolean;

  // Saved posts
  savePost: (postId: string) => void;
  unsavePost: (postId: string) => void;
  isPostSaved: (postId: string) => boolean;

  // Computed
  followedSpaceIds: Set<string>;
  followedUserIds: Set<string>;
  savedPostIds: Set<string>;
  activeSpaceCount: number;
  activeUserCount: number;
}
```

**Usage**:
```tsx
const { followSpace, isFollowingSpace, followedSpaceIds } = useFeedPreferences();

// Follow a space
followSpace('tech-discussion', 'Tech Discussion');

// Check follow status
if (isFollowingSpace('tech-discussion')) {
  // ...
}
```

**Convenience Hooks**:
- `useFollowSpace(spaceId)` - Simple toggle for specific space
- `useFollowUser(userPk)` - Simple toggle for specific user

---

### useStoredIdentity
**Location**: `src/hooks/useStoredIdentity.ts`
**Purpose**: Persists identity to localStorage

**Returns**:
```typescript
interface UseStoredIdentityResult {
  identity: StoredIdentity | null;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
  isLoading: boolean;
}
```

**Usage**:
```tsx
const { identity, setIdentity, clearIdentity } = useStoredIdentity();
```

---

### useKeypair
**Location**: `src/hooks/useKeypair.ts`
**Purpose**: Generates Ed25519 keypairs using WASM

**Returns**:
```typescript
interface UseKeypairResult {
  keypair: WasmKeypair | null;
  address: string | null;      // Bech32m (cs1...)
  generate: () => void;
  clear: () => void;
}
```

**Usage**:
```tsx
const { keypair, address, generate, clear } = useKeypair();

// Generate new keypair
generate();

// Use the address
console.log(`Your address: ${address}`);
```

---

### usePow
**Location**: `src/hooks/usePow.ts`
**Purpose**: Proof-of-work mining with batched execution

**Returns**:
```typescript
type PowState = 'idle' | 'initializing' | 'mining' | 'complete' | 'cancelled' | 'error';

interface UsePowResult {
  state: PowState;
  solution: PowSolution | null;
  attempts: number;
  elapsedMs: number;
  mine: (publicKey: Uint8Array, difficulty: number) => void;
  cancel: () => void;
  reset: () => void;
}

interface PowSolution {
  nonce: bigint;
  timestamp: bigint;
  elapsedMs: number;
}
```

**Usage**:
```tsx
const { state, solution, attempts, elapsedMs, mine, cancel } = usePow();

// Start mining
mine(keypair.publicKey, 20);

// Cancel if needed
cancel();
```

---

### useStoredKeypair
**Location**: `src/hooks/useStoredKeypair.ts`
**Purpose**: Bridges stored identity with WASM Keypair

**Returns**:
```typescript
interface UseStoredKeypairResult {
  keypair: WasmKeypair | null;
  publicKey: Uint8Array | null;
  address: string | null;
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
}
```

**Usage**:
```tsx
const { keypair, address, sign } = useStoredKeypair();

// Sign a message
const signature = sign(messageBytes);
```

---

### useParentRpcConfig
**Location**: `src/hooks/useParentRpcConfig.ts`
**Purpose**: Receives RPC config from parent frame (desktop app wrapper)

**Returns**:
```typescript
interface ParentRpcConfig {
  rpcEndpoint: string;
  rpcAuth: string;
} | null
```

**Usage**:
```tsx
const parentConfig = useParentRpcConfig();

if (parentConfig) {
  // Running in iframe, use parent's RPC config
}
```

## State Management

### Context Providers

**SwimchainProvider** (`src/providers/SwimchainProvider.tsx`)
- Manages WASM module loading
- Provides `useSwimchain()` hook
- Shows fallback during initialization

**IdentityProvider** (`src/providers/IdentityProvider.tsx`)
- Global identity state
- Provides `useIdentityContext()` hook
- Wraps localStorage persistence

**RpcProvider** (in `src/hooks/useRpc.tsx`)
- RPC client connection state
- Auto-connection with retry
- Provides `useRpc()` hook

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Storage Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  localStorage               │  IndexedDB                        │
│  ├─ swimchain-identity      │  ├─ media (blobs, no TTL)         │
│  ├─ feed_prefs_{pk}         │  └─ content (5min TTL)            │
│  └─ sc:* (cached data)      │                                   │
└──────────────────────────────┴──────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Context Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  SwimchainContext    │  RpcContext          │  IdentityContext  │
│  (WASM state)        │  (connection state)  │  (identity state) │
└──────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Hooks Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  useSwimchain        │  useRpc              │  useIdentityContext│
│  useKeypair          │  useSpaces           │  useStoredIdentity │
│  usePow              │  useFeed             │  useStoredKeypair  │
│                      │  useFeedPreferences  │                    │
└──────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Component Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  Pages: Feed, Discover, IdentityPage                            │
│  Components: FeedCard, FeedList, FollowButton, etc.             │
└─────────────────────────────────────────────────────────────────┘
```

### Caching Strategy

**3-Tier Cache** (`src/lib/cache.ts`):

| Layer | Storage | TTL | Use Case |
|-------|---------|-----|----------|
| Memory | In-process | Configurable | Spaces (5min), threads (2min) |
| localStorage | Browser | Configurable | Spaces backup (30min) |
| IndexedDB | Browser | Permanent / 5min | Media blobs, content responses |

**Access Pattern**:
```
Memory → localStorage → Network → Update both caches
```

## RPC Integration

### SwimchainRpc Class
**Location**: `src/lib/rpc.ts`

**Authentication Methods**:
1. **Signature Auth** (primary): Ed25519 signed requests
   - Headers: `X-CS-Identity`, `X-CS-Timestamp`, `X-CS-Signature`
2. **Auth Header**: Raw Authorization from parent frame
3. **Basic Auth**: Username/password fallback

### Methods Used

| Method | Purpose | Component/Hook |
|--------|---------|----------------|
| `listSpaces` | Get available spaces | Discover, useSpaces |
| `listSpaceContent` | Get space content | useFeed |
| `getMedia` | Fetch media by hash | FeedCard |
| `getSyncStatus` | Network sync status | useNetworkStatus |
| `getPeers` | Connected peers | useNetworkStatus |
| `submitPost` | Create new post | usePostSubmit |
| `uploadMedia` | Upload media files | useMediaUpload |
| `submitEngagement` | Submit reactions | usePoolContribution |

### Network Ports

| Network | Port |
|---------|------|
| Mainnet | 9736 |
| Testnet | 19736 |
| Regtest | 29736 |

## Styling Guide

### Approach
- **Plain CSS** with CSS custom properties (variables)
- **BEM naming** convention: `block__element--modifier`
- **Component-scoped** styles in same directory or inline
- **Global styles** in `src/styles/`

### CSS Variables (from globals.css)

```css
/* Colors */
--color-bg-primary: #0d0d0d;
--color-bg-secondary: #1a1a1a;
--color-bg-tertiary: #262626;
--color-text-primary: #ffffff;
--color-text-secondary: #a3a3a3;
--color-accent-primary: #3b82f6;
--color-accent-secondary: #60a5fa;

/* Spacing */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;

/* Typography */
--font-size-xs: 0.75rem;
--font-size-sm: 0.875rem;
--font-size-base: 1rem;
--font-size-lg: 1.125rem;

/* Layout */
--header-height: 60px;
--radius-sm: 4px;
--radius-md: 8px;
--radius-full: 9999px;
```

### Responsive Breakpoints

```css
@media (max-width: 768px)  /* Tablet */
@media (max-width: 600px)  /* Mobile */
```

## Testing

### Run Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Testing Stack
- **Vitest** - Test runner
- **React Testing Library** - Component testing
- **happy-dom** - DOM environment

### Test Patterns
```tsx
import { render, screen } from '@testing-library/react';
import { FeedCard } from './FeedCard';

test('renders post content', () => {
  render(<FeedCard item={mockPost} />);
  expect(screen.getByText('Post content')).toBeInTheDocument();
});
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_USE_REMOTE_SEED` | Use testnet seed instead of local node | `false` |

### Storage Keys

| Key | Description |
|-----|-------------|
| `swimchain-identity` | User identity (address, seed, PoW) |
| `feed_prefs_{publicKey}` | Per-user feed preferences |
| `sc:*` | Cached data with TTL |

### Auto-Connection Priority

1. Parent frame config (iframe in desktop-app)
2. `VITE_USE_REMOTE_SEED` environment variable
3. Tauri with cookie auth (desktop app)
4. Local node fallback (`localhost:19736`)

## Known Issues & Limitations

- **7 placeholder routes**: `/saved`, `/compose`, `/profile`, `/profile/:userPk`, `/space/:spaceId`, `/post/:postId`, `/settings` show "Coming Soon"
- **Reactions not wired**: UI buttons visible but non-functional
- **Reply/Share non-functional**: UI buttons exist without handlers
- **User discovery placeholder**: Tab visible, shows "coming soon"
- **No live updates**: Feed requires manual refresh
- **No compose functionality**: FAB navigates to placeholder

## Future Improvements

- **Implement post composition** with media upload
- **Add reaction functionality** with PoW validation
- **Build user profiles** with post history
- **Create saved posts view** with filtering
- **Add space detail pages** with moderation tools
- **Implement live feed updates** via WebSocket or polling
- **Add reply threading** in post detail view
- **Build settings page** for preferences and identity management
- **Add notification system** for followed content
- **Implement share functionality** with deep links

## Routes Reference

| Path | Component | Status |
|------|-----------|--------|
| `/` | Feed | Complete |
| `/discover` | Discover | Complete |
| `/identity` | IdentityPage | Complete |
| `/saved` | ComingSoon | Placeholder |
| `/compose` | ComingSoon | Placeholder |
| `/profile` | ComingSoon | Placeholder |
| `/profile/:userPk` | ComingSoon | Placeholder |
| `/space/:spaceId` | ComingSoon | Placeholder |
| `/post/:postId` | ComingSoon | Placeholder |
| `/settings` | ComingSoon | Placeholder |

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.2.0 | UI framework |
| react-dom | ^18.2.0 | DOM rendering |
| react-router-dom | ^6.20.0 | Client-side routing |
| @noble/ciphers | ^2.1.1 | Encryption primitives |
| @noble/curves | ^1.9.7 | Cryptographic curves |
| @noble/hashes | ^1.8.0 | Hashing functions |
| @tauri-apps/api | ^2.9.1 | Tauri desktop integration |
| hash-wasm | ^4.12.0 | WASM hashing |
| idb | ^8.0.0 | IndexedDB wrapper |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.3.0 | Type checking |
| vite | ^5.0.0 | Build tool |
| vitest | ^1.0.0 | Test runner |
| @vitejs/plugin-react | ^4.2.0 | React plugin |
| @testing-library/react | ^14.0.0 | Component testing |
| eslint | ^8.55.0 | Linting |
