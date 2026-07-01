# Chat-Client - Client Documentation

> **Last Updated:** 2026-01-12
> **Version:** 0.1.0
> **Status:** Production-ready with minor incomplete features

## Overview

The Swimchain Chat-Client is a Discord-style real-time messaging application built on the Swimchain protocol. It provides a familiar synchronous chat experience by mapping Discord concepts to Swimchain's decentralized data structures.

**Target Users**: Users seeking a familiar chat interface for decentralized, censorship-resistant messaging with built-in spam prevention through Proof-of-Work.

### Terminology Mapping

| Discord Concept | Swimchain Equivalent | ID Format |
|-----------------|---------------------|-----------|
| Server | Space | `sp1...` bech32m |
| Channel | Thread (Post) | `sha256:...` |
| Message | Reply | `sha256:...` |
| DM/Group DM | Private Space | `sp1...` |
| Reaction | Engagement | PoW-backed |
| Server Member | Space Member | Derived from activity |
| Server Admin | Space Creator | Author of space |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server (http://localhost:5175)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Type check
pnpm tsc --noEmit

# Run tests
pnpm test
pnpm test:watch
pnpm test:coverage

# Lint
pnpm lint
pnpm lint:fix
```

### Prerequisites

- Local Swimchain node running on testnet (port 19736)
- Node.js 18+
- pnpm package manager

## Architecture

### Tech Stack

- **Framework**: React 18.2.0
- **Language**: TypeScript 5.3
- **Build Tool**: Vite 5.0
- **Styling**: Component-scoped CSS (vanilla CSS files per component)
- **State**: React Context API + Custom Hooks
- **Routing**: react-router-dom 6.20.0
- **Desktop**: @tauri-apps/api 2.9.1 (optional)
- **Testing**: Vitest + @testing-library/react

### Directory Structure

```
src/
├── components/        # Reusable UI components (21 files)
│   ├── ServerList.tsx
│   ├── ChannelSidebar.tsx
│   ├── ChatArea.tsx
│   ├── MessageItem.tsx
│   ├── ChatMessageInput.tsx
│   ├── RequireIdentity.tsx
│   ├── MiningProgress.tsx
│   ├── HeatIndicator.tsx
│   ├── TypingIndicator.tsx
│   ├── OnlineUsers.tsx
│   ├── StatusBar.tsx
│   └── ...
├── pages/             # Page components (routes)
│   ├── Chat.tsx
│   ├── IdentityPage.tsx
│   ├── SettingsPage.tsx
│   └── SpaceChatPage.tsx
├── hooks/             # Custom React hooks (13 files)
│   ├── useRpc.tsx
│   ├── useServers.ts
│   ├── useChannels.ts
│   ├── useMessages.ts
│   ├── useActionPow.ts
│   ├── usePresence.ts
│   ├── useTypingIndicator.ts
│   └── ...
├── contexts/          # React context providers
│   ├── PresenceContext.tsx
│   └── TypingContext.tsx
├── layouts/           # Layout components
│   └── MainLayout.tsx
├── lib/               # Utilities and helpers
│   └── rpc.ts         # SwimchainRpc client (704 lines)
├── types/             # TypeScript definitions
│   └── index.ts       # Type definitions (356 lines)
├── utils/             # Helper functions
│   └── time.ts
├── mocks/             # Mock data for development
│   └── data.ts
├── styles/            # Global styles
│   └── globals.css
├── App.tsx            # Router setup
└── main.tsx           # Entry point with providers
```

### Provider Hierarchy

```
React.StrictMode
└── ErrorBoundary
    └── SwimchainProvider (WASM initialization)
        └── RpcProvider (node connection)
            └── IdentityProvider (user identity)
                └── PresenceProvider (online status)
                    └── TypingProvider (typing indicators)
                        └── BrowserRouter
                            └── App Routes
```

### Routing

| Route | Component | Auth | Description |
|-------|-----------|------|-------------|
| `/identity` | IdentityPage | No | Identity creation/import/management |
| `/` | Navigate | Yes | Redirects to `/channels/@me` |
| `/channels/@me` | Chat | Yes | Direct messages list |
| `/channels/:serverId` | Chat | Yes | Server view (auto-selects first channel) |
| `/channels/:serverId/:channelId` | Chat | Yes | Specific channel messages |
| `/settings` | SettingsPage | Yes | User preferences |
| `/servers/discover` | Chat | Yes | Public server discovery |
| `*` | Navigate | - | 404 fallback redirect |

## Features

### Identity Management
**Description**: Create, import, and manage Swimchain identity with PoW-based identity mining.

**User Flow**:
1. Navigate to `/identity`
2. Choose "Create New" or "Import Existing"
3. For new identity: Enter optional display name, mine PoW (difficulty 20)
4. View identity details: address, public key
5. Continue to chat

**Components**: `IdentityPage`, `MiningProgress`

**Hooks**: `useKeypair`, `usePow`, `useIdentityContext`, `useStoredKeypair`

**Status**: Complete

---

### Server Navigation
**Description**: Discord-style vertical server icon sidebar with unread indicators.

**User Flow**:
1. View server icons in left sidebar
2. Hover for server name tooltip
3. Click to navigate to server
4. See unread badge count and notification ping

**Components**: `ServerList`

**Hooks**: `useServers`

**RPC**: `listSpaces()`

**Status**: Complete

---

### Channel Navigation
**Description**: Channel list sidebar with categories, server header, and user area.

**User Flow**:
1. Select server to see channel list
2. View channels grouped by category (auto-detected from `[Category]` prefix)
3. Collapse/expand category groups
4. Click channel to view messages
5. See unread counts per channel

**Components**: `ChannelSidebar`

**Hooks**: `useChannels`

**RPC**: `listSpaceContent()`

**Status**: Complete

---

### Message Viewing
**Description**: Main chat area with message history, grouping, and reactions.

**User Flow**:
1. Select channel to load messages
2. Messages auto-scroll to newest
3. Consecutive messages from same author within 5 minutes grouped
4. See reactions, timestamps, edit indicators
5. Polls for new messages every 5 seconds

**Components**: `ChatArea`, `MessageItem`, `MessageStream`

**Hooks**: `useMessages`, `useOptimisticMessages`

**RPC**: `getContent()`, `getReplies()`

**Status**: Complete

---

### Send Message
**Description**: Compose and send messages with PoW spam prevention.

**User Flow**:
1. Type message in input area
2. Press Enter or click Send
3. Message appears immediately (optimistic UI) with "sending" status
4. PoW mines in background (~15s on desktop, difficulty 8)
5. Status updates to "sent" on confirmation
6. If PoW fails, status shows "failed" with retry option

**Components**: `ChatMessageInput`, `MessageInput`, `MiningProgress`

**Hooks**: `useReplyPow`, `useSendMessage`, `useOptimisticMessages`

**RPC**: `submitReply()`

**Status**: Complete

---

### Typing Indicators
**Description**: Show when other users are typing in the channel.

**User Flow**:
1. Start typing to broadcast indicator
2. See "User is typing..." animation
3. Indicator clears after 5s of inactivity

**Components**: `TypingIndicator`

**Hooks**: `useTypingIndicator`

**Context**: `TypingProvider`

**Status**: Partial (local tracking works, no network broadcast)

---

### User Presence
**Description**: Track and display user online/away/offline status.

**User Flow**:
1. Presence auto-detected from activity
2. Green = online (active < 5min)
3. Yellow = away (5-30min inactive)
4. Gray = offline (> 30min inactive)

**Components**: `OnlineUsers`

**Hooks**: `usePresence`

**Context**: `PresenceProvider`

**Status**: Partial (local inference, mock data, no peer-to-peer exchange)

---

### Reactions
**Description**: React to messages with quick (5s) or standard (15s) engagements.

**User Flow**:
1. Hover message to see action toolbar
2. Click reaction button
3. Choose quick (5s) or standard (15s) reaction
4. PoW mines briefly (~1s, difficulty 6)
5. Reaction count updates

**Components**: `MessageItem`, `QuickActions`

**Hooks**: `useReactions`, `useEngagementPow`

**RPC**: `submitEngagement()`

**Status**: Placeholder (UI exists, submission not wired)

---

### User Settings
**Description**: Configure chat preferences and behavior.

**User Flow**:
1. Navigate to `/settings`
2. Toggle typing indicators on/off
3. Set presence visibility
4. Configure notification preferences
5. Adjust PoW difficulty (advanced)

**Components**: `SettingsPage`

**Storage**: `localStorage['swimchain-chat-preferences']`

**Status**: Complete

---

### Network Status
**Description**: Display connection status, sync progress, and peer count.

**User Flow**:
1. View status bar at bottom
2. See sync percentage
3. See connected peer count
4. See storage usage

**Components**: `StatusBar`

**Hooks**: `useNetworkStatus`, `useRpc`

**RPC**: `getInfo()`, `getSyncStatus()`

**Status**: Complete

---

### Heat/Decay Visualization
**Description**: Visual indicator of content freshness and activity level.

**User Flow**:
1. View heat indicator on messages
2. Red/orange = hot (recent activity)
3. Blue = cooling (less active)
4. Gray = decayed (inactive)

**Components**: `HeatIndicator`

**Status**: Complete

---

### Feature Matrix

| Feature | Status | Components | Hooks | RPC Methods |
|---------|--------|------------|-------|-------------|
| Route Navigation | ✓ Complete | Routes, RequireIdentity | useNavigate | - |
| Server Navigation | ✓ Complete | ServerList | useServers | listSpaces |
| Channel Navigation | ✓ Complete | ChannelSidebar | useChannels | listSpaceContent |
| Identity Creation | ✓ Complete | IdentityPage | useKeypair, usePow | - |
| Identity Management | ✓ Complete | IdentityPage | useIdentityContext | - |
| Route Protection | ✓ Complete | RequireIdentity | useIdentityContext | - |
| Send Message | ✓ Complete | ChatArea, ChatMessageInput | useSendMessage, useReplyPow | submitReply |
| Create Channel | ◐ Partial | ChannelSidebar | useCreateChannel | submitPost |
| View Messages | ✓ Complete | ChatArea, MessageItem | useMessages | getContent, getReplies |
| View Server List | ✓ Complete | ServerList | useServers | listSpaces |
| View Channel List | ✓ Complete | ChannelSidebar | useChannels | listSpaceContent |
| Message Grouping | ✓ Complete | ChatArea | - | - |
| Add Reaction | ✗ Placeholder | MessageItem | useEngagementPow | submitEngagement |
| User Settings | ✓ Complete | SettingsPage | - | - |
| Typing Indicators | ◐ Partial | TypingIndicator | useTypingIndicator | - |
| Presence Tracking | ◐ Partial | OnlineUsers | usePresence | - |
| Message Polling | ✓ Complete | ChatArea | useMessages | getReplies |
| PoW Mining | ✓ Complete | MiningProgress | useActionPow | - |
| Connection Status | ✓ Complete | StatusBar | useRpc | getInfo |

**Summary**: 14 complete (78%), 3 partial (17%), 1 placeholder (5%)

## Components Reference

### Pages

#### Chat
**Location**: `src/pages/Chat.tsx`

**Purpose**: Main Discord-style chat interface orchestrating sidebar, channels, and messages.

**Props**: None (uses route params: `serverId`, `channelId`)

**Hooks Used**: `useServers`, `useChannels`, `useOptimisticMessages`, `useReplyPow`, `useSendMessage`

**Renders**: ServerList, ChannelSidebar, ChatArea, MiningProgress (overlay)

**Usage**:
```tsx
<Route path="/channels/:serverId/:channelId" element={<Chat />} />
```

---

#### IdentityPage
**Location**: `src/pages/IdentityPage.tsx`

**Purpose**: Identity creation, viewing, and management with PoW mining.

**State Machine**:
- `idle` - Ready to generate
- `initializing` - Preparing PoW
- `mining` - Mining in progress
- `complete` - PoW found, ready to save
- `cancelled` - User cancelled
- `error` - Mining failed

**Hooks Used**: `useKeypair`, `usePow`, `useIdentityContext`, `useStoredKeypair`

---

#### SettingsPage
**Location**: `src/pages/SettingsPage.tsx`

**Purpose**: User preferences management.

**Preferences Interface**:
```typescript
interface ChatPreferences {
  showTypingIndicators: boolean;
  showPresence: boolean;
  notificationSounds: boolean;
  powDifficulty: number;
}
```

---

### Sidebar Components

#### ServerList
**Location**: `src/components/ServerList.tsx`

**Purpose**: Discord-style vertical server icon sidebar.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| servers | Server[] | Yes | List of servers to display |
| currentServerId | string | No | Currently selected server |
| onServerSelect | (serverId: string) => void | No | Selection callback |

**Usage**:
```tsx
<ServerList
  servers={servers}
  currentServerId={currentId}
  onServerSelect={handleSelect}
/>
```

---

#### ChannelSidebar
**Location**: `src/components/ChannelSidebar.tsx`

**Purpose**: Channel list with categories, server header, and user area.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| server | Server | Yes | Current server |
| channels | Channel[] | Yes | Channels in server |
| currentChannelId | string | No | Currently selected channel |
| onChannelSelect | (channelId: string) => void | No | Selection callback |
| onCreateChannel | () => void | No | Create channel callback |

---

### Message Components

#### ChatArea
**Location**: `src/components/ChatArea.tsx`

**Purpose**: Main message display area with header, list, and input.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| channel | Channel | Yes | Current channel |
| messages | Message[] | Yes | Messages to display |
| loading | boolean | Yes | Loading state |
| onSendMessage | (content: string) => Promise<void> | Yes | Send callback |
| onReaction | (messageId: string, emoji: string) => void | No | Reaction callback |
| currentUserId | string | No | Current user ID |
| isSending | boolean | No | Message sending state |

---

#### MessageItem
**Location**: `src/components/MessageItem.tsx`

**Purpose**: Individual message display with avatar, content, and reactions.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| message | Message | Yes | Message data |
| isGrouped | boolean | Yes | Whether to hide avatar/timestamp |
| onReaction | (messageId: string, emoji: string) => void | No | Reaction callback |
| isOwnMessage | boolean | No | Style differently if own message |

---

#### ChatMessageInput
**Location**: `src/components/ChatMessageInput.tsx`

**Purpose**: Message composition input with send button.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| channelName | string | Yes | Placeholder text reference |
| onSend | (content: string) => void | Yes | Send callback |
| disabled | boolean | No | Disable input |
| placeholder | string | No | Custom placeholder |

---

### Utility Components

#### RequireIdentity
**Location**: `src/components/RequireIdentity.tsx`

**Purpose**: Route guard requiring valid identity.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| children | ReactNode | Yes | Protected content |

**Usage**:
```tsx
<Route path="/channels/*" element={
  <RequireIdentity>
    <Chat />
  </RequireIdentity>
} />
```

---

#### MiningProgress
**Location**: `src/components/MiningProgress.tsx`

**Purpose**: PoW mining progress display.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| state | MiningState | Yes | Current mining state |
| progress | MiningProgress | Yes | Progress stats (attempts, elapsedMs) |
| onCancel | () => void | No | Cancel callback |

---

#### HeatIndicator
**Location**: `src/components/HeatIndicator.tsx`

**Purpose**: Visual indicator of content activity/freshness.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| heatPercent | number | Yes | Heat level 0-100 |
| size | 'small' \| 'medium' \| 'large' | No | Display size |
| showLabel | boolean | No | Show percentage label |

---

#### Loading
**Location**: `src/components/Loading.tsx`

**Purpose**: Loading spinner with optional message.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| message | string | No | Loading message |
| size | 'small' \| 'medium' \| 'large' | No | Spinner size |

---

#### ErrorBoundary
**Location**: `src/components/ErrorBoundary.tsx`

**Purpose**: React error boundary with fallback UI.

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| children | ReactNode | Yes | Content to wrap |
| fallback | ReactNode | No | Custom error UI |

## Hooks Reference

### useRpc
**Location**: `src/hooks/useRpc.tsx`

**Purpose**: RPC client provider and hook for node communication.

**Returns**:
```typescript
{
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: { version: string; network: string; peerCount: number } | null;
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

---

### useServers
**Location**: `src/hooks/useServers.ts`

**Purpose**: Fetch and manage server (space) list.

**Returns**:
```typescript
{
  servers: Server[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Polling**: Every 30 seconds

---

### useChannels
**Location**: `src/hooks/useChannels.ts`

**Purpose**: Fetch channels (threads) within a server.

**Parameters**: `serverId: string`

**Returns**:
```typescript
{
  channels: Channel[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Polling**: Every 15 seconds

---

### useMessages
**Location**: `src/hooks/useMessages.ts`

**Purpose**: Fetch messages (replies) for a channel.

**Parameters**: `channelId: string`, `pollInterval?: number`

**Returns**:
```typescript
{
  messages: Message[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  currentUserId?: string;
}
```

**Polling**: Every 5 seconds (MESSAGE_POLL_INTERVAL)

---

### useOptimisticMessages
**Location**: `src/hooks/useMessages.ts`

**Purpose**: Optimistic UI updates while PoW is mining.

**Parameters**: `channelId: string`

**Returns**:
```typescript
{
  messages: Message[];           // Real + pending combined
  loading: boolean;
  error: string | null;
  addPendingMessage: (content: string) => string;  // Returns tempId
  confirmPendingMessage: (tempId: string, actualId: string) => void;
  failPendingMessage: (tempId: string) => void;
  removePendingMessage: (tempId: string) => void;
}
```

**Usage**:
```tsx
const { messages, addPendingMessage, confirmPendingMessage } = useOptimisticMessages(channelId);

// Add optimistic message
const tempId = addPendingMessage("Hello!");

// After PoW completes and message is sent
confirmPendingMessage(tempId, actualMessageId);
```

---

### useActionPow
**Location**: `src/hooks/useActionPow.ts`

**Purpose**: Mine Argon2id PoW for posts, replies, and engagements.

**Returns**:
```typescript
{
  state: 'idle' | 'mining' | 'complete' | 'error' | 'cancelled';
  progress: { attempts: number; elapsedMs: number; hashRate: number };
  solution: PoWSolution | null;
  error: string | null;
  mine: (actionType, content, authorPubkey, isTestnet?) => Promise<PoWSolution>;
  cancel: () => void;
  reset: () => void;
  getRpcParams: () => { pow_nonce, pow_difficulty, pow_nonce_space, pow_hash, timestamp } | null;
}
```

---

### useReplyPow
**Location**: `src/hooks/useActionPow.ts`

**Purpose**: Wrapper for reply-specific PoW mining.

**Returns**:
```typescript
{
  ...useActionPow,
  mineReply: (body: string, authorPubkey: string, isTestnet?: boolean) => Promise<PoWSolution>;
}
```

**Usage**:
```tsx
const { mineReply, state, progress } = useReplyPow();

const solution = await mineReply("Hello world!", identity.publicKey);
// Use solution.pow_nonce, solution.pow_hash for RPC call
```

---

### useTypingIndicator
**Location**: `src/hooks/useTypingIndicator.ts`

**Purpose**: Manage typing indicator per space.

**Parameters**: `spaceId: string`

**Returns**:
```typescript
{
  startTyping: () => void;
  stopTyping: () => void;
  typingUsers: string[];  // User IDs currently typing (excludes self)
}
```

**Usage**:
```tsx
const { startTyping, stopTyping, typingUsers } = useTypingIndicator(spaceId);

// Call startTyping() on input change
// Call stopTyping() on blur or send
```

---

### usePresence
**Location**: `src/hooks/usePresence.ts`

**Purpose**: Access user presence state.

**Returns**:
```typescript
{
  setOwnPresence: (status: 'online' | 'away' | 'offline') => void;
  getPresence: (userId: string) => PresenceState | undefined;
  onlineUsers: PresenceState[];
  onlineCount: number;
  totalCount: number;
}
```

---

### useChatNavigation
**Location**: `src/hooks/useChatNavigation.ts`

**Purpose**: Keyboard navigation for chat (vim-like bindings).

**Keyboard Shortcuts**:
| Key | Action |
|-----|--------|
| `j` | Navigate to next message |
| `k` | Navigate to previous message |
| `Enter` | Expand thread |
| `Escape` | Close thread panel |
| `/` | Focus message input |
| `e` | Quick reaction |
| `E` | Standard reaction |
| `r` | Reply to message |

## State Management

### Context Providers

#### RpcProvider
Provides RPC client to entire component tree. Auto-connects to local node and handles signature authentication.

**Value Shape**:
```typescript
interface RpcContextValue {
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: NodeInfo | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
}
```

---

#### PresenceProvider
Tracks user presence (online/away/offline) based on activity timestamps. Sends heartbeat every 30 seconds.

**Value Shape**:
```typescript
interface PresenceContextValue {
  presenceMap: Map<string, PresenceState>;
  setOwnPresence: (status: PresenceStatus) => void;
  getPresence: (userId: string) => PresenceState | undefined;
  onlineUsers: PresenceState[];
  onlineCount: number;
  totalCount: number;
}
```

**Constants**:
- `PRESENCE_HEARTBEAT_MS`: 30000 (30 seconds)
- `PRESENCE_AWAY_THRESHOLD_MS`: 120000 (2 minutes)

---

#### TypingProvider
Manages ephemeral typing indicators. Broadcasts every 3 seconds while typing, clears after 5 seconds.

**Value Shape**:
```typescript
interface TypingContextValue {
  typingUsers: Map<string, Set<string>>;  // spaceId → Set<userId>
  startTyping: (spaceId: string) => void;
  stopTyping: (spaceId: string) => void;
  getTypingUsers: (spaceId: string) => string[];
}
```

**Constants**:
- `TYPING_TIMEOUT_MS`: 5000
- `TYPING_BROADCAST_INTERVAL_MS`: 3000

### Data Flow

```
@swimchain/frontend (WASM)
    │
    ├── IdentityProvider
    │       └── useIdentityContext() → identity, keypair
    │
    └── PoW functions
            └── useActionPow() → mine(), solution

localStorage['swimchain-identity']
    │
    └── RpcProvider
            │
            └── SwimchainRpc client
                    │
                    ├── Signature Auth Headers
                    │       X-CS-Identity: publicKey
                    │       X-CS-Timestamp: timestamp
                    │       X-CS-Signature: signature
                    │
                    └── useRpc()
                            │
                            ├── useServers() → Server[]
                            ├── useChannels(serverId) → Channel[]
                            └── useMessages(channelId) → Message[]
```

### Polling Strategy

Since Swimchain lacks WebSockets, the client uses smart polling:

| Data Type | Interval | Priority |
|-----------|----------|----------|
| Messages (active channel) | 5s | High |
| Channels | 15s | Medium |
| Servers | 30s | Low |
| Network status | 10s | Background |

### Optimistic Updates

Messages appear instantly before confirmation:

1. Generate temporary ID (`pending-{timestamp}`)
2. Add to UI with `status: 'sending'`
3. Mine PoW asynchronously
4. Submit to node
5. Replace temp ID with real ID on success
6. Mark as `status: 'failed'` if error

## RPC Integration

### Connection

The client connects to a local Swimchain node:

| Network | Port | URL |
|---------|------|-----|
| Testnet | 19736 | `http://127.0.0.1:19736` |
| Mainnet | 9736 | `http://127.0.0.1:9736` |
| Regtest | 29736 | `http://127.0.0.1:29736` |

### Authentication

**Signature Auth (Browser)**:
```typescript
headers: {
  'X-CS-Identity': publicKey,        // Hex-encoded public key
  'X-CS-Timestamp': timestamp,       // Unix timestamp
  'X-CS-Signature': signature        // Ed25519 signature of message
}

// Signature message format:
// swimchain-rpc:{method}:{sha256(params)}:{timestamp}
```

### Methods Used

| Method | Purpose | Hook/Component |
|--------|---------|----------------|
| `getInfo()` | Node version, network, uptime | useRpc |
| `getSyncStatus()` | Sync %, peers, storage | useNetworkStatus |
| `getPeers()` | Connected peer list | StatusBar |
| `listSpaces()` | Get all spaces | useServers |
| `listSpaceContent()` | Get threads in space | useChannels |
| `getContent()` | Fetch post/thread | useMessages |
| `getReplies()` | Get thread replies | useMessages |
| `submitPost()` | Create thread | useCreateChannel |
| `submitReply()` | Send message | useSendMessage |
| `submitEngagement()` | Add reaction | useReactions |
| `getReactions()` | Get reaction counts | useMessages |
| `getUserReactions()` | User's reactions | useMessages |
| `getIdentityLevel()` | Identity level/reputation | useRpc |

## Styling Guide

### Color Scheme (Discord-inspired)

```css
/* Backgrounds */
--bg-primary: #36393f;     /* Main content */
--bg-secondary: #2f3136;   /* Sidebars */
--bg-tertiary: #202225;    /* Server list */
--bg-accent: #40444b;      /* Inputs */

/* Text */
--text-normal: #dcddde;    /* Primary */
--text-muted: #72767d;     /* Secondary */
--text-link: #00aff4;      /* Links */

/* Brand */
--brand-primary: #5865f2;  /* Discord blurple */

/* Status */
--status-online: #3ba55d;  /* Green */
--status-idle: #faa81a;    /* Amber */
--status-dnd: #ed4245;     /* Red */
--status-offline: #747f8d; /* Gray */
```

### CSS Structure

Each component has its own CSS file:
- `ServerList.tsx` → `ServerList.css`
- `ChannelSidebar.tsx` → `ChannelSidebar.css`
- etc.

Global styles in `src/styles/globals.css`.

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

Tests use Vitest and @testing-library/react.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_RPC_URL` | Node RPC URL | `http://127.0.0.1:19736` |
| `VITE_NETWORK` | Network type | `testnet` |

### Vite Configuration

```typescript
// vite.config.ts
{
  server: { port: 5175 },
  build: { target: 'esnext', sourcemap: true },
  resolve: { alias: { '@': '/src' } }
}
```

### Constants

```typescript
// Difficulty
MESSAGE_DIFFICULTY = 10;          // ~15s PoW for messages
REACTION_DIFFICULTY = 8;          // ~1s PoW for reactions
IDENTITY_DIFFICULTY = 20;         // Identity mining

// Timing
POLL_INTERVAL_MS = 5000;          // Message polling
MESSAGE_POLL_INTERVAL = 5000;     // Same as above
PRESENCE_HEARTBEAT_MS = 30000;    // Presence broadcast
PRESENCE_AWAY_THRESHOLD_MS = 120000; // 2 min inactivity
TYPING_TIMEOUT_MS = 5000;         // Typing indicator timeout
TYPING_BROADCAST_INTERVAL_MS = 3000; // Typing re-broadcast
HEAT_UPDATE_INTERVAL_MS = 60000;  // Heat decay update

// Engagement
POOL_TARGET_SECONDS = 60;         // Content persistence requirement
ENGAGE_QUICK_SECONDS = 5;         // Quick reaction
ENGAGE_STANDARD_SECONDS = 15;     // Standard reaction
```

### Local Storage Keys

| Key | Purpose |
|-----|---------|
| `swimchain-identity` | Stored identity with keypair and seed |
| `swimchain-chat-preferences` | User preferences |

## Known Issues & Limitations

- **No WebSocket support**: Uses polling for "real-time" updates
- **Typing indicators local only**: Not broadcast to peers
- **Presence inference**: Based on activity timestamps, not explicit status
- **Reactions not wired**: UI exists but submission logic incomplete
- **Create channel partial**: Hook exists, form UI not implemented
- **No offline support**: Requires active node connection
- **PoW mining blocks UI**: Background worker would improve UX
- **Local node only**: Connects to localhost, not remote seeds

## Future Improvements

### Incomplete Features
- [ ] **Reaction submission** - UI exists, TODO: wire up PoW and submitEngagement()
- [ ] **Channel creation form** - Button exists, TODO: create form UI
- [ ] **Typing indicator broadcast** - Local tracking works, TODO: network sync
- [ ] **Presence network sync** - Local tracking works, TODO: peer exchange

### Planned Features
- [ ] Display name lookups (user profiles)
- [ ] Unread count tracking per channel/server
- [ ] Server discovery page
- [ ] Direct messages (DM channels)
- [ ] Notification sounds
- [ ] Thread panel for nested replies
- [ ] Mobile responsive improvements
- [ ] Encrypted private channels (E2E encryption)
- [ ] User profiles with avatars
- [ ] WebSocket real-time updates (replace polling)
- [ ] Web Worker for PoW mining (non-blocking)
- [ ] Virtual scrolling for large message lists
- [ ] Message search functionality

## Security Considerations

1. **Private Keys**: Seeds stored in localStorage, never transmitted
2. **Signature Auth**: All RPC requests signed with identity
3. **PoW Spam Prevention**: Actions require proof-of-work
4. **Local Node Only**: Client connects to localhost, not remote seeds

## Common Issues

1. **"Connection failed"**: Start local node with `sw node start --testnet`
2. **"Identity upgrade required"**: Old identity format, recreate on `/identity`
3. **"RPC auth failed"**: Ensure identity has seed stored
