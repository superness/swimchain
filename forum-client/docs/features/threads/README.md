# Threads & Content

**Feature Group**: Threads & Content
**Route**: `/spaces/:spaceId/threads/:threadId`, `/spaces/:spaceId/new-thread`

## Overview

The Threads feature enables users to create, view, and reply to discussion threads within spaces. Threads support text content, images, nested replies, and optional encryption for private discussions.

## Screenshots (Captured 2026-02-05)

### Space View with Thread List

![Space View](space-view.png)

The space view displays:
- **Space Header**: Space name with post count
- **Sort Options**: Newest, Oldest, Most Replies, Most Active
- **Thread List**: Shows title, author, reply count, activity timestamp
- **New Thread Button**: Navigate to thread creation

### New Thread Form (Empty)

![New Thread Empty](new-thread-empty.png)

The thread creation form includes:
- **Breadcrumb**: Navigation path (Spaces / Space Name / New Thread)
- **Title Input**: Placeholder "What's this about?"
- **Content Editor**: Textarea with "Write your post..." placeholder
- **Image Upload**: "Add Image" button (0/4 images, max 1MB each)

### New Thread Form (Full View)

![New Thread Full](new-thread-full.png)

Additional form elements visible after scrolling:
- **Encryption Toggle**: "Encrypt this post" checkbox with lock icon
- **Action Buttons**: Cancel and Create Thread
- **PoW Notice**: "Creating a thread requires proof-of-work mining (~60 seconds)"

### Thread Creation with PoW Mining

![Thread Creating](thread-creating.png)

During thread submission:
- **Mining Status**: "Mining Proof-of-Work" message
- **Visual Indicator**: Animated hexagonal/cube icon
- **Disabled Form**: Input fields grayed out during mining

## Known Bugs (Found During Testing)

### BUG 1: Thread Content Not Loading from Network
**Severity**: High
**Description**: Thread titles display "(Loading from network...)" indefinitely. Content never resolves even after extended wait times.

![Loading Issue](space-view-loaded.png)

**Reproduction Steps**:
1. Navigate to a space with existing threads
2. Observe thread list showing "(Loading from network...)"
3. Content never loads even with stable network (9 peers, synced)

### BUG 2: HTTP 401 Authentication Errors (Root Cause Identified)
**Severity**: Critical
**Description**: JSON-RPC calls fail with `{"code":-32001,"message":"Authentication required"}` when no browser identity exists in localStorage.

![Auth Error](spaces-reconnected.png)

**Root Cause Analysis** (2026-02-05):
The forum-client uses signature-based authentication that requires either:
1. A stored browser identity (seed + publicKey in localStorage key `swimchain-identity`)
2. Remote signing via the node's identity

The `useNodeIdentity` hook sets up remote signing, but depends on the RPC being connected first. This creates a chicken-and-egg problem:
- RPC client needs auth to connect
- Remote signing setup needs RPC to be connected
- Fresh browser sessions have neither

**Technical Details**:
- Location: `forum-client/src/hooks/useRpc.tsx` and `useNodeIdentity.tsx`
- The `get_identity_info` and `sign_message` RPC methods should NOT require authentication since they ARE the authentication bootstrap mechanism

**Reproduction Steps**:
1. Open forum-client in fresh browser session (no localStorage)
2. Navigate to /spaces
3. Observe "Unable to Load Spaces - Authentication required" error
4. Auth errors appear even though node has valid identity

**Workaround**: Import an identity via the Identity page (if the page itself doesn't require auth)

### BUG 3: Unexpected Navigation After Thread Creation
**Severity**: Medium
**Description**: After thread creation with PoW mining, the app navigates away from the expected thread view to unrelated pages (Private Spaces, Identity Settings).

**Reproduction Steps**:
1. Fill in thread creation form
2. Click "Create Thread"
3. Wait for PoW mining to complete
4. App navigates to unexpected page instead of showing the new thread

### BUG 4: Thread View Stuck on "Fetching content from network..."
**Severity**: High
**Description**: When clicking on a thread to view it, the content page shows "Fetching content from network... This may take a few seconds" but never loads.

![Thread View Loading](thread-view.png)

**Reproduction Steps**:
1. Click on a thread in the thread list
2. Thread view shows "Fetching content from network..."
3. Content never appears even after 30+ seconds

## UI Components

### Thread View (Expected)

The main thread page should display:
- **Title**: Thread title at the top
- **Author Info**: Author avatar, address, and timestamp
- **Body Content**: Full thread content with markdown support
- **Engagement**: Reaction counts and engagement indicators
- **Reply Section**: Nested replies below the main content

### Nested Replies (Expected)

Reply threading features:
- **Indentation**: Visual hierarchy showing reply depth
- **Collapse Controls**: Expand/collapse reply subtrees
- **Reply Button**: Reply to any comment in the tree
- **Author Info**: Each reply shows author avatar and address

### Thread with Images (Expected)

Image gallery features:
- **Thumbnail Grid**: Consistent sizing for image previews
- **Lightbox**: Click to view full-size images
- **Navigation**: Arrow keys to browse multiple images
- **Download**: Option to save images locally

### Encrypted Threads (Expected)

Encrypted content protection:
- **Lock Icon**: Visual indicator of encrypted content
- **Passphrase Prompt**: Input field to unlock content
- **Warning Banner**: Explains content is encrypted

## Technical Details

- Content stored as Swimchain content actions with merkle tree references
- Images chunked and stored with content hashes
- Encryption uses AES-256-GCM with key derived from passphrase
- Replies link to parent via `parent_hash` field
- PoW difficulty scales with content size

## Related Features

- Spaces & Forums
- Content Health & Decay
- Media & Images
- Engagement & Reactions
