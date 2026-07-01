# Chat Client Design Document

## Overview

A Discord-style real-time chat client built on Swimchain. Presents the same underlying data with a server/channel/message paradigm optimized for synchronous conversation.

**Data Mapping:**
| Discord Concept | Swimchain Equivalent |
|-----------------|---------------------|
| Server | Space |
| Channel | Thread/Post |
| Message | Reply |
| DM | Private Space (2 members) |
| Group DM | Private Space (3+ members) |
| Server Member | Space Member |
| Server Admin | Space Creator |

## Philosophy Comparison

| Aspect | Forum-Client | Feed-Client | Chat-Client |
|--------|-------------|-------------|-------------|
| Primary Unit | Thread | Post | Message |
| Navigation | Space → Thread | Feed scroll | Server → Channel |
| Interaction | Async discussion | Social engagement | Real-time chat |
| Time Feel | Hours/days | Minutes/hours | Seconds/minutes |
| Layout | Forum tables | Card feed | Chat bubbles |

## Visual Layout

### Main Interface

```
┌──────┬────────────────┬─────────────────────────────────┬──────────┐
│      │                │                                 │          │
│  S   │   CHANNELS     │         #general                │ MEMBERS  │
│  E   │                │                                 │          │
│  R   │  ▼ TEXT        │  ┌─────────────────────────┐   │ ONLINE   │
│  V   │    # general   │  │ alice · 2:34 PM         │   │ ● alice  │
│  E   │    # random    │  │ Hey everyone! 👋        │   │ ● bob    │
│  R   │    # dev       │  └─────────────────────────┘   │ ● carol  │
│  S   │                │                                 │          │
│      │  ▼ VOICE       │  ┌─────────────────────────┐   │ OFFLINE  │
│  ●   │    🔊 Lounge   │  │ bob · 2:35 PM           │   │ ○ dave   │
│  ●   │                │  │ What's up! Working on   │   │ ○ eve    │
│  ●   │  ▼ PRIVATE     │  │ the new feature.        │   │          │
│  +   │    🔒 admin    │  └─────────────────────────┘   │          │
│      │                │                                 │          │
│      │  [+ Channel]   │  ┌─────────────────────────┐   │          │
│ ──── │                │  │ carol · 2:36 PM         │   │          │
│      │                │  │ Nice! Need any help?    │   │          │
│  DMs │                │  └─────────────────────────┘   │          │
│      │                │                                 │          │
│  👤  │                │  ═══════════════════════════   │          │
│  👤  │                │                                 │          │
│  👤  │                │  ┌─────────────────────────────┐│          │
│      │                │  │ 📎  Type a message...   😀 ││          │
├──────┴────────────────┴─┴─────────────────────────────┴┴──────────┤
│ 🎧 Username#1234        🎤 Mute  🔇 Deafen  ⚙ Settings            │
└───────────────────────────────────────────────────────────────────┘
```

### Server List (Left Rail)

```
┌──────┐
│  🏠  │  ← Home (DMs + notifications)
├──────┤
│  ●   │  ← Server icon (space avatar)
│crypto│     with unread indicator
├──────┤
│  ●   │
│ rust │
├──────┤
│  ●   │
│gaming│
├──────┤
│  +   │  ← Join/Create Server
├──────┤
│  🔍  │  ← Explore Public Servers
└──────┘
```

### Channel Categories

Channels (threads) are organized into categories based on tags or prefixes:

```
▼ INFORMATION
   📌 rules           (pinned thread)
   📌 announcements   (pinned thread)

▼ TEXT CHANNELS
   # general
   # random
   # introductions
   # off-topic

▼ DEVELOPMENT
   # frontend
   # backend
   # devops

▼ PRIVATE
   🔒 admin-only      (encrypted thread)
   🔒 moderators      (encrypted thread)
```

## Data Model

### Server (Space) Representation

```typescript
interface Server {
  id: string;              // spaceId
  name: string;            // space name
  icon?: string;           // space avatar/icon
  banner?: string;         // server banner image
  description?: string;
  memberCount: number;
  isPrivate: boolean;

  // Computed from threads
  channels: Channel[];
  categories: ChannelCategory[];

  // User's relationship
  joined: boolean;
  muted: boolean;
  notificationLevel: 'all' | 'mentions' | 'none';
}

interface ChannelCategory {
  name: string;
  collapsed: boolean;
  channels: Channel[];
}

interface Channel {
  id: string;              // threadId
  name: string;            // thread title (formatted as channel name)
  type: 'text' | 'announcement' | 'private';
  category?: string;
  isPinned: boolean;
  isEncrypted: boolean;
  lastMessageAt: number;
  unreadCount: number;

  // Thread metadata
  createdBy: string;
  createdAt: number;
}

interface Message {
  id: string;              // replyId
  channelId: string;       // threadId
  author: string;          // userPk
  authorName?: string;     // display name
  authorAvatar?: string;
  content: string;
  attachments: Attachment[];
  reactions: Reaction[];
  createdAt: number;
  editedAt?: number;
  replyTo?: string;        // reply to specific message
  isPinned: boolean;
}
```

### Channel Naming Convention

Threads become channels with normalized names:

```typescript
function threadToChannelName(threadTitle: string): string {
  return threadTitle
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 32);
}

// "General Discussion" → "general-discussion"
// "🚀 Announcements" → "announcements"
// "Dev / Frontend" → "dev-frontend"
```

### Category Detection

Categories are inferred from thread prefixes or tags:

```typescript
function detectCategory(threadTitle: string): string | null {
  const prefixMatch = threadTitle.match(/^\[([^\]]+)\]/);
  if (prefixMatch) return prefixMatch[1];

  const slashMatch = threadTitle.match(/^([^\/]+)\s*\//);
  if (slashMatch) return slashMatch[1].trim();

  return null;
}

// "[Dev] Frontend Discussion" → category: "Dev"
// "Support / General" → category: "Support"
// "random" → category: null (default)
```

## Real-Time Experience

### Polling Strategy

Since Swimchain doesn't have WebSockets, simulate real-time with smart polling:

```typescript
interface PollingConfig {
  // Active channel - poll frequently
  activeChannel: {
    interval: 2000,      // 2 seconds
    onFocus: true,       // Only when tab focused
  };

  // Other channels in server - check for unreads
  serverChannels: {
    interval: 10000,     // 10 seconds
    batchSize: 10,       // Check 10 channels per poll
  };

  // Server list - check for activity
  servers: {
    interval: 30000,     // 30 seconds
  };

  // DMs - moderate frequency
  directMessages: {
    interval: 5000,      // 5 seconds
  };
}
```

### Optimistic Updates

Messages appear instantly before confirmation:

```typescript
async function sendMessage(channelId: string, content: string) {
  // 1. Generate temporary ID
  const tempId = `temp_${Date.now()}`;

  // 2. Add to UI immediately (optimistic)
  addMessageToUI({
    id: tempId,
    content,
    author: myPk,
    createdAt: Date.now(),
    status: 'sending'
  });

  // 3. Mine PoW and send
  try {
    const result = await sendReply(channelId, content);
    // 4. Replace temp with real message
    replaceMessage(tempId, result.replyId, 'sent');
  } catch (err) {
    // 5. Mark as failed
    updateMessageStatus(tempId, 'failed');
  }
}
```

### Unread Tracking

```typescript
interface UnreadState {
  // Per-channel unread count
  channels: Map<string, {
    count: number;
    lastReadAt: number;
    lastMessageAt: number;
    mentions: number;
  }>;

  // Per-server aggregate
  servers: Map<string, {
    totalUnread: number;
    hasMentions: boolean;
  }>;
}

// Store last read position per channel
function markChannelRead(channelId: string) {
  const lastMessage = getLastMessage(channelId);
  storage.set(`read_${channelId}`, lastMessage.createdAt);
}
```

## Component Architecture

### Pages

```
/                        → Home (DMs list + notifications)
/channels/@me            → DM list
/channels/@me/:odm       → Direct message conversation
/channels/:serverId      → Server view (default channel)
/channels/:serverId/:channelId → Specific channel
/invite/:code            → Join server via invite
/servers/create          → Create new server
/servers/discover        → Browse public servers
```

### Component Tree

```
src/
├── components/
│   ├── Server/
│   │   ├── ServerList.tsx           # Left rail with server icons
│   │   ├── ServerIcon.tsx           # Individual server button
│   │   ├── ServerDropdown.tsx       # Right-click server menu
│   │   ├── CreateServerModal.tsx    # Create/join server
│   │   └── ServerSettings.tsx       # Server configuration
│   │
│   ├── Channel/
│   │   ├── ChannelSidebar.tsx       # Channel list for server
│   │   ├── ChannelCategory.tsx      # Collapsible category
│   │   ├── ChannelItem.tsx          # Single channel row
│   │   ├── CreateChannelModal.tsx   # New channel (thread)
│   │   └── ChannelSettings.tsx      # Channel configuration
│   │
│   ├── Chat/
│   │   ├── ChatContainer.tsx        # Main chat area
│   │   ├── MessageList.tsx          # Virtual scrolling messages
│   │   ├── Message.tsx              # Single message bubble
│   │   ├── MessageGroup.tsx         # Grouped consecutive messages
│   │   ├── MessageInput.tsx         # Composer with attachments
│   │   ├── MessageActions.tsx       # React, reply, edit, delete
│   │   ├── ReplyPreview.tsx         # Inline reply indicator
│   │   ├── TypingIndicator.tsx      # "X is typing..."
│   │   └── PinnedMessages.tsx       # Pinned messages panel
│   │
│   ├── Members/
│   │   ├── MemberList.tsx           # Right sidebar members
│   │   ├── MemberItem.tsx           # Single member row
│   │   ├── MemberProfile.tsx        # Click to view profile
│   │   └── RoleTag.tsx              # Member role badge
│   │
│   ├── DM/
│   │   ├── DMList.tsx               # Direct messages list
│   │   ├── DMItem.tsx               # Single DM conversation
│   │   ├── CreateDMModal.tsx        # Start new DM
│   │   └── GroupDMSettings.tsx      # Group DM management
│   │
│   ├── Home/
│   │   ├── HomeView.tsx             # DMs + activity feed
│   │   ├── FriendsList.tsx          # Friends management
│   │   └── ActivityFeed.tsx         # Recent activity
│   │
│   ├── User/
│   │   ├── UserArea.tsx             # Bottom left user panel
│   │   ├── UserPopout.tsx           # Click username popup
│   │   ├── UserProfile.tsx          # Full profile view
│   │   ├── UserSettings.tsx         # Account settings
│   │   └── StatusSelector.tsx       # Online/away/dnd/offline
│   │
│   └── Common/
│       ├── Avatar.tsx               # User/server avatars
│       ├── Tooltip.tsx              # Hover tooltips
│       ├── Modal.tsx                # Modal container
│       ├── ContextMenu.tsx          # Right-click menus
│       ├── EmojiPicker.tsx          # Emoji selection
│       ├── FileUpload.tsx           # Attachment handling
│       └── MarkdownRenderer.tsx     # Message formatting
│
├── hooks/
│   ├── useServer.ts                 # Server data + channels
│   ├── useChannel.ts                # Channel messages
│   ├── useMessages.ts               # Message list + pagination
│   ├── useUnread.ts                 # Unread tracking
│   ├── usePolling.ts                # Real-time polling
│   ├── useTyping.ts                 # Typing indicators
│   ├── useMembers.ts                # Server member list
│   ├── usePresence.ts               # Online/offline status
│   ├── useDMs.ts                    # Direct messages
│   └── useNotifications.ts          # Desktop notifications
│
├── stores/
│   ├── serverStore.ts               # Server list state
│   ├── channelStore.ts              # Channels per server
│   ├── messageStore.ts              # Messages per channel
│   ├── unreadStore.ts               # Unread counts
│   ├── userStore.ts                 # Current user state
│   └── uiStore.ts                   # UI state (modals, etc)
│
├── pages/
│   ├── Home.tsx
│   ├── Server.tsx
│   ├── Channel.tsx
│   ├── DirectMessage.tsx
│   ├── Discover.tsx
│   ├── Invite.tsx
│   └── Settings.tsx
│
└── lib/
    ├── polling.ts                   # Polling manager
    ├── notifications.ts             # Desktop notifications
    ├── sounds.ts                    # Notification sounds
    ├── markdown.ts                  # Message formatting
    ├── mentions.ts                  # @mention parsing
    └── storage.ts                   # Local state persistence
```

## Key Features

### 1. Server Management

**Join Server:**
- Via invite link/code
- Via public server discovery
- Create new server (creates space)

**Server Settings (Admin):**
- Edit name, icon, banner
- Manage roles (future)
- Manage invites
- Delete server

```typescript
interface ServerSettings {
  // Basic info
  name: string;
  icon?: File;
  banner?: File;
  description?: string;

  // Privacy
  isPrivate: boolean;
  requireInvite: boolean;

  // Moderation
  autoModeration: boolean;
  blockedWords: string[];
}
```

### 2. Channel Management

**Create Channel:**
- Text channel (creates thread)
- Announcement channel (pinned thread)
- Private channel (encrypted thread)

**Channel Settings:**
- Rename channel
- Set category
- Pin/unpin
- Archive (future)
- Delete

```typescript
async function createChannel(
  serverId: string,
  name: string,
  category?: string,
  isPrivate = false
) {
  // Format title for category
  const title = category
    ? `[${category}] ${name}`
    : name;

  // Create thread in space
  return createThread(serverId, {
    title,
    body: `Welcome to #${name}!`,
    isPinned: false,
    isEncrypted: isPrivate,
  });
}
```

### 3. Messaging

**Message Features:**
- Text with markdown
- File attachments (images, files)
- Emoji reactions
- Reply to specific message
- Edit message
- Delete message
- Pin message

**Message Input:**
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Replying to alice                                    ✕ │ │
│ │ > Original message preview...                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📎 │ Type a message in #general...              │ 😀 📤 │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [GIF] [Sticker] [Gift] [File]                              │
└─────────────────────────────────────────────────────────────┘
```

### 4. Direct Messages

**DM Types:**
- 1:1 DM (private space with 2 members)
- Group DM (private space with 3-10 members)

**DM List:**
```
┌─────────────────────────────────────────┐
│ DIRECT MESSAGES               [+ New]  │
├─────────────────────────────────────────┤
│ ● alice                    2m ago      │
│   Working on it now!                   │
├─────────────────────────────────────────┤
│ ○ bob, carol, dave         1h ago      │
│   Let's meet tomorrow                  │
├─────────────────────────────────────────┤
│ ○ eve                      3d ago      │
│   Thanks!                              │
└─────────────────────────────────────────┘
```

### 5. Member Presence

Track online/offline status locally:

```typescript
interface UserPresence {
  status: 'online' | 'idle' | 'dnd' | 'offline';
  lastSeen: number;
  customStatus?: string;
}

// Presence is local + inferred from activity
function inferPresence(userPk: string): UserPresence {
  const lastActivity = getLastActivity(userPk);
  const now = Date.now();

  if (now - lastActivity < 5 * 60 * 1000) {
    return { status: 'online', lastSeen: lastActivity };
  } else if (now - lastActivity < 30 * 60 * 1000) {
    return { status: 'idle', lastSeen: lastActivity };
  } else {
    return { status: 'offline', lastSeen: lastActivity };
  }
}
```

### 6. Notifications

```typescript
interface NotificationSettings {
  // Global
  enableDesktop: boolean;
  enableSound: boolean;

  // Per-server override
  servers: Map<string, {
    level: 'all' | 'mentions' | 'none';
    muted: boolean;
    mutedUntil?: number;
  }>;

  // Per-channel override
  channels: Map<string, {
    level: 'all' | 'mentions' | 'none';
    muted: boolean;
  }>;
}

// Desktop notification
function showNotification(message: Message, channel: Channel, server: Server) {
  if (!shouldNotify(message, channel, server)) return;

  new Notification(`#${channel.name} - ${server.name}`, {
    body: `${message.authorName}: ${message.content.slice(0, 100)}`,
    icon: server.icon,
    tag: channel.id,
  });

  playSound('message');
}
```

### 7. @Mentions

```typescript
// Parse mentions in message content
function parseMentions(content: string, members: Member[]): ParsedContent {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;

  return content.replace(mentionRegex, (match, name) => {
    const member = members.find(m =>
      m.displayName?.toLowerCase() === name.toLowerCase() ||
      m.pk.startsWith(name)
    );

    if (member) {
      return `<@${member.pk}>`;
    }
    return match;
  });
}

// Render mention as clickable
function MentionSpan({ userPk }: { userPk: string }) {
  const { profile } = useUserProfile(userPk);
  return (
    <span className="mention" onClick={() => openProfile(userPk)}>
      @{profile?.displayName || truncate(userPk)}
    </span>
  );
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Quick switcher (search servers/channels) |
| `Ctrl+/` | Show all shortcuts |
| `Ctrl+Shift+M` | Toggle mute |
| `Ctrl+Shift+D` | Toggle deafen |
| `Ctrl+Enter` | Send message |
| `↑` | Edit last message |
| `Esc` | Cancel reply/edit |
| `Ctrl+E` | Toggle emoji picker |
| `Alt+↑/↓` | Navigate channels |
| `Alt+Shift+↑/↓` | Navigate servers |

## Styling

### Color Scheme (Discord-inspired)

```css
:root {
  /* Background layers */
  --bg-primary: #36393f;      /* Main content */
  --bg-secondary: #2f3136;    /* Sidebars */
  --bg-tertiary: #202225;     /* Server list */
  --bg-accent: #40444b;       /* Input fields */

  /* Text */
  --text-normal: #dcddde;
  --text-muted: #72767d;
  --text-link: #00aff4;

  /* Brand */
  --brand-primary: #5865f2;   /* Blurple */
  --brand-hover: #4752c4;

  /* Status */
  --status-online: #3ba55d;
  --status-idle: #faa81a;
  --status-dnd: #ed4245;
  --status-offline: #747f8d;

  /* Accents */
  --mention-bg: rgba(88, 101, 242, 0.3);
  --unread-indicator: #f04747;
}
```

### Message Layout

```css
.message {
  display: flex;
  padding: 0.125rem 1rem;

  &:hover {
    background: rgba(4, 4, 5, 0.07);
  }

  &.grouped {
    padding-top: 0;

    .message-avatar {
      visibility: hidden;
    }

    .message-timestamp {
      display: none;
    }
  }
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin-right: 1rem;
  cursor: pointer;
}

.message-content {
  flex: 1;
  min-width: 0;

  .message-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;

    .author-name {
      font-weight: 500;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }

    .timestamp {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
  }

  .message-body {
    line-height: 1.375;
    word-wrap: break-word;
  }
}
```

## State Management

Using a simple store pattern (Zustand-like):

```typescript
// serverStore.ts
interface ServerStore {
  servers: Server[];
  currentServerId: string | null;

  // Actions
  setServers: (servers: Server[]) => void;
  addServer: (server: Server) => void;
  removeServer: (serverId: string) => void;
  setCurrentServer: (serverId: string | null) => void;
  updateServer: (serverId: string, updates: Partial<Server>) => void;
}

// channelStore.ts
interface ChannelStore {
  // Map of serverId -> channels
  channelsByServer: Map<string, Channel[]>;
  currentChannelId: string | null;

  // Actions
  setChannels: (serverId: string, channels: Channel[]) => void;
  setCurrentChannel: (channelId: string | null) => void;
  updateChannel: (channelId: string, updates: Partial<Channel>) => void;
}

// messageStore.ts
interface MessageStore {
  // Map of channelId -> messages
  messagesByChannel: Map<string, Message[]>;
  pendingMessages: Map<string, Message>; // Optimistic

  // Actions
  setMessages: (channelId: string, messages: Message[]) => void;
  addMessage: (channelId: string, message: Message) => void;
  addPendingMessage: (channelId: string, message: Message) => void;
  confirmMessage: (tempId: string, realId: string) => void;
  failMessage: (tempId: string) => void;
}
```

## Reuse from swimchain-react

```typescript
// Core providers
import { SwimchainProvider, RpcProvider, useRpc } from '@swimchain/react';

// Identity
import { useStoredIdentity, useStoredKeypair } from '@swimchain/react';

// Content (Servers = Spaces, Channels = Threads, Messages = Replies)
import {
  useSpaces,           // → useServers
  useSpaceThreads,     // → useChannels
  useThread,           // → useChannel
  useReplies,          // → useMessages
  useUserPosts,        // → user activity
} from '@swimchain/react';

// Private spaces (DMs)
import {
  getDMSpaceId,
  encryptWithSpaceKey,
  decryptWithSpaceKey,
} from '@swimchain/react';

// PoW for sending messages
import { computePow, createReplyChallenge } from '@swimchain/react';

// Profiles
import { useUserProfile, getAvatarColor } from '@swimchain/react';

// Caching
import { getContentFromCache, setContentInCache } from '@swimchain/react';
```

## Implementation Phases

### Phase 1: Core Chat (MVP)
- [ ] Project setup
- [ ] Server list (joined spaces)
- [ ] Channel list (threads in space)
- [ ] Message list (replies in thread)
- [ ] Send message (create reply)
- [ ] Basic polling for new messages
- [ ] Unread indicators

### Phase 2: Server Management
- [ ] Create server (create space)
- [ ] Join server via invite
- [ ] Leave server
- [ ] Server settings
- [ ] Create channel (create thread)
- [ ] Channel categories

### Phase 3: Direct Messages
- [ ] DM list
- [ ] Start DM (create private space)
- [ ] Group DMs
- [ ] DM notifications

### Phase 4: Rich Messaging
- [ ] File attachments
- [ ] Image previews
- [ ] Emoji reactions
- [ ] Reply to specific message
- [ ] Edit/delete messages
- [ ] Pin messages
- [ ] Markdown formatting

### Phase 5: Member Experience
- [ ] Member list sidebar
- [ ] Online/offline status (inferred)
- [ ] User profiles (popout + full)
- [ ] @mentions
- [ ] Typing indicators (optimistic)

### Phase 6: Notifications & Polish
- [ ] Desktop notifications
- [ ] Notification sounds
- [ ] Per-server/channel mute
- [ ] Quick switcher (Ctrl+K)
- [ ] Keyboard navigation
- [ ] Search messages

### Phase 7: Advanced
- [ ] Server discovery
- [ ] Server invites with expiry
- [ ] Roles and permissions
- [ ] Server boost/premium
- [ ] Custom emoji
- [ ] Voice channels (WebRTC - stretch)

## File Structure

```
chat-client/
├── public/
│   ├── index.html
│   └── sounds/
│       ├── message.mp3
│       ├── mention.mp3
│       └── join.mp3
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── stores/
│   ├── pages/
│   ├── lib/
│   ├── styles/
│   │   ├── globals.css
│   │   ├── variables.css
│   │   ├── discord-theme.css
│   │   └── components/
│   └── types/
│       ├── server.ts
│       ├── channel.ts
│       ├── message.ts
│       └── user.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── DESIGN.md
```

## package.json

```json
{
  "name": "@swimchain/chat-client",
  "version": "0.1.0",
  "dependencies": {
    "@swimchain/react": "workspace:*",
    "@swimchain/core": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "zustand": "^4.4.0",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

## Performance Considerations

### Virtual Scrolling
Messages use virtual scrolling for channels with 1000s of messages:

```typescript
// Only render visible messages + buffer
const OVERSCAN = 10;

function MessageList({ channelId }: { channelId: string }) {
  const { messages } = useMessages(channelId);
  const containerRef = useRef<HTMLDivElement>(null);

  const { visibleRange, totalHeight } = useVirtualScroll({
    itemCount: messages.length,
    itemHeight: estimateMessageHeight,
    containerRef,
    overscan: OVERSCAN,
  });

  return (
    <div ref={containerRef} style={{ height: totalHeight }}>
      {messages.slice(visibleRange.start, visibleRange.end).map(msg => (
        <Message key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

### Message Batching
Batch message fetches to reduce API calls:

```typescript
// Fetch messages for multiple channels at once
async function batchFetchUnread(channelIds: string[]) {
  const results = await Promise.all(
    channelIds.map(id =>
      rpc.getReplies(id, { since: lastRead[id], limit: 1 })
    )
  );

  return channelIds.reduce((acc, id, i) => {
    acc[id] = results[i].totalCount;
    return acc;
  }, {} as Record<string, number>);
}
```

### Image Lazy Loading
```typescript
function MessageAttachment({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        imgRef.current!.src = url;
        observer.disconnect();
      }
    });

    observer.observe(imgRef.current!);
    return () => observer.disconnect();
  }, [url]);

  return (
    <img
      ref={imgRef}
      onLoad={() => setLoaded(true)}
      className={loaded ? 'loaded' : 'loading'}
    />
  );
}
```

## Success Metrics

1. **Message Send Time** - < 500ms optimistic, < 3s confirmed
2. **Channel Switch** - < 200ms
3. **Server Switch** - < 500ms
4. **Polling Efficiency** - < 10 requests/minute idle
5. **Memory Usage** - < 150MB for 10 servers, 100 channels
6. **Offline Support** - Read cached messages offline
