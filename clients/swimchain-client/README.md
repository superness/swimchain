# @swimchain/client

Portable SwimChain RPC client library for Node.js and browser environments.

## Installation

```bash
npm install @swimchain/client
# or
pnpm add @swimchain/client
```

For signing support (needed for creating content), also install:
```bash
npm install @noble/ed25519
```

## Quick Start

```typescript
import { swimchainTestnet } from '@swimchain/client';

// Create a client connected to local testnet node
const client = swimchainTestnet();
await client.connect();

// List spaces
const { spaces } = await client.listSpaces();
console.log('Spaces:', spaces);

// Get content from a space
const { items } = await client.getSpacePosts(spaces[0].id);
console.log('Posts:', items);
```

## Creating Content

To create content, you need an identity (keypair):

```typescript
import { swimchainTestnet } from '@swimchain/client';

const client = swimchainTestnet();
await client.connect();

// Set your identity (from stored keys)
await client.setIdentity({
  publicKey: '...', // 64 hex chars (32 bytes)
  seed: '...',      // 64 hex chars (32 bytes)
});

// Create a post (PoW is mined automatically)
const result = await client.createPost(
  spaceId,
  'Hello World',
  'This is my first post!',
  {
    onProgress: (attempts, elapsed, rate) => {
      console.log(`Mining: ${attempts} attempts, ${rate.toFixed(1)} H/s`);
    },
  }
);
console.log('Created post:', result.contentId);
```

## API Reference

### Client Factory Functions

- `swimchainTestnet(port?: number)` - Create client for local testnet (default port 19736)
- `swimchainMainnet(port?: number)` - Create client for local mainnet (default port 9736)
- `swimchain(endpoint: string, testnet?: boolean)` - Create client with custom endpoint

### SwimchainClient Methods

#### Connection
- `connect()` - Connect to the node
- `isConnected()` - Check connection status
- `setIdentity(options)` - Set identity for authenticated operations
- `setCustomSigner(signer, publicKeyHex)` - Set custom signer (for WASM)

#### Node Status
- `getInfo()` - Get node info
- `getSyncStatus()` - Get sync status
- `getPeers()` - Get connected peers

#### Content Retrieval
- `listSpaces(options?)` - List discussion spaces
- `getSpaceContent(spaceId, options?)` - Get all content in a space
- `getSpacePosts(spaceId, options?)` - Get only top-level posts
- `getContent(contentId)` - Get single content item
- `getReplies(contentId)` - Get replies to content
- `getReactions(contentId)` - Get reactions to content
- `requestContent(contentId)` - Request content from network

#### Content Creation (with PoW)
- `createPost(spaceId, title, body, options?)` - Create a new post
- `createReply(parentId, body, options?)` - Reply to content
- `engage(contentId, emoji?, options?)` - Engage with content
- `createSpace(name, options?)` - Create a new space

#### Identity & Pools
- `getIdentityLevel(identityId)` - Get identity level
- `getPoolInfo(poolId)` - Get pool info
- `getPoolForContent(contentId)` - Get pool for content

### Low-Level RPC

For advanced use, get the underlying RPC client:

```typescript
const rpc = client.getRpc();
const result = await rpc.call('custom_method', { param: 'value' });
```

## Types

All types are exported for TypeScript:

```typescript
import {
  Space,
  ContentItem,
  ContentType,
  DecayInfo,
  DecayState,
  Reply,
  ReactionCounts,
  NodeInfo,
  SyncStatus,
  PeerInfo,
  // ... and more
} from '@swimchain/client';
```

## PoW Utilities

For manual PoW operations:

```typescript
import {
  createChallenge,
  computePow,
  solutionToRpcParams,
  getDifficulty,
  getPoWConfig,
  ActionType,
} from '@swimchain/client';

// Create challenge
const challenge = await createChallenge(
  ActionType.Post,
  contentBytes,
  authorPubkey,
  getDifficulty(ActionType.Post, true)
);

// Mine solution
const solution = await computePow(
  challenge,
  getPoWConfig(true),
  onProgress,
  isCancelled
);

// Convert to RPC params
const params = solutionToRpcParams(solution);
```

## License

MIT
