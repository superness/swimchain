# Forum Client - Client Documentation

## Overview

The **Swimchain Forum Client** is a decentralized, censorship-resistant forum application built on the Swimchain network. It serves as the reference implementation for building applications on Swimchain, demonstrating key features like:

- **Proof-of-Work spam resistance** - All content creation requires Argon2id PoW
- **End-to-end encryption** - Passphrase-protected posts and private spaces
- **Content decay system** - Content naturally ages out unless engaged with
- **Client-side moderation** - Personal blocklists without network censorship

**Target Users**: Developers building Swimchain clients, forum administrators, and end users seeking censorship-resistant discussion platforms.

## Quick Start

```bash
# Navigate to forum-client
cd forum-client

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

**Requirements**:
- Node.js >= 18.0.0
- Local Swimchain node running on `localhost:9494` (default) or `localhost:19736` (testnet)

**Environment Variables**:
- `VITE_USE_REMOTE_SEED=true` - Connect to testnet seed instead of localhost

## Architecture

### Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Framework** | React 18.2 | UI components and state |
| **Language** | TypeScript 5.3 | Type-safe development |
| **Build Tool** | Vite 5.0 | Fast HMR and bundling |
| **Styling** | Component-scoped CSS | Isolated styles per component |
| **State** | React Context (5 providers) | Global state management |
| **Routing** | React Router DOM 6.20 | Client-side navigation |
| **Cryptography** | @noble/* | Ed25519 signatures, AES-GCM encryption |
| **PoW Mining** | hash-wasm (Argon2id) | Browser-based proof-of-work |

### Directory Structure

```
forum-client/
src/
  main.tsx              # React entry point
  App.tsx               # Main routing & providers
  components/           # Reusable UI components (33+ files)
    Header.tsx          # App header with search
    Sidebar.tsx         # Navigation sidebar
    ThreadList.tsx      # Thread listing table
    ReplyTree.tsx       # Nested reply rendering
    EncryptedContent.tsx # Encryption handling
    ChatView.tsx        # Private space chat
    ...
  pages/                # Page components (9 files)
    Identity.tsx        # Identity creation/import
    SpaceList.tsx       # Space listing
    SpaceView.tsx       # Thread listing in space
    ThreadView.tsx      # Thread with replies
    NewThread.tsx       # Create new thread
    Profile.tsx         # User profile
    Settings.tsx        # App settings
    CreatePrivateSpace.tsx
    SearchResults.tsx
  hooks/                # Custom React hooks (18 files)
    useRpc.tsx          # RPC client provider
    useActionPow.ts     # Argon2id PoW mining
    useBlocklist.ts     # Client-side blocklist
    usePrivateSpaceKeys.ts # Private space encryption
    ...
  lib/                  # Utility libraries (7 files)
    rpc.ts              # SwimchainRpc client
    encryption.ts       # AES-GCM encryption
    action-pow.ts       # PoW challenge/solution
    x25519.ts           # Key exchange
    cache.ts            # Multi-layer caching
    profile.ts          # Profile management
    dm.ts               # Direct message utilities
  providers/            # Context providers (2 files)
    SwimchainProvider.tsx # WASM loading
    IdentityProvider.tsx  # Identity state
  layouts/
    MainLayout.tsx      # 3-column layout
  types/
    index.ts            # TypeScript definitions
  wasm/
    loader.ts           # Local WASM loader
    chainsocial_wasm.* # WASM bindings
  styles/
    globals.css         # Global styles
```

### Provider Hierarchy

```tsx
<ErrorBoundary>
  <SwimchainProvider>           {/* WASM initialization */}
    <RpcProvider>               {/* RPC connection */}
      <PreferencesProvider>     {/* User settings */}
        <BrowserRouter>
          <IdentityProvider>    {/* Identity state */}
            <KeyboardNavigationProvider>  {/* Keyboard shortcuts */}
              <MainLayout>
                <Routes />
              </MainLayout>
            </KeyboardNavigationProvider>
          </IdentityProvider>
        </BrowserRouter>
      </PreferencesProvider>
    </RpcProvider>
  </SwimchainProvider>
</ErrorBoundary>
```

## Features

### 1. Identity Management
**Description**: Create, import, and manage cryptographic identities for participating in the network.

**User Flow**:
1. Navigate to `/identity`
2. Click "Generate Identity" to create a new keypair
3. Wait for SHA-256 PoW mining (~20 leading zeros)
4. Save identity to localStorage
5. Optionally set a display name

**Components**: `IdentityPage`, `IdentityCard`, `AddressDisplay`, `PowProgress`

**Status**: Complete

---

### 2. Space Navigation
**Description**: Browse and navigate public discussion spaces (forums).

**User Flow**:
1. Navigate to `/spaces`
2. View list of public spaces with post counts
3. Click a space to view its threads
4. Use sidebar for quick navigation

**Components**: `SpaceList`, `SpaceTree`, `Sidebar`

**Status**: Complete

---

### 3. Thread Creation
**Description**: Create new discussion threads with optional encryption and media attachments.

**User Flow**:
1. Navigate to a space
2. Click "New Thread"
3. Enter title and body
4. Optionally enable encryption with passphrase
5. Optionally attach images (up to 4)
6. Wait for Argon2id PoW mining
7. Submit thread

**Components**: `NewThread`, `PowProgress`, `ImageGallery`

**Status**: Complete

---

### 4. Reply System
**Description**: Nested threaded replies with decay tracking.

**User Flow**:
1. Open a thread
2. Click "Reply" on thread or existing reply
3. Enter reply content
4. Wait for PoW mining
5. Submit reply

**Components**: `ThreadView`, `ReplyTree`, `ReplyComposer`

**Status**: Complete

---

### 5. Discord-Style Reactions
**Description**: 8 emoji reactions with PoW cost per reaction.

**User Flow**:
1. Click reaction button on any content
2. Select emoji: heart, thumbs_up, thumbs_down, laugh, thinking, mind_blown, fire, swimming
3. Wait for engagement PoW mining
4. Reaction is recorded

**Components**: `ThreadView`, `ReplyTree`

**Reaction Types**:
| Emoji | Code | Symbol |
|-------|------|--------|
| heart | 1 | Heart |
| thumbs_up | 2 | Thumbs up |
| thumbs_down | 3 | Thumbs down |
| laugh | 4 | Laughing face |
| thinking | 5 | Thinking face |
| mind_blown | 6 | Mind blown |
| fire | 7 | Fire |
| swimming | 8 | Swimming |

**Status**: Complete

---

### 6. Encrypted Posts
**Description**: Passphrase-protected posts using PBKDF2 + AES-256-GCM.

**User Flow (Creating)**:
1. In NewThread, check "Encrypt this post"
2. Enter a passphrase
3. Optionally set as default passphrase
4. Submit - content is encrypted client-side

**User Flow (Viewing)**:
1. See "[Encrypted Post]" placeholder
2. Enter passphrase to decrypt
3. Optionally save passphrase for this content
4. View decrypted content

**Components**: `EncryptedContent`, `EncryptedBadge`, `DecryptedBadge`, `InlineUnlock`

**Encryption Format**: `[ENCRYPTED:v1:<base64(salt:iv:ciphertext)>]`

**Status**: Complete

---

### 7. Private Spaces
**Description**: End-to-end encrypted group chats and DMs using X25519 key exchange.

**User Flow (Creating)**:
1. Navigate to `/spaces/new/private`
2. Enter space name
3. Invite users by public key
4. Space key is generated and shared via X25519 encryption

**User Flow (Joining)**:
1. Receive invitation link/key
2. Space key is decrypted and stored in IndexedDB
3. Access encrypted messages in `/chat/:spaceId`

**Components**: `CreatePrivateSpace`, `PrivateSpaceList`, `ChatView`, `InviteModal`, `SpaceSettings`

**Encryption Format**: `[PRIVATE:v1:<base64(iv:ciphertext)>]`

**Status**: Partial - PoW for space creation not implemented

---

### 8. Client-Side Blocklist
**Description**: Personal filtering without network censorship.

**User Flow**:
1. Click block button on any user/post/space/reply
2. Content is hidden from view
3. Manage blocklist in Settings

**Components**: `BlockButton`, `BlocklistManager`

**Block Types**: `user`, `post`, `space`, `reply`

**Storage**: `localStorage['swimchain-blocklist']`

**Status**: Complete

---

### 9. Spam Attestation
**Description**: Community-driven content moderation with PoW cost.

**User Flow (Reporting)**:
1. Click "Report" on content
2. Select reason: advertising, repetitive, off_topic, harassment, illegal_content
3. Wait for PoW mining
4. Report is submitted

**User Flow (Defending)**:
1. See flagged content
2. Submit counter-attestation with PoW
3. Helps dispute false flags

**Components**: `ReportModal`, `SpamBadge`

**Status**: Complete

---

### 10. Vim-Style Navigation
**Description**: Keyboard shortcuts for power users.

**Shortcuts**:
| Key | Action |
|-----|--------|
| `j` | Navigate down |
| `k` | Navigate up |
| `Enter` | Open selected item |
| `n` | Focus new thread input |
| `r` | Focus reply input |
| `e` | Engage with content (+5s) |
| `E` | Engage with content (+15s) |
| `/` | Focus search box |
| `?` | Show shortcuts modal |
| `Backspace` | Go back |

**Components**: `KeyboardNavigationProvider`

**Status**: Complete

---

### 11. Content Decay System
**Description**: Content naturally ages and gets pruned unless engaged with.

**Decay States**:
| State | Description |
|-------|-------------|
| `protected` | In 48-hour floor protection period |
| `active` | Recently engaged, high survival probability |
| `stale` | No recent engagement, declining survival |
| `decayed` | Marked for removal |

**Components**: `ContentStatus`

**Status**: Complete (display only - decay happens server-side)

## Component Inventory

### Component Hierarchy

```
App.tsx
├── PreferencesProvider
│   └── BrowserRouter
│       └── IdentityProvider
│           └── KeyboardNavigationProvider
│               └── MainLayout
│                   ├── Header
│                   │   ├── SearchBox
│                   │   └── ProfileButton
│                   │       └── AddressDisplay
│                   ├── Sidebar
│                   │   ├── SpaceTree
│                   │   └── PrivateSpaceList
│                   ├── <Routes>
│                   │   ├── IdentityPage
│                   │   │   ├── IdentityCard
│                   │   │   └── PowProgress
│                   │   ├── SpaceList
│                   │   │   └── PowProgress (for space creation)
│                   │   ├── SpaceView
│                   │   │   ├── ThreadSortControls
│                   │   │   ├── ThreadList
│                   │   │   │   ├── ImageThumbnailIndicator
│                   │   │   │   ├── ContentStatus (compact)
│                   │   │   │   └── BlockButton
│                   │   │   └── Pagination
│                   │   ├── ThreadView
│                   │   │   ├── EncryptedContent
│                   │   │   ├── ImageGallery
│                   │   │   ├── EngagementPool
│                   │   │   ├── ContentStatus
│                   │   │   ├── ReplyTree
│                   │   │   │   └── ReplyComposer
│                   │   │   ├── BlockButton
│                   │   │   └── ReportModal
│                   │   ├── NewThread
│                   │   │   └── PowProgress
│                   │   ├── CreatePrivateSpace
│                   │   │   └── PowProgress
│                   │   ├── ChatView
│                   │   │   ├── SpaceSettings
│                   │   │   │   └── InviteModal
│                   │   │   ├── EncryptedContent
│                   │   │   └── UserAvatar
│                   │   ├── ProfilePage
│                   │   │   └── UserAvatar
│                   │   ├── SettingsPage
│                   │   │   ├── BlocklistManager
│                   │   │   └── DebugPanel
│                   │   └── SearchResults
│                   └── StatusBar
└── ErrorBoundary
```

---

### Pages

#### SpaceList (`src/pages/SpaceList.tsx`)
**Purpose**: Main landing page showing all available discussion spaces

**Props**: None

**State**:
- `showCreateForm: boolean` - Controls visibility of space creation form
- `spaceName: string` - Input value for new space name
- `createError: string | null` - Error message from creation attempt
- `isCreating: boolean` - Whether space creation is in progress

**Hooks Used**: `useSpaces`, `useRpc`, `useStoredIdentity`, `useSpaceCreationPow`, `useNavigate`

**Effects**: Auto-submit when mining completes

**Renders**: `PowProgress`, `Link` (to space cards)

**Routes To**: `/spaces/:spaceId`, `/identity`

---

#### SpaceView (`src/pages/SpaceView.tsx`)
**Purpose**: Displays threads within a specific space with sorting and pagination

**Props**: None (uses URL params)

**URL Params**: `spaceId`

**State**:
- `sortBy: ThreadSortOption` - Current sort order
- `page: number` - Current pagination page

**Hooks Used**: `useSpaceThreads`, `useParams`, `useKeyboardNavigation`, `useBlocklist`

**Renders**: `ThreadSortControls`, `ThreadList`, `Pagination`, `Link` (to new thread)

**Routes To**: `/spaces/:spaceId/new`, `/spaces/:spaceId/thread/:threadId`

---

#### ThreadView (`src/pages/ThreadView.tsx`)
**Purpose**: Full thread view with replies, reactions, and engagement pool

**Props**: None (uses URL params)

**URL Params**: `spaceId`, `threadId`, `replyId?`

**State**:
- `showReplyComposer: boolean` - Reply form visibility
- `replyToId: string | null` - Parent ID for nested replies
- `passphrase: string` - Decryption passphrase (if encrypted)

**Hooks Used**: `useThread`, `useReplies`, `useEngagementPow`, `useReplyPow`, `useBlocklist`, `usePassphraseStore`

**Renders**: `EncryptedContent`, `ImageGallery`, `EngagementPool`, `ContentStatus`, `ReplyTree`, `ReplyComposer`, `BlockButton`, `ReportModal`

---

#### NewThread (`src/pages/NewThread.tsx`)
**Purpose**: Thread creation form with encryption and media upload

**Props**: None (uses URL params)

**URL Params**: `spaceId`

**State**:
- `title: string` - Thread title
- `body: string` - Thread body
- `encrypt: boolean` - Enable encryption toggle
- `passphrase: string` - Encryption passphrase
- `images: File[]` - Attached images (max 4)
- `isSubmitting: boolean` - Submission in progress

**Hooks Used**: `usePostPow`, `useMediaUpload`, `useStoredIdentity`, `useRpc`, `usePassphraseStore`, `useNavigate`

**Renders**: `PowProgress`

**Routes To**: `/spaces/:spaceId/thread/:threadId` (after creation)

---

#### Identity (`src/pages/Identity.tsx`)
**Purpose**: Identity creation, import, and management

**Props**: None

**State**:
- `identity: StoredIdentity | null` - Current stored identity
- `showCreate: boolean` - Creation form visibility
- `importSeed: string` - Import seed input
- `displayName: string` - Display name input

**Hooks Used**: `useStoredIdentity`, `useSwimchain`, `usePow`

**Renders**: `IdentityCard`, `PowProgress`, `AddressDisplay`

---

#### Settings (`src/pages/Settings.tsx`)
**Purpose**: User preferences and app settings

**Props**: None

**State**: None (uses context)

**Hooks Used**: `usePreferences`, `useRpc`

**Renders**: `BlocklistManager`, `DebugPanel`

---

#### CreatePrivateSpace (`src/pages/CreatePrivateSpace.tsx`)
**Purpose**: Create end-to-end encrypted private spaces

**Props**: None

**State**:
- `spaceName: string` - Space name input
- `initialMembers: string[]` - Public keys of initial members
- `isCreating: boolean` - Creation in progress

**Hooks Used**: `useStoredKeypair`, `usePrivateSpaceKeys`, `useRpc`, `useSpaceCreationPow`, `useNavigate`

**Renders**: `PowProgress`

**Routes To**: `/chat/:spaceId` (after creation)

---

#### SearchResults (`src/pages/SearchResults.tsx`)
**Purpose**: Display search results (client-side filtering)

**Props**: None

**URL Params**: `?q=query`

**State**:
- `results: Thread[]` - Filtered threads
- `loading: boolean` - Loading state

**Hooks Used**: `useSpaces`, `useRpc`, `useSearchParams`

**Renders**: Thread result cards with links

---

#### Profile (`src/pages/Profile.tsx`)
**Purpose**: User profile display and editing

**Props**: None (uses URL params)

**URL Params**: `userPk?` (optional - shows own profile if missing)

**State**:
- `editing: boolean` - Edit mode toggle
- `displayName: string` - Display name input

**Hooks Used**: `useUserProfile`, `useStoredIdentity`, `useParams`

**Renders**: `UserAvatar`, `AvatarGroup`, `StartDMButton`

---

### Shared Components

#### Header (`src/components/Header.tsx`)
**Purpose**: App header with branding, search, and profile access

**Props**: None

**Hooks Used**: `useNavigate`

**Renders**: `SearchBox`, `ProfileButton`

**Styling**: `Header.css`

---

#### Sidebar (`src/components/Sidebar.tsx`)
**Purpose**: Navigation sidebar with public/private space tabs

**Props**: None

**State**:
- `collapsed: boolean` - Sidebar collapsed state
- `activeTab: 'public' | 'private'` - Active tab selection

**Hooks Used**: `useSpaces`, `usePrivateSpaceKeys`

**Renders**: `SpaceTree`, `PrivateSpaceList`

**Styling**: `Sidebar.css`

---

#### StatusBar (`src/components/StatusBar.tsx`)
**Purpose**: Bottom status bar showing sync status and peer count

**Props**: None

**Hooks Used**: `useNetworkStatus`, `useRpc`

**Styling**: `StatusBar.css`

---

#### MainLayout (`src/layouts/MainLayout.tsx`)
**Purpose**: 3-column responsive layout with header, sidebar, and content

**Props**:
```typescript
interface MainLayoutProps {
  children: ReactNode;
}
```

**Effects**: Focus management on route change for accessibility

**Renders**: `Header`, `Sidebar`, `StatusBar`, skip-link

**Styling**: `MainLayout.css`

---

#### ThreadList (`src/components/ThreadList.tsx`)
**Purpose**: Displays threads in a table with filtering, auto-decryption, and keyboard selection

**Props**:
```typescript
interface ThreadListProps {
  threads: Thread[];
  spaceId: string;
  selectedIndex?: number;
  onThreadClick?: (threadId: string) => void;
}
```

**State**:
- `decryptedTitles: Map<string, string>` - Auto-decrypted titles cache

**Hooks Used**: `useBlocklist`, `useKeyboardNavigation`, `usePassphraseStore`

**Renders**: `ImageThumbnailIndicator`, `ContentStatus`, `BlockButton`, `EncryptedBadge`

**Styling**: `ThreadList.css`

---

#### ThreadSortControls (`src/components/ThreadSortControls.tsx`)
**Purpose**: Sort dropdown for thread ordering

**Props**:
```typescript
interface ThreadSortControlsProps {
  value: ThreadSortOption;
  onChange: (value: ThreadSortOption) => void;
}
```

**Sort Options**: `newest`, `oldest`, `replies`, `active`

**Styling**: `ThreadSortControls.css`

---

#### ReplyTree (`src/components/ReplyTree.tsx`)
**Purpose**: Renders nested reply hierarchy with collapsible branches

**Props**:
```typescript
interface ReplyTreeProps {
  replies: Reply[];
  threadId: string;
  focusedReplyId?: string;
  onReply?: (parentId: string) => void;
  onReact?: (replyId: string, emoji: string) => void;
  encryptionPassphrase?: string;
}
```

**State**:
- `collapsedIds: Set<string>` - Collapsed reply IDs
- `showingMore: Set<string>` - Expanded "show more" branches

**Renders**: `ReplyComposer`, `ContentStatus`, `BlockButton`, `UserAvatar`

**Styling**: `ReplyTree.css`

---

#### ReplyComposer (`src/components/ReplyComposer.tsx`)
**Purpose**: Inline reply composition form with PoW mining

**Props**:
```typescript
interface ReplyComposerProps {
  threadId: string;
  parentId: string | null;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
}
```

**State**:
- `body: string` - Reply content
- `isMining: boolean` - PoW mining state

**Hooks Used**: `useReplyPow`

**Renders**: `PowProgress`

**Styling**: `ReplyComposer.css`

---

#### ChatView (`src/components/ChatView.tsx`)
**Purpose**: Private space chat interface with real-time messages

**Props**: None (uses URL params)

**URL Params**: `spaceId`

**State**:
- `messages: PrivateMessage[]` - Decrypted messages
- `newMessage: string` - Input value
- `showSettings: boolean` - Settings modal visibility

**Hooks Used**: `usePrivateSpaceMessages`, `usePrivateSpaceKeys`, `useStoredKeypair`

**Renders**: `SpaceSettings`, `InviteModal`, `EncryptedContent`, `UserAvatar`

**Styling**: `ChatView.css`

---

#### EncryptedContent (`src/components/EncryptedContent.tsx`)
**Purpose**: Handles passphrase decryption UI with auto-unlock

**Props**:
```typescript
interface EncryptedContentProps {
  contentId: string;
  encryptedBody: string;
  encryptedTitle: string;
  onDecrypted?: (title: string, body: string) => void;
  onLocked?: () => void;
}
```

**State**:
- `passphrase: string` - User input passphrase
- `decryptedTitle: string | null` - Decrypted title
- `decryptedBody: string | null` - Decrypted body
- `error: string | null` - Decryption error
- `decrypting: boolean` - Decryption in progress
- `rememberPassphrase: boolean` - Save passphrase toggle
- `setAsDefault: boolean` - Set as default toggle

**Hooks Used**: `usePassphraseStore`

**Effects**: Auto-decrypt with stored passphrases on mount

**Exports**: `EncryptedContent`, `EncryptedBadge`, `DecryptedBadge`, `InlineUnlock`

**Styling**: `EncryptedContent.css`

---

#### ImageGallery (`src/components/ImageGallery.tsx`)
**Purpose**: Display and decrypt media attachments with lightbox

**Props**:
```typescript
interface ImageGalleryProps {
  mediaRefs: MediaRef[];
  thumbnailMode?: boolean;
  maxThumbnails?: number;
  encryptionPassphrase?: string;
}
```

**State**:
- `imageUrls: Map<string, string>` - Loaded image URLs
- `encryptedLocked: Set<string>` - Locked encrypted images
- `loading: boolean` - Loading state
- `lightboxIndex: number | null` - Open lightbox image index

**Hooks Used**: `useMediaUpload`, `useRpc`

**Effects**: Load and decrypt images, keyboard navigation in lightbox

**Exports**: `ImageGallery`, `ImageThumbnailIndicator`

**Styling**: `ImageGallery.css`

---

#### EngagementPool (`src/components/EngagementPool.tsx`)
**Purpose**: Visualize and contribute to content persistence pool

**Props**:
```typescript
interface EngagementPoolProps {
  pool: PoolState;
  onContribute?: (seconds: number) => void;
  isContributing?: boolean;
  contributionProgress?: number;
}
```

**Contribution Buttons**: +5s Quick, +15s Standard, +30s Champion

**Exports**: `EngagementPool`, `EngagementPoolBadge`

**Styling**: `EngagementPool.css`

---

#### ContentStatus (`src/components/ContentStatus.tsx`)
**Purpose**: Discord-style emoji reactions with picker

**Props**:
```typescript
interface ContentStatusProps {
  onReact?: (emoji: string) => void;
  isReacting?: boolean;
  emojiCounts?: EmojiCount[];
  compact?: boolean;
}
```

**State**:
- `showPicker: boolean` - Emoji picker visibility

**Emoji Options**: heart, thumbs_up, fire, laugh, thinking, mind_blown, swimming, thumbs_down

**Styling**: `ContentStatus.css`

---

#### PowProgress (`src/components/PowProgress.tsx`)
**Purpose**: Mining progress indicator with cancel button

**Props**:
```typescript
interface PowProgressProps {
  attempts: number;
  elapsedMs: number;
  difficulty: number;
  onCancel?: () => void;
}
```

**Display**: Attempts count, elapsed time, estimated hash rate

**Styling**: `PowProgress.css`

---

#### AddressDisplay (`src/components/AddressDisplay.tsx`)
**Purpose**: Truncated bech32m address with copy button

**Props**:
```typescript
interface AddressDisplayProps {
  address: string;
  truncate?: boolean;
}
```

**Exports**: `AddressDisplay`, `truncateAddress` (utility)

**Styling**: `AddressDisplay.css`

---

#### SpaceTree (`src/components/SpaceTree.tsx`)
**Purpose**: Hierarchical space navigation tree

**Props**:
```typescript
interface SpaceTreeProps {
  spaces: Space[];
  selectedId?: string;
  onSelect?: (spaceId: string) => void;
}
```

**State**:
- `expandedIds: Set<string>` - Expanded tree nodes

**Styling**: `SpaceTree.css`

---

#### PrivateSpaceList (`src/components/PrivateSpaceList.tsx`)
**Purpose**: List of user's private spaces

**Props**: None

**Hooks Used**: `usePrivateSpaceKeys`, `useStoredKeypair`

**Renders**: List of private space links, unread indicators

**Styling**: `PrivateSpaceList.css`

---

#### SearchBox (`src/components/SearchBox.tsx`)
**Purpose**: Header search input with keyboard shortcut hint

**Props**: None

**State**:
- `query: string` - Search input value
- `isFocused: boolean` - Focus state for styling

**Hooks Used**: `useNavigate`

**Routes To**: `/search?q={query}`

**Styling**: `SearchBox.css`

---

#### ProfileButton (`src/components/ProfileButton.tsx`)
**Purpose**: Header profile indicator with identity status

**Props**: None

**Hooks Used**: `useNodeIdentity`

**Renders**: `AddressDisplay`, avatar initials

**Routes To**: `/identity`, `/settings`

**Styling**: `ProfileButton.css`

---

#### IdentityCard (`src/components/IdentityCard.tsx`)
**Purpose**: Display identity details with address and metadata

**Props**:
```typescript
interface IdentityCardProps {
  identity: StoredIdentity;
}
```

**Renders**: `AddressDisplay`, creation date, PoW difficulty

**Styling**: `IdentityCard.css`

---

#### UserAvatar (`src/components/UserAvatar.tsx`)
**Purpose**: Deterministic avatar from public key with optional image

**Props**:
```typescript
interface UserAvatarProps {
  userPk: string;
  displayName?: string;
  avatar?: AvatarInfo | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
  showOnline?: boolean;
  isOnline?: boolean;
}
```

**State**:
- `imageError: boolean` - Image load error flag

**Exports**: `UserAvatar`, `AvatarGroup`

**Styling**: `UserAvatar.css`

---

#### Pagination (`src/components/Pagination.tsx`)
**Purpose**: Page navigation with ellipsis for large ranges

**Props**:
```typescript
interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}
```

**Styling**: `Pagination.css`

---

#### BlockButton (`src/components/BlockButton.tsx`)
**Purpose**: Block content/users with dropdown menu

**Props**:
```typescript
interface BlockButtonProps {
  id: string;
  type: BlockType;
  authorId?: string;
  variant?: 'icon' | 'text' | 'menu-item';
}
```

**State**:
- `showMenu: boolean` - Dropdown menu visibility

**Hooks Used**: `useBlocklist`

**Effects**: Click outside to close menu

**Exports**: `BlockButton`, `BlockedIndicator`

**Styling**: `BlockButton.css`

---

#### BlocklistManager (`src/components/BlocklistManager.tsx`)
**Purpose**: View and manage all blocked content

**Props**: None

**State**:
- `activeTab: 'users' | 'posts' | 'spaces' | 'replies'` - Active filter tab

**Hooks Used**: `useBlocklist`

**Features**: Tab-based filtering, unblock buttons, clear all

**Styling**: `BlocklistManager.css`

---

#### ReportModal (`src/components/ReportModal.tsx`)
**Purpose**: Spam attestation modal with reason selection

**Props**:
```typescript
interface ReportModalProps {
  contentId: string;
  onClose: () => void;
}
```

**State**:
- `selectedReason: SpamReason | null` - Selected report reason
- `result: 'success' | 'error' | null` - Submission result

**Hooks Used**: `useSpamReport`, `useSpamStatus`, `useStoredKeypair`

**Spam Reasons**: advertising, repetitive, off_topic, harassment, illegal_content

**Exports**: `ReportModal`, `SpamBadge`, `ReportButton`

**Styling**: `ReportModal.css`

---

#### InviteModal (`src/components/InviteModal.tsx`)
**Purpose**: Invite users to private spaces

**Props**:
```typescript
interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName?: string;
}
```

**State**:
- `recipientAddress: string` - Invitee public key input
- `message: string` - Optional message
- `inviteError: string | null` - Error message
- `success: boolean` - Success state

**Hooks Used**: `useStoredKeypair`, `usePrivateSpaceKeys`, `useInviteToSpace`

**Styling**: `InviteModal.css`

---

#### SpaceSettings (`src/components/SpaceSettings.tsx`)
**Purpose**: Private space admin controls

**Props**:
```typescript
interface SpaceSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  isAdmin?: boolean;
}
```

**State**:
- `showInviteModal: boolean` - Invite modal visibility
- `confirmLeave: boolean` - Leave confirmation state
- `kickingMember: string | null` - Member being kicked

**Hooks Used**: `useSpaceMembers`, `useLeaveSpace`, `useKickMember`, `usePrivateSpaceKeys`

**Renders**: `InviteModal`, member list with kick buttons

**Styling**: `SpaceSettings.css`

---

#### StartDMButton (`src/components/StartDMButton.tsx`)
**Purpose**: Initiate direct messages with users

**Props**:
```typescript
interface StartDMButtonProps {
  recipientPk: string;
  recipientName?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}
```

**State**:
- `status: DMStatus` - DM state (none, pending_sent, active)
- `loading: boolean` - Request in progress
- `error: string | null` - Error message

**Hooks Used**: `useStoredKeypair`, `usePrivateSpaceKeys`, `useRequestDM`, `useNavigate`

**Styling**: `StartDMButton.css`

---

#### DebugPanel (`src/components/DebugPanel.tsx`)
**Purpose**: Node diagnostic information panel

**Props**: None

**State**:
- `status: NodeStatus | null` - Node status info
- `peers: PeerInfo[]` - Connected peers list
- `showPeers: boolean` - Peer list visibility
- `showLogs: boolean` - Logs section visibility
- `autoRefresh: boolean` - Auto-refresh toggle

**Hooks Used**: `useRpc`

**Effects**: Fetch debug info on mount, auto-refresh every 5s

**Styling**: `DebugPanel.css`

---

#### NodeStatusBar (`src/components/NodeStatusBar.tsx`)
**Purpose**: Desktop app node status indicator (Tauri only)

**Props**:
```typescript
interface NodeStatusBarProps {
  onSettingsClick?: () => void;
}
```

**State**:
- `status: NodeStatus | null` - Node running status
- `showControls: boolean` - Control dropdown visibility
- `isTauriAvailable: boolean | null` - Tauri detection state

**Effects**: Poll node status every 3s

**Exports**: `NodeStatusBar`, `isInTauri`

**Styling**: `NodeStatusBar.css`

---

#### RequireIdentity (`src/components/RequireIdentity.tsx`)
**Purpose**: Route guard that redirects to `/identity` if no valid identity

**Props**:
```typescript
interface RequireIdentityProps {
  children: React.ReactNode;
}
```

**Hooks Used**: `useIdentityContext`, `useLocation`

**Routes To**: `/identity` (if no identity)

---

#### ErrorBoundary (`src/components/ErrorBoundary.tsx`)
**Purpose**: Catch React errors with recovery UI

**Props**:
```typescript
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
```

**State**:
- `hasError: boolean` - Error caught flag
- `error: Error | null` - Caught error
- `errorInfo: ErrorInfo | null` - Component stack

**Features**: Retry button, reload button, technical details (dev mode)

**Styling**: `ErrorBoundary.css`

---

#### Loading (`src/components/Loading.tsx`)
**Purpose**: WASM initialization loading screen

**Props**: None

**Styling**: `Loading.css`

---

## Components Reference

### Core Layout Components

#### Header
**Location**: `src/components/Header.tsx`
**Purpose**: App header with branding, search, and profile access

**Props**: None (uses hooks internally)

**Usage**:
```tsx
<Header />
```

---

#### Sidebar
**Location**: `src/components/Sidebar.tsx`
**Purpose**: Navigation sidebar with public/private space tabs

**Props**: None

**Features**:
- Collapsible
- Space tree navigation
- Private space list

---

#### MainLayout
**Location**: `src/layouts/MainLayout.tsx`
**Purpose**: 3-column responsive layout

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| children | ReactNode | Yes | Page content |

---

### Content Components

#### ThreadList
**Location**: `src/components/ThreadList.tsx`
**Purpose**: Displays threads in a table with filtering and auto-decryption

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| threads | Thread[] | Yes | Array of threads to display |
| spaceId | string | Yes | Parent space ID |

**Features**:
- Auto-filters blocked content
- Auto-decrypts with stored passphrases
- Image thumbnails for media posts

---

#### ReplyTree
**Location**: `src/components/ReplyTree.tsx`
**Purpose**: Renders nested reply hierarchy

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| replies | Reply[] | Yes | Nested reply array |
| threadId | string | Yes | Parent thread ID |
| onReply | (parentId: string) => void | No | Reply callback |

---

#### EncryptedContent
**Location**: `src/components/EncryptedContent.tsx`
**Purpose**: Handles passphrase decryption UI

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| contentId | string | Yes | Content ID for passphrase storage |
| encryptedBody | string | Yes | Encrypted content string |
| encryptedTitle | string | Yes | Original title (usually "[Encrypted Post]") |
| onDecrypted | (title, body) => void | No | Decryption success callback |
| onLocked | () => void | No | Lock callback |

---

#### ImageGallery
**Location**: `src/components/ImageGallery.tsx`
**Purpose**: Display and decrypt media attachments

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| mediaRefs | MediaRef[] | Yes | Array of media references |
| thumbnailMode | boolean | No | Show thumbnails only |
| maxThumbnails | number | No | Max thumbnails (default: 4) |
| encryptionPassphrase | string | No | Passphrase for encrypted media |

---

### Identity Components

#### RequireIdentity
**Location**: `src/components/RequireIdentity.tsx`
**Purpose**: Route guard that redirects to `/identity` if no valid identity

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| children | ReactNode | Yes | Protected content |

**Usage**:
```tsx
<RequireIdentity>
  <ProtectedPage />
</RequireIdentity>
```

---

#### IdentityCard
**Location**: `src/components/IdentityCard.tsx`
**Purpose**: Display identity details with address and public key

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| identity | StoredIdentity | Yes | Identity to display |

---

#### UserAvatar
**Location**: `src/components/UserAvatar.tsx`
**Purpose**: Generate deterministic avatar from public key

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| publicKey | string | Yes | Hex public key |
| size | number | No | Avatar size in pixels |

---

### Moderation Components

#### BlockButton
**Location**: `src/components/BlockButton.tsx`
**Purpose**: Single button to block content/users

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| id | string | Yes | Item ID to block |
| type | BlockType | Yes | 'user' \| 'post' \| 'space' \| 'reply' |
| authorId | string | No | Author ID for user blocking |

---

#### ReportModal
**Location**: `src/components/ReportModal.tsx`
**Purpose**: Modal for reporting spam with reason selection

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| contentId | string | Yes | Content to report |
| isOpen | boolean | Yes | Modal visibility |
| onClose | () => void | Yes | Close callback |

## Hooks & State Inventory

This section provides a comprehensive inventory of all custom hooks and state management patterns in the forum-client.

---

### Custom Hooks

#### useRpc (`src/hooks/useRpc.tsx`)
**Purpose**: RPC client provider with signature authentication and auto-reconnect

**Parameters**: None (uses RpcContext)

**Returns**:
```typescript
interface RpcContextValue {
  rpc: SwimchainRpc | null;       // RPC client instance
  connected: boolean;              // Connection status
  connecting: boolean;             // Connection attempt in progress
  error: string | null;            // Connection error message
  nodeInfo: {
    version: string;
    network: string;
    peerCount: number;
  } | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
}
```

**State Managed**:
- RPC client instance (in-memory)
- Connection state
- Node information

**Side Effects**:
- Auto-connects to localhost:19736 on mount
- Polls for identity changes every 1 second
- Retries connection every 5 seconds on failure
- Listens for parent frame config (iframe mode)

**Used By**: SpaceList, SpaceView, ThreadView, NewThread, Profile, Settings, all data-fetching hooks

**Dependencies**: None (root context)

---

#### useStoredIdentity (`src/hooks/useStoredIdentity.ts`)
**Purpose**: Persist user identity to localStorage

**Parameters**: None

**Returns**:
```typescript
interface UseStoredIdentityResult {
  identity: StoredIdentity | null;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
  isLoading: boolean;
}
```

**State Managed**:
- User identity (seed, publicKey, address)
- Loading state during hydration

**Storage**: `localStorage['swimchain-identity']`

**Side Effects**:
- Loads identity from localStorage on mount
- Persists changes to localStorage

**Used By**: IdentityPage, NewThread, ReplyComposer, all PoW hooks

**Dependencies**: None

---

#### useStoredKeypair (`src/hooks/useStoredKeypair.ts`)
**Purpose**: Bridge stored identity to WASM Keypair for signing

**Parameters**: None

**Returns**:
```typescript
interface UseStoredKeypairResult {
  keypair: WasmKeypair | null;     // WASM keypair object
  publicKey: Uint8Array | null;    // 32-byte public key
  address: string | null;          // cs1... bech32m address
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
}
```

**State Managed**:
- WASM Keypair instance
- Derived public key and address

**Side Effects**:
- Creates Keypair from seed when identity/WASM available
- Frees WASM memory on unmount

**Used By**: CreatePrivateSpace, ChatView, InviteModal, StartDMButton

**Dependencies**: `useSwimchain`, `useStoredIdentity`

---

#### useNodeIdentity (`src/hooks/useNodeIdentity.ts`)
**Purpose**: Use node's identity for signing (alternative to browser-side identity)

**Parameters**: None

**Returns**:
```typescript
interface UseNodeIdentityResult {
  identity: { publicKey: string; address: string } | null;
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
  refetch: () => void;
}
```

**State Managed**:
- Node identity info

**Side Effects**:
- Fetches identity via `get_identity_info` RPC on connect
- Signs messages via `sign_message` RPC

**Used By**: ProfileButton

**Dependencies**: `useRpc`

---

#### useActionPow (`src/hooks/useActionPow.ts`)
**Purpose**: Mine Argon2id PoW for content creation actions

**Parameters**: None

**Returns**:
```typescript
interface UseActionPowResult {
  state: MiningState;              // 'idle' | 'mining' | 'complete' | 'error' | 'cancelled'
  progress: {
    attempts: number;
    elapsedMs: number;
    hashRate: number;
  };
  solution: PoWSolution | null;
  error: string | null;
  mine: (actionType: ActionType, content: Uint8Array, authorPubkey: Uint8Array, isTestnet?: boolean) => Promise<PoWSolution>;
  cancel: () => void;
  reset: () => void;
  getRpcParams: () => RpcParams | null;
}
```

**State Managed**:
- Mining state machine
- Progress metrics
- PoW solution

**Side Effects**:
- CPU-intensive Argon2id hashing (runs in batches for UI responsiveness)
- Progress callbacks during mining

**Used By**: NewThread, ReplyComposer, ThreadView (reactions)

**Dependencies**: None (uses lib/action-pow)

**Specialized Variants**:
| Hook | Purpose | ActionType |
|------|---------|------------|
| `usePostPow()` | New thread creation | `ActionType.Post` |
| `useReplyPow()` | Reply submission | `ActionType.Reply` |
| `useEngagementPow()` | Reactions/engagement | `ActionType.Engage` |
| `useSpaceCreationPow()` | Space creation | `ActionType.SpaceCreation` |
| `useEditPow()` | Content edits | `ActionType.Edit` |

---

#### usePow (`src/hooks/usePow.ts`)
**Purpose**: Mine SHA-256 PoW for identity creation (simpler than Argon2id)

**Parameters**: None

**Returns**:
```typescript
interface UsePowResult {
  state: PowState;                 // 'idle' | 'initializing' | 'mining' | 'complete' | 'cancelled' | 'error'
  solution: PowSolution | null;
  attempts: number;
  elapsedMs: number;
  mine: (publicKey: Uint8Array, difficulty: number) => void;
  cancel: () => void;
  reset: () => void;
}
```

**State Managed**:
- Mining state
- Solution (nonce + timestamp)
- Progress counters

**Side Effects**:
- Calls WASM `mineIdentityPowWithLimit` in batches
- Frees WASM result objects

**Used By**: IdentityPage

**Dependencies**: `useSwimchain`

---

#### useBlocklist (`src/hooks/useBlocklist.ts`)
**Purpose**: Client-side content filtering (local moderation)

**Parameters**: None

**Returns**:
```typescript
interface UseBlocklistResult {
  isUserBlocked: (userId: string) => boolean;
  isPostBlocked: (postId: string) => boolean;
  isSpaceBlocked: (spaceId: string) => boolean;
  isReplyBlocked: (replyId: string) => boolean;
  isBlocked: (id: string, type: BlockType) => boolean;
  block: (id: string, type: BlockType, reason?: string) => void;
  unblock: (id: string, type: BlockType) => void;
  getBlocked: (type: BlockType) => BlockedItem[];
  blocklist: Blocklist;
  clearAll: () => void;
  filterBlocked: <T>(items: T[], type: BlockType, options?) => T[];
}
```

**State Managed**:
- Blocked users, posts, spaces, replies
- O(1) lookup Sets for performance

**Storage**: `localStorage['swimchain-blocklist']`

**Side Effects**:
- Loads blocklist from localStorage on mount
- Persists changes to localStorage

**Used By**: ThreadList, ReplyTree, SpaceView, BlockButton, BlocklistManager

**Dependencies**: None

---

#### usePrivateSpaceKeys (`src/hooks/usePrivateSpaceKeys.ts`)
**Purpose**: Store and retrieve X25519 space keys for private spaces

**Parameters**: `userPublicKey?: string`

**Returns**:
```typescript
interface UsePrivateSpaceKeysResult {
  loading: boolean;
  error: string | null;
  spaceCount: number;
  getSpaceKey: (spaceId: string) => Uint8Array | null;
  getSpaceKeyInfo: (spaceId: string) => PrivateSpaceKey | null;
  storeSpaceKey: (spaceId, key, invitedBy, version?, name?) => Promise<void>;
  updateSpaceKey: (spaceId, newKey, newVersion) => Promise<void>;
  removeSpaceKey: (spaceId: string) => Promise<void>;
  hasSpaceKey: (spaceId: string) => boolean;
  listMyPrivateSpaces: PrivateSpaceKey[];
}
```

**State Managed**:
- Map of spaceId → PrivateSpaceKey
- Loading/error states

**Storage**: IndexedDB `swimchain-private-spaces/space-keys`

**Side Effects**:
- Opens IndexedDB on mount
- Loads all keys into memory for fast lookup

**Used By**: Sidebar, PrivateSpaceList, ChatView, CreatePrivateSpace, InviteModal

**Dependencies**: None

---

#### usePrivateSpaceMessages (`src/hooks/usePrivateSpaceMessages.ts`)
**Purpose**: Fetch and decrypt messages in private spaces

**Parameters**:
```typescript
(
  spaceId: string | undefined,
  spaceKey: Uint8Array | null,
  options?: { pollInterval?: number; limit?: number }
)
```

**Returns**:
```typescript
{
  messages: PrivateMessage[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

**State Managed**:
- Decrypted messages array
- Loading/error states

**Side Effects**:
- Fetches posts via RPC on mount
- Polls every 5 seconds (configurable)
- Decrypts content with space key
- Re-decrypts when space key becomes available

**Used By**: ChatView

**Dependencies**: `useRpc`

---

#### usePassphraseStore (`src/hooks/usePassphraseStore.ts`)
**Purpose**: Store passphrases for encrypted content auto-unlock

**Parameters**: None

**Returns**:
```typescript
interface UsePassphraseStoreResult {
  getPassphrase: (contentId: string) => string | null;
  getPassphrasesToTry: (contentId: string) => string[];
  savePassphrase: (contentId: string, passphrase: string) => void;
  removePassphrase: (contentId: string) => void;
  hasPassphrase: (contentId: string) => boolean;
  clearAll: () => void;
  getStoredIds: () => string[];
  defaultPassphrase: string | null;
  setDefaultPassphrase: (passphrase: string | null) => void;
  hasDefaultPassphrase: boolean;
}
```

**State Managed**:
- Map of contentId → passphrase
- Default passphrase

**Storage**:
- `localStorage['swimchain-passphrases']` - Per-content passphrases
- `localStorage['swimchain-default-passphrase']` - Default passphrase

**Side Effects**:
- Loads from localStorage on mount
- Persists changes

**Used By**: EncryptedContent, ThreadList, NewThread

**Dependencies**: None

---

#### useUserProfile (`src/hooks/useUserProfile.ts`)
**Purpose**: Fetch and cache user profiles

**Parameters**: `userPk: string | undefined`

**Returns**:
```typescript
{
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**State Managed**:
- User profile data
- In-memory cache with 1-minute TTL

**Side Effects**:
- Fetches profile space via RPC
- Decodes profile/avatar info from posts
- Caches results in module-level Map

**Used By**: Profile, UserAvatar, StartDMButton

**Dependencies**: `useRpc`

**Related**: `useUserProfiles(userPks: string[])` - Batch profile fetching

---

#### useSyncStatus (`src/hooks/useSyncStatus.ts`)
**Purpose**: Track node synchronization status

**Parameters**: None

**Returns**:
```typescript
interface UseSyncStatusResult {
  syncStatus: SyncStatus;
  connected: boolean;
  refresh: () => void;
}
```

**State Managed**:
- Sync percentage, peer count, storage usage

**Side Effects**:
- Fetches `get_sync_status` RPC on mount
- Polls every 10 seconds

**Used By**: StatusBar, NodeStatusBar

**Dependencies**: `useRpc`

---

#### useParentRpcConfig (`src/hooks/useParentRpcConfig.ts`)
**Purpose**: Receive RPC config from parent iframe (desktop-app integration)

**Parameters**: None

**Returns**: `ParentRpcConfig | null`

**State Managed**:
- Parent frame RPC endpoint and auth

**Side Effects**:
- Listens for `SWIMCHAIN_RPC_CONFIG` postMessage
- Stores config in module-level variable

**Used By**: RpcProvider (internally)

**Dependencies**: None

---

#### useKeypair (`src/hooks/useKeypair.ts`)
**Purpose**: Generate fresh in-memory keypairs (for testing/temporary use)

**Parameters**: None

**Returns**:
```typescript
interface UseKeypairResult {
  keypair: WasmKeypair | null;
  address: string | null;
  generate: () => void;
  clear: () => void;
}
```

**State Managed**:
- In-memory keypair (not persisted)

**Side Effects**:
- Generates via WASM
- Frees old keypair on regenerate

**Used By**: (testing utilities)

**Dependencies**: `useSwimchain`

---

### Context Providers

#### RpcProvider (`src/hooks/useRpc.tsx`)
**Purpose**: Provides RPC client to entire component tree

**Value Shape**:
```typescript
interface RpcContextValue {
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: { version: string; network: string; peerCount: number } | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
}
```

**Initialization**:
1. Checks for parent frame config (iframe mode)
2. Loads identity from localStorage for signature auth
3. Connects to `http://127.0.0.1:19736` (testnet)
4. Retries every 5 seconds on failure

**Children Access**: `useRpc()` hook

---

#### SwimchainProvider (`src/providers/SwimchainProvider.tsx`)
**Purpose**: Initialize WASM module before app renders

**Value Shape**:
```typescript
interface SwimchainContextValue {
  isLoaded: boolean;
  loadError: Error | null;
}
```

**Initialization**:
- Calls `initWasm()` on mount
- Shows fallback UI until loaded

**Children Access**: `useSwimchain()` hook

---

#### IdentityProvider (`src/providers/IdentityProvider.tsx`)
**Purpose**: Global identity state management

**Value Shape**:
```typescript
interface IdentityContextValue {
  identity: StoredIdentity | null;
  isLoading: boolean;
  hasValidIdentity: boolean;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
}
```

**Initialization**: Loads from `localStorage['swimchain-identity']`

**Children Access**: `useIdentityContext()` hook

---

#### PreferencesProvider (`src/hooks/usePreferences.tsx`)
**Purpose**: User preferences with persistence

**Value Shape**:
```typescript
interface PreferencesContextValue {
  preferences: Preferences;
  updatePreference: <K>(key: K, value: Preferences[K]) => void;
  resetToDefaults: () => void;
}
```

**Default Values**:
```typescript
{
  threadOrdering: 'newest',
  threadsPerPage: 25,
  storageTargetMB: 500,
}
```

**Storage**: `localStorage['swimchain-preferences']`

**Children Access**: `usePreferences()` hook

---

#### KeyboardNavigationProvider (`src/hooks/useKeyboardNavigation.tsx`)
**Purpose**: Vim-style keyboard navigation state

**Value Shape**:
```typescript
interface KeyboardNavContextValue {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  items: string[];
  setItems: (items: string[]) => void;
  isShortcutsModalOpen: boolean;
  openShortcutsModal: () => void;
  closeShortcutsModal: () => void;
}
```

**Keyboard Handlers**: j/k (navigate), Enter (select), n (new), r (reply), / (search), ? (help)

**Children Access**: `useKeyboardNavigation()` hook

---

### State Patterns

#### Async Data Pattern
Standard pattern for fetching data from RPC:
```typescript
const [data, setData] = useState<T | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  if (!rpc || !connected) return;

  const fetch = async () => {
    setLoading(true);
    try {
      const result = await rpc.call('method', params);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  fetch();
}, [rpc, connected, ...deps]);
```

**Used In**: useSpaces, useSpaceThreads, useThread, useReplies, useUserProfile

---

#### Mining State Machine Pattern
Pattern for PoW mining operations:
```typescript
type MiningState = 'idle' | 'mining' | 'complete' | 'error' | 'cancelled';

const [state, setState] = useState<MiningState>('idle');
const [progress, setProgress] = useState({ attempts: 0, elapsedMs: 0 });
const [solution, setSolution] = useState<Solution | null>(null);
const cancelledRef = useRef(false);

const mine = async () => {
  setState('mining');
  cancelledRef.current = false;

  try {
    const result = await computePow(
      challenge,
      (attempts, elapsed) => setProgress({ attempts, elapsedMs: elapsed }),
      () => cancelledRef.current
    );
    setSolution(result);
    setState('complete');
  } catch (err) {
    setState(err.message.includes('cancelled') ? 'cancelled' : 'error');
  }
};
```

**Used In**: useActionPow, usePow, all specialized PoW hooks

---

#### localStorage Persistence Pattern
Pattern for persisting state to localStorage:
```typescript
const STORAGE_KEY = 'swimchain-something';

const [state, setState] = useState<T | null>(null);

// Load on mount
useEffect(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setState(JSON.parse(stored));
  } catch (e) {
    console.error('Load failed:', e);
  }
}, []);

// Save helper
const save = useCallback((newState: T) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  setState(newState);
}, []);
```

**Used In**: useStoredIdentity, useBlocklist, usePassphraseStore, usePreferences

---

#### IndexedDB Persistence Pattern
Pattern for IndexedDB storage (for larger data):
```typescript
const DB_NAME = 'swimchain-db';
const STORE_NAME = 'store';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}
```

**Used In**: usePrivateSpaceKeys, lib/cache.ts (media cache)

---

### Data Flow

#### RPC Data Flow
```
User Action (click, submit)
         │
         ▼
┌─────────────────────────┐
│   Page Component        │
│ (SpaceView, ThreadView) │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Data Fetching Hook    │
│ (useSpaces, useThread)  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   useRpc Context        │
│ (get rpc client)        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   SwimchainRpc Class    │
│ (signature auth)        │
└───────────┬─────────────┘
            │ HTTP POST
            ▼
┌─────────────────────────┐
│   Local Swimchain Node  │
│ (localhost:19736)       │
└───────────┬─────────────┘
            │ P2P
            ▼
┌─────────────────────────┐
│   Swimchain Network     │
└─────────────────────────┘
```

---

#### Content Creation Flow
```
User Input (title, body)
         │
         ▼
┌─────────────────────────┐
│   Form Component        │
│ (NewThread)             │
└───────────┬─────────────┘
            │ encrypt?
            ▼
┌─────────────────────────┐
│   lib/encryption.ts     │
│ (PBKDF2 + AES-GCM)      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   usePostPow Hook       │
│ (Argon2id mining)       │
└───────────┬─────────────┘
            │ solution
            ▼
┌─────────────────────────┐
│   rpc.call('submit_post')│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Node validates PoW    │
│   → mempool → block     │
└─────────────────────────┘
```

---

### Caching Strategies

#### Multi-Layer Cache (lib/cache.ts)
```
Layer 1: Memory Cache (Map)
├── TTL: 1-5 minutes
├── Data: Spaces, profiles, threads
└── Access: getFromMemory() / setInMemory()

Layer 2: IndexedDB Content Cache
├── TTL: 5 minutes (with expiry check)
├── Data: Thread content, replies
└── Access: getContentFromCache() / setContentInCache()

Layer 3: IndexedDB Media Cache
├── TTL: Permanent (content-addressed)
├── Data: Images, encrypted media blobs
└── Access: getMediaFromCache() / setMediaInCache()

Layer 4: localStorage
├── TTL: 30 minutes or permanent
├── Data: Identity, preferences, blocklist
└── Access: getFromStorage() / setInStorage()
```

---

#### Cache Invalidation
```typescript
// Clear specific prefix
invalidateMemory('spaces');

// Clear all caches
await clearAllCaches();

// Clear decrypted media (privacy)
await clearDecryptedMediaCache();

// Clear profile cache
clearProfileCache(userPk);
```

---

## State Management

### Context Providers

| Provider | Purpose | Storage |
|----------|---------|---------|
| `SwimchainProvider` | WASM module initialization | Memory |
| `RpcProvider` | RPC connection state | Memory |
| `IdentityProvider` | User identity | localStorage |
| `PreferencesProvider` | User settings | localStorage |
| `KeyboardNavigationProvider` | Navigation state | Memory |

### Data Flow

```
                    User Action
                         |
                         v
              +----------------------+
              |   Page Component     |
              |  (SpaceView, etc.)   |
              +----------------------+
                         |
                         v
              +----------------------+
              |    Custom Hooks      |
              |  (useSpaceThreads)   |
              +----------------------+
                         |
                         v
              +----------------------+
              |   SwimchainRpc       |
              |  (signature auth)    |
              +----------------------+
                         |
                         v
              +----------------------+
              |   Local Node         |
              |  (localhost:19736)   |
              +----------------------+
                         |
                         v
              +----------------------+
              |   P2P Network        |
              +----------------------+
```

### Caching Strategy

```
Layer 1: Memory Cache (fastest)
  - TTL: 1-5 minutes
  - Spaces list, user profiles, threads

Layer 2: IndexedDB Content Cache
  - TTL: 5 minutes
  - Content, threads, replies

Layer 3: IndexedDB Media Cache
  - TTL: Permanent (content-addressable)
  - Images, encrypted media

Layer 4: localStorage
  - TTL: Permanent or 30 minutes
  - Identity, preferences, blocklist, passphrases
```

## RPC Integration

### Authentication

The client uses **Ed25519 signature authentication**:

```typescript
// Headers added to each request
'X-CS-Identity': publicKeyHex,
'X-CS-Timestamp': timestamp,
'X-CS-Signature': signatureHex,

// Signature message format
message = `swimchain-rpc:${method}:${sha256(paramsJson)}:${timestamp}`
```

### Methods Used

| Method | Purpose | Component |
|--------|---------|-----------|
| `get_info` | Node information | RpcProvider |
| `get_sync_status` | Sync progress | NodeStatusBar |
| `list_spaces` | Get public spaces | SpaceList |
| `list_space_posts` | Get threads in space | SpaceView |
| `get_content` | Get single content | ThreadView |
| `get_replies` | Get reply tree | ThreadView |
| `submit_post` | Create thread | NewThread |
| `submit_reply` | Create reply | ReplyComposer |
| `submit_engagement` | Add reaction | ThreadView |
| `submit_edit` | Edit content | ThreadView |
| `create_space` | Create space | CreatePrivateSpace |
| `get_reactions` | Get reaction counts | ThreadView |
| `upload_media` | Upload image | NewThread |
| `get_media` | Get image by hash | ImageGallery |
| `request_content` | Request from network | useSpaceThreads |
| `submit_spam_attestation` | Report spam | ReportModal |
| `submit_counter_attestation` | Defend content | ReportModal |
| `get_spam_status` | Check spam flags | ThreadView |

### RPC Configuration

```typescript
// Default: Local testnet node
const LOCAL_TESTNET: RpcConfig = {
  endpoint: 'http://127.0.0.1:19736',
  timeout: 30000,
};

// Testnet seeds (for browser testing without local node)
const TESTNET_SEED_SF: RpcConfig = {
  endpoint: 'http://64.225.115.108:8736',
  timeout: 30000,
};
```

## Encryption

### Passphrase Encryption (Public Posts)

Used for encrypted posts that can be shared with a passphrase.

```
Algorithm: PBKDF2 (100,000 iterations) + AES-256-GCM
Format: [ENCRYPTED:v1:<base64(salt:iv:ciphertext)>]

salt: 16 bytes (random)
iv: 12 bytes (random)
ciphertext: variable length
```

**Functions**:
- `encryptContent(content, passphrase)` - Encrypt text
- `decryptContent(encryptedContent, passphrase)` - Decrypt text
- `encryptMedia(data, passphrase)` - Encrypt images
- `decryptMedia(encryptedData, passphrase)` - Decrypt images

### Space Key Encryption (Private Spaces)

Used for private spaces where all members share a 32-byte key.

```
Algorithm: AES-256-GCM (direct key, no PBKDF2)
Format: [PRIVATE:v1:<base64(iv:ciphertext)>]

iv: 12 bytes (random)
ciphertext: variable length
```

**Functions**:
- `encryptWithSpaceKey(content, spaceKey)` - Encrypt with space key
- `decryptWithSpaceKey(encryptedContent, spaceKey)` - Decrypt
- `encryptPrivateMedia(data, spaceKey)` - Encrypt images
- `decryptPrivateMedia(encryptedData, spaceKey)` - Decrypt images

### Key Exchange (Invitations)

Used to share space keys with invited users.

```
Algorithm: X25519 (Curve25519 DH) + XSalsa20-Poly1305
Conversion: Ed25519 -> X25519 via birational map
```

**Functions**:
- `encryptSpaceKeyForRecipient(spaceKey, senderSeed, recipientPubkey)` - Encrypt key for user
- `decryptSpaceKey(encryptedKey, recipientSeed, senderPubkey)` - Decrypt received key

## Styling Guide

### CSS Organization

Each component has a co-located `.css` file:
```
components/
  ThreadList.tsx
  ThreadList.css
  ReplyTree.tsx
  ReplyTree.css
```

### CSS Variables

```css
/* Colors */
--primary: #2563eb;
--bg: #ffffff;
--bg-elevated: #f8fafc;
--text: #1e293b;
--text-muted: #64748b;
--border: #e2e8f0;
--error: #dc2626;
--success: #16a34a;

/* Spacing */
--spacing-xs: 0.25rem;
--spacing-sm: 0.5rem;
--spacing-md: 1rem;
--spacing-lg: 1.5rem;
--spacing-xl: 2rem;
```

### Component Classes

```css
/* Buttons */
.btn { }
.btn-primary { }
.btn-secondary { }
.btn-danger { }
.btn-large { }

/* Cards */
.card { }

/* Forms */
.input { }
.input-group { }

/* Layout */
.thread-list { }
.reply-tree { }
.encrypted-content { }
```

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Testing Stack
- **Test Runner**: Vitest 1.0
- **Testing Library**: @testing-library/react 14.0
- **DOM Environment**: happy-dom

### Test Files
Tests are co-located with components:
```
components/
  ComponentName.tsx
  ComponentName.test.tsx
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_USE_REMOTE_SEED` | Connect to remote testnet seed instead of localhost | `false` |

The client auto-connects to `localhost:19736` (testnet) by default. Set `VITE_USE_REMOTE_SEED=true` to use the San Francisco or NYC testnet seeds for browser testing without running a local node.

**RPC Endpoints:**
| Network | Port | Example |
|---------|------|---------|
| Mainnet | 9736 | `http://127.0.0.1:9736` |
| Testnet | 19736 | `http://127.0.0.1:19736` |
| Regtest | 29736 | `http://127.0.0.1:29736` |
| Testnet Seed (SF) | 8736 | `http://64.225.115.108:8736` |
| Testnet Seed (NYC) | 8736 | `http://104.236.106.124:8736` |

### Vite Configuration

```typescript
// vite.config.ts
{
  plugins: [react()],
  resolve: {
    alias: { '@': './src' },
  },
  server: {
    port: 5173,
    headers: {
      // Required for WASM + SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
}
```

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true,
    "jsx": "react-jsx",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

## Known Issues & Limitations

### Current Limitations

1. **Search** - No full-text search RPC; client-side filtering only
2. **Private Space Creation** - PoW not implemented for creation action
3. **Direct Messages** - Request/accept flow needs refinement
4. **Settings** - Limited configuration options exposed
5. **Offline Mode** - No offline support; requires active node connection
6. **Mobile** - Not responsive on small screens

### Browser Requirements

- **SharedArrayBuffer** - Required for WASM threading
- **Web Crypto API** - Required for encryption
- **IndexedDB** - Required for caching and key storage
- **localStorage** - Required for identity and preferences

### Node Requirements

- Local Swimchain node must be running
- Default port: 19736 (testnet)
- CORS must be enabled on node

## Future Improvements

### Planned Features

1. **Full-Text Search** - Server-side search indexing
2. **Push Notifications** - WebSocket for real-time updates
3. **Rich Text Editor** - Markdown support with preview
4. **Thread Subscriptions** - Follow threads for updates
5. **Space Moderation Tools** - Creator controls for spaces
6. **Profile Avatars** - Image uploads for profiles
7. **Mobile Responsiveness** - PWA support
8. **Offline Mode** - Service worker for offline access

### Technical Debt

1. **Component Splitting** - Some components are too large
2. **Test Coverage** - Need more integration tests
3. **Error Boundaries** - Per-component error handling
4. **Accessibility** - ARIA improvements needed
5. **Performance** - Virtual scrolling for long lists

## Routes Reference

| Route | Component | Auth Required | Description |
|-------|-----------|---------------|-------------|
| `/identity` | IdentityPage | No | Identity management |
| `/settings` | SettingsPage | No | App settings |
| `/profile` | ProfilePage | No | Own profile |
| `/profile/:userPk` | ProfilePage | No | User profile |
| `/spaces` | SpaceList | Yes | Space listing |
| `/spaces/:spaceId` | SpaceView | Yes | Threads in space |
| `/spaces/:spaceId/new` | NewThread | Yes | Create thread |
| `/spaces/:spaceId/thread/:threadId` | ThreadView | Yes | View thread |
| `/spaces/:spaceId/thread/:threadId/reply/:replyId` | ThreadView | Yes | Focused reply |
| `/search` | SearchResults | Yes | Search results |
| `/spaces/new/private` | CreatePrivateSpace | Yes | Create private space |
| `/chat/:spaceId` | ChatView | Yes | Private space chat |

## Type Definitions

### Core Types

```typescript
interface Space {
  id: string;              // sp1... bech32m
  name: string;
  description: string;
  creator: string;         // cs1... address
  postCount: number;
  activePostCount: number;
  createdAt: number;
  parentId?: string;
}

interface Thread {
  id: string;              // sha256:... content ID
  spaceId: string;
  author: string;
  displayName?: string;
  title: string;
  content: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  pool: PoolState;
  decay: DecayInfo;
  reactions?: ReactionCounts;
  mediaRefs?: MediaRef[];
  pending?: boolean;
}

interface Reply {
  id: string;
  threadId: string;
  parentId: string | null;
  author: string;
  displayName?: string;
  content: string;
  createdAt: number;
  depth: number;
  children: Reply[];
  decay?: DecayInfo;
  reactions?: ReactionCounts;
}

interface StoredIdentity {
  address: string;
  publicKey: string;
  seed: string;
  createdAt: number;
  powSolution?: {
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}

interface DecayInfo {
  state: 'protected' | 'active' | 'stale' | 'decayed';
  survivalProbability: number;
  isProtected: boolean;
  secondsUntilDecayStarts: number | null;
  secondsUntilPruned: number | null;
  timeSinceEngagement: number;
}

interface PoolState {
  contributedSeconds: number;
  requiredSeconds: number;
  contributorCount: number;
  status: 'empty' | 'partial' | 'complete' | 'locked';
}
```

---

## Feature Map

This section maps all user-facing features to their implementation details, including components, hooks, RPC methods, and status.

---

### Navigation Features

#### Route Navigation
**User Flow**: User clicks nav link → Route changes → New page renders

**Components**: `Header`, `Sidebar`, `MainLayout`, react-router-dom

**Routes**:
| Path | Component | Auth Required | Description |
|------|-----------|---------------|-------------|
| `/identity` | Identity | No | Identity creation/import |
| `/settings` | Settings | No | App settings & blocklist |
| `/profile` | Profile | No | Own profile view |
| `/profile/:userPk` | Profile | No | Other user profile |
| `/spaces` | SpaceList | Yes | Public spaces listing |
| `/spaces/:spaceId` | SpaceView | Yes | Threads in a space |
| `/spaces/:spaceId/new` | NewThread | Yes | Create new thread |
| `/spaces/:spaceId/thread/:threadId` | ThreadView | Yes | View thread with replies |
| `/spaces/:spaceId/thread/:threadId/reply/:replyId` | ThreadView | Yes | Focused reply view |
| `/search` | SearchResults | Yes | Search results |
| `/spaces/new/private` | CreatePrivateSpace | Yes | Create private space |
| `/chat/:spaceId` | ChatView | Yes | Private space chat |

**Status**: ✓ Complete

---

#### Sidebar Navigation
**User Flow**: User sees sidebar → Selects public/private tab → Clicks space → Navigates

**Components**: `Sidebar`, `SpaceTree`, `PrivateSpaceList`

**Hooks**: `useSpaces`, `usePrivateSpaceKeys`

**Status**: ✓ Complete

---

#### Keyboard Navigation (Vim-style)
**User Flow**: User presses j/k → Selection moves → Press Enter → Opens item

**Components**: `KeyboardNavigationProvider`

**Hooks**: `useKeyboardNavigation`

**Shortcuts**:
| Key | Action |
|-----|--------|
| `j` | Navigate down |
| `k` | Navigate up |
| `Enter` | Open selected |
| `n` | New thread |
| `r` | Reply |
| `e` | Quick engage (+5s) |
| `E` | Engage (+15s) |
| `/` | Focus search |
| `?` | Show shortcuts |
| `Backspace` | Go back |

**Status**: ✓ Complete

---

### Authentication Features

#### Identity Creation
**User Flow**:
1. Navigate to `/identity`
2. Click "Generate Identity"
3. WASM generates keypair
4. SHA-256 PoW mining (~20 leading zeros)
5. Identity saved to localStorage

**Components**: `Identity`, `IdentityCard`, `PowProgress`, `AddressDisplay`

**Hooks**: `useStoredIdentity`, `useSwimchain`, `usePow`, `useKeypair`

**RPC Methods**: None (local keypair generation)

**Storage**: `localStorage['swimchain-identity']`

**Status**: ✓ Complete

---

#### Identity Import
**User Flow**:
1. Navigate to `/identity`
2. Enter 64-character hex seed
3. Keypair restored from seed
4. Identity saved to localStorage

**Components**: `Identity`

**Hooks**: `useStoredIdentity`, `useSwimchain`

**RPC Methods**: None

**Status**: ✓ Complete

---

#### Display Name Management
**User Flow**:
1. Navigate to `/identity` or `/profile`
2. Enter display name (max 31 chars)
3. Click save
4. Name stored on network

**Components**: `Identity`, `Profile`

**Hooks**: `useStoredIdentity`, `useRpc`

**RPC Methods**: `set_display_name`

**Status**: ✓ Complete

---

#### Route Protection
**User Flow**: User navigates to protected route → If no identity → Redirect to `/identity`

**Components**: `RequireIdentity`

**Hooks**: `useIdentityContext`

**Status**: ✓ Complete

---

### Content Creation Features

#### Create Thread (Post)
**User Flow**:
1. Navigate to space → Click "New Thread"
2. Enter title (max 256 chars) and body (max 4096 chars)
3. Optionally enable encryption with passphrase
4. Optionally attach images (max 4)
5. Click submit → Mine Argon2id PoW (difficulty 12)
6. Post submitted to network
7. Redirect to new thread

**Components**: `NewThread`, `PowProgress`

**Hooks**: `usePostPow`, `useMediaUpload`, `useStoredIdentity`, `useRpc`, `usePassphraseStore`

**RPC Methods**: `submit_post`, `upload_media`

**PoW Details**:
- Algorithm: Argon2id
- Difficulty: 12 (testnet)
- Memory: 64KB
- Time: 3 iterations

**Status**: ✓ Complete

---

#### Create Reply
**User Flow**:
1. Open thread → Click "Reply"
2. Enter reply content
3. Click submit → Mine Argon2id PoW (difficulty 8)
4. Reply submitted
5. Thread refreshes

**Components**: `ReplyComposer`, `ReplyTree`, `PowProgress`

**Hooks**: `useReplyPow`, `useStoredIdentity`, `useStoredKeypair`, `useRpc`

**RPC Methods**: `submit_reply`

**PoW Details**:
- Algorithm: Argon2id
- Difficulty: 8 (testnet)

**Status**: ✓ Complete

---

#### Upload Images
**User Flow**:
1. In NewThread, click "Add Images"
2. Select image (JPEG/PNG/GIF/WebP)
3. If >1MB, prompted to compress
4. Image uploaded (encrypted if post encrypted)
5. Media hash attached to post

**Components**: `NewThread`, `ImageGallery`

**Hooks**: `useMediaUpload`, `useRpc`

**RPC Methods**: `upload_media`

**Limits**:
- Max 4 images per post
- Max 1MB each (with compression prompt)
- Formats: JPEG, PNG, GIF, WebP

**Status**: ✓ Complete

---

#### Encrypt Post
**User Flow**:
1. In NewThread, check "Encrypt this post"
2. Enter passphrase (16+ chars recommended)
3. Optionally set as default passphrase
4. Submit → Content encrypted client-side
5. Title shows as "[Encrypted Post]"

**Components**: `NewThread`, `EncryptedContent`

**Hooks**: `usePassphraseStore`

**Libraries**: `lib/encryption.ts`

**Encryption**:
- Algorithm: PBKDF2 (100k iterations) + AES-256-GCM
- Format: `[ENCRYPTED:v1:<base64(salt:iv:ciphertext)>]`

**Status**: ✓ Complete

---

#### Create Space
**User Flow**:
1. Navigate to `/spaces`
2. Click "Create Space"
3. Enter space name
4. Mine SHA-256 PoW (difficulty 12)
5. Space created on network

**Components**: `SpaceList`, `PowProgress`

**Hooks**: `useSpaceCreationPow`, `useRpc`, `useStoredIdentity`

**RPC Methods**: `create_space`

**Status**: ✓ Complete

---

### Content Viewing Features

#### View Space List
**User Flow**: Navigate to `/spaces` → See all public spaces with stats

**Components**: `SpaceList`

**Hooks**: `useSpaces`, `useRpc`

**RPC Methods**: `list_spaces`

**Display**: Space name, description, post count (active/total), creator

**Status**: ✓ Complete

---

#### View Threads in Space
**User Flow**: Click space → See thread list → Sort/paginate → Click thread

**Components**: `SpaceView`, `ThreadList`, `ThreadSortControls`, `Pagination`

**Hooks**: `useSpaceThreads`, `useBlocklist`, `usePreferences`, `useKeyboardNavigation`

**RPC Methods**: `list_space_posts`, `request_content`

**Features**:
- Server-side pagination (10/25/50/100 per page)
- Sort: Newest, Oldest, Most Replies, Most Active
- Auto-filters blocked content
- Auto-decrypts with stored passphrases
- Keyboard navigation (j/k)

**Status**: ✓ Complete

---

#### View Thread with Replies
**User Flow**: Click thread → See full post + nested replies

**Components**: `ThreadView`, `ReplyTree`, `ImageGallery`, `EncryptedContent`, `ContentStatus`, `EngagementPool`

**Hooks**: `useThread`, `useReplies`, `useBlocklist`, `usePassphraseStore`

**RPC Methods**: `get_content`, `get_replies`, `get_reactions`

**Features**:
- Deep reply nesting (with depth limit)
- Collapsible reply branches
- Decay state display
- Engagement pool visualization
- Emoji reactions
- Image gallery with lightbox

**Status**: ✓ Complete

---

#### Decrypt Encrypted Content
**User Flow**:
1. See "[Encrypted Post]" placeholder
2. Auto-try stored passphrases
3. If none work, enter passphrase manually
4. Content decrypts client-side
5. Optionally save passphrase

**Components**: `EncryptedContent`, `EncryptedBadge`, `InlineUnlock`

**Hooks**: `usePassphraseStore`

**Features**:
- Auto-unlock with stored passphrases
- Remember passphrase per content
- Set default passphrase for all encrypted content
- Lock/unlock toggle

**Status**: ✓ Complete

---

#### View Images
**User Flow**: See thumbnails in thread → Click for lightbox → Navigate with arrows

**Components**: `ImageGallery`, `ImageThumbnailIndicator`

**Hooks**: `useMediaUpload`, `useRpc`

**RPC Methods**: `get_media`

**Features**:
- Thumbnail grid display
- Full-size modal lightbox
- Keyboard navigation (arrows, Esc)
- Lazy loading
- Encrypted image decryption

**Status**: ✓ Complete

---

#### Search Content
**User Flow**: Enter query in search box → Submit → See results

**Components**: `SearchResults`, `SearchBox`

**Hooks**: `useSpaces`, `useRpc`, `useSearchParams`

**RPC Methods**: None (client-side filtering only)

**Status**: ◐ Partial (client-side filtering only, no server-side search)

---

### User Interaction Features

#### Emoji Reactions
**User Flow**:
1. Click reaction button on thread/reply
2. Select emoji from picker
3. Mine engagement PoW
4. Adds 10 seconds to engagement pool
5. Reaction count updates

**Components**: `ContentStatus`, `ThreadView`, `ReplyTree`

**Hooks**: `useEngagementPow`, `useRpc`

**RPC Methods**: `submit_engagement`, `get_reactions`

**Available Reactions**:
| Emoji | Code | Symbol |
|-------|------|--------|
| heart | 1 | ❤️ |
| thumbs_up | 2 | 👍 |
| thumbs_down | 3 | 👎 |
| laugh | 4 | 😂 |
| thinking | 5 | 🤔 |
| mind_blown | 6 | 🤯 |
| fire | 7 | 🔥 |
| swimming | 8 | 🏊 |

**Status**: ✓ Complete

---

#### Engagement Pool Contribution
**User Flow**:
1. Click engagement button (+5s/+15s/+30s)
2. Mine PoW proof
3. Contribution added to pool
4. Pool progress updates

**Components**: `EngagementPool`, `EngagementPoolBadge`, `ThreadView`

**Hooks**: `useEngagementPow`, `useRpc`

**RPC Methods**: `submit_engagement`

**Pool States**: empty (0s) → partial (1-59s) → complete (60s) → locked

**Status**: ✓ Complete

---

#### Report Content (Spam Attestation)
**User Flow**:
1. Click "Report" on content
2. Select reason from modal
3. Submit → Mine attestation PoW
4. Spam flag recorded

**Components**: `ReportModal`, `SpamBadge`, `ReportButton`

**Hooks**: `useSpamReport`, `useSpamStatus`, `useStoredKeypair`

**RPC Methods**: `submit_spam_attestation`, `get_spam_status`

**Spam Reasons**: advertising, repetitive, off_topic, harassment, illegal_content

**Status**: ✓ Complete

---

#### Defend Content (Counter-Attestation)
**User Flow**:
1. See flagged content
2. Click "Defend"
3. Mine counter-attestation PoW
4. Counter flag recorded

**Components**: `ReportModal`

**Hooks**: `useStoredKeypair`, `useRpc`

**RPC Methods**: `submit_counter_attestation`

**Status**: ✓ Complete

---

#### Block Content/Users
**User Flow**:
1. Click block button on user/post/space/reply
2. Content immediately hidden
3. Manage in Settings → Blocklist

**Components**: `BlockButton`, `BlocklistManager`, `BlockedIndicator`

**Hooks**: `useBlocklist`

**Storage**: `localStorage['swimchain-blocklist']`

**Block Types**: user, post, space, reply

**Status**: ✓ Complete

---

#### View User Profile
**User Flow**: Click username/avatar → See profile with bio, website, posts

**Components**: `Profile`, `UserAvatar`, `AvatarGroup`

**Hooks**: `useUserProfile`, `useStoredIdentity`, `useParams`

**RPC Methods**: `post_to_space` (profile space)

**Profile Fields**:
- Display name (31 chars)
- Bio (500 chars)
- Website URL
- Avatar image (2MB max)

**Status**: ✓ Complete

---

#### Edit Own Profile
**User Flow**:
1. Navigate to `/profile`
2. Click "Edit Profile"
3. Update fields
4. Save → Posted to profile space

**Components**: `Profile`

**Hooks**: `useUserProfile`, `useStoredKeypair`, `useRpc`

**RPC Methods**: `post_to_space`, `upload_media`

**Status**: ✓ Complete

---

### Private Space Features

#### Create Private Space
**User Flow**:
1. Navigate to `/spaces/new/private`
2. Enter space name
3. Optionally add initial members
4. Space key generated
5. Key encrypted for each member
6. Space created

**Components**: `CreatePrivateSpace`, `PowProgress`

**Hooks**: `useStoredKeypair`, `usePrivateSpaceKeys`, `useRpc`, `useSpaceCreationPow`

**RPC Methods**: `create_space`

**Encryption**: X25519 key exchange + ChaCha20 space key

**Status**: ✓ Complete

---

#### View Private Space Chat
**User Flow**: Click private space in sidebar → See chat messages → Auto-decrypt with space key

**Components**: `ChatView`, `PrivateSpaceList`, `EncryptedContent`, `UserAvatar`

**Hooks**: `usePrivateSpaceMessages`, `usePrivateSpaceKeys`, `useStoredKeypair`

**RPC Methods**: `get_content` (with space filter)

**Features**:
- Real-time polling (every 3-5 seconds)
- Auto-decryption with space key
- Message timestamps
- User avatars

**Status**: ✓ Complete

---

#### Send Private Message
**User Flow**:
1. Open private space
2. Type message
3. Submit → Encrypted with space key
4. Posted to network

**Components**: `ChatView`

**Hooks**: `usePrivateSpaceMessages`, `usePrivateSpaceKeys`, `useStoredKeypair`, `useRpc`

**RPC Methods**: `submit_post`

**Encryption**:
- Algorithm: AES-256-GCM with space key
- Format: `[PRIVATE:v1:<base64(iv:ciphertext)>]`

**Status**: ✓ Complete

---

#### Invite to Private Space
**User Flow**:
1. Open space settings
2. Click "Invite"
3. Enter recipient public key
4. Space key encrypted for recipient
5. Invitation sent

**Components**: `InviteModal`, `SpaceSettings`

**Hooks**: `useStoredKeypair`, `usePrivateSpaceKeys`, `useInviteToSpace`

**RPC Methods**: `submit_post` (invitation payload)

**Status**: ◐ Partial (basic flow works, needs refinement)

---

#### Start Direct Message
**User Flow**:
1. View user profile
2. Click "Send Message"
3. Creates 1-to-1 private space
4. Navigate to chat

**Components**: `StartDMButton`, `Profile`

**Hooks**: `useStoredKeypair`, `usePrivateSpaceKeys`, `useRequestDM`, `useNavigate`

**RPC Methods**: `submit_post` (DM request)

**Status**: ◐ Partial (DM request flow needs testing)

---

### Real-time Features

#### Network Sync Status
**User Flow**: View status bar → See sync percentage, peer count

**Components**: `StatusBar`, `NodeStatusBar`, `DebugPanel`

**Hooks**: `useSyncStatus`, `useRpc`

**RPC Methods**: `get_sync_status`, `get_info`

**Display**:
- Sync percentage
- Peer count
- Storage usage
- Last block time
- Connection state

**Status**: ✓ Complete

---

#### Content Fetching Indicators
**User Flow**: Navigate to space/thread → See "fetching..." indicator → Content loads

**Components**: Various (inline in SpaceView, ThreadView)

**Hooks**: `useSpaceThreads`, `useReplies`

**RPC Methods**: `request_content`

**Status**: ✓ Complete

---

#### Node Status (Desktop App)
**User Flow**: In Tauri app, see node status bar → Start/stop node

**Components**: `NodeStatusBar`

**Hooks**: `useSyncStatus`

**Features**: Tauri-specific controls (when available)

**Status**: ✓ Complete

---

### Special Features

#### Proof-of-Work Mining

| Action | Algorithm | Difficulty | Purpose |
|--------|-----------|------------|---------|
| Identity creation | SHA-256 | 20 | Sybil resistance |
| Space creation | SHA-256 | 12 | Rate limiting |
| Thread creation | Argon2id | 12 | Spam prevention |
| Reply creation | Argon2id | 8 | Spam prevention |
| Engagement | Argon2id | varies | Spam prevention |

**Components**: `PowProgress`

**Hooks**: `usePow`, `useActionPow`, `usePostPow`, `useReplyPow`, `useEngagementPow`, `useSpaceCreationPow`

**Status**: ✓ Complete

---

#### Content Decay Display
**User Flow**: View thread → See decay state badge

**Components**: `ContentStatus`, `ThreadView`

**Decay States**:
| State | Description |
|-------|-------------|
| protected | In 48-hour floor protection |
| active | Recently engaged |
| stale | No recent engagement |
| decayed | Scheduled for removal |

**Status**: ✓ Complete (display only - decay happens server-side)

---

### Feature Matrix

| Feature | Status | Components | Primary Hook | RPC Methods |
|---------|--------|------------|--------------|-------------|
| **Navigation** |
| Route navigation | ✓ Complete | Header, Sidebar, Router | - | - |
| Sidebar tabs | ✓ Complete | Sidebar, SpaceTree | useSpaces | list_spaces |
| Keyboard nav | ✓ Complete | KeyboardNavigationProvider | useKeyboardNavigation | - |
| **Authentication** |
| Create identity | ✓ Complete | Identity, PowProgress | usePow | - |
| Import identity | ✓ Complete | Identity | useStoredIdentity | - |
| Display name | ✓ Complete | Identity, Profile | useRpc | set_display_name |
| **Content Creation** |
| Create thread | ✓ Complete | NewThread, PowProgress | usePostPow | submit_post |
| Create reply | ✓ Complete | ReplyComposer | useReplyPow | submit_reply |
| Upload images | ✓ Complete | NewThread | useMediaUpload | upload_media |
| Encrypt post | ✓ Complete | NewThread | usePassphraseStore | - |
| Create space | ✓ Complete | SpaceList | useSpaceCreationPow | create_space |
| **Content Viewing** |
| Space list | ✓ Complete | SpaceList | useSpaces | list_spaces |
| Thread list | ✓ Complete | SpaceView, ThreadList | useSpaceThreads | list_space_posts |
| Thread view | ✓ Complete | ThreadView, ReplyTree | useThread, useReplies | get_content, get_replies |
| Decrypt content | ✓ Complete | EncryptedContent | usePassphraseStore | - |
| Image gallery | ✓ Complete | ImageGallery | useMediaUpload | get_media |
| Search | ◐ Partial | SearchResults | - | - |
| **User Interaction** |
| Emoji reactions | ✓ Complete | ContentStatus | useEngagementPow | submit_engagement |
| Engagement pool | ✓ Complete | EngagementPool | useEngagementPow | submit_engagement |
| Report spam | ✓ Complete | ReportModal | useSpamReport | submit_spam_attestation |
| Block content | ✓ Complete | BlockButton, BlocklistManager | useBlocklist | - |
| View profile | ✓ Complete | Profile | useUserProfile | - |
| Edit profile | ✓ Complete | Profile | useUserProfile | post_to_space |
| **Private Spaces** |
| Create private space | ✓ Complete | CreatePrivateSpace | usePrivateSpaceKeys | create_space |
| View chat | ✓ Complete | ChatView | usePrivateSpaceMessages | get_content |
| Send message | ✓ Complete | ChatView | usePrivateSpaceKeys | submit_post |
| Invite members | ◐ Partial | InviteModal | useInviteToSpace | submit_post |
| Start DM | ◐ Partial | StartDMButton | useRequestDM | submit_post |
| **Real-time** |
| Sync status | ✓ Complete | StatusBar | useSyncStatus | get_sync_status |
| Fetch indicators | ✓ Complete | Various | useSpaceThreads | request_content |
| **Special** |
| PoW mining | ✓ Complete | PowProgress | usePow, useActionPow | - |
| Decay display | ✓ Complete | ContentStatus | - | - |

---

### Implementation Status Summary

| Category | Complete | Partial | Total |
|----------|----------|---------|-------|
| Navigation | 3 | 0 | 3 |
| Authentication | 4 | 0 | 4 |
| Content Creation | 5 | 0 | 5 |
| Content Viewing | 5 | 1 | 6 |
| User Interaction | 6 | 0 | 6 |
| Private Spaces | 3 | 2 | 5 |
| Real-time | 3 | 0 | 3 |
| Special | 2 | 0 | 2 |
| **Total** | **31** | **3** | **34** |

**Overall Completion: ~91% of features fully implemented**

### Incomplete Features

1. **Search** - Client-side filtering only; no server-side full-text search RPC
2. **Invite Members** - Basic flow implemented but needs refinement and testing
3. **Start DM** - DM request/accept flow needs additional testing

---

## Accessibility Features

The forum client includes several accessibility enhancements:

- **Skip to main content link** - Allows keyboard users to bypass navigation
- **ARIA labels** - All interactive elements have proper labels
- **Keyboard navigation** - Full vim-style keyboard support (j/k navigation)
- **Focus management** - Focus moves to main content on route changes
- **Screen reader support** - Proper heading hierarchy and announcements
- **Role attributes** - Semantic roles on layout regions (banner, main, navigation)

---

*Documentation generated for @swimchain/forum-client v0.1.0*
