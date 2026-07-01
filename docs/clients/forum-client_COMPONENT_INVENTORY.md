# Forum-Client Component Inventory

## Overview

This document provides a comprehensive inventory of all React components in the forum-client application, including their props, state, hooks used, and component relationships.

---

## Component Hierarchy

```
App
├── ErrorBoundary
│   └── MainLayout
│       ├── Header
│       │   ├── SearchBox
│       │   ├── ProfileButton
│       │   │   └── AddressDisplay
│       │   └── NodeStatusBar (Tauri only)
│       ├── Sidebar
│       │   ├── SpaceTree
│       │   │   └── SpaceNode (internal)
│       │   └── PrivateSpaceList
│       └── <Page Components>
│           ├── SpaceList
│           ├── SpaceView
│           │   ├── ThreadList
│           │   │   ├── ThreadSortControls
│           │   │   ├── EncryptedBadge
│           │   │   └── ImageThumbnailIndicator
│           │   └── Pagination
│           ├── ThreadView
│           │   ├── EncryptedContent
│           │   ├── ImageGallery
│           │   ├── EngagementPool
│           │   ├── ContentStatus
│           │   ├── ReportModal / SpamBadge
│           │   ├── BlockButton
│           │   ├── ReplyTree (recursive)
│           │   │   └── ReplyComposer
│           │   └── ChatView (private spaces)
│           ├── NewThread
│           │   └── PowProgress
│           ├── Identity
│           │   ├── IdentityCard
│           │   └── PowProgress
│           ├── Settings
│           │   ├── BlocklistManager
│           │   └── DebugPanel
│           ├── Profile
│           │   └── UserAvatar / AvatarGroup
│           ├── SearchResults
│           └── CreatePrivateSpace
│               └── InviteModal
└── LoadingScreen (during WASM init)
```

---

## Pages (src/pages/)

### SpaceList (`src/pages/SpaceList.tsx`)

**Purpose**: Main landing page displaying all public spaces (forums)

**Props**: None

**State**:
- None (fetches via hooks)

**Effects**:
- Fetches spaces on mount via useSpaces

**Hooks Used**:
- `useSpaces()` - Fetches list of spaces from node
- `useNavigate()` - Navigation to space view

**Renders**:
- List of space cards with name, description, post count
- "Create Space" button
- Link to each space (`/space/:spaceId`)

**Styling**: `SpaceList.css`

---

### SpaceView (`src/pages/SpaceView.tsx`)

**Purpose**: Displays threads within a specific space with sorting and pagination

**Props**: None (uses route params)

**State**:
- `sort: ThreadSortOption` - Current sort order (newest/oldest/replies/active)
- `page: number` - Current pagination page

**Effects**:
- Fetches threads when spaceId, sort, or page changes

**Hooks Used**:
- `useParams()` - Gets spaceId from URL
- `useSpaceThreads(spaceId, { offset, limit })` - Fetches threads
- `useNavigate()` - Navigation

**Renders**:
- `ThreadSortControls` - Sort button group
- `ThreadList` - List of thread items
- `Pagination` - Page navigation
- "New Thread" button

**Styling**: `SpaceView.css`

---

### ThreadView (`src/pages/ThreadView.tsx`)

**Purpose**: Displays a thread with its original post, engagement pool, and nested replies

**Props**: None (uses route params)

**State**:
- `replyingTo: string | null` - ID of content being replied to
- `decryptedTitle: string | null` - Decrypted title (if encrypted)
- `decryptedBody: string | null` - Decrypted body (if encrypted)
- `showReportModal: boolean` - Report modal visibility

**Effects**:
- Fetches thread content and replies
- Handles encryption state changes

**Hooks Used**:
- `useParams()` - Gets threadId from URL
- `useThread(contentId)` - Fetches thread details
- `useReplies(contentId)` - Fetches nested replies
- `useReactions(contentId)` - Fetches emoji reactions
- `usePoolContribution()` - Engagement pool contribution
- `useStoredKeypair()` - For signing replies

**Renders**:
- `EncryptedContent` - If post is encrypted
- `ImageGallery` - Attached images
- `EngagementPool` - Contribution pool
- `ContentStatus` - Emoji reactions
- `BlockButton` - Block options
- `SpamBadge` / `ReportModal` - Spam reporting
- `ReplyTree` - Nested replies
- `ReplyComposer` - Reply input
- `ChatView` - (For private space threads)

**Styling**: `ThreadView.css`

---

### NewThread (`src/pages/NewThread.tsx`)

**Purpose**: Create a new thread with PoW mining

**Props**: None (uses route params)

**State**:
- `title: string` - Thread title
- `body: string` - Thread body
- `encrypt: boolean` - Whether to encrypt post
- `passphrase: string` - Encryption passphrase
- `mining: boolean` - PoW mining state
- `miningProgress: MiningProgress` - Mining attempts/time

**Effects**:
- Validates form and triggers PoW mining

**Hooks Used**:
- `useParams()` - Gets spaceId from URL
- `useNavigate()` - Navigation after submit
- `usePostSubmit()` - Submits post with PoW
- `useActionPow()` - PoW mining hook

**Renders**:
- Title input field
- Body textarea with markdown support
- Encryption toggle and passphrase input
- `PowProgress` - During mining
- Submit/Cancel buttons

**Styling**: `NewThread.css`

---

### Identity (`src/pages/Identity.tsx`)

**Purpose**: Create and manage user identity (Ed25519 keypair with PoW)

**Props**: None

**State**:
- `seedMnemonic: string` - Generated seed phrase
- `mining: boolean` - Identity PoW mining state
- `miningProgress: MiningProgress` - Mining progress

**Effects**:
- Generates new keypair from seed
- Mines PoW proof for identity registration

**Hooks Used**:
- `useIdentityContext()` - Identity state management
- `useStoredIdentity()` - localStorage persistence
- `useSwimchain()` - WASM availability
- `useNavigate()` - Post-creation navigation

**Renders**:
- `IdentityCard` - Shows current identity
- Seed phrase display/input
- `PowProgress` - During identity mining
- Create/Import/Export buttons

**Styling**: `Identity.css`

---

### Settings (`src/pages/Settings.tsx`)

**Purpose**: User preferences and debug information

**Props**: None

**State**:
- `activeTab: string` - Current settings tab

**Effects**:
- None

**Hooks Used**:
- `useIdentityContext()` - Clear identity
- `useRpc()` - Connection status

**Renders**:
- `BlocklistManager` - Blocked content management
- `DebugPanel` - Node debug info
- Theme toggle
- Clear data options

**Styling**: `Settings.css`

---

### Profile (`src/pages/Profile.tsx`)

**Purpose**: View and edit user profiles

**Props**: None (uses route params)

**State**:
- `editing: boolean` - Edit mode
- `displayName: string` - Editable name
- `bio: string` - Editable bio

**Effects**:
- Fetches profile on mount

**Hooks Used**:
- `useParams()` - Gets userId from URL
- `useUserProfile(userPk)` - Fetches profile data
- `useStoredKeypair()` - For profile editing
- `usePostSubmit()` - Saves profile changes

**Renders**:
- `UserAvatar` - User avatar with size options
- Display name and bio
- Edit form (if own profile)
- `StartDMButton` - Message user

**Styling**: `Profile.css`

---

### SearchResults (`src/pages/SearchResults.tsx`)

**Purpose**: Display search results across spaces and threads

**Props**: None (uses query params)

**State**:
- `results: SearchResult[]` - Search matches
- `loading: boolean` - Loading state

**Effects**:
- Performs client-side search when query changes

**Hooks Used**:
- `useSearchParams()` - Gets query from URL
- `useSpaces()` - Search across spaces
- `useRpc()` - Direct content search

**Renders**:
- Search result cards grouped by type
- Links to matching content

**Styling**: `SearchResults.css`

---

### CreatePrivateSpace (`src/pages/CreatePrivateSpace.tsx`)

**Purpose**: Create encrypted private space with X25519 key exchange

**Props**: None

**State**:
- `spaceName: string` - Space name
- `spaceKey: Uint8Array | null` - Generated encryption key
- `invitees: string[]` - List of invitee public keys
- `creating: boolean` - Creation in progress

**Effects**:
- Generates space key
- Encrypts keys for invitees

**Hooks Used**:
- `useStoredKeypair()` - For signing and key derivation
- `useCreatePrivateSpace()` - RPC for creation
- `usePrivateSpaceKeys()` - Stores local key
- `useNavigate()` - Post-creation navigation

**Renders**:
- Space name input
- Invitee list with public key input
- `InviteModal` - Invite existing users
- Create button

**Styling**: `CreatePrivateSpace.css`

---

## Shared Components (src/components/)

### Layout Components

#### Header (`src/components/Header.tsx`)

**Purpose**: Top navigation bar with branding, search, and user profile

**Props**: None

**State**: None (stateless)

**Hooks Used**:
- `useRpc()` - Connection status for indicator

**Renders**:
- Logo/title link
- `SearchBox`
- `ProfileButton`
- `NodeStatusBar` (only in Tauri)

**Styling**: `Header.css`

---

#### Sidebar (`src/components/Sidebar.tsx`)

**Purpose**: Left navigation panel with space list and private spaces

**Props**: None

**State**:
- `collapsed: boolean` - Sidebar collapsed state

**Hooks Used**:
- `useSpaces()` - Public spaces list
- `useLocation()` - Active route highlighting

**Renders**:
- `SpaceTree` - Public spaces hierarchy
- `PrivateSpaceList` - User's private spaces
- Quick links (new thread, settings)

**Styling**: `Sidebar.css`

---

#### StatusBar (`src/components/StatusBar.tsx`)

**Purpose**: Bottom status bar showing sync status and peer count

**Props**: None

**State**: None

**Hooks Used**:
- `useNetworkStatus()` - Sync state, peers

**Renders**:
- Sync percentage
- Peer count
- Connection indicator

**Styling**: `StatusBar.css`

---

### Content Display Components

#### ThreadList (`src/components/ThreadList.tsx`)

**Purpose**: Renders list of thread previews with engagement info

**Props**:
```typescript
interface ThreadListProps {
  threads: Thread[];
  loading?: boolean;
  showSpace?: boolean;
}
```

**State**: None

**Hooks Used**:
- `useBlocklist()` - Filter blocked content

**Renders**:
- Thread title (with `EncryptedBadge` if encrypted)
- Author `AddressDisplay`
- `ImageThumbnailIndicator` for attachments
- Reply count, engagement, time ago

**Styling**: `ThreadList.css`

---

#### ReplyTree (`src/components/ReplyTree.tsx`)

**Purpose**: Recursive component for nested reply threads

**Props**:
```typescript
interface ReplyTreeProps {
  replies: Reply[];
  parentId: string | null;
  depth?: number;
  maxDepth?: number;
  onReply?: (replyId: string) => void;
  encryptionPassphrase?: string;
}
```

**State**:
- `collapsed: Map<string, boolean>` - Collapsed branches

**Hooks Used**:
- `useBlocklist()` - Filter blocked replies/users

**Renders**:
- Reply content recursively
- Collapse/expand controls
- Reply button
- `BlockButton` per reply

**Styling**: `ReplyTree.css`

---

#### ReplyComposer (`src/components/ReplyComposer.tsx`)

**Purpose**: Text input for composing replies with PoW mining

**Props**:
```typescript
interface ReplyComposerProps {
  threadId: string;
  parentId?: string;
  spaceId: string;
  onSubmit?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}
```

**State**:
- `body: string` - Reply content
- `mining: boolean` - PoW in progress
- `progress: MiningProgress` - Mining stats

**Hooks Used**:
- `useReplySubmit()` - Submits reply with PoW
- `useReplyPow()` - PoW mining

**Renders**:
- Textarea for reply
- `PowProgress` during mining
- Submit/Cancel buttons

**Styling**: `ReplyComposer.css`

---

#### ChatView (`src/components/ChatView.tsx`)

**Purpose**: Real-time chat interface for private spaces

**Props**:
```typescript
interface ChatViewProps {
  spaceId: string;
  spaceKey: Uint8Array;
}
```

**State**:
- `messages: Message[]` - Decrypted messages
- `input: string` - Current message input

**Effects**:
- Polls for new messages
- Decrypts messages with spaceKey

**Hooks Used**:
- `usePrivateSpaceMessages(spaceId)` - Fetches messages
- `useStoredKeypair()` - For sending messages
- `usePrivateSpaceKeys()` - Space key access

**Renders**:
- Message list with timestamps
- User avatars
- Message input with send button

**Styling**: `ChatView.css`

---

### Encryption Components

#### EncryptedContent (`src/components/EncryptedContent.tsx`)

**Purpose**: Display and unlock passphrase-encrypted content

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
- `decryptedTitle: string | null` - Unlocked title
- `decryptedBody: string | null` - Unlocked body
- `error: string | null` - Decryption error
- `decrypting: boolean` - In progress
- `rememberPassphrase: boolean` - Save passphrase
- `setAsDefault: boolean` - Set as default

**Effects**:
- Auto-tries stored passphrases on mount

**Hooks Used**:
- `usePassphraseStore()` - Passphrase persistence

**Renders**:
- Lock icon (locked state)
- Passphrase input form
- Decrypted content (unlocked state)
- Lock button to re-lock

**Styling**: `EncryptedContent.css`

**Also exports**:
- `EncryptedBadge` - Lock icon badge
- `DecryptedBadge` - Unlocked icon badge
- `InlineUnlock` - Compact unlock input

---

#### ImageGallery (`src/components/ImageGallery.tsx`)

**Purpose**: Display images with lightbox and encrypted image support

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
- `imageUrls: Map<string, string>` - Loaded/decrypted URLs
- `encryptedLocked: Set<string>` - Locked encrypted images
- `loading: boolean` - Loading state
- `lightboxIndex: number | null` - Open lightbox image

**Effects**:
- Loads images from node
- Decrypts encrypted images with passphrase
- Keyboard navigation in lightbox

**Hooks Used**:
- `useMediaUpload()` - Media URL fetching
- `useRpc()` - For encrypted media fetch

**Renders**:
- Thumbnail grid or full images
- Lock icon for encrypted images
- Lightbox overlay with navigation
- "+N more" button for hidden images

**Styling**: `ImageGallery.css`

**Also exports**:
- `ImageThumbnailIndicator` - Icon showing image count

---

### User & Profile Components

#### AddressDisplay (`src/components/AddressDisplay.tsx`)

**Purpose**: Truncated address display with copy and DM buttons

**Props**:
```typescript
interface AddressDisplayProps {
  address: string;
  displayName?: string;
  full?: boolean;
  className?: string;
  showDM?: boolean;
  showAvatar?: boolean;
  avatarSize?: AvatarSize;
  avatar?: AvatarInfo | null;
  linkToProfile?: boolean;
}
```

**State**: None

**Renders**:
- Truncated address (or full if specified)
- Display name if provided
- `UserAvatar` if showAvatar
- Copy to clipboard button
- `StartDMButton` if showDM
- Profile link if linkToProfile

**Styling**: `AddressDisplay.css`

**Also exports**:
- `truncateAddress(address: string): string` - Utility function

---

#### UserAvatar (`src/components/UserAvatar.tsx`)

**Purpose**: User avatar with generated colors or uploaded image

**Props**:
```typescript
interface UserAvatarProps {
  userPk: string;
  displayName?: string;
  avatar?: AvatarInfo | null;
  size?: AvatarSize; // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  showOnline?: boolean;
  isOnline?: boolean;
}
```

**State**:
- `imageError: boolean` - Image load failed

**Renders**:
- Uploaded avatar image (if available)
- Generated avatar with initials and color
- Online status indicator

**Styling**: `UserAvatar.css`

**Also exports**:
- `AvatarGroup` - Multiple avatars with overflow

---

#### ProfileButton (`src/components/ProfileButton.tsx`)

**Purpose**: Header button showing identity status with link to identity page

**Props**: None

**State**: None

**Hooks Used**:
- `useNodeIdentity()` - Current identity

**Renders**:
- Avatar with initials
- `AddressDisplay` for address
- Loading/No Identity states
- Links to `/identity` and `/settings`

**Styling**: `ProfileButton.css`

---

#### IdentityCard (`src/components/IdentityCard.tsx`)

**Purpose**: Card displaying full identity details

**Props**:
```typescript
interface IdentityCardProps {
  identity: StoredIdentity;
}
```

**State**: None

**Renders**:
- Large avatar
- Full `AddressDisplay`
- Creation date
- PoW difficulty badge
- "Verified" status badge

**Styling**: `IdentityCard.css`

---

#### StartDMButton (`src/components/StartDMButton.tsx`)

**Purpose**: Button to initiate DM with another user

**Props**:
```typescript
interface StartDMButtonProps {
  recipientPk: string;
  recipientName?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}
```

**State**:
- `status: DMStatus` - DM state (none/pending/active)
- `loading: boolean` - Request in progress
- `error: string | null` - Error message

**Effects**:
- Checks if DM space already exists

**Hooks Used**:
- `useStoredKeypair()` - For key derivation
- `usePrivateSpaceKeys()` - Check existing DMs
- `useRequestDM()` - Send DM request
- `useNavigate()` - Navigate to DM

**Renders**:
- Button with message icon
- Different text based on status
- Disabled when pending

**Styling**: `StartDMButton.css`

---

### Private Space Components

#### PrivateSpaceList (`src/components/PrivateSpaceList.tsx`)

**Purpose**: Sidebar list of user's private spaces and pending invites

**Props**: None

**State**:
- `decryptedSpaces: DecryptedSpace[]` - Spaces with decrypted names
- `decryptedInvites: DecryptedInvite[]` - Pending invites
- `processingInvite: string | null` - Invite being accepted
- `decliningInvite: string | null` - Invite being declined

**Effects**:
- Decrypts space names using stored keys

**Hooks Used**:
- `useStoredKeypair()` - For X25519 key derivation
- `usePrivateSpaces(userPk)` - Fetches user's spaces
- `usePrivateSpaceInvites(userPk)` - Fetches pending invites
- `useAcceptInvite()` - Accept invite RPC
- `useDeclineDM()` - Decline invite RPC
- `usePrivateSpaceKeys()` - Key storage

**Renders**:
- Invites section with Accept/Decline buttons
- Private spaces list with icons
- "Create Private Space" button

**Styling**: `PrivateSpaceList.css`

---

#### InviteModal (`src/components/InviteModal.tsx`)

**Purpose**: Modal for inviting users to private spaces

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
- `recipientAddress: string` - Invitee public key
- `message: string` - Optional message
- `inviteError: string | null` - Error message
- `success: boolean` - Invite sent
- `loading: boolean` - In progress

**Hooks Used**:
- `useStoredKeypair()` - For key derivation
- `usePrivateSpaceKeys()` - Get space key
- `useInviteToSpace()` - Send invite RPC

**Renders**:
- Recipient address input
- Message textarea
- Error/success feedback
- Cancel/Send buttons

**Styling**: `InviteModal.css`

---

#### SpaceSettings (`src/components/SpaceSettings.tsx`)

**Purpose**: Settings modal for private space administration

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
- `showInviteModal: boolean` - Invite modal open
- `confirmLeave: boolean` - Leave confirmation
- `kickingMember: string | null` - Member being kicked
- `error: string | null` - Error message

**Hooks Used**:
- `useStoredKeypair()` - For signing operations
- `useSpaceMembers(spaceId)` - Member list
- `useLeaveSpace()` - Leave space RPC
- `useKickMember()` - Kick member RPC
- `usePrivateSpaceKeys()` - Key management
- `useNavigate()` - Post-leave navigation

**Renders**:
- Space info card
- Members list with roles
- Invite button
- Kick buttons (admin only)
- Leave space (danger zone)
- `InviteModal`

**Styling**: `SpaceSettings.css`

---

### Engagement & Status Components

#### ContentStatus (`src/components/ContentStatus.tsx`)

**Purpose**: Emoji reactions display and picker

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
- `showPicker: boolean` - Emoji picker open

**Renders**:
- Existing reaction counts
- Emoji picker (8 options)
- React button with loading state

**Styling**: `ContentStatus.css`

---

#### EngagementPool (`src/components/EngagementPool.tsx`)

**Purpose**: Visualization of content engagement pool for persistence

**Props**:
```typescript
interface EngagementPoolProps {
  pool: PoolState;
  onContribute?: (seconds: number) => void;
  isContributing?: boolean;
  contributionProgress?: number;
}
```

**State**: None (controlled component)

**Renders**:
- Progress bar (contributed/required seconds)
- Contributor count
- Contribution buttons (+5s, +15s, +30s)
- "Persisted" badge when complete
- Mining progress during contribution

**Styling**: `EngagementPool.css`

**Also exports**:
- `EngagementPoolBadge` - Compact badge for lists

---

#### PowProgress (`src/components/PowProgress.tsx`)

**Purpose**: Mining progress display during PoW computation

**Props**:
```typescript
interface PowProgressProps {
  attempts: number;
  elapsedMs: number;
  difficulty: number;
  onCancel: () => void;
}
```

**State**:
- `tip: string` - Random mining tip (selected once)

**Renders**:
- Animated 3D cube spinner
- Attempts, elapsed time, hash rate stats
- Progress bar (estimated)
- Educational tips about PoW
- Cancel button

**Styling**: `PowProgress.css`

---

### Moderation Components

#### ReportModal (`src/components/ReportModal.tsx`)

**Purpose**: Spam attestation UI for reporting content

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

**Hooks Used**:
- `useSpamStatus(contentId)` - Current spam status
- `useSpamReport()` - Report submission with PoW
- `useStoredKeypair()` - For signing

**Renders**:
- Spam reason options (5 types)
- Current report count
- Mining progress during submission
- Defend button (if already flagged)
- Success/error feedback

**Styling**: `ReportModal.css`

**Also exports**:
- `SpamBadge` - Shows flagged/reported status
- `ReportButton` - Opens report modal

---

#### BlockButton (`src/components/BlockButton.tsx`)

**Purpose**: Client-side blocking for users and content

**Props**:
```typescript
interface BlockButtonProps {
  id: string;
  type: BlockType; // 'user' | 'post' | 'space' | 'reply'
  authorId?: string;
  variant?: 'icon' | 'text' | 'menu-item';
}
```

**State**:
- `showMenu: boolean` - Dropdown menu open

**Effects**:
- Click outside to close menu

**Hooks Used**:
- `useBlocklist()` - Block state management

**Renders**:
- Block icon button
- Dropdown with block options
- Block item / Block user options

**Styling**: `BlockButton.css`

**Also exports**:
- `BlockedIndicator` - Shows blocked state

---

#### BlocklistManager (`src/components/BlocklistManager.tsx`)

**Purpose**: Settings panel for managing blocked content

**Props**: None

**State**:
- `activeTab: TabType` - Current tab (users/posts/spaces/replies)

**Hooks Used**:
- `useBlocklist()` - All blocking operations

**Renders**:
- Tab navigation with counts
- List of blocked items per type
- Unblock buttons
- Clear all button

**Styling**: `BlocklistManager.css`

---

### Navigation & Controls

#### SearchBox (`src/components/SearchBox.tsx`)

**Purpose**: Search input with keyboard shortcut

**Props**: None

**State**:
- `query: string` - Search input
- `isFocused: boolean` - Focus state

**Hooks Used**:
- `useNavigate()` - Navigate to search results

**Renders**:
- Search icon
- Input with placeholder
- "/" shortcut indicator
- Form with submit

**Styling**: `SearchBox.css`

---

#### SpaceTree (`src/components/SpaceTree.tsx`)

**Purpose**: Hierarchical navigation tree for public spaces

**Props**: None

**State**: None

**Hooks Used**:
- `useSpaces()` - Fetches spaces

**Renders**:
- `SpaceNode` components (internal)
- Active state highlighting
- Post count badges
- Loading/error/empty states

**Styling**: `SpaceTree.css`

---

#### Pagination (`src/components/Pagination.tsx`)

**Purpose**: Page navigation with ellipsis support

**Props**:
```typescript
interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}
```

**State**: None

**Renders**:
- Previous/Next buttons
- Page number buttons
- Ellipsis for large page counts

**Styling**: `Pagination.css`

---

#### ThreadSortControls (`src/components/ThreadSortControls.tsx`)

**Purpose**: Button group for thread sorting options

**Props**:
```typescript
interface ThreadSortControlsProps {
  value: ThreadSortOption;
  onChange: (value: ThreadSortOption) => void;
}
```

**State**: None

**Renders**:
- Button group (Newest, Oldest, Most Replies, Most Active)
- Active state styling

**Styling**: `ThreadSortControls.css`

---

### Debug & System Components

#### DebugPanel (`src/components/DebugPanel.tsx`)

**Purpose**: Node diagnostics and peer information

**Props**: None

**State**:
- `status: NodeStatus | null` - Node status info
- `peers: PeerInfo[]` - Connected peers
- `loading: boolean` - Refreshing
- `error: string | null` - Error message
- `showPeers: boolean` - Peers section expanded
- `showLogs: boolean` - Logs section expanded
- `autoRefresh: boolean` - Auto-refresh toggle

**Effects**:
- Fetches debug info on mount
- Auto-refresh interval (5s)

**Hooks Used**:
- `useRpc()` - RPC calls for debug info

**Renders**:
- Connection status grid
- Sync state, chain height, peer count
- Storage used, last block time
- Node ID and version
- Collapsible peer table
- Troubleshooting tips

**Styling**: `DebugPanel.css`

---

#### NodeStatusBar (`src/components/NodeStatusBar.tsx`)

**Purpose**: Tauri desktop app node status bar

**Props**:
```typescript
interface NodeStatusBarProps {
  onSettingsClick?: () => void;
}
```

**State**:
- `status: NodeStatus | null` - Node running status
- `loading: boolean` - Operation in progress
- `error: string | null` - Error message
- `showControls: boolean` - Controls dropdown open
- `isTauriAvailable: boolean | null` - Tauri detection

**Effects**:
- Polls node status (3s interval)

**Renders**:
- Status indicator (Running/Stopped/Connecting)
- Peer count, network, RPC port
- Control dropdown (Stop/Restart/Settings)
- Returns null if not in Tauri

**Styling**: `NodeStatusBar.css`

**Also exports**:
- `isInTauri(): boolean` - Tauri detection utility

---

#### LoadingScreen (`src/components/Loading.tsx`)

**Purpose**: Initial loading screen during WASM initialization

**Props**: None

**State**: None

**Renders**:
- Animated spinner rings
- "Swimchain" title
- "Initializing decentralized forum..." message
- "Loading WASM modules" hint

**Styling**: `Loading.css`

---

#### ErrorBoundary (`src/components/ErrorBoundary.tsx`)

**Purpose**: React error boundary with retry functionality

**Props**:
```typescript
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
```

**State**:
- `hasError: boolean` - Error caught
- `error: Error | null` - The error
- `errorInfo: ErrorInfo | null` - Component stack

**Renders**:
- Custom fallback or default error UI
- Error message
- WASM-specific hints
- Try Again / Reload buttons
- Stack trace (dev mode only)

**Styling**: `ErrorBoundary.css`

---

#### RequireIdentity (`src/components/RequireIdentity.tsx`)

**Purpose**: Route guard requiring valid identity

**Props**:
```typescript
interface RequireIdentityProps {
  children: React.ReactNode;
}
```

**State**: None

**Hooks Used**:
- `useIdentityContext()` - Identity state
- `useLocation()` - Redirect preservation

**Renders**:
- Loading spinner while checking
- Redirects to `/identity` if missing
- Children if valid identity

---

## Custom Hooks (src/hooks/)

### RPC & Data Hooks

#### useRpc (`src/hooks/useRpc.tsx`)

**Purpose**: Main hook for RPC connection and data fetching

**Returns**:
```typescript
{
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: { version, network, peerCount } | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
}
```

**Also exports (from same file)**:
- `useNetworkStatus()` - Sync status
- `useSpaces()` - Space list
- `useSpaceThreads(spaceId)` - Threads in space
- `useThread(contentId)` - Single thread
- `useReplies(contentId)` - Thread replies
- `useReactions(contentId)` - Emoji reactions
- `usePoolContribution()` - Engagement pool
- `usePostSubmit()` - Create post with PoW
- `useReplySubmit()` - Create reply with PoW
- `useEditSubmit()` - Edit in mempool
- `useMediaUpload()` - Upload/fetch media
- `useSpamStatus(contentId)` - Spam report status
- `useSpamReport()` - Submit spam report
- `useIdentityName()` - Display name management
- `usePrivateSpaces(userPk)` - Private space list
- `usePrivateSpaceInvites(userPk)` - Pending invites
- `useSpaceMembers(spaceId)` - Space member list
- `useCreatePrivateSpace()` - Create private space
- `useInviteToSpace()` - Invite to space
- `useAcceptInvite()` - Accept space invite
- `useLeaveSpace()` - Leave space
- `useKickMember()` - Kick from space
- `useRequestDM()` - Request DM
- `useAcceptDM()` - Accept DM request
- `useDeclineDM()` - Decline DM request
- `usePendingDMRequests(userId)` - Pending DM requests

---

### PoW Hooks

#### useActionPow (`src/hooks/useActionPow.ts`)

**Purpose**: Argon2id PoW mining for actions

**Returns**:
```typescript
{
  state: MiningState;
  progress: MiningProgress;
  solution: PoWSolution | null;
  error: string | null;
  mine: (actionType, content, authorPk, isTestnet?) => Promise<PoWSolution>;
  cancel: () => void;
  reset: () => void;
  getRpcParams: () => RpcPowParams | null;
}
```

**Also exports**:
- `useEngagementPow()` - Engagement-specific mining
- `useReplyPow()` - Reply-specific mining
- `usePostPow()` - Post-specific mining
- `useSpaceCreationPow()` - Space creation mining
- `useEditPow()` - Edit-specific mining

---

### Identity & Keys

#### useStoredKeypair (`src/hooks/useStoredKeypair.ts`)

**Purpose**: WASM Keypair from stored identity seed

**Returns**:
```typescript
{
  keypair: WasmKeypair | null;
  publicKey: Uint8Array | null;
  address: string | null;
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
}
```

---

#### useNodeIdentity (`src/hooks/useNodeIdentity.ts`)

**Purpose**: Identity from node via RPC

**Returns**:
```typescript
{
  identity: NodeIdentity | null;
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
  refetch: () => void;
}
```

---

#### usePrivateSpaceKeys (`src/hooks/usePrivateSpaceKeys.ts`)

**Purpose**: IndexedDB storage for private space keys

**Returns**:
```typescript
{
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

---

### Content Management

#### useBlocklist (`src/hooks/useBlocklist.ts`)

**Purpose**: Client-side content blocking

**Returns**:
```typescript
{
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
  filterBlocked: <T>(items: T[], type, options?) => T[];
}
```

---

#### usePassphraseStore (`src/hooks/usePassphraseStore.ts`)

**Purpose**: Passphrase persistence for encrypted content

**Returns**:
```typescript
{
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

---

#### useUserProfile (`src/hooks/useUserProfile.ts`)

**Purpose**: Fetch user profiles from profile space

**Returns**:
```typescript
{
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

**Also exports**:
- `useUserProfiles(userPks: string[])` - Batch profile fetching
- `clearProfileCache(userPk?: string)` - Cache invalidation

---

## Providers (src/providers/)

### SwimchainProvider (`src/providers/SwimchainProvider.tsx`)

**Purpose**: WASM initialization and availability context

**Context Value**:
```typescript
{
  isLoaded: boolean;
  loadError: Error | null;
}
```

**Props**:
```typescript
{
  children: ReactNode;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  fallback?: ReactNode;
}
```

---

### IdentityProvider (`src/providers/IdentityProvider.tsx`)

**Purpose**: Global identity state management

**Context Value**:
```typescript
{
  identity: StoredIdentity | null;
  isLoading: boolean;
  hasValidIdentity: boolean;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
}
```

---

### RpcProvider (in `src/hooks/useRpc.tsx`)

**Purpose**: RPC connection management and data fetching context

**Context Value**:
```typescript
{
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: { version, network, peerCount } | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
}
```

---

## Component Summary

| Category | Count | Description |
|----------|-------|-------------|
| **Pages** | 9 | Route-level page components |
| **Layout** | 4 | Header, Sidebar, StatusBar, MainLayout |
| **Content Display** | 5 | ThreadList, ReplyTree, ReplyComposer, ChatView, ImageGallery |
| **Encryption** | 2 | EncryptedContent, (components within) |
| **User/Profile** | 6 | AddressDisplay, UserAvatar, ProfileButton, IdentityCard, StartDMButton, RequireIdentity |
| **Private Spaces** | 3 | PrivateSpaceList, InviteModal, SpaceSettings |
| **Engagement** | 3 | ContentStatus, EngagementPool, PowProgress |
| **Moderation** | 3 | ReportModal, BlockButton, BlocklistManager |
| **Navigation** | 4 | SearchBox, SpaceTree, Pagination, ThreadSortControls |
| **Debug/System** | 4 | DebugPanel, NodeStatusBar, LoadingScreen, ErrorBoundary |
| **Custom Hooks** | 13 | RPC, PoW, Identity, Storage, Profile |
| **Providers** | 3 | Swimchain, Identity, RPC |

**Total Components**: ~38 (including sub-exports)
**Total Hooks**: 30+ (including useRpc exports)
**Total Providers**: 3
