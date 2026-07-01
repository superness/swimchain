# Forum-Client Feature Map

Complete mapping of all user-facing features to their implementation in the Swimchain forum-client.

---

## Table of Contents

1. [Navigation Features](#navigation-features)
2. [Authentication Features](#authentication-features)
3. [Content Creation Features](#content-creation-features)
4. [Content Viewing Features](#content-viewing-features)
5. [User Interaction Features](#user-interaction-features)
6. [Private Spaces Features](#private-spaces-features)
7. [Moderation Features](#moderation-features)
8. [Real-time Features](#real-time-features)
9. [Feature Matrix](#feature-matrix)

---

## Navigation Features

### Route Navigation

**User Flow**: User clicks nav link -> Route changes -> New page renders

**Components**: `Header`, `Sidebar`, `SpaceTree`, `react-router-dom`

**Routes**:

| Path | Component | Description | Protection |
|------|-----------|-------------|------------|
| `/` | `SpaceList` | Landing page with all spaces | Public |
| `/spaces` | `SpaceList` | Alias for homepage | Public |
| `/spaces/:spaceId` | `SpaceView` | View threads in a space | RequireIdentity |
| `/spaces/:spaceId/new` | `NewThread` | Create new thread | RequireIdentity |
| `/spaces/:spaceId/thread/:threadId` | `ThreadView` | View thread with replies | RequireIdentity |
| `/spaces/:spaceId/thread/:threadId/reply/:replyId` | `ThreadView` | Thread with focused reply | RequireIdentity |
| `/spaces/new/private` | `CreatePrivateSpace` | Create encrypted space | RequireIdentity |
| `/identity` | `Identity` | Create/manage identity | Public |
| `/settings` | `Settings` | User preferences | Public |
| `/profile` | `Profile` | View own profile | Public |
| `/profile/:userPk` | `Profile` | View user profile | Public |
| `/search` | `SearchResults` | Search content | RequireIdentity |
| `/chat/:spaceId` | `ChatView` | Direct messaging | RequireIdentity |

**Status**: Complete

---

### Sidebar Navigation

**User Flow**:
1. User views sidebar on left
2. SpaceTree shows all public spaces
3. PrivateSpaceList shows user's private spaces
4. User clicks space to navigate
5. Active space is highlighted

**Components**: `Sidebar`, `SpaceTree`, `PrivateSpaceList`

**Hooks Used**: `useSpaces`, `usePrivateSpaceKeys`, `useLocation`

**RPC Methods**: `list_spaces`

**Status**: Complete

---

### Search Navigation

**User Flow**:
1. User clicks search icon or presses `/`
2. SearchBox gains focus
3. User types query and presses Enter
4. Browser navigates to `/search?q=query`
5. SearchResults page displays matches

**Components**: `SearchBox`, `SearchResults`

**Hooks Used**: `useNavigate`, `useSearchParams`, `useSpaces`

**RPC Methods**: Client-side filtering only (no server-side search yet)

**Status**: Partial - Client-side only, server-side search not implemented

---

### Keyboard Navigation

**User Flow**:
1. User presses navigation keys
2. Selection moves between items
3. Enter opens selected item

**Components**: `KeyboardNavigationProvider`, thread lists, reply trees

**Shortcuts**:
| Key | Action |
|-----|--------|
| `j` | Move selection down |
| `k` | Move selection up |
| `Enter` | Open selected item |
| `/` | Focus search |
| `?` | Show shortcuts help |
| `Backspace` | Go back |

**Status**: Complete

---

## Authentication Features

### Identity Creation

**User Flow**:
1. User navigates to `/identity`
2. Clicks "Create Identity"
3. WASM generates Ed25519 keypair
4. PoW mining starts (difficulty 20)
5. Progress bar shows mining status
6. Mining completes (typically 5-30 seconds)
7. User confirms to save identity
8. Identity stored in localStorage
9. User redirected to spaces

**Components**: `Identity`, `PowProgress`, `IdentityCard`

**Hooks Used**: `useKeypair`, `usePow`, `useIdentityContext`, `useStoredIdentity`

**RPC Methods**: None (client-side generation)

**Status**: Complete

---

### Identity Import

**User Flow**:
1. User navigates to `/identity`
2. Clicks "Import Identity"
3. Enters 64-character hex seed
4. System validates and derives keypair
5. PoW mining starts over imported key
6. Identity saved after mining completes

**Components**: `Identity`, `PowProgress`

**Hooks Used**: `useKeypair`, `usePow`, `useIdentityContext`

**Status**: Complete

---

### Display Name Update

**User Flow**:
1. User navigates to `/identity` or `/profile`
2. Clicks edit on display name
3. Enters new display name
4. Clicks save
5. Name stored on-chain via RPC

**Components**: `Identity`, `Profile`

**Hooks Used**: `useIdentityName`, `useStoredKeypair`

**RPC Methods**: `update_identity_name`

**Status**: Complete

---

### Route Protection (RequireIdentity)

**User Flow**:
1. User navigates to protected route
2. `RequireIdentity` checks for valid identity
3. If no identity, redirects to `/identity`
4. Return URL preserved for post-creation redirect

**Components**: `RequireIdentity`

**Hooks Used**: `useIdentityContext`, `useLocation`

**Status**: Complete

---

## Content Creation Features

### Create Thread/Post

**User Flow**:
1. User navigates to space
2. Clicks "New Thread" button
3. Enters title (max 256 chars)
4. Enters body (max 4096 chars, markdown supported)
5. Optional: Enable encryption toggle
6. Optional: Enter passphrase (or generate random)
7. Optional: Attach images (max 4, 1MB each)
8. Clicks "Create Thread"
9. System validates input
10. If encrypted: encrypts title + body + images
11. Argon2id PoW mining starts (difficulty 12 testnet / 20 mainnet)
12. Progress shows: attempts, hash rate, elapsed time
13. User can cancel mining
14. Mining completes (typically 10-60 seconds)
15. System signs content with keypair
16. RPC submits post
17. User redirected to new thread

**Components**: `NewThread`, `PowProgress`

**Hooks Used**: `usePostPow`, `usePostSubmit`, `useMediaUpload`, `useStoredKeypair`, `usePassphraseStore`

**RPC Methods**: `submit_post`, `upload_media` (for images)

**Status**: Complete

---

### Create Reply

**User Flow**:
1. User views thread
2. Scrolls to ReplyComposer or clicks "Reply" on specific comment
3. Enters reply content
4. Clicks "Post Reply"
5. Argon2id PoW mining starts (difficulty 8 testnet / 18 mainnet)
6. Progress shown inline
7. Mining completes
8. System signs and submits
9. Reply appears in tree

**Components**: `ReplyComposer`, `PowProgress`, `ReplyTree`

**Hooks Used**: `useReplyPow`, `useReplySubmit`, `useStoredKeypair`, `useReplies`

**RPC Methods**: `submit_reply`

**Status**: Complete

---

### Create Space

**User Flow**:
1. User on SpaceList page
2. Clicks "+ Create Space"
3. Form appears for space name + description
4. Clicks "Create"
5. PoW mining starts (difficulty 12 testnet / 22 mainnet)
6. Space created on network
7. User redirected to new space

**Components**: `SpaceList`

**Hooks Used**: `useSpaceCreationPow`, `useRpc`

**RPC Methods**: `create_space`

**Status**: Complete

---

### Edit Content (Replace-In-Mempool)

**User Flow**:
1. User views own content (not yet in block)
2. Clicks "Edit" button
3. Modifies title or body
4. Clicks "Save"
5. PoW mining starts (difficulty 10 testnet / 18 mainnet)
6. Edit submitted with replacement hash
7. Original mempool entry replaced

**Components**: `ThreadView`, `EditModal`

**Hooks Used**: `useEditPow`, `useEditSubmit`, `useStoredKeypair`

**RPC Methods**: `submit_edit`

**Status**: Complete

---

### Image Upload

**User Flow**:
1. User in NewThread form
2. Clicks "Add Image" or drags file
3. System validates: max 1MB, image type
4. If too large: offers compression dialog
5. User confirms compression or cancels
6. Image uploaded to node
7. Media hash returned and attached to post

**Components**: `NewThread`, `ImageGallery`

**Hooks Used**: `useMediaUpload`

**RPC Methods**: `upload_media`

**Status**: Complete

---

### Encrypted Image Upload

**User Flow**:
1. User in NewThread with encryption enabled
2. Adds image
3. System encrypts image with passphrase (AES-256-GCM)
4. Encrypted blob uploaded
5. Media hash stored with encryption flag

**Components**: `NewThread`

**Hooks Used**: `useMediaUpload` (`uploadEncryptedImage`)

**RPC Methods**: `upload_media`

**Status**: Complete

---

## Content Viewing Features

### Browse Spaces

**User Flow**:
1. User visits homepage
2. System fetches all spaces (cached)
3. Displays space cards with:
   - Space name
   - Description
   - Post count
   - Active post count
4. User clicks space to view threads

**Components**: `SpaceList`

**Hooks Used**: `useSpaces`

**RPC Methods**: `list_spaces`

**Caching**: 5min memory, 30min localStorage

**Status**: Complete

---

### View Space Threads

**User Flow**:
1. User navigates to space
2. System fetches threads (paginated)
3. Displays thread list with:
   - Title (or "[Encrypted]" badge)
   - Author address + display name
   - Image indicator (if attachments)
   - Reply count
   - Last activity time
4. Missing thread bodies requested from network
5. Polling updates UI as bodies arrive (2s intervals, 30s max)
6. User can sort: Newest, Oldest, Most Replies, Most Active
7. User can paginate (50 per page default)

**Components**: `SpaceView`, `ThreadList`, `ThreadSortControls`, `Pagination`, `EncryptedBadge`

**Hooks Used**: `useSpaceThreads`, `usePreferences`, `useBlocklist`

**RPC Methods**: `list_space_posts`, `request_content`, `list_space_content`

**Caching**: 2min memory cache

**Status**: Complete

---

### View Thread Details

**User Flow**:
1. User clicks thread in list
2. System fetches thread content
3. If body missing: requests from network, shows loading
4. Polling for content arrival (1s intervals, 30s max)
5. Displays:
   - Title (decrypted if encrypted and passphrase known)
   - Body content (markdown rendered)
   - Author info with avatar
   - Creation time
   - Image gallery (if attachments)
   - Engagement pool status
   - Emoji reactions
6. User can interact with content

**Components**: `ThreadView`, `ImageGallery`, `EngagementPool`, `ContentStatus`, `UserAvatar`, `AddressDisplay`

**Hooks Used**: `useThread`, `useReactions`, `useBlocklist`, `usePassphraseStore`

**RPC Methods**: `get_content`, `get_pool_for_content`, `get_reactions`, `request_content`

**Status**: Complete

---

### View Replies (Reply Tree)

**User Flow**:
1. User views thread
2. System fetches all replies
3. Builds nested tree structure
4. Missing reply bodies requested
5. Displays:
   - Replies nested by parent
   - Depth limiting (configurable)
   - Collapse/expand controls
   - Author info per reply
   - Reply timestamps
6. Blocked content filtered

**Components**: `ReplyTree`, `ReplyComposer`, `BlockButton`

**Hooks Used**: `useReplies`, `useBlocklist`

**RPC Methods**: `get_replies`, `request_content`

**Status**: Complete

---

### Decrypt Encrypted Content

**User Flow**:
1. User views encrypted content (lock icon)
2. Clicks to unlock
3. System tries stored passphrases first
4. If no match: passphrase input appears
5. User enters passphrase
6. System attempts AES-GCM decryption
7. If success: content displayed
8. Optional: Save passphrase for this content
9. Optional: Set as default passphrase

**Components**: `EncryptedContent`, `InlineUnlock`

**Hooks Used**: `usePassphraseStore`

**Encryption**: AES-256-GCM with PBKDF2 key derivation

**Status**: Complete

---

### View User Profile

**User Flow**:
1. User clicks address/username
2. Navigates to `/profile/:userPk`
3. System fetches profile from profile space
4. Displays:
   - Avatar (or generated placeholder)
   - Display name
   - Bio
   - Website link
   - User's cs1... address
5. If own profile: edit controls shown
6. DM button for other users

**Components**: `Profile`, `UserAvatar`, `AddressDisplay`, `StartDMButton`

**Hooks Used**: `useUserProfile`, `useStoredKeypair`

**RPC Methods**: `list_posts_for_space` (profile space)

**Caching**: 1min memory cache

**Status**: Complete

---

### View Images

**User Flow**:
1. User views content with images
2. Thumbnail grid displayed
3. Click thumbnail opens lightbox
4. Arrow keys navigate between images
5. Escape closes lightbox
6. If encrypted: decrypt icon shown, click to unlock

**Components**: `ImageGallery`

**Hooks Used**: `useMediaUpload` (`getMediaUrl`), `usePassphraseStore`

**RPC Methods**: `get_media`

**Caching**: IndexedDB permanent storage

**Status**: Complete

---

### Search Content

**User Flow**:
1. User types in search box
2. Presses Enter
3. Navigates to search results
4. Client-side filters spaces by name
5. Results displayed

**Components**: `SearchBox`, `SearchResults`

**Hooks Used**: `useSearchParams`, `useSpaces`

**RPC Methods**: None (client-side only)

**Status**: Partial - No server-side full-text search

---

## User Interaction Features

### Emoji Reactions

**User Flow**:
1. User views thread/reply
2. Clicks reaction button
3. Emoji picker shows 8 options: ❤️ 👍 👎 😂 🤔 🤯 🔥 🏊
4. User selects emoji
5. PoW mining starts (difficulty 6 testnet / 16 mainnet)
6. Engagement submitted with emoji code
7. Reaction count updates

**Components**: `ContentStatus`

**Hooks Used**: `useEngagementPow`, `usePoolContribution`, `useReactions`

**RPC Methods**: `submit_engagement`, `get_reactions`

**Status**: Complete

---

### Engagement Pool Contribution

**User Flow**:
1. User views content engagement pool
2. Pool shows: contributed/required seconds, contributors
3. Clicks contribution button (+5s, +15s, +30s)
4. PoW mining starts (proportional to seconds)
5. Contribution added to pool
6. If pool complete: "Persisted" badge shown
7. Content protected from decay

**Components**: `EngagementPool`

**Hooks Used**: `useEngagementPow`, `usePoolContribution`

**RPC Methods**: `submit_engagement`, `get_pool_for_content`

**Status**: Complete

---

### Block User

**User Flow**:
1. User clicks block button on content
2. Menu shows: "Block this post" / "Block this user"
3. User selects option
4. Content/user added to local blocklist
5. All content from blocked user hidden
6. Blocklist persists in localStorage

**Components**: `BlockButton`, `BlocklistManager`

**Hooks Used**: `useBlocklist`

**RPC Methods**: None (client-side only)

**Status**: Complete

---

### Manage Blocklist

**User Flow**:
1. User navigates to Settings
2. Clicks Blocklist tab
3. Views blocked: Users, Posts, Spaces, Replies
4. Can unblock individual items
5. Can clear all blocked

**Components**: `BlocklistManager`

**Hooks Used**: `useBlocklist`

**Status**: Complete

---

### Start Direct Message

**User Flow**:
1. User views another user's profile
2. Clicks "Message" / "Start DM" button
3. System checks for existing DM space
4. If none: creates DM request
5. Recipient sees pending invite
6. When accepted: DM space available
7. User navigates to chat

**Components**: `StartDMButton`, `Profile`

**Hooks Used**: `useRequestDM`, `useStoredKeypair`, `usePrivateSpaceKeys`

**RPC Methods**: `request_dm`

**Status**: Complete

---

## Private Spaces Features

### Create Private Space

**User Flow**:
1. User navigates to `/spaces/new/private`
2. Enters space name
3. Clicks "Create"
4. System generates random 32-byte space key
5. Derives X25519 keys from user's Ed25519 seed
6. Encrypts space key for creator
7. Encrypts space name with space key
8. PoW mining starts
9. Space created on network
10. Space key stored in IndexedDB
11. Invite modal opens for adding members

**Components**: `CreatePrivateSpace`, `InviteModal`

**Hooks Used**: `useCreatePrivateSpace`, `useStoredKeypair`, `usePrivateSpaceKeys`

**RPC Methods**: `create_private_space`

**Encryption**: X25519 key exchange + AES-256-GCM

**Status**: Complete

---

### Invite to Private Space

**User Flow**:
1. User is admin of private space
2. Opens space settings or invite modal
3. Enters recipient's public key/address
4. Optional: adds message
5. Clicks "Send Invite"
6. System encrypts space key for recipient using X25519
7. Invite submitted to network
8. Recipient sees pending invite

**Components**: `InviteModal`, `SpaceSettings`

**Hooks Used**: `useInviteToSpace`, `useStoredKeypair`, `usePrivateSpaceKeys`

**RPC Methods**: `invite_to_space`

**Status**: Complete

---

### Accept Private Space Invite

**User Flow**:
1. User sees invite in PrivateSpaceList sidebar
2. Clicks "Accept"
3. System decrypts space key using user's X25519 keys
4. Space key stored in IndexedDB
5. Space appears in private spaces list
6. User can now view/post in space

**Components**: `PrivateSpaceList`

**Hooks Used**: `useAcceptInvite`, `useStoredKeypair`, `usePrivateSpaceKeys`, `usePrivateSpaceInvites`

**RPC Methods**: `accept_invite`

**Status**: Complete

---

### Decline Private Space Invite

**User Flow**:
1. User sees invite in PrivateSpaceList
2. Clicks "Decline"
3. Invite removed from list
4. No key stored

**Components**: `PrivateSpaceList`

**Hooks Used**: `useDeclineDM`

**RPC Methods**: `decline_invite`

**Status**: Complete

---

### View Private Space

**User Flow**:
1. User clicks private space in sidebar
2. System retrieves space key from IndexedDB
3. Fetches encrypted content
4. Decrypts content with space key
5. Displays decrypted threads/messages

**Components**: `SpaceView`, `ChatView`, `EncryptedContent`

**Hooks Used**: `usePrivateSpaceKeys`, `usePrivateSpaceMessages`

**RPC Methods**: `list_space_posts`

**Status**: Complete

---

### Private Space Chat

**User Flow**:
1. User navigates to private space (DM)
2. ChatView component renders
3. Messages decrypted with space key
4. Real-time polling for new messages (5s)
5. User types message
6. Message encrypted with space key
7. PoW mining
8. Message submitted
9. Appears in chat

**Components**: `ChatView`

**Hooks Used**: `usePrivateSpaceMessages`, `usePrivateSpaceKeys`, `useStoredKeypair`

**RPC Methods**: `list_posts_for_space`, `submit_post`

**Status**: Complete

---

### Leave Private Space

**User Flow**:
1. User opens space settings
2. Clicks "Leave Space"
3. Confirmation dialog appears
4. User confirms
5. Space key removed from IndexedDB
6. Space removed from list
7. User can no longer decrypt content

**Components**: `SpaceSettings`

**Hooks Used**: `useLeaveSpace`, `usePrivateSpaceKeys`

**RPC Methods**: `leave_space`

**Status**: Complete

---

### Kick Member (Admin)

**User Flow**:
1. Admin opens space settings
2. Views member list
3. Clicks "Kick" on member
4. Confirmation dialog
5. Member removed from space
6. Member can no longer access content

**Components**: `SpaceSettings`

**Hooks Used**: `useKickMember`, `useSpaceMembers`

**RPC Methods**: `kick_member`

**Status**: Complete

---

## Moderation Features

### Report Spam

**User Flow**:
1. User clicks "Report" on content
2. ReportModal opens
3. Shows spam reason options:
   - Advertising
   - Repetitive
   - Off-topic
   - Harassment
   - Illegal content
4. User selects reason
5. PoW mining starts
6. Spam attestation submitted
7. Report count increments
8. If threshold reached: content flagged

**Components**: `ReportModal`, `ReportButton`

**Hooks Used**: `useSpamReport`, `useSpamStatus`, `useStoredKeypair`

**RPC Methods**: `submit_spam_attestation`, `get_spam_status`

**Status**: Complete

---

### View Spam Status

**User Flow**:
1. User views content
2. SpamBadge shows if flagged
3. Shows: report count, threshold, flag status

**Components**: `SpamBadge`, `ThreadView`

**Hooks Used**: `useSpamStatus`

**RPC Methods**: `get_spam_status`

**Status**: Complete

---

### Defend Against Spam Flag

**User Flow**:
1. Author sees own content flagged
2. Opens report modal
3. "Defend" button shown (instead of report)
4. Clicks defend
5. Counter-attestation submitted
6. May reduce flag count

**Components**: `ReportModal`

**Hooks Used**: `useSpamReport`

**RPC Methods**: `submit_counter_attestation`

**Status**: Complete

---

## Real-time Features

### Content Sync Polling

**User Flow**:
1. User views content list
2. System detects missing bodies (content not synced)
3. Requests content from network peers
4. Polls every 2 seconds for arrival
5. UI updates when content arrives
6. Stops after 30 seconds max

**Components**: All content viewing components

**Hooks Used**: `useSpaceThreads`, `useThread`, `useReplies`

**RPC Methods**: `request_content`, `get_content`, `list_space_content`

**Status**: Complete

---

### Network Status Display

**User Flow**:
1. User views status bar
2. Shows: sync progress, peer count, connection status
3. Auto-refreshes every 10 seconds
4. Color indicates: connected (green), syncing (yellow), disconnected (red)

**Components**: `NodeStatusBar`, `StatusBar`, `DebugPanel`

**Hooks Used**: `useNetworkStatus`, `useSyncStatus`

**RPC Methods**: `get_sync_status`, `get_peers`

**Status**: Complete

---

### Auto-Reconnection

**User Flow**:
1. Connection to node drops
2. Status shows "Disconnected"
3. System attempts reconnect every 5 seconds
4. On reconnect: status updates
5. Data automatically refetches

**Components**: Via `RpcProvider`

**Hooks Used**: `useRpc`

**Status**: Complete

---

### Private Message Polling

**User Flow**:
1. User in private space chat
2. System polls for new messages (5s interval)
3. New messages decrypted and displayed
4. Chat auto-scrolls to latest

**Components**: `ChatView`

**Hooks Used**: `usePrivateSpaceMessages`

**RPC Methods**: `list_posts_for_space`

**Status**: Complete

---

## Feature Matrix

### Navigation Features

| Feature | Status | Components | Hooks | RPC |
|---------|--------|------------|-------|-----|
| Route Navigation | ✓ Complete | Header, Sidebar, Router | useNavigate | - |
| Sidebar Navigation | ✓ Complete | SpaceTree, PrivateSpaceList | useSpaces, usePrivateSpaceKeys | list_spaces |
| Search Navigation | ◐ Partial | SearchBox, SearchResults | useSearchParams | - (client-side) |
| Keyboard Navigation | ✓ Complete | KeyboardNavigationProvider | useKeyboardNavigation | - |

### Authentication Features

| Feature | Status | Components | Hooks | RPC |
|---------|--------|------------|-------|-----|
| Identity Creation | ✓ Complete | Identity, PowProgress | useKeypair, usePow | - |
| Identity Import | ✓ Complete | Identity | useKeypair, usePow | - |
| Display Name Update | ✓ Complete | Identity, Profile | useIdentityName | update_identity_name |
| Route Protection | ✓ Complete | RequireIdentity | useIdentityContext | - |

### Content Creation Features

| Feature | Status | Components | Hooks | RPC |
|---------|--------|------------|-------|-----|
| Create Thread | ✓ Complete | NewThread, PowProgress | usePostPow, usePostSubmit | submit_post |
| Create Reply | ✓ Complete | ReplyComposer | useReplyPow, useReplySubmit | submit_reply |
| Create Space | ✓ Complete | SpaceList | useSpaceCreationPow | create_space |
| Edit Content (RIM) | ✓ Complete | ThreadView | useEditPow, useEditSubmit | submit_edit |
| Image Upload | ✓ Complete | NewThread | useMediaUpload | upload_media |
| Encrypted Upload | ✓ Complete | NewThread | useMediaUpload | upload_media |

### Content Viewing Features

| Feature | Status | Components | Hooks | RPC |
|---------|--------|------------|-------|-----|
| Browse Spaces | ✓ Complete | SpaceList | useSpaces | list_spaces |
| View Space Threads | ✓ Complete | SpaceView, ThreadList | useSpaceThreads | list_space_posts |
| View Thread Details | ✓ Complete | ThreadView | useThread | get_content |
| View Replies | ✓ Complete | ReplyTree | useReplies | get_replies |
| Decrypt Content | ✓ Complete | EncryptedContent | usePassphraseStore | - |
| View Profile | ✓ Complete | Profile | useUserProfile | list_posts_for_space |
| View Images | ✓ Complete | ImageGallery | useMediaUpload | get_media |
| Search Content | ◐ Partial | SearchResults | useSpaces | - (client-side) |

### User Interaction Features

| Feature | Status | Components | Hooks | RPC |
|---------|--------|------------|-------|-----|
| Emoji Reactions | ✓ Complete | ContentStatus | useEngagementPow, useReactions | submit_engagement |
| Pool Contribution | ✓ Complete | EngagementPool | useEngagementPow | submit_engagement |
| Block User | ✓ Complete | BlockButton | useBlocklist | - (client-side) |
| Manage Blocklist | ✓ Complete | BlocklistManager | useBlocklist | - |
| Start DM | ✓ Complete | StartDMButton | useRequestDM | request_dm |

### Private Space Features

| Feature | Status | Components | Hooks | RPC |
|---------|--------|------------|-------|-----|
| Create Private Space | ✓ Complete | CreatePrivateSpace | useCreatePrivateSpace | create_private_space |
| Invite to Space | ✓ Complete | InviteModal | useInviteToSpace | invite_to_space |
| Accept Invite | ✓ Complete | PrivateSpaceList | useAcceptInvite | accept_invite |
| Decline Invite | ✓ Complete | PrivateSpaceList | useDeclineDM | decline_invite |
| View Private Space | ✓ Complete | SpaceView, ChatView | usePrivateSpaceKeys | list_space_posts |
| Private Chat | ✓ Complete | ChatView | usePrivateSpaceMessages | list_posts_for_space |
| Leave Space | ✓ Complete | SpaceSettings | useLeaveSpace | leave_space |
| Kick Member | ✓ Complete | SpaceSettings | useKickMember | kick_member |

### Moderation Features

| Feature | Status | Components | Hooks | RPC |
|---------|--------|------------|-------|-----|
| Report Spam | ✓ Complete | ReportModal | useSpamReport | submit_spam_attestation |
| View Spam Status | ✓ Complete | SpamBadge | useSpamStatus | get_spam_status |
| Defend Content | ✓ Complete | ReportModal | useSpamReport | submit_counter_attestation |

### Real-time Features

| Feature | Status | Components | Hooks | RPC |
|---------|--------|------------|-------|-----|
| Content Sync | ✓ Complete | All content components | useThread, useReplies | request_content |
| Network Status | ✓ Complete | NodeStatusBar | useNetworkStatus | get_sync_status |
| Auto-Reconnect | ✓ Complete | RpcProvider | useRpc | - |
| Message Polling | ✓ Complete | ChatView | usePrivateSpaceMessages | list_posts_for_space |

---

## Summary Statistics

| Category | Total | Complete | Partial | Placeholder |
|----------|-------|----------|---------|-------------|
| Navigation | 4 | 3 | 1 | 0 |
| Authentication | 4 | 4 | 0 | 0 |
| Content Creation | 6 | 6 | 0 | 0 |
| Content Viewing | 8 | 7 | 1 | 0 |
| User Interaction | 5 | 5 | 0 | 0 |
| Private Spaces | 8 | 8 | 0 | 0 |
| Moderation | 3 | 3 | 0 | 0 |
| Real-time | 4 | 4 | 0 | 0 |
| **Total** | **42** | **40** | **2** | **0** |

### Incomplete Features

1. **Search Content** (Partial): Client-side filtering only. Server-side full-text search not yet implemented in node.

2. **Search Navigation** (Partial): Works but limited to client-side space name filtering.

---

## PoW Difficulty Reference

| Action | Testnet | Mainnet | Typical Time |
|--------|---------|---------|--------------|
| Identity Creation | 20 | 22 | 5-30 seconds |
| Space Creation | 12 | 22 | 10-60 seconds |
| Thread/Post | 12 | 20 | 10-60 seconds |
| Reply | 8 | 18 | 5-30 seconds |
| Edit | 10 | 18 | 5-30 seconds |
| Engagement/Reaction | 6 | 16 | 2-10 seconds |

---

## RPC Methods Used (Complete List)

### Node Status
- `get_sync_status` - Network sync state
- `get_peers` - Connected peers
- `get_identity_info` - Node identity

### Content Operations
- `list_spaces` - All public spaces
- `list_space_posts` - Threads in space
- `list_space_content` - All space content
- `get_content` - Single content item
- `get_replies` - Reply tree
- `request_content` - Request from network
- `submit_post` - Create thread
- `submit_reply` - Create reply
- `submit_edit` - Edit content
- `create_space` - Create public space

### Engagement
- `submit_engagement` - Reactions/contributions
- `get_pool_for_content` - Pool state
- `get_reactions` - Emoji counts
- `get_user_reactions` - User's reactions

### Media
- `upload_media` - Upload image
- `get_media` - Retrieve image

### Moderation
- `submit_spam_attestation` - Report spam
- `submit_counter_attestation` - Defend content
- `get_spam_status` - Spam flag status

### Private Spaces
- `create_private_space` - Create encrypted space
- `invite_to_space` - Send invite
- `accept_invite` - Accept invite
- `decline_invite` - Decline invite
- `leave_space` - Leave space
- `kick_member` - Remove member
- `get_space_members` - Member list

### DM
- `request_dm` - Request DM
- `accept_dm` - Accept DM request
- `decline_dm` - Decline DM

### Identity
- `update_identity_name` - Set display name
- `get_identity_name` - Get display name
