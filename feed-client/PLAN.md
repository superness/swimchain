# Feed-Client Improvement Plan

## Overview

Bring feed-client to feature parity with forum-client and chat-client. The feed-client is a social media feed aggregator that currently has basic feed display and identity management, but lacks many core features for content creation, moderation, and user interaction.

---

## Current State

### What Feed-Client Has
- ✅ Feed display with infinite scroll
- ✅ Discover page (browse spaces)
- ✅ Identity creation with PoW mining
- ✅ Follow/mute spaces and users
- ✅ Save posts locally
- ✅ Basic avatar generation
- ✅ Mobile responsive layout
- ✅ Loading skeletons
- ✅ Error boundaries

### What Feed-Client Is Missing
- ✅ Content creation (posts, comments) - Phase 1
- ✅ Blocklist system - Phase 4
- ✅ Report/moderation system - Phase 4
- ✅ User profiles - Phase 3
- ✅ Image upload - Phase 2
- ✅ Reactions - Phase 5
- ❌ Search
- ❌ Encryption support
- ❌ Toast notifications
- ❌ Debug panel
- ❌ Node status bar

---

## Phase 1: Core Content Features (CRITICAL) - COMPLETE

### 1.1 Post Creation
- [x] Create `pages/Compose.tsx` - Post creation form
- [x] Port `usePostPow.ts` - Created `hooks/useActionPow.ts` with usePostPow, useReplyPow, etc.
- [x] Export `usePostSubmit` from useRpc (already existed)
- [x] Add image attachment support (included in Compose.tsx)
- [x] Wire up `/compose` route

### 1.2 Post Detail View
- [x] Create `pages/Post.tsx` - Single post view with replies
- [x] Export `useThread` from useRpc (already existed)
- [x] Export `useReplies` from useRpc (already existed)
- [x] Wire up `/post/:postId` route

### 1.3 Comment/Reply System
- [x] Port `useReplyPow` - Created in `hooks/useActionPow.ts`
- [x] Export `useReplySubmit` from useRpc (already existed)
- [x] Add reply UI to Post page (ReplyComposer component)
- [ ] Add reply count to FeedCard (minor enhancement for later)

---

## Phase 2: Media & Images - COMPLETE

### 2.1 Image Upload
- [x] `useMediaUpload` already exists in useRpc.tsx
  - `uploadImage()` - Upload to node storage
  - `compressAndUpload()` - Compress before upload
  - `getMediaUrl()` - Retrieve media URL from hash
- [x] Add image picker to Compose page (done in Phase 1)
- [x] Add image preview before posting (done in Phase 1)

### 2.2 Image Gallery Enhancement
- [x] Port `ImageGallery.tsx` with lightbox feature
- [x] Add keyboard navigation (arrows, Escape)
- [x] Add fullscreen viewer (lightbox overlay)
- [x] Update FeedCard to use ImageGallery
- [x] Add ImageThumbnailIndicator for compact mode

---

## Phase 3: User Profiles - COMPLETE

### 3.1 Profile Fetching
- [x] Port `useUserProfile.ts` from chat-client
- [x] Port `useUserProfiles.ts` for batch fetching
- [x] Add profile caching (1-minute TTL)

### 3.2 Profile UI
- [x] Create `pages/Profile.tsx` - User profile page
- [x] Create `UserProfileModal.tsx` for quick profile view
- [x] Wire up `/profile/:userPk` route
- [x] Add click-to-profile on FeedCard author (already linked)
- [x] Display name, bio, website, avatar

### 3.3 Own Profile Management
- [x] Create profile edit UI (in Profile.tsx)
- [x] Port profile update RPC calls
- [x] Wire up `/profile` route (own profile)

---

## Phase 4: Blocklist & Moderation - COMPLETE

### 4.1 Blocklist System
- [x] Port `useBlocklist.ts` from chat-client
  - Block types: user, post, space, reply
  - localStorage persistence
  - O(1) lookups with Set caching
- [x] FilterBlocked utility for feed filtering
- [x] Integrated into FeedCard via menu dropdown
- [ ] Filter blocked users from discovery (integrate into UI)

### 4.2 Block UI
- [x] Port `BlockButton.tsx` - Icon/text/menu variants
- [x] Port `BlocklistManager.tsx` - Manage blocked items
- [x] Add block option to FeedCard menu
- [ ] Add block option to UserProfileModal (integration task)

### 4.3 Report System
- [x] Port `ReportModal.tsx` with spam reasons
- [x] Spam attestation hooks (useSpamReport, useSpamStatus) already in useRpc
- [x] SpamBadge component for showing flagged content
- [x] Add report option to FeedCard menu
- [ ] Auto-block on harassment reports (future enhancement)

---

## Phase 5: Reactions & Engagement - COMPLETE

### 5.1 Reaction System
- [x] Port `useEngagementPow.ts` for reaction PoW (in useActionPow.ts)
- [x] `usePoolContribution` already exists in useRpc.tsx (engagement submission)
- [x] `useReactions` hook for fetching reaction counts (already in useRpc.tsx)
- [x] Create `ReactionPicker.tsx` - Emoji picker with keyboard navigation
- [x] Create `ReactionDisplay.tsx` - Simple reaction count display
- [x] Integrate ReactionPicker into FeedCard

### 5.2 Engagement Display
- [x] FeedCard already shows heat via decay indicator
- [x] Decay state visualization in FeedCard
- [x] Integrate reaction counts into FeedCard

---

## Phase 6: Search - COMPLETE

### 6.1 Local Search
- [x] Add search input to feed page header
- [x] Filter feed by content/author/space
- [x] Keyboard shortcut (Cmd/Ctrl+K)
- [x] Escape to clear search
- [x] Real-time filtering without refetch
- [x] "No results" empty state

### 6.2 Global Search (Optional - Future)
- [ ] Integrate with `search` RPC method
- [ ] Search results page
- [ ] Search by space, user, content

---

## Phase 7: Polish & UX - COMPLETE

### 7.1 Toast Notifications
- [x] Port `Toast.tsx` and `Toast.css` from chat-client
- [x] Add ToastProvider to App
- [x] Add feedback for:
  - [x] Post creation success/failure
  - [x] Block actions (user/post)
  - [x] Save/unsave actions
  - [x] Settings changes

### 7.2 Debug Panel
- [x] Port `DebugPanel.tsx` and `DebugPanel.css`
- [x] Add to Settings page
- [x] Show node status, peers, sync info

### 7.3 Node Status Bar
- [x] Port `NodeStatusBar.tsx` and CSS
- [x] Show peer count, RPC status
- [x] Tauri desktop integration (auto-hides when not in Tauri)

### 7.4 Settings Page
- [x] Create `pages/Settings.tsx`
- [x] Feed preferences (compact mode, show replies, sort order)
- [x] Blocklist manager integration
- [x] Debug panel access
- [x] Wire up `/settings` route

---

## Phase 8: Encryption - COMPLETE

### 8.1 Private Spaces Support
- [x] Port `lib/encryption.ts` - Already exists with full implementation
- [x] Port `lib/encryption-worker.ts` - PBKDF2 Web Worker
- [x] Port `usePrivateSpaceKeys.ts` - IndexedDB key storage
- [x] Port `usePassphraseStore.ts` - Passphrase localStorage cache
- [x] Encrypted content detection and display (`EncryptedContent.tsx`)
- [x] EncryptedBadge, DecryptedBadge, InlineUnlock components

### 8.2 Private Space Creation
- [x] Port `lib/x25519.ts` - X25519 key exchange for key sharing
- [x] Port `CreatePrivateSpace.tsx` - Space creation UI with encryption
- [x] Port `InviteModal.tsx` - Invite system UI
- [x] Add `/create-private-space` route
- [x] Key sharing flow via X25519 box encryption

---

## Files to Port from chat-client

```
chat-client/src/                    feed-client/src/              Priority   Status
├── lib/
│   ├── encryption.ts            → lib/encryption.ts              P8         ✓ Done
│   ├── encryption-worker.ts     → lib/encryption-worker.ts       P8         ✓ Done
│   ├── x25519.ts                → lib/x25519.ts                  P8         ✓ Done
│   ├── profile.ts               → lib/profile.ts                 P3         ✓ Done
│   └── avatar.ts                → (exists, enhance)              -          -
├── hooks/
│   ├── useBlocklist.ts          → hooks/useBlocklist.ts          P4         ✓ Done
│   ├── useUserProfile.ts        → hooks/useUserProfile.ts        P3         ✓ Done
│   ├── useUserProfiles.ts       → hooks/useUserProfiles.ts       P3         ✓ Done
│   ├── usePostPow.ts            → hooks/useActionPow.ts          P1         ✓ Done
│   ├── useReplyPow.ts           → hooks/useActionPow.ts          P1         ✓ Done
│   ├── useEngagementPow.ts      → hooks/useActionPow.ts          P5         ✓ Done
│   ├── usePostSubmit.ts         → hooks/useRpc.tsx (exists)      P1         ✓ Done
│   ├── useReplySubmit.ts        → hooks/useRpc.tsx (exists)      P1         ✓ Done
│   ├── useThread.ts             → hooks/useRpc.tsx (exists)      P1         ✓ Done
│   ├── useReplies.ts            → hooks/useRpc.tsx (exists)      P1         ✓ Done
│   ├── useMediaUpload.ts        → hooks/useRpc.tsx (exists)      P2         ✓ Done
│   ├── usePassphraseStore.ts    → hooks/usePassphraseStore.ts    P8         ✓ Done
│   └── usePrivateSpaceKeys.ts   → hooks/usePrivateSpaceKeys.ts   P8         ✓ Done
├── components/
│   ├── BlockButton.tsx          → components/BlockButton.tsx     P4         ✓ Done
│   ├── BlocklistManager.tsx     → components/BlocklistManager.tsx P4         ✓ Done
│   ├── ReportModal.tsx          → components/ReportModal.tsx     P4         ✓ Done
│   ├── ImageGallery.tsx         → components/ImageGallery.tsx    P2         ✓ Done
│   ├── UserProfileModal.tsx     → components/UserProfileModal.tsx P3         ✓ Done
│   ├── Toast.tsx                → components/Toast.tsx           P7         ✓ Done
│   ├── NodeStatusBar.tsx        → components/NodeStatusBar.tsx   P7         ✓ Done
│   ├── DebugPanel.tsx           → components/DebugPanel.tsx      P7         ✓ Done
│   ├── EncryptedContent.tsx     → components/EncryptedContent.tsx P8         ✓ Done
│   └── InviteModal.tsx          → components/InviteModal.tsx     P8         ✓ Done
└── pages/
    └── (create new pages)       → pages/Compose.tsx              P1         ✓ Done
                                 → pages/Post.tsx                 P1         ✓ Done
                                 → pages/Profile.tsx              P3         ✓ Done
                                 → pages/Space.tsx                P3         -
                                 → pages/Settings.tsx             P7         ✓ Done
                                 → pages/CreatePrivateSpace.tsx   P8         ✓ Done
```

---

## Progress Tracking

| Phase | Description | Status | Completion |
|-------|-------------|--------|------------|
| Phase 1 | Core Content Features | Complete | 95% |
| Phase 2 | Media & Images | Complete | 100% |
| Phase 3 | User Profiles | Complete | 100% |
| Phase 4 | Blocklist & Moderation | Complete | 95% |
| Phase 5 | Reactions & Engagement | Complete | 100% |
| Phase 6 | Search | Complete | 100% |
| Phase 7 | Polish & UX | Complete | 100% |
| Phase 8 | Encryption | Complete | 100% |

**Overall Progress: 100%**

---

## Implementation Notes

### Dependencies
- Feed-client uses `@swimchain/frontend` package (same as chat-client)
- WASM modules loaded via SwimchainProvider
- RPC client pattern similar to chat-client

### Key Differences from Chat-Client
- Feed-client is feed-focused (aggregated content from followed sources)
- Chat-client is channel-focused (real-time messaging in specific channels)
- Feed-client has follow/mute system for content curation
- Feed-client displays decay state prominently

### Testing Considerations
- Test with local node running
- Verify PoW mining works in browser
- Test image upload size limits (1MB max)
- Verify blocklist persistence across sessions

---

## Notes

- Priority order: P1 (Critical) → P8 (Future)
- Phases 1-4 are essential for MVP
- Phase 5-7 improve UX significantly
- Phase 8 is for future private content support
- Port code from chat-client where possible to maintain consistency
