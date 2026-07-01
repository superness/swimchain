# SwimChain Forum Client - Feature Catalog

This document describes all features in the forum-client organized by functional groups.

## Quick Links

- **[FEATURE_REVIEW.html](FEATURE_REVIEW.html)** - Interactive review with screenshots, grades, and dev opinions
- **[swimchain-team.md](../../claudeplus/claude-chat/hats/context/swimchain-team.md)** - Team coordination docs

---

## Testing Status (February 5, 2026)

| Feature Group | Grade | Status | Screenshots |
|---------------|-------|--------|-------------|
| Identity & Onboarding | **A** | Fully working | 2 |
| Sponsorship System | **A** | Fully working | 3 |
| **Sponsorship E2E** | **A+** | Two-node test PASSED | 10 |
| Thread View/Create | **B** | Working (bugs fixed) | 21 |
| Private Spaces | **C** | Auth fixed, encryption untested | 13 |
| Chat/Messaging | **B+** | Working, needs polish | 24 |
| Search | **D** | Placeholder only | 14 |
| Node Status | **A** | Working | 1 |
| Space List | **A** | Working | 10 |

**Total: 98 screenshots across 9 feature areas**

### Bugs Fixed This Session

1. **Thread content never loads** - Missing `setFetching(false)` in useRpc.tsx
2. **HTTP 401 auth errors** - Added 6 methods to AUTH_EXEMPT_METHODS in server.rs
3. **Navigation after thread creation** - Fixed async/await in NewThread.tsx

---

## Detailed Feature Documentation

The following features have detailed documentation with screenshots:

| Feature | Documentation |
|---------|---------------|
| Identity Display | [features/identity-display/](features/identity-display/README.md) |
| Sponsorship System | [features/sponsorship/](features/sponsorship/README.md) |
| **Sponsorship E2E (Two-Node)** | [features/sponsorship-e2e/](features/sponsorship-e2e/README.md) |
| Node Status Bar | [features/node-status/](features/node-status/README.md) |
| Space List | [features/space-list/](features/space-list/README.md) |
| Thread View/Create | [features/thread/](features/thread/README.md) |
| Private Spaces | [features/private-spaces/](features/private-spaces/README.md) |
| Chat/Messaging | [features/chat/](features/chat/README.md) |
| Search | [features/search/](features/search/README.md) |

---

## Group 1: Identity & Onboarding

User identity management including creation, import/export, backup, and sponsorship status display.

| Feature | Description |
|---------|-------------|
| **identity-loaded** | Main identity page showing address, public key, sponsored status, and backup/export buttons |
| **identity-sponsored** | Sponsored identity with green badge, sponsor info, and full posting privileges |
| **identity-not-sponsored** | Banner showing "You need a sponsor to post" with link to sponsorship page |
| **identity-backup-modal** | Modal with seed phrase/encrypted export, copy button, and security warning |
| **identity-delete-confirm** | Confirmation modal with strong warning and confirmation input field |

---

## Group 2: Sponsorship System

Full sponsorship lifecycle for enabling users to post content.

| Feature | Description |
|---------|-------------|
| **sponsorship-find-empty** | Empty state when no sponsorship offers are available |
| **sponsorship-find-offers** | List of available offers with sponsor info, slots count, and claim buttons |
| **sponsorship-my-offers-empty** | Empty "My Offers" tab with "Create Offer" button |
| **sponsorship-my-offers** | List of created offers showing slots used/available and view claims button |
| **sponsorship-create-modal** | Modal form with slots, description, public/private toggle |
| **sponsorship-claim-modal** | Modal with sponsor info, message input, and submit claim button |
| **sponsorship-pending-claims** | List of pending claims with approve/reject buttons |
| **sponsorship-status-unsponsored** | Status page showing "Not Sponsored" with limitations explained |
| **sponsorship-status-active** | Active sponsorship status with green indicator and sponsor info |

---

## Group 3: Spaces & Forums

Public space listing, creation, and browsing.

| Feature | Description |
|---------|-------------|
| **spaces-list-empty** | Empty spaces page with "No spaces yet" and create button |
| **spaces-list** | Space cards grid with name, description, thread count, and activity |
| **space-view-empty** | Space page with no threads showing "No threads yet" |
| **space-view-threads** | Space with thread list showing title, preview, author, reply count |
| **space-sort-pagination** | Pagination controls with page numbers, sort dropdown |

---

## Group 4: Threads & Content

Thread viewing, creation, replies, and content types.

| Feature | Description |
|---------|-------------|
| **thread-view** | Thread page with title, body, author info, timestamps, and reply section |
| **thread-with-images** | Thread with image gallery, thumbnails, and click to expand |
| **thread-encrypted-locked** | Locked encrypted content with passphrase prompt |
| **thread-encrypted-unlocked** | Decrypted content visible after entering passphrase |
| **thread-nested-replies** | Deep reply tree with indentation and collapse controls |
| **new-thread-empty** | Thread creation form with title, body, image upload, encryption toggle |
| **new-thread-encryption** | Encryption options with passphrase fields and warning |
| **reply-composer** | Reply form with textarea and submit button |

---

## Group 5: Private Spaces & Chat

Encrypted private spaces with real-time messaging.

| Feature | Description |
|---------|-------------|
| **private-spaces-list** | Private spaces section with lock icons and member count |
| **private-space-create** | Private space creation form with name, description, initial invites |
| **private-space-pending-invites** | Invite notification with accept/decline buttons |
| **private-space-invite-modal** | Invite modal with user search and address input |
| **chat-empty** | Empty chat room with "No messages yet" |
| **chat-with-messages** | Chat with message bubbles, timestamps, and author avatars |

---

## Group 6: Content Health & Decay

Content aging, decay indicators, and spam flagging.

| Feature | Description |
|---------|-------------|
| **content-healthy** | Fresh content with no decay warnings |
| **content-decaying** | Aging content with yellow/orange decay warning |
| **content-spam-flagged** | Spam warning overlay with "Flagged as spam" and hide/show option |

---

## Group 7: Media & Images

Image handling and gallery features.

| Feature | Description |
|---------|-------------|
| **media-thumbnails** | Image thumbnail grid with consistent sizing and click to expand |
| **media-lightbox** | Full-screen lightbox with navigation and zoom controls |
| **media-upload** | Upload interface with drag-and-drop and file picker |

---

## Group 8: Engagement & Reactions

Emoji reactions and engagement features.

| Feature | Description |
|---------|-------------|
| **engagement-reactions** | Reaction badges on content with emoji counts |
| **engagement-emoji-picker** | Emoji picker popup with categories and search |

---

## Group 9: Moderation & Safety

Reporting, blocking, and content moderation.

| Feature | Description |
|---------|-------------|
| **moderation-report-modal** | Report form with reason selection and details textarea |
| **moderation-block-button** | Block controls with "Block User" and "Hide Content" options |
| **moderation-blocklist** | Blocklist management with blocked users and content lists |

---

## Group 10: User Profiles

User profile viewing and editing.

| Feature | Description |
|---------|-------------|
| **profile-own** | Your profile page with display name, bio, avatar, and edit button |
| **profile-other** | Another user's profile with block/report options |
| **profile-edit** | Edit form with display name, bio, and avatar upload |
| **profile-modal** | Popup profile card with quick actions |

---

## Group 11: Search

Content and space search.

| Feature | Description |
|---------|-------------|
| **search-input** | Search page with input field and filter options |
| **search-results** | Results list with highlighted query terms and filters |

---

## Group 12: Settings & Debug

App configuration and developer tools.

| Feature | Description |
|---------|-------------|
| **settings-main** | Settings sections with node connection, preferences, blocklist |
| **settings-debug** | Debug panel with RPC status and request logs |

---

## Group 13: UI Shell & Components

Persistent UI elements and states.

| Feature | Description |
|---------|-------------|
| **ui-header** | App header with logo, navigation, user avatar, search icon |
| **ui-sidebar** | Navigation sidebar with home, spaces, profile, settings links |
| **ui-status-connected** | Connection status with green indicator |
| **ui-status-offline** | Offline status with red indicator and retry button |
| **ui-toast-success** | Green success notification toast |
| **ui-toast-error** | Red error notification toast |
| **ui-loading** | Loading indicators with skeleton screens and spinners |
| **ui-avatar** | User avatar component with image or initials |
