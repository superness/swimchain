# Chat & Private Spaces Feature

Documentation for SwimChain's real-time chat and private messaging functionality.

## Overview

SwimChain provides encrypted private spaces for real-time messaging. These spaces use end-to-end encryption where only members with the space key can read messages.

## Feature Components

### 1. Private Spaces Tab
- Located in the sidebar under the "Private" tab
- Shows list of joined private spaces
- "Create Private Space" button for new rooms

![Private Spaces Empty](private-spaces-empty.png)

### 2. Create Private Space Form
- Space Name input (encrypted, only visible to members)
- End-to-end encryption notice
- Creates a new private chat room

![Create Private Space Form](create-private-space-form.png)

### 3. Chat Room Interface
The chat interface includes:
- Room header with name and member count
- Invite button to add members
- Settings button (gear icon)
- Members list toggle
- Message area with "No messages yet" empty state
- Message input with send button

![Chat Empty State](chat-empty.png)

### 4. Message Composer
- Text input: "Type a message..."
- Send button (paper airplane icon)
- Supports real-time messaging when properly authenticated

![Typing Message](typing-message.png)

## Technical Details

### Authentication Flow
1. User must have a stored identity (seed/keypair in localStorage)
2. Identity is used to sign RPC requests
3. Unsponsored identities can create/view private spaces but may have limited posting

### Encryption
- Messages encrypted with space key using AES-GCM
- Space key shared via X25519 key exchange
- Only members with the space key can decrypt content

### Components (forum-client)
- `ChatView.tsx` - Main chat interface
- `usePrivateSpaceMessages.ts` - Message fetching hook
- `usePrivateSpaceKeys.ts` - Space key management
- `encryption.ts` - E2E encryption utilities

### Components (chat-client - Discord-style)
- `Chat.tsx` - Server/channel/chat combined view
- `ServerList.tsx` - Server sidebar
- `ChannelSidebar.tsx` - Channel list per server
- `ChatArea.tsx` - Message display area
- `ChatMessageInput.tsx` - Message composition

## Routes

| Route | Description |
|-------|-------------|
| `/chat/:spaceId` | Chat view for a specific private space |
| `/spaces` (Private tab) | List of private spaces |
| `/create-private-space` | Create new private space |

## Requirements

- Stored identity in browser localStorage
- For full functionality: sponsored identity
- RPC connection to swimchain node

## Known Issues

1. Private space creation requires PoW (may need sponsorship)
2. Sending messages in private spaces requires proper key exchange
3. Identity must be explicitly imported (not auto-created)

## Screenshots Reference

| Screenshot | Description |
|------------|-------------|
| `main-page.png` | Initial page with auth required |
| `private-tab.png` | Private tab with HTTP 401 error |
| `identity-page.png` | Node identity management |
| `import-identity-modal.png` | Import identity form |
| `after-import.png` | Authenticated view with spaces |
| `private-spaces-empty.png` | Empty private spaces list |
| `create-private-space-form.png` | Create space form |
| `chat-empty.png` | Chat room with no messages |
| `typing-message.png` | Message input in use |
