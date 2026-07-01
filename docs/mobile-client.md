# Swimchain Mobile Client

A touch-first mobile client for iOS and Android with full node capability, implementing the Swimchain protocol with battery-conscious proof-of-work.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Build Instructions](#build-instructions)
4. [Component Catalog](#component-catalog)
5. [Navigation Structure](#navigation-structure)
6. [Native Modules](#native-modules)
7. [Offline Capability](#offline-capability)
8. [Storage Management](#storage-management)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting](#troubleshooting)

## Architecture Overview

The mobile client is built with React Native and consists of:

- **Native Argon2id Module**: Platform-specific implementations for battery-efficient PoW
- **Offline Queue**: Persistent queue for actions created without connectivity
- **Network Monitor**: Tracks connectivity and manages sync mode (WiFi vs cellular)
- **Storage Manager**: Handles local data with automatic eviction
- **Touch-Optimized Components**: All UI elements meet 44pt minimum touch targets

### Key Dependencies

- React Native 0.73+
- React Navigation 6.x
- React Native Reanimated 3.x
- React Native Gesture Handler 2.x
- AsyncStorage for persistence

## Project Structure

```
mobile-client/
├── App.tsx                    # Main entry point
├── index.js                   # React Native entry
├── package.json               # Dependencies
├── metro.config.js            # Metro bundler config
├── tsconfig.json              # TypeScript config
├── ios/                       # iOS native code
│   ├── Podfile               # CocoaPods dependencies
│   ├── NativeArgon2.swift    # Argon2id implementation
│   └── NativeArgon2.m        # Objective-C bridge
├── android/                   # Android native code
│   └── app/src/main/java/
│       └── com/swimchainmobile/
│           └── argon2/       # Argon2id implementation
└── src/
    ├── components/           # Reusable UI components
    ├── screens/              # Screen components
    ├── navigation/           # Navigation configuration
    ├── hooks/                # Custom React hooks
    ├── services/             # Business logic services
    ├── stores/               # State management
    ├── constants/            # App constants
    ├── theme/                # Styling constants
    ├── native/               # Native module interfaces
    └── providers/            # React context providers
```

## Build Instructions

### Prerequisites

- Node.js 18+
- Yarn or npm
- Xcode 15+ (for iOS)
- Android Studio (for Android)
- CocoaPods (for iOS)

### iOS Build

```bash
cd mobile-client

# Install dependencies
yarn install

# Install iOS pods
cd ios && pod install && cd ..

# Run on iOS Simulator
yarn ios

# Build for release
yarn ios --configuration Release
```

### Android Build

```bash
cd mobile-client

# Install dependencies
yarn install

# Run on Android emulator
yarn android

# Build release APK
cd android && ./gradlew assembleRelease
```

### Development Server

```bash
# Start Metro bundler
yarn start

# Clear cache if needed
yarn start --reset-cache
```

## Component Catalog

### Core Components

| Component | Description | Touch Target |
|-----------|-------------|--------------|
| `TouchPressable` | Touch-optimized Pressable wrapper | 44pt min |
| `Button` | Standard button with variants | 44pt min |
| `Card` | Container card with elevation | N/A |
| `HeatIndicator` | Decay status dot | 8-16pt |
| `HeatBar` | Engagement pool progress | 44pt min |
| `HeatBadge` | Compact heat badge | 24×36pt |

### Thread Components

| Component | Description |
|-----------|-------------|
| `ThreadCard` | Thread list item (88pt height) |
| `ThreadList` | Virtualized thread list |
| `SwipeableThreadCard` | Thread card with swipe actions |
| `PostContent` | Post title and body display |
| `ReplyItem` | Single reply with depth indicator |
| `ReplyList` | List of replies with threading |

### Engagement Components

| Component | Description |
|-----------|-------------|
| `EngagementPool` | Pool progress and contribution buttons |
| `MiningProgress` | Full-screen mining overlay |
| `MiningTip` | Rotating educational tips |

### Status Components

| Component | Description |
|-----------|-------------|
| `ForkIndicator` | Current fork status badge |
| `SyncStatus` | Network and sync state |
| `QueueBadge` | Pending queue count |
| `StorageBreakdown` | Storage usage chart |

## Navigation Structure

The app uses a bottom tab navigator with nested stacks:

```
Root Navigator (Stack)
├── Main (Tab Navigator)
│   ├── Home (Stack)
│   │   ├── HomeScreen
│   │   ├── SpaceViewScreen
│   │   └── ThreadViewScreen
│   ├── Search
│   │   └── SearchScreen
│   ├── Post (opens modal)
│   └── Profile (Stack)
│       ├── ProfileScreen
│       ├── StorageScreen
│       ├── SettingsScreen
│       └── QueueScreen
└── Compose (Modal)
```

## Native Modules

### NativeArgon2

Platform-specific Argon2id implementation for efficient PoW mining.

**Configuration** (per SPEC_03):
- Memory: 64 MiB (65536 KiB)
- Iterations: 3
- Parallelism: 2
- Hash Length: 32 bytes

**TypeScript Interface:**

```typescript
interface NativeArgon2Module {
  hash(input: Uint8Array, salt: Uint8Array, config: Argon2Config): Promise<Uint8Array>;

  mine(
    challenge: Uint8Array,
    difficulty: number,
    config: Argon2Config,
    onProgress: (progress: MiningProgress) => void,
  ): Promise<PowSolution>;

  cancel(): void;
  isAvailable(): boolean;
}
```

**Progress Events:**
- `currentNonce`: Current nonce being tested
- `hashesPerSecond`: Mining rate
- `elapsedMs`: Time spent mining
- `estimatedRemainingMs`: Estimated time to solution

## Offline Capability

### Queue System

Actions created offline are stored in AsyncStorage and processed when connectivity returns:

1. User creates action (post/reply/engage)
2. Action added to queue with `pending` status
3. On connectivity restore:
   - Fetch fresh challenge
   - Compute PoW
   - Submit to network
4. Success: Remove from queue
5. Failure: Retry up to 3 times, then mark `failed`

### Queue Item Structure

```typescript
interface QueuedAction {
  id: string;
  type: 'post' | 'reply' | 'engage';
  spaceId: string;
  content?: { title?: string; body: string };
  status: 'pending' | 'processing' | 'failed';
  retryCount: number;
  createdAt: number;
  error?: string;
}
```

## Storage Management

### Storage Profiles

| Profile | Limit | Eviction Threshold |
|---------|-------|-------------------|
| Budget1GB | 1 GB | 85% |
| Standard5GB | 5 GB | 90% |
| Flagship10GB | 10 GB | 92% |

### Eviction Priority

Content is evicted in this order (lowest priority first):

1. **OldUnfollowed**: >7 days, not in subscribed spaces
2. **OldFollowed**: >7 days, in subscribed spaces
3. **RecentFollowed**: ≤7 days, in subscribed spaces
4. **Pinned**: User-pinned content
5. **OwnContent**: User's own content (never evicted)

### Storage Categories

- **Your Content**: Posts and replies you authored
- **Pinned**: Content you explicitly pinned
- **Subscribed**: Content from subscribed spaces
- **Other**: Cached content from browsing

## Performance Optimization

### Memory Budget

- Baseline: 150 MB
- Peak (during PoW): 300 MB
- Image cache: 50 MB max

### FlatList Optimization

```typescript
const VIRTUALIZATION_CONFIG = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 5,
  windowSize: 5,
  removeClippedSubviews: true,
  getItemLayout: (data, index) => ({
    length: THREAD_CARD_HEIGHT,
    offset: THREAD_CARD_HEIGHT * index,
    index,
  }),
};
```

### Memoization

- All list item components use `React.memo`
- Expensive calculations use `useMemo`
- Event handlers use `useCallback`

## Troubleshooting

### Common Issues

**Metro bundler fails to start:**
```bash
yarn start --reset-cache
```

**iOS pod install fails:**
```bash
cd ios
rm -rf Pods Podfile.lock
pod install --repo-update
```

**Android build fails:**
```bash
cd android
./gradlew clean
cd ..
yarn android
```

**Native module not found:**
- iOS: Ensure pods are installed and project rebuilt
- Android: Clean and rebuild the project

### Debug Tools

- **Flipper**: Network inspection, layout inspection
- **React DevTools**: Component hierarchy, state inspection
- **Systrace** (Android): Performance profiling
- **Instruments** (iOS): Memory and performance profiling

### Logs

```bash
# iOS logs
npx react-native log-ios

# Android logs
npx react-native log-android

# Metro logs
yarn start --verbose
```
