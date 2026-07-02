# Swimchain Chat Client

**Version:** 1.0.0
**Last Updated:** December 2024
**Milestone:** 6.7

## Overview

The Swimchain Chat Client provides a Discord-like real-time messaging experience powered by proof-of-work. It features channel-based navigation, typing indicators, presence status, inline thread expansion, and quick reactions.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd chat-client
npm install
```

### Development

```bash
npm run dev
```

The client runs on **port 5175** (different from forum-client on 5173).

### Production Build

```bash
npm run build
npm run preview
```

## Key Differences from Other Clients

| Aspect | Forum Client | Reddit Client | Chat Client |
|--------|-------------|---------------|-------------|
| Layout | Thread-based | Card-based | Discord-like 3-column |
| Navigation | Space hierarchy | Tabs + sidebar | Channel sidebar |
| Messages | Threaded discussion | Cards with expansion | Stream with inline threads |
| Reactions | None | Upvotes | Quick +5s/+15s with low PoW |
| Presence | None | None | Online/Away/Offline indicators |
| Typing | None | None | Ephemeral typing indicators |
| Real-time | Polling | Polling | Simulated (future: WebSocket) |

## Project Structure

```
chat-client/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx                  # Entry point
    ├── App.tsx                   # Router and providers
    ├── components/
    │   ├── AddressDisplay.tsx    # Truncated address with copy
    │   ├── ErrorBoundary.tsx     # Error handling
    │   ├── Header.tsx            # Space header
    │   ├── HeatIndicator.tsx     # Heat percentage display
    │   ├── Loading.tsx           # Loading spinner
    │   ├── MessageBubble.tsx     # Individual message
    │   ├── MessageInput.tsx      # Input with mining
    │   ├── MessageStream.tsx     # Scrollable message list
    │   ├── MiningProgress.tsx    # PoW progress bar
    │   ├── MobileNav.tsx         # Hamburger menu
    │   ├── OnlineUsers.tsx       # Right panel
    │   ├── QuickActions.tsx      # Message action bar
    │   ├── SpaceSidebar.tsx      # Left sidebar
    │   ├── StatusBar.tsx         # Bottom status
    │   ├── ThreadPanel.tsx       # Inline thread expansion
    │   └── TypingIndicator.tsx   # Typing dots
    ├── contexts/
    │   ├── PresenceContext.tsx   # Online/away/offline
    │   └── TypingContext.tsx     # Ephemeral typing
    ├── hooks/
    │   ├── useChatNavigation.ts  # Keyboard shortcuts
    │   ├── useMessageInput.ts    # Input state machine
    │   ├── usePresence.ts        # Presence access
    │   ├── useReactions.ts       # Optimistic reactions
    │   ├── useRealTimeUpdates.ts # Polling simulation
    │   ├── useThread.ts          # Thread expansion
    │   └── useTypingIndicator.ts # Typing management
    ├── layouts/
    │   └── MainLayout.tsx        # 3-column layout
    ├── mocks/
    │   └── data.ts               # Mock users, spaces, messages
    ├── pages/
    │   ├── IdentityPage.tsx      # Identity management
    │   ├── SettingsPage.tsx      # Preferences
    │   └── SpaceChatPage.tsx     # Main chat view
    ├── styles/
    │   └── globals.css           # CSS variables and base
    ├── types/
    │   └── index.ts              # TypeScript types
    └── utils/
        └── time.ts               # Time formatting
```

## Components Reference

### MessageBubble

Individual chat message with:
- Author address with presence indicator
- Timestamp (relative format)
- Message content with heat-based opacity
- Pool progress display
- Reply count and thread toggle
- Quick actions on hover

### MessageStream

Scrollable container for messages featuring:
- Auto-scroll to bottom on new messages
- "New messages" indicator when scrolled up
- Date separators (TODAY, YESTERDAY, etc.)
- Message grouping (same author within 5 minutes)

### MessageInput

Input field with 4-state machine:
1. **READY**: Empty input, shows "~15s PoW" label
2. **TYPING**: User is typing, character count
3. **MINING**: Progress bar with time remaining and tips
4. **SENT**: Brief confirmation, then reset

### ThreadPanel

Inline expansion below parent message:
- Chronological reply list
- Reply input at bottom
- "Close thread" button
- Left border indicator

### QuickActions

Hover bar with buttons:
- Reply (opens thread)
- +5s quick reaction (~1s PoW)
- +15s standard reaction (~3-5s PoW)
- Share (copy link)
- More options

## Hooks Reference

### useMessageInput

```typescript
const { state, content, setContent, submit, cancel, progress } = useMessageInput({
  spaceId: 'sp1...',
  parentId: null,
  onMessageSent: (message) => {},
});
```

### useThread

```typescript
const {
  expandedThreadId,
  toggleThread,
  closeThread,
  threadReplies,
  isLoadingReplies,
} = useThread();
```

### useTypingIndicator

```typescript
const { startTyping, stopTyping, typingUsers } = useTypingIndicator(spaceId);
```

### usePresence

```typescript
const { setOwnPresence, getPresence, onlineUsers, onlineCount } = usePresence();
```

### useChatNavigation

```typescript
useChatNavigation({
  messages,
  selectedMessageId,
  expandedThreadId,
  onSelectMessage,
  onToggleThread,
  onReplyTo,
  onReactQuick,
  onReactStandard,
  onCloseThread,
  inputRef,
});
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` | Select next message |
| `k` | Select previous message |
| `Enter` | Expand thread (if selected has replies) |
| `Escape` | Close thread / clear selection |
| `/` | Focus message input |
| `e` | Quick engage +5s on selected |
| `E` (Shift+E) | Standard engage +15s on selected |
| `r` | Reply to selected message |

## Technical Details

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `POOL_TARGET_SECONDS` | 60 | Seconds required for persistence |
| `ENGAGE_QUICK_SECONDS` | 5 | Quick reaction contribution |
| `ENGAGE_STANDARD_SECONDS` | 15 | Standard reaction contribution |
| `TYPING_TIMEOUT_MS` | 5000 | Indicator expires after 5s |
| `TYPING_BROADCAST_INTERVAL_MS` | 3000 | Re-broadcast every 3s |
| `PRESENCE_HEARTBEAT_MS` | 30000 | Heartbeat every 30s |
| `PRESENCE_AWAY_THRESHOLD_MS` | 120000 | Away after 2 min inactivity |
| `POLL_INTERVAL_MS` | 5000 | Check for updates every 5s |
| `REACTION_DIFFICULTY` | 8 | PoW difficulty (~1s) |
| `MESSAGE_DIFFICULTY` | 10 | PoW difficulty (~15s) |

### State Management

- **PresenceContext**: Tracks online/away/offline status with heartbeat
- **TypingContext**: Ephemeral in-memory only (never persisted)
- **React State**: Local component state for UI interactions

### PoW Difficulties

- **Reactions**: Difficulty 8 (~1s on mobile, <1s on desktop)
- **Messages**: Difficulty 10 (~15s on desktop)

### CSS Variables

The client uses CSS custom properties for theming:

```css
--sidebar-width: 240px;
--online-panel-width: 200px;
--input-height: 56px;
--header-height: 48px;
--min-touch-target: 44px;
```

Heat-based opacity classes:
- `.heat-100` (100%, full opacity)
- `.heat-80` (80%, 95% opacity)
- `.heat-60` (60%, 85% opacity)
- `.heat-40` (40%, 70% opacity)
- `.heat-20` (20%, 55% opacity)
- `.heat-5` (<5%, 40% opacity)

### Responsive Breakpoints

- **Desktop (>1024px)**: Full 3-column layout
- **Tablet (768-1024px)**: Hidden online panel
- **Mobile (<768px)**: Single column with overlay sidebar

## Changelog

### 1.0.0 (December 2024)

- Initial release as part of Milestone 6.7
- Discord-like 3-column layout
- Channel-based navigation
- Real-time message stream
- Typing indicators (ephemeral)
- Presence indicators (online/away/offline)
- Thread expansion inline
- Quick reactions with low PoW
- Message input with mining progress
- Keyboard navigation
- Mobile responsive design
