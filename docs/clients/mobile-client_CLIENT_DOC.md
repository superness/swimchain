# Mobile Client - Client Documentation

## Overview

The Swimchain Mobile Client (branded as **"Tidal"**) is a React Native application providing mobile access to the Swimchain decentralized content network. It features battery-conscious on-device Proof of Work mining, offline-first capabilities with action queuing, network-aware sync modes, and tiered storage management. The app targets iOS and Android platforms with a unique "Tidal UX" paradigm featuring hold-to-tend gestures and breath-based content vitality visualization.

**Target Users**: Mobile users who want to participate in the Swimchain network, create content, and contribute to engagement pools while on the go.

## Quick Start

```bash
# Navigate to mobile client
cd mobile-client

# Install dependencies
pnpm install

# Start Metro bundler
pnpm start

# Run on Android (separate terminal)
pnpm android

# Run on iOS (separate terminal)
pnpm ios

# Type check
pnpm typecheck

# Run tests
pnpm test

# Lint code
pnpm lint
```

**Prerequisites**:
- Node.js >= 18
- pnpm package manager
- React Native development environment (Android Studio / Xcode)
- Connected device or emulator

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Native 0.73.2 |
| Language | TypeScript 5.0.4 |
| Build Tool | Metro bundler |
| Navigation | React Navigation 6.x (bottom tabs + native stack) |
| Styling | StyleSheet (React Native) with theme constants |
| State | React Context + Custom Hooks + Singleton Services |
| Storage | AsyncStorage |
| Networking | JSON-RPC 2.0 client + NetInfo API |
| Cryptography | Native Argon2 module |
| Animations | react-native-reanimated 3.6.3 |
| Gestures | react-native-gesture-handler 2.14.0 |

### Directory Structure

```
src/
├── components/           # Reusable UI components (25+ files)
│   └── tidal/           # Tidal UX components (5 files)
├── screens/             # Screen components (9 files)
├── hooks/               # Custom React hooks (6 files)
├── services/            # Business logic services (5 files)
├── providers/           # React context providers (1 file)
├── navigation/          # Navigation setup (4 files)
├── theme/               # Design tokens and colors (2 files)
├── constants/           # Protocol and mining constants (2 files)
├── native/              # Native module bridges (1 file)
├── stores/              # State management (placeholder)
├── utils/               # Utility functions (placeholder)
└── globals.d.ts         # Global type definitions
```

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @swimchain/core | workspace | Core protocol bindings |
| @swimchain/react | workspace | React integration layer |
| @react-navigation/* | 6.x | Navigation framework |
| react-native-reanimated | 3.6.3 | Smooth animations |
| react-native-gesture-handler | 2.14.0 | Touch gestures |
| react-native-haptic-feedback | 2.2.0 | Haptic feedback |
| @react-native-async-storage/async-storage | 1.21.0 | Persistent storage |
| @react-native-community/netinfo | 11.2.0 | Network monitoring |
| react-native-svg | 14.1.0 | SVG rendering |

## Features

### Tab Navigation
**Description**: Bottom tab navigation with 4 tabs (Home, Search, Post, Profile)
**User Flow**: Tap tabs to switch sections; Post tab opens compose modal
**Components**: `TabNavigator.tsx`, `RootNavigator.tsx`
**Status**: Complete

### Stack Navigation
**Description**: Nested stack navigation within Home and Profile tabs
**User Flow**: Navigate to detail screens (Space -> Thread) with back navigation
**Components**: `HomeStackNavigator.tsx`, `ProfileStackNavigator.tsx`
**Status**: Complete

### Identity Management
**Description**: Ed25519 keypair generation and secure storage
**User Flow**: Auto-generated on first launch, view in Profile, export option
**Components**: `IdentityCard`, `AddressDisplay`, `ProfileScreen`
**Status**: Partial (export shows "Coming Soon")

### PoW Mining
**Description**: On-device Argon2id proof-of-work for content creation
**User Flow**: Compose content -> Mining progress screen -> Cancel or continue browsing
**Components**: `MiningProgress`, `MiningTip`, `ComposeScreen`
**Status**: Complete

### Content Creation (Posts)
**Description**: Create posts with title/body and PoW validation
**User Flow**: Open compose -> Enter content -> Mine PoW -> Submit
**Components**: `ComposeScreen`, `MiningProgress`
**Status**: Complete

### Content Creation (Replies)
**Description**: Reply to existing threads with PoW validation
**User Flow**: Open thread -> Tap Reply -> Enter body -> Mine PoW -> Submit
**Components**: `ComposeScreen`, `ThreadViewScreen`
**Status**: Complete

### Engagement Contribution
**Description**: Contribute to engagement pools via PoW mining (5/15/30 seconds)
**User Flow**: View thread -> Tap Engage button -> Select tier -> Mining
**Components**: `EngagementPool`, `ThreadViewScreen`
**Status**: Partial (simulated with delay)

### Home Feed
**Description**: Main feed showing spaces and recent threads
**User Flow**: View spaces list and recent content, pull-to-refresh
**Components**: `HomeScreen`, `SpaceCard`, `ThreadList`, `PoolsNeedingHelp`
**Status**: Complete

### Space View
**Description**: View threads within a specific space
**User Flow**: Tap space -> View threads -> Toggle subscription
**Components**: `SpaceViewScreen`, `ThreadList`
**Status**: Complete

### Thread View
**Description**: View post content, engagement pool, and replies
**User Flow**: Tap thread -> View content and replies -> Engage or reply
**Components**: `ThreadViewScreen`, `PostContent`, `EngagementPool`, `ReplyList`
**Status**: Complete

### Search
**Description**: Search spaces and threads
**User Flow**: Enter query -> View results -> Navigate to space/thread
**Components**: `SearchScreen`, `SpaceCard`
**Status**: Partial (mock data, threads tab placeholder)

### Pull-to-Refresh
**Description**: Refresh content by pulling down
**User Flow**: Pull down on any list -> Content refreshes
**Components**: All list screens
**Status**: Complete

### Haptic Feedback
**Description**: Touch feedback for button presses and gestures
**User Flow**: Automatic on touch interactions
**Components**: `TouchPressable`, `Button`
**Status**: Complete

### Storage Management
**Description**: Tiered storage profiles (1GB/5GB/10GB) with smart eviction
**User Flow**: Profile -> Storage -> Select tier -> View breakdown -> Clear cache
**Components**: `StorageScreen`, `StorageBreakdown`, `StorageProfileSelector`
**Status**: Partial (profile selection UI, clear cache mocked)

### Offline Queue
**Description**: Queue actions when offline for later submission
**User Flow**: Create content offline -> Queued automatically -> Retry when online
**Components**: `QueueScreen`, `QueueBadge`
**Status**: Partial (UI complete, processing mocked)

### App Settings
**Description**: Configure sync and app preferences
**User Flow**: Profile -> Settings -> Toggle options
**Components**: `SettingsScreen`
**Status**: Partial (UI only, not persisted)

### Connection Status
**Description**: Visual indicator of network connection state
**User Flow**: View sync status in Home or Profile
**Components**: `SyncStatus`
**Status**: Complete

### Fork Indicator
**Description**: Show current fork status and minority warnings
**User Flow**: View in Profile -> See fork status
**Components**: `ForkIndicator`, `ProfileScreen`
**Status**: Placeholder (mock data)

### Mining Progress
**Description**: Real-time progress during PoW mining
**User Flow**: Mining -> View progress, hash rate, tips -> Cancel if needed
**Components**: `MiningProgress`, `MiningTip`
**Status**: Complete

### Tidal UX - Hold-to-Tend
**Description**: Long-press gesture to contribute PoW to content
**User Flow**: Hold on content -> Reach threshold -> Contribution completes
**Components**: `TendGesture`
**Status**: Complete (not integrated in main flow)

### Tidal UX - Breath Indicator
**Description**: Breathing animation showing content vitality
**User Flow**: Visual indicator next to content
**Components**: `BreathIndicator`
**Status**: Complete (not integrated in main flow)

### Tidal UX - Depth Feed
**Description**: Content organized by depth layers (surface/shallows/deep/archive)
**User Flow**: Navigate depth layers to explore content
**Components**: `DepthFeed`
**Status**: Complete (not integrated in main flow)

### Tidal UX - Rescue Mission
**Description**: Collaborative modal to save content from decay
**User Flow**: Content at risk -> Join rescue -> Contribute PoW
**Components**: `RescueMission`
**Status**: Complete (not integrated in main flow)

### Tidal UX - Stewardship Profile
**Description**: User's tending statistics and garden view
**User Flow**: View profile -> See tending stats and garden
**Components**: `StewardshipProfile`
**Status**: Complete (not integrated in main flow)

## Components Reference

### Screens

#### HomeScreen
**Location**: `src/screens/HomeScreen.tsx`
**Purpose**: Main feed with spaces and recent threads
**Props**: None (route component)
**State**:
| State | Type | Description |
|-------|------|-------------|
| refreshing | boolean | Pull-to-refresh state |

---

#### SpaceViewScreen
**Location**: `src/screens/SpaceViewScreen.tsx`
**Purpose**: View threads in a specific space
**Props** (route params):
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| spaceId | string | Yes | Space identifier |

**State**:
| State | Type | Description |
|-------|------|-------------|
| refreshing | boolean | Pull-to-refresh state |
| isSubscribed | boolean | Subscription toggle |

---

#### ThreadViewScreen
**Location**: `src/screens/ThreadViewScreen.tsx`
**Purpose**: View post with engagement pool and replies
**Props** (route params):
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| postId | string | Yes | Post content ID |
| spaceId | string | Yes | Parent space ID |

**State**:
| State | Type | Description |
|-------|------|-------------|
| refreshing | boolean | Pull-to-refresh state |
| isContributing | boolean | PoW contribution in progress |

---

#### ComposeScreen
**Location**: `src/screens/ComposeScreen.tsx`
**Purpose**: Create new post or reply with PoW mining
**Props** (route params):
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| spaceId | string | No | Target space for new post |
| replyTo | string | No | Parent content ID for reply |

**State**:
| State | Type | Description |
|-------|------|-------------|
| title | string | Post title |
| body | string | Post/reply body |
| isMining | boolean | Mining in progress |

---

#### SearchScreen
**Location**: `src/screens/SearchScreen.tsx`
**Purpose**: Search spaces and threads
**State**:
| State | Type | Description |
|-------|------|-------------|
| query | string | Search input |
| activeTab | 'spaces' \| 'threads' | Tab selection |
| results | SpaceData[] | Search results |

---

#### ProfileScreen
**Location**: `src/screens/ProfileScreen.tsx`
**Purpose**: User identity and settings hub
**Navigates To**: StorageScreen, QueueScreen, SettingsScreen

---

#### StorageScreen
**Location**: `src/screens/StorageScreen.tsx`
**Purpose**: Storage management with profile selection
**State**:
| State | Type | Description |
|-------|------|-------------|
| profile | StorageProfile | Selected storage tier |
| categories | StorageCategory[] | Storage breakdown |

---

#### SettingsScreen
**Location**: `src/screens/SettingsScreen.tsx`
**Purpose**: App settings configuration
**State**:
| State | Type | Description |
|-------|------|-------------|
| wifiOnlyFullSync | boolean | Full sync only on WiFi |
| cellularBudgetMb | 50 \| 100 \| 200 | Cellular data budget |
| backgroundSyncEnabled | boolean | Background sync toggle |
| hapticFeedback | boolean | Haptic feedback toggle |
| notifications | boolean | Notifications toggle |

---

#### QueueScreen
**Location**: `src/screens/QueueScreen.tsx`
**Purpose**: Offline queue management
**State**:
| State | Type | Description |
|-------|------|-------------|
| queue | QueuedAction[] | Queued items |

### Shared Components

#### ThreadList
**Location**: `src/components/ThreadList.tsx`
**Purpose**: Virtualized list of threads with 60fps scrolling
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| threads | ThreadData[] | Yes | Thread data array |
| onThreadPress | (thread) => void | Yes | Thread tap handler |
| onRefresh | () => void | No | Refresh callback |
| refreshing | boolean | No | Refresh state |
| onEndReached | () => void | No | Infinite scroll handler |
| ListHeaderComponent | ReactElement | No | Header component |
| ListEmptyComponent | ReactElement | No | Empty state component |

**Usage**:
```tsx
<ThreadList
  threads={threads}
  onThreadPress={(t) => navigation.navigate('Thread', { postId: t.id })}
  onRefresh={handleRefresh}
  refreshing={refreshing}
/>
```

---

#### ThreadCard
**Location**: `src/components/ThreadCard.tsx`
**Purpose**: Thread list item with heat badge
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| thread | ThreadData | Yes | Thread data |
| onPress | () => void | Yes | Tap handler |
| onSwipeRight | () => void | No | Right swipe action |
| onSwipeLeft | () => void | No | Left swipe action |

**Notes**: Memoized with `React.memo` for FlatList performance

---

#### Button
**Location**: `src/components/Button.tsx`
**Purpose**: Touch-optimized button with variants
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Button label |
| variant | 'primary' \| 'secondary' \| 'outline' \| 'ghost' \| 'danger' | No | Visual variant |
| size | 'sm' \| 'md' \| 'lg' | No | Size variant |
| disabled | boolean | No | Disabled state |
| loading | boolean | No | Loading state |
| onPress | () => void | No | Press handler |
| haptic | HapticType | No | Haptic feedback type |

**Usage**:
```tsx
<Button
  title="Submit"
  variant="primary"
  onPress={handleSubmit}
  loading={isSubmitting}
/>
```

---

#### TouchPressable
**Location**: `src/components/TouchPressable.tsx`
**Purpose**: Touch-optimized Pressable with haptic feedback
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| minSize | number | No | Minimum touch target (default 44pt) |
| haptic | 'light' \| 'medium' \| 'heavy' \| 'selection' \| 'success' \| 'error' \| 'none' | No | Haptic type |
| pressedStyle | ViewStyle | No | Style when pressed |
| disabledOpacity | number | No | Opacity when disabled |

---

#### Card
**Location**: `src/components/Card.tsx`
**Purpose**: Container component with elevation
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| children | ReactNode | Yes | Card content |
| elevation | 'none' \| 'sm' \| 'md' \| 'lg' | No | Shadow elevation |
| padding | 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| 'none' | No | Internal padding |

---

#### HeatBadge
**Location**: `src/components/HeatBadge.tsx`
**Purpose**: Compact 24pt heat indicator for lists
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| decayPercentage | number | Yes | Current decay (0-100) |
| poolSeconds | number | No | Engagement pool seconds |

---

#### HeatBar
**Location**: `src/components/HeatBar.tsx`
**Purpose**: Progress bar for engagement pool
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| currentSeconds | number | Yes | Current pool seconds |
| requiredSeconds | number | No | Target seconds |
| lastEngagement | number | No | Last engagement timestamp |
| showTimeRemaining | boolean | No | Show countdown |

---

#### HeatIndicator
**Location**: `src/components/HeatIndicator.tsx`
**Purpose**: Animated dot showing content vitality
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| decayPercentage | number | Yes | Current decay (0-100) |
| size | 'sm' \| 'md' \| 'lg' | No | Indicator size |
| animated | boolean | No | Enable pulse animation |

---

#### EngagementPool
**Location**: `src/components/EngagementPool.tsx`
**Purpose**: Manage and display engagement pool with contribution buttons
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| poolId | string | Yes | Pool identifier |
| currentSeconds | number | Yes | Current pool time |
| requiredSeconds | number | No | Target pool time |
| contributors | Contributor[] | Yes | Recent contributors |
| onContribute | (seconds: 5\|15\|30) => void | Yes | Contribution handler |
| isContributing | boolean | Yes | Mining in progress |
| contributionProgress | MiningProgress \| null | No | Mining progress |
| lastEngagement | number | No | Last engagement timestamp |

---

#### MiningProgress
**Location**: `src/components/MiningProgress.tsx`
**Purpose**: Full-screen mining progress with circular indicator
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| progress | MiningProgress \| null | Yes | Mining progress state |
| estimatedDuration | number | Yes | Estimated time in ms |
| estimatedBattery | number | Yes | Battery usage estimate |
| onCancel | () => void | Yes | Cancel handler |
| onContinueBrowsing | () => void | No | Background mining handler |
| isActive | boolean | Yes | Mining active state |

---

#### SyncStatus
**Location**: `src/components/SyncStatus.tsx`
**Purpose**: Display sync state and cellular budget
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| mode | 'full' \| 'headers' \| 'paused' | Yes | Current sync mode |
| isOnline | boolean | Yes | Network connected |
| isWifi | boolean | Yes | WiFi connection |
| cellularUsedMb | number | Yes | Cellular data used |
| cellularBudgetMb | number | Yes | Cellular budget |
| lastSyncTime | number | No | Last sync timestamp |

---

#### AddressDisplay
**Location**: `src/components/AddressDisplay.tsx`
**Purpose**: Display and copy Swimchain addresses
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| address | string | Yes | Swimchain address |
| format | 'full' \| 'truncated' \| 'minimal' | No | Display format |
| copyable | boolean | No | Enable copy |
| onCopy | () => void | No | Copy callback |
| label | string | No | Label text |

---

#### ForkIndicator
**Location**: `src/components/ForkIndicator.tsx`
**Purpose**: Show current fork status with minority warning
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| status | ForkStatus | Yes | Fork status object |
| compact | boolean | No | Compact display |

```typescript
interface ForkStatus {
  forkId: string;
  isMainChain: boolean;
  participantCount: number;
  lastBlockTime: number;
  divergenceDetected: boolean;
}
```

### Tidal UX Components

#### BreathIndicator
**Location**: `src/components/tidal/BreathIndicator.tsx`
**Purpose**: Visualize content vitality through breathing dots and wave
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| survivalProbability | number | Yes | Content survival (0-1) |
| size | 'sm' \| 'md' \| 'lg' | No | Indicator size |
| showWave | boolean | No | Show wave animation |

**Breath States**: `'strong' | 'steady' | 'fading' | 'gasping' | 'final'`

---

#### TendGesture
**Location**: `src/components/tidal/TendGesture.tsx`
**Purpose**: Hold-to-tend interaction for contributing PoW
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| contentId | string | Yes | Content to tend |
| currentBreaths | number | Yes | Current breath count |
| onTendStart | () => void | No | Gesture start callback |
| onTendProgress | (progress) => void | No | Progress callback |
| onTendComplete | (seconds) => void | No | Completion callback |
| onTendCancel | () => void | No | Cancel callback |
| isMining | boolean | No | Mining in progress |
| disabled | boolean | No | Disable gesture |

**Tier Thresholds**: 5 seconds (quick), 15 seconds (moderate), 30 seconds (full)

---

#### DepthFeed
**Location**: `src/components/tidal/DepthFeed.tsx`
**Purpose**: Depth-based content navigation
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| items | T[] | Yes | Content items |
| renderItem | (item, depth) => ReactElement | Yes | Item renderer |
| onRefresh | () => void | No | Refresh callback |
| refreshing | boolean | No | Refresh state |
| onDepthChange | (depth) => void | No | Depth change callback |

**Depth Layers**: `'surface' | 'shallows' | 'deep' | 'archive'`

---

#### RescueMission
**Location**: `src/components/tidal/RescueMission.tsx`
**Purpose**: Collaborative content rescue modal
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| contentId | string | Yes | Content ID |
| title | string | Yes | Content title |
| authorAddress | string | Yes | Author address |
| survivalProbability | number | Yes | Current survival (0-1) |
| breathsNeeded | number | Yes | Total breaths needed |
| breathsContributed | number | Yes | Current contributions |
| activeStewards | Steward[] | Yes | Active contributors |
| isParticipating | boolean | Yes | User participating |
| onJoinRescue | () => void | Yes | Join handler |
| onLetRest | () => void | Yes | Let decay handler |
| visible | boolean | Yes | Modal visibility |
| onClose | () => void | Yes | Close handler |

---

#### StewardshipProfile
**Location**: `src/components/tidal/StewardshipProfile.tsx`
**Purpose**: User's garden and tending statistics
**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| address | string | Yes | User address |
| joinedAt | number | Yes | Join timestamp |
| garden | GardenItem[] | Yes | Garden items |
| stats | TendingStats | Yes | Tending statistics |
| topSpaces | SpaceAffinity[] | Yes | Top space affiliations |

## Hooks Reference

### useMobilePow
**Location**: `src/hooks/useMobilePow.ts`
**Purpose**: Battery-conscious PoW with progress tracking and cancellation
**Returns**:
```typescript
{
  state: 'idle' | 'mining' | 'complete' | 'error' | 'cancelled';
  progress: MiningProgress | null;
  solution: PowSolution | null;
  error: string | null;
  mine: (challenge: Uint8Array, difficulty: number) => Promise<PowSolution>;
  cancel: () => void;
  estimateDuration: (difficulty: number) => number;
  estimateBattery: (durationMs: number) => number;
  isNativeAvailable: boolean;
}
```
**Usage**:
```tsx
const { state, progress, mine, cancel, estimateDuration } = useMobilePow();

const handleSubmit = async () => {
  const challenge = await rpc.getChallenge('post');
  const solution = await mine(challenge.bytes, challenge.difficulty);
  await rpc.submitPost({ ...content, pow: solution });
};
```

---

### useRpcConnection
**Location**: `src/hooks/useRpc.ts`
**Purpose**: RPC connection state and auto-reconnect
**Returns**:
```typescript
{
  rpc: SwimchainRpc;
  connected: boolean;
  connecting: boolean;
  reconnect: () => Promise<void>;
}
```
**Usage**:
```tsx
const { rpc, connected, reconnect } = useRpcConnection();

if (!connected) {
  return <Button title="Reconnect" onPress={reconnect} />;
}
```

---

### useSpaces
**Location**: `src/hooks/useRpc.ts`
**Purpose**: Fetch and cache space list
**Returns**:
```typescript
{
  spaces: SpaceInfo[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
```
**Usage**:
```tsx
const { spaces, loading, refresh } = useSpaces();
```

---

### useSpaceThreads
**Location**: `src/hooks/useRpc.ts`
**Purpose**: Fetch threads for a specific space
**Parameters**: `spaceId: string | null`
**Returns**:
```typescript
{
  threads: ContentItem[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
```
**Usage**:
```tsx
const { threads, loading, refresh } = useSpaceThreads(spaceId);
```

---

### useThread
**Location**: `src/hooks/useRpc.ts`
**Purpose**: Fetch single thread with replies
**Parameters**: `contentId: string | null`
**Returns**:
```typescript
{
  thread: ContentItem | null;
  replies: ReplyItem[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
```
**Usage**:
```tsx
const { thread, replies, loading, refresh } = useThread(contentId);
```

---

### useRecentContent
**Location**: `src/hooks/useRpc.ts`
**Purpose**: Fetch recent content across all spaces
**Parameters**: `limit: number = 20`
**Returns**:
```typescript
{
  content: ContentItem[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
```

---

### usePoolsAtRisk
**Location**: `src/hooks/useRpc.ts`
**Purpose**: Fetch content at risk of decay
**Parameters**: `threshold: number = 0.1`
**Returns**:
```typescript
{
  pools: ContentItem[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
```

---

### useKeypair
**Location**: `src/hooks/useKeypair.ts`
**Purpose**: Ed25519 keypair management for signing
**Returns**:
```typescript
{
  keypair: KeypairLike | null;
  publicKeyHex: string | null;
  address: string | null;
  loading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
  isReady: boolean;
}
```
**Usage**:
```tsx
const { address, sign, isReady } = useKeypair();

if (!isReady) return <LoadingIndicator />;

const signature = sign(messageBytes);
```

---

### useStoredIdentity
**Location**: `src/hooks/useStoredIdentity.ts`
**Purpose**: Manage identity in AsyncStorage
**Returns**:
```typescript
{
  identity: StoredIdentity | null;
  loading: boolean;
  save: (identity: StoredIdentity) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}
```
**Storage Key**: `@swimchain/identity`

---

### useMemoryWarning
**Location**: `src/hooks/useMemoryWarning.ts`
**Purpose**: Handle memory pressure events
**Parameters**: `onWarning?: () => void`
**Memory Budget**:
- Baseline: 150 MB
- Peak during PoW: 300 MB (64 MiB Argon2)
- Image cache max: 50 MB

## State Management

### Context Providers

#### MobileSwimchainProvider
**Location**: `src/providers/MobileChainSocialProvider.tsx`
**Purpose**: Global state for mobile-specific Swimchain features

**Context Value**:
```typescript
interface MobileSwimchainContextValue {
  // Identity
  address: string | null;
  isIdentityLoaded: boolean;

  // Network
  networkState: NetworkState;

  // Storage
  storageProfile: StorageProfile;
  storageStats: StorageStats | null;

  // Queue
  queueCount: number;

  // PoW
  pow: ReturnType<typeof useMobilePow>;

  // Actions
  setStorageProfile: (profile: StorageProfile) => Promise<void>;
}
```

**Usage**:
```tsx
// In component
const { address, networkState, pow } = useMobileSwimchain();
```

### Data Flow

```
                    ┌──────────────────────────────┐
                    │   MobileSwimchainProvider    │
                    │                              │
                    │  - address (identity)        │
                    │  - networkState              │
                    │  - storageProfile            │
                    │  - queueCount                │
                    │  - pow (useMobilePow)        │
                    └──────────────┬───────────────┘
                                   │
                                   │ useMobileSwimchain()
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Screen Components                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   useRpcConnection()                        │ │
│  │  { rpc, connected, connecting, reconnect }                 │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Data Fetching Hooks                            │ │
│  │  useSpaces() -> { spaces, loading, error, refresh }        │ │
│  │  useSpaceThreads(id) -> { threads, loading, ... }          │ │
│  │  useThread(id) -> { thread, replies, loading, ... }        │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              useMemo() Transformations                      │ │
│  │  RPC data -> UI component props                            │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                 UI Components                               │ │
│  │  ThreadList, SpaceCard, EngagementPool, etc.               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Content Submission Flow

```
User Input (ComposeScreen)
       │
       ▼
useKeypair() -> { keypair, address, sign, isReady }
       │
       ▼
rpc.getChallenge('post' | 'reply')
       │
       ▼
useMobilePow().mine(challenge, difficulty)
       │ (progress updates via callback)
       ▼
MiningProgress component shows real-time state
       │
       ▼
keypair.sign(contentBytes)
       │
       ▼
rpc.submitPost() / rpc.submitReply()
       │
       ├──► Success -> navigation.goBack()
       │
       └──► Offline -> offlineQueue.add() -> QueueScreen
```

### Singleton Services

| Service | Location | Purpose |
|---------|----------|---------|
| SwimchainRpc | `src/services/SwimchainRpc.ts` | JSON-RPC 2.0 client |
| NetworkMonitor | `src/services/NetworkMonitor.ts` | Network state & sync mode |
| OfflineQueue | `src/services/OfflineQueue.ts` | Offline action queue |
| StorageManager | `src/services/StorageManager.ts` | Tiered storage management |
| ChallengeManager | `src/services/ChallengeManager.ts` | PoW challenge lifecycle |

## RPC Integration

### Methods Used

| Method | Purpose | Component/Hook |
|--------|---------|----------------|
| `listSpaces` | Fetch all spaces | useSpaces |
| `listSpaceContent` | Fetch threads in space | useSpaceThreads |
| `getContent` | Fetch single content item | useThread |
| `getReplies` | Fetch replies to content | useThread |
| `getRecentContent` | Fetch recent content | useRecentContent |
| `getPoolsAtRisk` | Fetch at-risk pools | usePoolsAtRisk |
| `getChallenge` | Get PoW challenge | ComposeScreen |
| `submitPost` | Submit new post | ComposeScreen |
| `submitReply` | Submit reply | ComposeScreen |
| `submitEngagement` | Submit engagement | ThreadViewScreen |

### RPC Configuration

```typescript
// Android emulator
const DEFAULT_CONFIG = {
  endpoint: 'http://10.0.2.2:39736',
};

// iOS simulator
const IOS_CONFIG = {
  endpoint: 'http://localhost:39736',
};
```

## Styling Guide

### Theme System

The app uses a centralized theme system in `src/theme/`.

**Spacing Scale**:
```typescript
SPACING: {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
}
```

**Typography**:
```typescript
FONT_SIZE: {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 32,
}
```

**Colors** (from `src/theme/colors.ts`):
```typescript
COLORS: {
  primary: '#0066CC',
  primaryLight: '#3399FF',
  primaryDark: '#004C99',

  // Heat decay colors
  heatFull: 'OrangeRed',      // 0-20% decay
  heatWarm: 'DarkOrange',     // 20-40% decay
  heatCooling: 'Gold',        // 40-60% decay
  heatFading: 'Gray',         // 60-80% decay
  heatDecayed: 'DarkGray',    // 80-100% decay

  // Status colors
  success: 'green',
  warning: 'gold',
  error: 'red',
  info: 'blue',
}
```

**Touch Targets**: Minimum 44pt per iOS Human Interface Guidelines

### StyleSheet Pattern

```tsx
import { StyleSheet } from 'react-native';
import { SPACING, COLORS, FONT_SIZE } from '../theme';

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
});
```

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test src/hooks/__tests__/useMobilePow.test.ts
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| N/A | RPC endpoint is hardcoded per platform | Android: 10.0.2.2:39736, iOS: localhost:39736 |

### Build Configuration

**Metro Config** (`metro.config.js`):
- Server port: 8082
- Monorepo support for @swimchain/core and @swimchain/react
- Experimental import support disabled

**Babel Config** (`babel.config.js`):
- Preset: @react-native/babel-preset
- Plugin: react-native-reanimated/plugin (must be last)

**TypeScript Config** (`tsconfig.json`):
- Target: ES2020
- Module: commonjs
- Strict mode enabled
- Path aliases: `@/*` -> `src/*`

### Protocol Constants

Located in `src/constants/protocol.ts`:

| Constant | Value | Description |
|----------|-------|-------------|
| CHALLENGE_EXPIRY | 600s | PoW challenge validity |
| MAX_POW_RETRIES | 3 | Maximum retry attempts |
| ARGON2_MEMORY | 64 MiB | Mining memory cost |
| ARGON2_ITERATIONS | 3 | Mining iterations |
| POST_DIFFICULTY | 9 | Post mining difficulty (~51s) |
| REPLY_DIFFICULTY | 8 | Reply mining difficulty (~26s) |
| ENGAGE_DIFFICULTY | 8 | Engagement difficulty (~26s) |
| POOL_TOTAL_SECONDS | 60 | Engagement pool target |
| MAX_TITLE_LENGTH | 140 | Post title limit |
| MAX_BODY_LENGTH | 10000 | Post body limit |

## Feature Map

This section maps user-facing features to their implementation details including user flows, components, hooks, and RPC methods.

### Navigation Features

#### Tab Navigation
**User Flow**: User taps bottom tab → Screen switches → Tab highlight updates
**Components**: `TabNavigator.tsx`, `RootNavigator.tsx`
**Routes**:
| Tab | Target | Description |
|-----|--------|-------------|
| Home | HomeStackNavigator | Main feed and content browsing |
| Search | SearchScreen | Search spaces and threads |
| Post | ComposeScreen (modal) | Opens compose modal |
| Profile | ProfileStackNavigator | Identity and settings |
**Status**: ✓ Complete

#### Stack Navigation (Home)
**User Flow**:
1. User views HomeScreen (feed)
2. Taps space card → SpaceViewScreen
3. Taps thread card → ThreadViewScreen
4. Back button returns to previous screen
**Components**: `HomeStackNavigator.tsx`, `HomeScreen`, `SpaceViewScreen`, `ThreadViewScreen`
**Hooks**: `useNavigation`, `useRoute`
**Status**: ✓ Complete

#### Stack Navigation (Profile)
**User Flow**:
1. User views ProfileScreen (identity hub)
2. Taps Storage → StorageScreen
3. Taps Offline Queue → QueueScreen
4. Taps Settings → SettingsScreen
**Components**: `ProfileStackNavigator.tsx`, `ProfileScreen`, `StorageScreen`, `QueueScreen`, `SettingsScreen`
**Status**: ✓ Complete

---

### Authentication Features

#### Identity Generation
**User Flow**:
1. First app launch
2. Ed25519 keypair auto-generated
3. Address derived from public key
4. Identity stored in AsyncStorage
**Components**: `IdentityCard`, `AddressDisplay`
**Hooks**: `useStoredIdentity`, `useKeypair`
**Storage Key**: `@swimchain/identity`
**Status**: ✓ Complete

#### Identity Display
**User Flow**: Profile tab → View address → Copy to clipboard
**Components**: `ProfileScreen`, `IdentityCard`, `AddressDisplay`
**Hooks**: `useStoredIdentity`, `useKeypair`
**Address Format**: `cs1q...` (truncated 14 chars)
**Status**: ✓ Complete

#### Identity Export
**User Flow**: Profile tab → IdentityCard → Export button → Alert "Coming Soon"
**Components**: `IdentityCard`
**Status**: ◐ Placeholder

---

### Content Creation Features

#### Create Post
**User Flow**:
1. User taps Post tab (or FAB)
2. ComposeScreen opens as modal
3. User enters title (required, max 140 chars)
4. User enters body (required, max 10000 chars)
5. User taps Submit
6. Challenge fetched from RPC
7. MiningProgress overlay appears
8. Native Argon2 mining (~51 seconds)
9. Content signed with keypair
10. Post submitted via RPC
11. Success → Modal closes, navigate to new post

**Components**: `ComposeScreen`, `MiningProgress`, `MiningTip`, `Button`
**Hooks**: `useKeypair`, `useMobilePow`
**RPC Methods**:
- `getChallenge('post')` → Get PoW challenge
- `submitPost()` → Submit signed post with PoW proof
**Protocol**: Difficulty 9 (~51s), Argon2id (64 MiB, 3 iterations)
**Status**: ✓ Complete

#### Create Reply
**User Flow**:
1. User views ThreadViewScreen
2. Taps "Reply" button
3. ComposeScreen opens with replyTo param
4. User enters body (no title for replies)
5. Mining and submission (same as post)

**Components**: `ComposeScreen`, `ThreadViewScreen`, `MiningProgress`
**Hooks**: `useKeypair`, `useMobilePow`
**RPC Methods**:
- `getChallenge('reply')`
- `submitReply()`
**Protocol**: Difficulty 8 (~26s)
**Status**: ✓ Complete

#### Mining Progress Display
**User Flow**:
1. Mining starts
2. Full-screen overlay with circular progress
3. Shows: progress %, estimated time, battery estimate
4. Rotating educational tips (MiningTip)
5. Options: Cancel or Continue Browsing

**Components**: `MiningProgress`, `MiningTip`
**Hooks**: `useMobilePow` (progress, state, cancel)
**Status**: ✓ Complete

#### Cancel Mining
**User Flow**: User taps Cancel → Mining aborted → Return to compose
**Components**: `MiningProgress`
**Hooks**: `useMobilePow.cancel()`
**Status**: ✓ Complete

---

### Content Viewing Features

#### Home Feed
**User Flow**:
1. App opens to HomeScreen
2. Display subscribed spaces (horizontal list)
3. Display pools at risk (horizontal scroll)
4. Display recent threads (vertical list)
5. Pull to refresh all data

**Components**: `HomeScreen`, `SpaceCard`, `ThreadList`, `ThreadCard`, `PoolsNeedingHelp`, `SyncStatus`
**Hooks**: `useRpcConnection`, `useSpaces`, `useRecentContent`, `usePoolsAtRisk`
**RPC Methods**:
- `listSpaces()` → Fetch spaces
- `getRecentContent(20)` → Recent threads
- `getPoolsAtRisk(0.1)` → At-risk content
**Status**: ✓ Complete

#### Space View
**User Flow**:
1. User taps SpaceCard on home
2. SpaceViewScreen loads
3. Threads filtered to parent_id === null
4. Pull to refresh
5. Tap thread → ThreadViewScreen

**Components**: `SpaceViewScreen`, `ThreadList`, `ThreadCard`, `Button`
**Hooks**: `useSpaceThreads(spaceId)`
**RPC Methods**: `listSpaceContent(spaceId, {limit: 50, sort: 'recent'})`
**Status**: ✓ Complete

#### Thread View
**User Flow**:
1. User taps ThreadCard
2. ThreadViewScreen loads
3. Post content displayed (title, body, author)
4. Engagement pool status shown
5. Replies listed below
6. Actions: Engage, Reply

**Components**: `ThreadViewScreen`, `PostContent`, `EngagementPool`, `ReplyList`, `ReplyItem`, `HeatIndicator`
**Hooks**: `useThread(contentId)`
**RPC Methods**:
- `getContent(contentId)` → Fetch post
- `getReplies(contentId)` → Fetch replies
**Status**: ✓ Complete

#### Search Spaces
**User Flow**:
1. User taps Search tab
2. Enter query in TextInput
3. Results filtered from mock data
4. Tap SpaceCard → SpaceViewScreen

**Components**: `SearchScreen`, `SpaceCard`
**Hooks**: Local state (client-side filtering)
**RPC Methods**: None (mock data)
**Status**: ◐ Partial (no RPC integration)

#### Search Threads
**User Flow**: User switches to Threads tab → Placeholder shown
**Components**: `SearchScreen`
**Status**: ◐ Placeholder

---

### User Interaction Features

#### Engagement Pool Contribution
**User Flow**:
1. View thread with engagement pool
2. Tap contribution button (5s / 15s / 30s)
3. Simulated 2-second delay
4. Pool seconds increment (mock)

**Components**: `EngagementPool`, `HeatBar`, `Button`
**Hooks**: `useMobilePow` (planned)
**RPC Methods**: `submitEngagement()` (planned)
**Status**: ◐ Partial (simulated, not real PoW)

#### Space Subscription Toggle
**User Flow**: SpaceViewScreen → Tap Subscribe/Unsubscribe button
**Components**: `SpaceViewScreen`, `Button`
**Status**: ◐ Partial (UI only, not persisted)

#### Pull-to-Refresh
**User Flow**: Pull down on any list → RefreshControl activates → Data refetched
**Components**: All list screens (HomeScreen, SpaceViewScreen, ThreadViewScreen)
**Hooks**: `refresh()` from data hooks
**Status**: ✓ Complete

#### Copy Address
**User Flow**: Tap address → Copied to clipboard → Haptic feedback
**Components**: `AddressDisplay`
**Status**: ✓ Complete

---

### Settings & Configuration Features

#### Storage Profile Selection
**User Flow**:
1. Profile → Storage
2. View current usage breakdown
3. Select profile (1GB / 5GB / 10GB)
4. Profile saved to AsyncStorage

**Components**: `StorageScreen`, `StorageBreakdown`, `StorageProfileSelector`
**Service**: `StorageManager`
**Profiles**:
| Profile | Max Storage | Eviction Threshold |
|---------|-------------|-------------------|
| Budget1GB | 1 GB | 85% |
| Standard5GB | 5 GB | 90% |
| Flagship10GB | 10 GB | 92% |
**Status**: ◐ Partial (UI complete, eviction mocked)

#### Clear Cache
**User Flow**: Storage screen → Clear category or Clear All → Alert confirmation
**Components**: `StorageScreen`, `StorageBreakdown`, `Button`
**Status**: ◐ Placeholder

#### Sync Settings
**User Flow**: Profile → Settings → Toggle switches
**Options**:
- WiFi-only full sync
- Background sync enabled
- Haptic feedback
- Notifications

**Components**: `SettingsScreen`, `Switch`, `TouchPressable`
**Status**: ◐ Partial (UI only, not persisted)

#### Cellular Budget Selection
**User Flow**: Settings → Select 50MB / 100MB / 200MB cellular budget
**Components**: `SettingsScreen`, `TouchPressable`
**Status**: ◐ Partial (UI only)

---

### Offline Features

#### Offline Queue View
**User Flow**:
1. Profile → Offline Queue
2. View pending/failed actions
3. Summary shows pending/failed counts
4. Each item shows: type, space, content preview, status

**Components**: `QueueScreen`, `Card`, `QueueBadge`
**Service**: `OfflineQueue`
**Status**: ✓ Complete (UI)

#### Queue Badge
**User Flow**: Profile menu shows badge with pending count
**Components**: `ProfileScreen`, `QueueBadge`
**Status**: ✓ Complete

#### Retry Failed Action
**User Flow**: Queue screen → Tap Retry on failed item → Status resets to pending
**Components**: `QueueScreen`, `Button`
**Service**: `offlineQueue.retry(id)`
**Status**: ◐ Partial (UI only, processing mocked)

#### Delete Queued Action
**User Flow**: Queue screen → Tap Delete → Action removed from queue
**Components**: `QueueScreen`, `Button`
**Service**: `offlineQueue.remove(id)`
**Status**: ◐ Partial (UI only)

#### Process Queue
**User Flow**: Queue screen → Process Queue button → All pending processed
**Components**: `QueueScreen`, `Button`
**Status**: ◐ Placeholder

---

### Real-time Features

#### Sync Status Display
**User Flow**: View sync indicator on Home or Profile
**Displays**: sync mode (full/headers/paused), connection status, cellular usage
**Components**: `SyncStatus`
**Service**: `NetworkMonitor`
**Status**: ✓ Complete

#### Fork Status Display
**User Flow**: Profile → View fork indicator
**Displays**: fork ID, main chain status, participant count, divergence warning
**Components**: `ForkIndicator`, `ProfileScreen`
**Status**: ◐ Placeholder (mock data)

#### Auto-Reconnect
**User Flow**: Connection lost → Auto-reconnect every 5s → Status updates
**Components**: `SyncStatus`
**Hooks**: `useRpcConnection`
**Service**: `SwimchainRpc.startAutoReconnect(5000)`
**Status**: ✓ Complete

---

### Tidal UX Features (Not Integrated)

These advanced UX features are fully implemented but not yet integrated into the main app flow.

#### Breath Indicator
**Purpose**: Visualize content survival probability through breathing animation
**User Flow**: View animated dots indicating content vitality
**Components**: `src/components/tidal/BreathIndicator.tsx`
**States**: strong (≥80%) → steady (≥50%) → fading (≥20%) → gasping (<20%) → final (<5%)
**Status**: ✓ Complete (not integrated)

#### Hold-to-Tend Gesture
**Purpose**: Long-press to contribute PoW to content
**User Flow**: Hold on content → Progress fills → Tier reached → Contribution
**Components**: `src/components/tidal/TendGesture.tsx`
**Tiers**: 5s (1s hold), 15s (2.5s hold), 30s (5s hold)
**Status**: ✓ Complete (not integrated)

#### Depth Feed
**Purpose**: Organize content by survival time instead of chronology
**User Flow**: Scroll through depth layers (surface → shallows → deep → archive)
**Components**: `src/components/tidal/DepthFeed.tsx`
**Layers**:
| Layer | Age | Metaphor |
|-------|-----|----------|
| Surface 🌊 | <1h | Fresh content |
| Shallows 🐚 | 1-6h | Finding footing |
| The Deep 🦑 | 6-24h | Proven survivors |
| Archive 🏛️ | >24h | Permanent |
**Status**: ✓ Complete (not integrated)

#### Rescue Mission
**Purpose**: Collaborative modal to save at-risk content
**User Flow**: Content at risk → Join rescue → Multiple users contribute → Content saved
**Components**: `src/components/tidal/RescueMission.tsx`
**Status**: ✓ Complete (not integrated)

#### Stewardship Profile
**Purpose**: User's tending statistics and contribution garden
**User Flow**: View garden of content user has helped, tending stats
**Components**: `src/components/tidal/StewardshipProfile.tsx`
**Status**: ✓ Complete (not integrated)

---

### Feature Matrix

| Feature | Status | Components | Hooks | RPC Methods |
|---------|--------|------------|-------|-------------|
| Tab Navigation | ✓ Complete | TabNavigator, RootNavigator | useNavigation | - |
| Stack Navigation | ✓ Complete | HomeStackNavigator, ProfileStackNavigator | useNavigation, useRoute | - |
| Identity Generation | ✓ Complete | IdentityCard | useStoredIdentity, useKeypair | - |
| Identity Display | ✓ Complete | ProfileScreen, AddressDisplay | useStoredIdentity | - |
| Identity Export | ◐ Placeholder | IdentityCard | - | - |
| Create Post | ✓ Complete | ComposeScreen, MiningProgress | useMobilePow, useKeypair | getChallenge, submitPost |
| Create Reply | ✓ Complete | ComposeScreen, MiningProgress | useMobilePow, useKeypair | getChallenge, submitReply |
| Home Feed | ✓ Complete | HomeScreen, ThreadList, SpaceCard | useSpaces, useRecentContent, usePoolsAtRisk | listSpaces, getRecentContent, getPoolsAtRisk |
| Space View | ✓ Complete | SpaceViewScreen, ThreadList | useSpaceThreads | listSpaceContent |
| Thread View | ✓ Complete | ThreadViewScreen, PostContent, ReplyList | useThread | getContent, getReplies |
| Search Spaces | ◐ Partial | SearchScreen, SpaceCard | - | - (mock) |
| Search Threads | ◐ Placeholder | SearchScreen | - | - |
| Engagement | ◐ Partial | EngagementPool, HeatBar | useMobilePow | submitEngagement (planned) |
| Space Subscribe | ◐ Partial | SpaceViewScreen | - | - |
| Pull-to-Refresh | ✓ Complete | All list screens | refresh() | Various |
| Storage Profile | ◐ Partial | StorageScreen, StorageProfileSelector | - | - |
| Clear Cache | ◐ Placeholder | StorageScreen | - | - |
| Sync Settings | ◐ Partial | SettingsScreen | - | - |
| Offline Queue | ◐ Partial | QueueScreen | - | - |
| Sync Status | ✓ Complete | SyncStatus | useRpcConnection | - |
| Fork Status | ◐ Placeholder | ForkIndicator | - | - |
| Auto-Reconnect | ✓ Complete | SyncStatus | useRpcConnection | - |
| Breath Indicator | ✓ Complete* | BreathIndicator | - | - |
| Hold-to-Tend | ✓ Complete* | TendGesture | useMobilePow | - |
| Depth Feed | ✓ Complete* | DepthFeed | - | - |
| Rescue Mission | ✓ Complete* | RescueMission | - | - |
| Stewardship Profile | ✓ Complete* | StewardshipProfile | - | - |

*Not integrated into main app flow

## Known Issues & Limitations

### Incomplete Features
- **Identity Export**: Shows "Coming Soon" alert instead of actual export
- **Engagement Contribution**: Simulated with 2-second delay, not real PoW
- **Search Threads Tab**: Shows placeholder message
- **Settings Persistence**: Changes not saved to AsyncStorage
- **Queue Processing**: Mocked, no actual retry logic
- **Fork Status**: Uses mock data
- **Background Mining**: Just navigates back, doesn't actually run in background

### Tidal UX Not Integrated
The Tidal UX components (BreathIndicator, TendGesture, DepthFeed, RescueMission, StewardshipProfile) are fully implemented but not integrated into the main navigation flow.

### Platform Limitations
- Native Argon2 module requires native build setup
- Haptic feedback only works on physical devices
- Background mining limited by OS restrictions

## Future Improvements

### Planned Features
1. **Complete Identity Export** - QR code or secure file export
2. **Real Engagement Mining** - Connect PoW to engagement contribution
3. **Search Implementation** - Full text search with thread results
4. **Settings Persistence** - Save preferences to AsyncStorage
5. **Queue Auto-Retry** - Automatic retry with exponential backoff
6. **Live Fork Status** - Real-time fork detection and warning
7. **Background Mining** - Continue mining when app is backgrounded

### Tidal UX Integration
1. Add depth-based feed option to Home screen
2. Integrate breath indicators with thread cards
3. Add rescue mission notifications for at-risk content
4. Add stewardship profile to Profile tab

### Performance Improvements
1. Implement content caching with stale-while-revalidate
2. Add image caching with memory-aware eviction
3. Optimize FlatList with getItemLayout for all lists
4. Add skeleton loading states

### Enhanced Features
1. Push notifications for content interactions
2. Deep linking for sharing content
3. Biometric authentication for identity
4. Multi-account support
