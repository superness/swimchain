# Bridge Client - Client Documentation

## Overview

The **Bridge Client** (`@swimchain/bridge-client`) is a specialized Swimchain application that enables bidirectional message bridging between Swimchain and external communication platforms (Matrix and IRC). It allows communities using traditional chat protocols to participate in Swimchain spaces without requiring users to directly interact with the blockchain.

**Target Users:**
- Community administrators who want to integrate their Matrix rooms or IRC channels with Swimchain
- Bridge operators connecting decentralized and traditional communication platforms
- Developers building cross-platform chat infrastructure

**Key Capabilities:**
- Bidirectional message bridging (Matrix/IRC <-> Swimchain)
- Browser-based Argon2id Proof-of-Work mining
- Echo prevention to avoid message loops
- Sliding window rate limiting (10 posts/hour/space)
- Daily PoW budget tracking (3600 seconds default)

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

# Run linting
pnpm lint
```

**Prerequisites:**
- Node.js >= 18.0.0
- A running Swimchain node (default: localhost:3030)
- For IRC: A WebSocket-to-IRC proxy (e.g., webircgateway)
- For Matrix: Access token from your Matrix homeserver

## Architecture

### Tech Stack

- **Framework**: React 18.2.0
- **Language**: TypeScript 5.3.0
- **Build Tool**: Vite 5.0.0
- **Styling**: CSS Variables with dark theme (WCAG 2.1 AA compliant)
- **State**: React Context + Singleton Services
- **Routing**: react-router-dom 6.20.0
- **PoW**: hash-wasm 4.12.0 (Argon2id)

### Directory Structure

```
src/
├── adapters/         # Platform adapters (Matrix, IRC)
│   ├── MatrixAdapter.ts
│   └── IrcAdapter.ts
├── components/       # Reusable UI components
│   ├── ErrorBoundary.tsx
│   └── Loading.tsx
├── hooks/            # Custom React hooks
│   ├── useRpc.tsx
│   ├── useBridgeEngine.ts
│   ├── useStoredIdentity.ts
│   ├── useStoredKeypair.ts
│   └── useActionPow.ts
├── lib/              # Utilities and helpers
│   ├── rpc.ts
│   └── action-pow.ts
├── pages/            # Route page components
│   ├── Dashboard.tsx
│   ├── MatrixConfig.tsx
│   ├── IrcConfig.tsx
│   ├── Settings.tsx
│   └── ActivityLog.tsx
├── services/         # Core business logic
│   ├── BridgeEngine.ts
│   ├── EchoTracker.ts
│   └── RateLimiter.ts
├── styles/           # Global styles
│   └── globals.css
├── types/            # TypeScript definitions
│   ├── index.ts
│   └── constants.ts
├── App.tsx           # Main app with routing
└── main.tsx          # Entry point
```

### Component Hierarchy

```
ErrorBoundary
└── SwimchainProvider (WASM initialization)
    └── RpcProvider (Node connection)
        └── App
            └── BrowserRouter
                └── Routes
                    ├── Dashboard
                    ├── MatrixConfig
                    ├── IrcConfig
                    ├── ActivityLog
                    └── Settings
```

## Features

### Dashboard Overview
**Description**: Main control center for the bridge, showing connection status, platform health, recent activity, and PoW budget.
**User Flow**:
1. User opens the application (redirects to `/dashboard`)
2. Views connection status for all platforms (Matrix, IRC, Swimchain)
3. Clicks "Connect Bridge" to start bridging
4. Monitors activity feed and PoW budget
**Components**: `Dashboard`
**Status**: Complete

---

### Matrix Integration
**Description**: Configure and connect to Matrix homeservers for bidirectional message bridging.
**User Flow**:
1. Navigate to `/matrix` from dashboard
2. Enter homeserver URL (e.g., `https://matrix.org`)
3. Enter user ID (e.g., `@user:matrix.org`)
4. Paste access token (from Element: Settings -> Help & About -> Advanced)
5. Add room IDs to bridge (e.g., `!room:matrix.org`)
6. Save configuration and return to dashboard
**Components**: `MatrixConfig`, `MatrixAdapter`
**Status**: Complete

---

### IRC Integration
**Description**: Configure IRC server connections via WebSocket proxy for browser compatibility.
**User Flow**:
1. Navigate to `/irc` from dashboard
2. Enter IRC server (e.g., `irc.libera.chat`)
3. Configure port (default: 6697) and TLS
4. Set nickname for the bridge bot
5. Add channels to bridge (e.g., `#channel`)
6. Configure WebSocket proxy URL
7. Save configuration
**Components**: `IrcConfig`, `IrcAdapter`
**Status**: Complete

---

### Bridge Settings
**Description**: General bridge configuration including target space and rate limits.
**User Flow**:
1. Navigate to `/settings` from dashboard
2. Enable/disable the bridge globally
3. Set target Swimchain space ID
4. Configure max posts per hour (rate limiting)
5. Set daily PoW budget in seconds
6. Save settings or reset to defaults
**Components**: `Settings`
**Status**: Complete

---

### Activity Logging
**Description**: Comprehensive log of all bridge activity with filtering capabilities.
**User Flow**:
1. Navigate to `/activity` from dashboard
2. View table of all bridge activities
3. Filter by type: All, Messages Bridged, Errors, Connections, Rate Limited
4. Monitor direction indicators (inbound vs outbound)
**Components**: `ActivityLog`
**Status**: Complete

---

### Proof-of-Work Mining
**Description**: Browser-based Argon2id PoW mining for Swimchain content submission.
**User Flow**:
1. Message arrives from Matrix/IRC
2. BridgeEngine checks rate limits and PoW budget
3. PoW is mined with progress tracking
4. Content is submitted to Swimchain with PoW proof
5. Daily budget is decremented
**Components**: `BridgeEngine`, `useActionPow`
**Status**: Complete

---

### Echo Prevention
**Description**: Prevents infinite message loops by tracking bridged messages.
**User Flow**:
1. Message arrives for bridging
2. EchoTracker checks if message was already bridged
3. If already seen within TTL (1 hour), message is skipped
4. Successfully bridged messages are recorded
**Components**: `EchoTracker`
**Status**: Complete

## Components Reference

### ErrorBoundary
**Location**: `src/components/ErrorBoundary.tsx`
**Purpose**: React error boundary that catches JavaScript errors in child components and displays a fallback UI with retry options.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| children | ReactNode | Yes | Child components to wrap |
| fallback | ReactNode | No | Custom fallback UI to display on error |

**Usage**:
```tsx
<ErrorBoundary fallback={<CustomErrorUI />}>
  <App />
</ErrorBoundary>
```

---

### LoadingScreen
**Location**: `src/components/Loading.tsx`
**Purpose**: Stateless loading spinner displayed during WASM initialization.

**Props**: None (stateless component)

**Usage**:
```tsx
<SwimchainProvider fallback={<LoadingScreen />}>
  <App />
</SwimchainProvider>
```

---

### Dashboard
**Location**: `src/pages/Dashboard.tsx`
**Purpose**: Main dashboard showing connection status, activity feed, and bridge controls.

**Props**: None (route component)

**State**:
| State | Type | Description |
|-------|------|-------------|
| engine | BridgeEngine | Singleton bridge engine |
| statuses | PlatformStatus[] | All platform statuses |
| recentActivity | ActivityLogEntry[] | Recent activity entries |
| isConnecting | boolean | Connection in progress |

**Usage**:
```tsx
// Accessed via route
<Route path="/dashboard" element={<Dashboard />} />
```

---

### MatrixConfig
**Location**: `src/pages/MatrixConfig.tsx`
**Purpose**: Configuration page for Matrix homeserver connection.

**Props**: None (route component)

**Form Fields**:
| Field | Type | Description |
|-------|------|-------------|
| enabled | checkbox | Enable Matrix bridging |
| homeserverUrl | url | Homeserver URL (e.g., https://matrix.org) |
| userId | text | Matrix user ID (e.g., @user:matrix.org) |
| accessToken | password | Access token for authentication |
| roomIds | list | Room IDs to bridge |

---

### IrcConfig
**Location**: `src/pages/IrcConfig.tsx`
**Purpose**: Configuration page for IRC server connection.

**Props**: None (route component)

**Form Fields**:
| Field | Type | Description |
|-------|------|-------------|
| enabled | checkbox | Enable IRC bridging |
| server | text | IRC server hostname |
| port | number | Server port (default: 6697) |
| tls | checkbox | Use TLS encryption |
| nickname | text | Bridge bot nickname |
| proxyUrl | url | WebSocket proxy URL |
| channels | list | Channels to bridge |

---

### Settings
**Location**: `src/pages/Settings.tsx`
**Purpose**: General bridge settings configuration.

**Props**: None (route component)

**Form Fields**:
| Field | Type | Description |
|-------|------|-------------|
| enabled | checkbox | Enable bridge globally |
| targetSpace | text | Swimchain space ID (sp1...) |
| maxPostsPerHour | number | Rate limit per hour per space |
| dailyPowBudgetSeconds | number | Max PoW seconds per day |

---

### ActivityLog
**Location**: `src/pages/ActivityLog.tsx`
**Purpose**: Full activity log with filtering.

**Props**: None (route component)

**Filter Options**:
- All Activities
- Messages Bridged
- Errors
- Connections
- Rate Limited

## Hooks Reference

### useRpc
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Access the RPC client context for Swimchain node communication.

**Returns**:
```typescript
{
  rpc: SwimchainRpc | null;    // RPC client instance
  connected: boolean;           // Whether connected to node
  connecting: boolean;          // Whether connection is in progress
  error: string | null;         // Connection error message
  reconnect: () => Promise<void>; // Manual reconnection trigger
}
```

**Usage**:
```tsx
const { rpc, connected, error } = useRpc();

if (connected && rpc) {
  const spaces = await rpc.listSpaces();
}
```

---

### useContentWatcher
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Poll for new content in a Swimchain space.

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| spaceId | string \| null | - | Space to watch |
| pollIntervalMs | number | 10000 | Polling interval in ms |

**Returns**:
```typescript
{
  newContent: ContentItem[];    // Newly detected content
  isWatching: boolean;          // Whether watching is active
  lastTimestamp: number;        // Last seen content timestamp
  resetTimestamp: () => void;   // Reset to current time
}
```

**Usage**:
```tsx
const { newContent, isWatching } = useContentWatcher('sp1abc...', 5000);
```

---

### useSpaceList
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Fetch available Swimchain spaces.

**Returns**:
```typescript
{
  spaces: Array<{
    space_id: string;
    post_count: number;
    name: string | null;
  }>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
```

**Usage**:
```tsx
const { spaces, isLoading, refresh } = useSpaceList();
```

---

### useBridgeEngineRpc
**Location**: `src/hooks/useBridgeEngine.ts`
**Purpose**: Connect the BridgeEngine singleton to the RPC client.

**Returns**: `void`

**Usage**:
```tsx
// Call once in Dashboard or App
useBridgeEngineRpc();
```

---

### useStoredIdentity
**Location**: `src/hooks/useStoredIdentity.ts`
**Purpose**: Manage bridge identity in localStorage.

**Returns**:
```typescript
{
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

### useStoredKeypair
**Location**: `src/hooks/useStoredKeypair.ts`
**Purpose**: Create a WASM Keypair from stored identity for signing operations.

**Returns**:
```typescript
{
  keypair: Keypair | null;       // WASM Keypair object
  publicKey: Uint8Array | null;  // Public key bytes
  publicKeyHex: string | null;   // Public key as hex
  address: string | null;        // bech32m address
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
  hasIdentity: boolean;
}
```

**Usage**:
```tsx
const { keypair, sign, hasIdentity } = useStoredKeypair();

if (hasIdentity) {
  const signature = sign(messageBytes);
}
```

---

### useActionPow
**Location**: `src/hooks/useActionPow.ts`
**Purpose**: Mine Proof-of-Work for Swimchain actions with progress tracking.

**Returns**:
```typescript
{
  mineForReply: (content: string) => Promise<ActionPowResult | null>;
  mineForPost: (title: string, body: string) => Promise<ActionPowResult | null>;
  isMining: boolean;
  progress: MiningProgress | null;
  cancel: () => void;
  error: string | null;
  isReady: boolean;
}
```

**Usage**:
```tsx
const { mineForPost, isMining, progress, cancel } = useActionPow();

const result = await mineForPost('Title', 'Body content');
```

## State Management

### Context Providers

#### RpcProvider
**Location**: `src/hooks/useRpc.tsx`

Provides Swimchain RPC client to the component tree with automatic connection and retry logic.

```tsx
// In main.tsx
<RpcProvider>
  <App />
</RpcProvider>

// In components
const { rpc, connected } = useRpc();
```

#### SwimchainProvider
**Location**: `@swimchain/react` (external package)

Initializes WASM modules and provides Swimchain core functionality.

```tsx
<SwimchainProvider
  fallback={<LoadingScreen />}
  onLoad={() => console.log('WASM loaded')}
  onError={(err) => console.error('WASM failed:', err)}
>
  {children}
</SwimchainProvider>
```

### Singleton Services

| Service | Location | Purpose |
|---------|----------|---------|
| BridgeEngine | `src/services/BridgeEngine.ts` | Coordinates all bridging logic |
| EchoTracker | `src/services/EchoTracker.ts` | Prevents message loops |
| HourlyRateLimiter | `src/services/RateLimiter.ts` | Sliding window rate limiting |

### Data Flow

```
External Platform (Matrix/IRC)
         │
         ▼
    ┌─────────────┐
    │   Adapter   │  (MatrixAdapter / IrcAdapter)
    │  (polling)  │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ BridgeEngine│  (singleton)
    │             │
    │ ├─EchoTracker
    │ ├─RateLimiter
    │ └─PoW Mining
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ SwimchainRpc│  (via RpcProvider)
    └──────┬──────┘
           │
           ▼
     Swimchain Node
```

## RPC Integration

### Methods Used

| Method | Purpose | Component |
|--------|---------|-----------|
| GET /info | Connect and get node info | RpcProvider |
| GET /spaces | List available spaces | useSpaceList |
| GET /spaces/:id/content | Fetch space content | BridgeEngine |
| submit_post (JSON-RPC) | Submit bridged post with PoW | BridgeEngine |
| submit_reply (JSON-RPC) | Submit reply with PoW | useActionPow |

### Signature Authentication

```
Headers for JSON-RPC requests:
X-CS-Identity: <public_key_hex>
X-CS-Timestamp: <unix_seconds>
X-CS-Signature: <signature_hex>

Message format:
swimchain-rpc:<method>:<sha256(params_json)>:<timestamp>
```

## Styling Guide

The application uses CSS custom properties for a consistent dark theme.

**Key Variables**:
```css
:root {
  --color-bg-primary: #0f0f1a;
  --color-bg-secondary: #1a1a2e;
  --color-accent-primary: #00d4ff;
  --color-success: #4caf50;
  --color-error: #f44336;
  --platform-matrix: #0dbd8b;
  --platform-irc: #5865f2;
  --platform-swimchain: #00d4ff;
}
```

**Accessibility**:
- WCAG 2.1 AA compliant color contrast
- Focus-visible outlines
- Semantic HTML elements
- ARIA attributes for dynamic content

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

**Test Stack**:
- Vitest: Test runner
- Testing Library: React component testing
- happy-dom: Browser environment simulation

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| (none required) | All config via localStorage | - |

### localStorage Keys

| Key | Description |
|-----|-------------|
| bridge_config | Bridge configuration (target space, rate limits) |
| bridge_matrix_state | Matrix sync token |
| bridge_irc_state | IRC connection state |
| bridge_rate_limits | Rate limit timestamps |
| bridge_activity_log | Activity log entries |
| bridge_pow_state | Daily PoW usage tracking |
| swimchain-bridge-identity | Bridge signing identity |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| MAX_BRIDGE_POSTS_PER_HOUR | 10 | Rate limit per space |
| RATE_LIMIT_WINDOW_MS | 3600000 | 1 hour sliding window |
| ECHO_TTL_MS | 3600000 | 1 hour echo tracking |
| DAILY_POW_BUDGET_SECS | 3600 | 1 hour PoW daily budget |
| MATRIX_POLL_INTERVAL_MS | 5000 | 5 second Matrix polling |
| IRC_POLL_INTERVAL_MS | 1000 | 1 second IRC polling |
| CS_POLL_INTERVAL_MS | 10000 | 10 second Swimchain polling |

### PoW Configuration

**Testnet (default for browser)**:
| Action | Difficulty | Memory | Iterations | Parallelism |
|--------|------------|--------|------------|-------------|
| Post | 10 bits | 8 MiB | 1 | 2 |
| Reply | 8 bits | 8 MiB | 1 | 2 |
| Engage | 6 bits | 8 MiB | 1 | 2 |

**Production**:
| Action | Difficulty | Memory | Iterations | Parallelism |
|--------|------------|--------|------------|-------------|
| Post | 20 bits | 64 MiB | 3 | 4 |
| Reply | 18 bits | 64 MiB | 3 | 4 |
| Engage | 16 bits | 64 MiB | 3 | 4 |

## Known Issues & Limitations

- **IRC requires WebSocket proxy**: Browsers cannot connect directly to IRC servers; a WebSocket-to-IRC proxy is required
- **Production PoW too heavy for browser**: 64 MiB Argon2id is impractical in browsers; testnet config (8 MiB) is recommended
- **No offline support**: Requires active connection to both Swimchain node and external platforms
- **Single target space**: Bridge can only target one Swimchain space at a time
- **No message threading**: Replies bridged as top-level posts due to threading complexity
- **Text-only bridging**: Images, embeds, and other media are not bridged
- **No user registration UI**: Identity must be pre-configured externally

## Future Improvements

- Multi-space bridging: Support multiple Swimchain spaces simultaneously
- Message threading: Preserve thread structure across platforms
- Media bridging: Support images and file attachments
- Discord integration: Add Discord as a bridged platform
- Telegram integration: Add Telegram as a bridged platform
- Worker-based PoW: Move PoW mining to Web Workers for better UI responsiveness
- Push notifications: Notify when bridging fails or rate limits are hit
- Admin dashboard: Web interface for monitoring multiple bridges
- Encrypted spaces: Support for bridging to private/encrypted Swimchain spaces
