# Chat-Client Improvement Plan

## Overview
Align chat-client with forum-client's functional features while removing unnecessary Discord-style UI elements.

---

## Phase 1: Remove Discord Fluff (COMPLETED)

### Voice/Premium Features
- [x] `ChannelSidebar.tsx` - Removed Mute/Deafen buttons and #0000 discriminator
- [x] `ChatMessageInput.tsx` - Removed Gift/Nitro, GIF picker, and attachment buttons

### Non-Functional UI Elements
- [x] `ChatArea.tsx` - Removed header toolbar buttons (threads, pinned, members, inbox, help)
- [x] `MessageItem.tsx` - Simplified message actions toolbar (removed non-functional "More" button)

### Discord Branding
- [x] `ServerList.tsx` - Replaced Discord "blurple" colors with Swimchain palette
- [x] `ServerList.tsx` - Removed "Add server" / "Explore servers" buttons
- [x] `ServerList.tsx` - Removed notification ping/unread badges
- [x] `ServerList.tsx` - Replaced Discord logo with generic home icon

---

## Phase 2: Add Core Functional Features (IN PROGRESS)

### High Priority

#### E2E Encryption (Port from forum-client)
- [x] Port `lib/encryption.ts` - PBKDF2 key derivation, AES-GCM encrypt/decrypt
- [x] Port `lib/encryption-worker.ts` - Web Worker for non-blocking key derivation
- [x] Port `hooks/usePrivateSpaceKeys.ts` - Store/retrieve channel keys (uses @swimchain/frontend)
- [x] Port `hooks/usePrivateChannelMessages.ts` - Decrypt messages (uses @swimchain/frontend)
- [x] Add encryption UI for creating private channels (CreatePrivateChannel page)
- [x] Add key-wrapped invite system (InviteModal component)

#### Blocklist System (Port from forum-client)
- [x] Port `hooks/useBlocklist.ts` - Block users, messages
- [x] Port `components/BlockButton.tsx` - Block UI with menu
- [x] Port `components/BlocklistManager.tsx` - Manage blocked items
- [x] Filter blocked content from message display
- [x] Integrate into Settings page

#### Image Upload
- [x] Port `components/ImageGallery.tsx` - Image gallery with lightbox
- [x] Add image display in `MessageItem.tsx`
- [x] Add image preview in `ChatMessageInput.tsx` (UI only)
- [x] Wire up image upload in Chat.tsx sendMessage handler
- [x] Port image upload logic from forum-client's `useRpc.tsx` (useMediaUpload hook)

### Medium Priority

#### Node Status Bar
- [x] Port `components/NodeStatusBar.tsx` from forum-client
- [x] Port `components/NodeStatusBar.css` - Styling
- [x] Add to chat layout (integrate with main App)

#### User Avatar
- [x] Port `lib/avatar.ts` - Avatar color/initials generation
- [x] Port `components/UserAvatar.tsx` - Avatar component
- [x] Port `components/UserAvatar.css` - Styling

#### Search
- [x] Add search input to header (Cmd/Ctrl+K shortcut)
- [x] Local message filtering by content/author
- [x] Backend `search` RPC available for global search (optional enhancement)

#### User Profiles
- [x] Port `hooks/useUserProfile.ts` (gracefully handles missing RPC)
- [x] Create user profile modal/page (UI component)
- [x] Wire up profile modal on user avatar click (in MessageItem.tsx)
- [x] Implement `get_user_profile` RPC on backend

#### Content Reporting
- [x] Port `components/ReportModal.tsx` - Report dialog with reasons
- [x] Add report option to message actions (UI wired up)
- [x] Wire up onReport handler in Chat.tsx (with auto-block for harassment)
- [x] Implement spam attestation submission via RPC (`submit_spam_attestation`)

### Low Priority

#### Space/Channel Creation PoW
- [x] Add PoW requirement for creating new channels
- [x] Port `useSpaceCreationPow` from forum-client (added as `useChannelCreationPow`)

#### Keyboard Shortcuts
- [x] Add Cmd/Ctrl+K for search focus
- [x] Add Escape to clear search
- [ ] Add keyboard navigation (message selection, etc.)

---

## Phase 3: Polish & Parity

- [ ] Ensure consistent styling with forum-client
- [x] Add loading states and error handling (Toast notification system)
- [x] Add debug panel for developers (DebugPanel component)
- [x] Mobile responsive improvements (responsive CSS, mobile nav)
- [x] Accessibility improvements (ARIA labels, skip links, keyboard nav)

---

## Files Ported from forum-client

```
forum-client/src/                    chat-client/src/              Status
├── lib/
│   ├── encryption.ts            → lib/encryption.ts              ✓ DONE
│   ├── encryption-worker.ts     → lib/encryption-worker.ts       ✓ DONE
│   └── (profile.ts simplified)  → lib/avatar.ts                  ✓ DONE
├── hooks/
│   ├── useBlocklist.ts          → hooks/useBlocklist.ts          ✓ DONE
│   ├── useUserProfile.ts        → hooks/useUserProfile.ts        ✓ DONE
│   ├── usePrivateSpaceKeys.ts   → hooks/usePrivateSpaceKeys.ts   ✓ DONE (via @swimchain/frontend)
│   └── usePrivateSpaceMessages.ts → hooks/usePrivateChannelMessages.ts ✓ DONE (via @swimchain/frontend)
├── components/
│   ├── BlockButton.tsx          → components/BlockButton.tsx     ✓ DONE
│   ├── BlocklistManager.tsx     → components/BlocklistManager.tsx ✓ DONE
│   ├── ImageGallery.tsx         → components/ImageGallery.tsx    ✓ DONE
│   ├── NodeStatusBar.tsx        → components/NodeStatusBar.tsx   ✓ DONE
│   ├── ReportModal.tsx          → components/ReportModal.tsx     ✓ DONE
│   ├── UserAvatar.tsx           → components/UserAvatar.tsx      ✓ DONE
│   ├── UserProfileModal.tsx     → components/UserProfileModal.tsx ✓ DONE
│   └── InviteModal.tsx          → components/InviteModal.tsx     ✓ DONE
└── pages/
    ├── CreatePrivateSpace.tsx   → pages/CreatePrivateChannel.tsx ✓ DONE
    └── Profile.tsx              → pages/                         TODO
```

---

## Progress Tracking

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Remove Fluff | Completed | 100% |
| Phase 2: Core Features | Completed | 100% |
| Phase 3: Polish | In Progress | 80% |

**Note:** All core features implemented. Backend RPC methods (`get_user_profile`, `submit_spam_attestation`, `search`) are ready. Phase 3 mostly complete with toast notifications, debug panel, mobile responsiveness, and accessibility improvements done.

---

## Notes

- Forum-client is the reference implementation for features
- Chat-client should maintain its real-time UX strengths (typing indicators, presence)
- Encryption is the highest priority missing feature
- All features should work within Tauri desktop app context
