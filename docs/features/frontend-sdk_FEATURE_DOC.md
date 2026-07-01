# Frontend SDK (`@swimchain/frontend`)

**Feature ID**: 14
**Status**: Complete
**Owner Area**: `swimchain-frontend/`
**Package**: `@swimchain/frontend@0.1.0`

## Overview

The Frontend SDK provides shared React components, hooks, providers, and utility functions for building Swimchain client applications. It handles WASM initialization, identity management, proof-of-work mining, and content encryption.

## Architecture

```
swimchain-frontend/
├── src/
│   ├── index.ts              # Main entry point
│   ├── components/           # React UI components
│   │   ├── WaveLoader.tsx    # Loading animation + PageTransition
│   │   ├── PowProgress.tsx   # PoW mining progress display
│   │   ├── AddressDisplay.tsx# Address with copy button
│   │   └── IdentityCard.tsx  # Identity display card
│   ├── hooks/                # React hooks
│   │   ├── useKeypair.ts     # In-memory keypair generation
│   │   ├── usePow.ts         # Identity PoW mining state
│   │   ├── useStoredIdentity.ts # localStorage identity
│   │   └── useStoredKeypair.ts  # Bridge stored identity to WASM
│   ├── providers/            # React context providers
│   │   ├── SwimchainProvider.tsx # WASM initialization
│   │   └── IdentityProvider.tsx  # Global identity context
│   ├── lib/                  # Utility functions
│   │   ├── action-pow.ts     # Argon2id Action PoW
│   │   └── encryption.ts     # AES-GCM content encryption
│   ├── wasm/                 # WASM bindings
│   │   ├── loader.ts         # WASM initialization
│   │   ├── chainsocial_wasm.js
│   │   ├── chainsocial_wasm.d.ts
│   │   └── chainsocial_wasm_bg.wasm
│   └── types/
│       └── index.ts          # TypeScript type definitions
└── package.json
```

---

## Data Structures

### StoredIdentity

```typescript
interface StoredIdentity {
  /** cs1... bech32m address */
  address: string;
  /** Hex-encoded public key */
  publicKey: string;
  /** Hex-encoded seed (for signing RPC requests) */
  seed: string;
  /** Unix timestamp of creation */
  createdAt: number;
  /** Optional stored PoW solution */
  powSolution?: {
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}
```

**Purpose**: Persisted identity data stored in localStorage
**Used by**: `useStoredIdentity`, `useStoredKeypair`, `IdentityProvider`, `IdentityCard`

### Space

```typescript
interface Space {
  id: string;          // sp1... format
  name: string;        // Display name
  icon: string;        // Emoji or URL
  memberCount: number;
  onlineCount: number;
  unreadCount: number;
  category: string;    // For sidebar grouping
}
```

**Purpose**: Represents a channel/space in the chat context
**Used by**: Client applications for space navigation

### Message

```typescript
interface Message {
  id: string;                    // sha256:<hex> content hash
  authorAddress: string;         // cs1... address
  content: string;
  createdAt: number;             // Unix timestamp
  lastEngagement: number;
  heatPercent: number;           // 0-100
  poolCurrent: number;           // Seconds contributed
  poolTarget: number;            // Always 60
  replyCount: number;
  parentId: string | null;
  spaceId: string;
  reactions: MessageReactions;
}
```

**Purpose**: Chat message with engagement/decay metadata
**Used by**: Chat and forum client message rendering

### DecayInfo

```typescript
interface DecayInfo {
  state: 'protected' | 'active' | 'stale' | 'decayed';
  survivalProbability: number;
  isProtected: boolean;
  secondsUntilDecayStarts: number | null;
  secondsUntilPruned: number | null;
  timeSinceEngagement: number;
}
```

**Purpose**: Content decay state for heat-based rendering
**Used by**: Content components for visual decay effects

### PoWChallenge (Action PoW)

```typescript
interface PoWChallenge {
  actionType: ActionType;
  contentHash: Uint8Array;  // 32 bytes
  authorId: Uint8Array;     // 32 bytes (public key)
  timestamp: number;        // Unix seconds
  difficulty: number;       // Leading zero bits required
  nonceSpace: Uint8Array;   // 8 bytes random
}
```

**Purpose**: Challenge structure for Argon2id action PoW
**Used by**: `lib/action-pow.ts` for post/reply mining

### WasmKeypair

```typescript
class WasmKeypair {
  constructor();                        // Generate new random keypair
  static fromSeed(seed: Uint8Array): WasmKeypair;
  publicKey(): Uint8Array;              // 32-byte Ed25519 public key
  seed(): Uint8Array;                   // 32-byte seed (private key)
  address(): string;                    // Bech32m cs1... address
  sign(message: Uint8Array): Uint8Array; // 64-byte signature
  free(): void;                         // Release WASM memory
}
```

**Purpose**: WASM-backed Ed25519 keypair for cryptographic operations
**Used by**: `useKeypair`, `useStoredKeypair`, identity creation flows

---

## Public APIs

### Providers

#### SwimchainProvider

```typescript
interface SwimchainProviderProps {
  children: ReactNode;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  fallback?: ReactNode;
}

function SwimchainProvider(props: SwimchainProviderProps): JSX.Element
```

**Purpose**: Initialize WASM module and provide loading state context
**Called from**: Root of all Swimchain client applications
**Side effects**: Loads WASM binary, sets `isLoaded` state

```tsx
// Usage
<SwimchainProvider fallback={<WaveLoader text="Loading..." />}>
  <App />
</SwimchainProvider>
```

#### useSwimchain

```typescript
interface SwimchainContextValue {
  isLoaded: boolean;
  loadError: Error | null;
}

function useSwimchain(): SwimchainContextValue
```

**Purpose**: Access WASM loading state
**Called from**: Components that need WASM operations

#### IdentityProvider

```typescript
interface IdentityContextValue {
  identity: StoredIdentity | null;
  isLoading: boolean;
  hasValidIdentity: boolean;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
}

function IdentityProvider({ children }: { children: ReactNode }): JSX.Element
```

**Purpose**: Global identity state management with localStorage persistence
**Called from**: App root, wraps components that need identity access
**Side effects**: Reads/writes to `localStorage['swimchain-identity']`

### Hooks

#### useKeypair

```typescript
interface UseKeypairResult {
  keypair: WasmKeypair | null;
  address: string | null;
  generate: () => void;
  clear: () => void;
}

function useKeypair(): UseKeypairResult
```

**Purpose**: Generate ephemeral in-memory keypairs
**Called from**: Identity creation flows
**Side effects**: Allocates/frees WASM memory

```tsx
// Usage
const { keypair, address, generate } = useKeypair();
useEffect(() => { generate(); }, []);
```

#### usePow

```typescript
type PowState = 'idle' | 'initializing' | 'mining' | 'complete' | 'cancelled' | 'error';

interface PowSolution {
  nonce: bigint;
  timestamp: bigint;
  elapsedMs: number;
}

interface UsePowResult {
  state: PowState;
  solution: PowSolution | null;
  attempts: number;
  elapsedMs: number;
  mine: (publicKey: Uint8Array, difficulty: number) => void;
  cancel: () => void;
  reset: () => void;
}

function usePow(): UsePowResult
```

**Purpose**: SHA-256 identity proof-of-work mining with state tracking
**Called from**: Identity creation flows
**Side effects**: Blocking CPU-intensive mining

#### useStoredIdentity

```typescript
interface UseStoredIdentityResult {
  identity: StoredIdentity | null;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
  isLoading: boolean;
}

function useStoredIdentity(): UseStoredIdentityResult
```

**Purpose**: Read/write identity from localStorage
**Called from**: Components needing identity persistence
**Side effects**: localStorage read on mount, write on setIdentity

#### useStoredKeypair

```typescript
interface UseStoredKeypairResult {
  keypair: WasmKeypair | null;
  publicKey: Uint8Array | null;
  address: string | null;
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
}

function useStoredKeypair(): UseStoredKeypairResult
```

**Purpose**: Bridge stored identity seed to live WASM Keypair for signing
**Called from**: RPC request signing, content submission
**Side effects**: Creates WASM Keypair from stored seed

### Components

#### WaveLoader

```typescript
interface WaveLoaderProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  fullScreen?: boolean;
  color?: string;  // CSS color value
}

function WaveLoader(props: WaveLoaderProps): JSX.Element
```

**Purpose**: Animated water wave loading indicator
**Called from**: Loading states throughout applications

| Size | Container Dimensions |
|------|---------------------|
| small | 48x48px |
| medium | 80x80px (default) |
| large | 120x120px |

#### PageTransition

```typescript
interface PageTransitionProps {
  active: boolean;
  direction?: 'up' | 'down';
  onComplete?: () => void;
}

function PageTransition(props: PageTransitionProps): JSX.Element | null
```

**Purpose**: SVG wave animation for page transitions
**Called from**: Route transitions, modal opens

#### PowProgress

```typescript
interface PowProgressProps {
  attempts: number;
  elapsedMs: number;
  difficulty: number;
  onCancel: () => void;
}

function PowProgress(props: PowProgressProps): JSX.Element
```

**Purpose**: Display PoW mining progress with stats and educational tips
**Called from**: Identity creation during mining phase

**Features**:
- 3D rotating cube animation
- Real-time attempts, elapsed time, hash rate display
- Progress bar based on expected attempts (`2^difficulty`)
- Random educational tips about PoW
- Cancel button

#### AddressDisplay

```typescript
interface AddressDisplayProps {
  address: string;          // Full cs1... address
  chars?: number;           // Characters at start/end (default: 6)
  showCopy?: boolean;       // Show copy button (default: true)
  className?: string;
}

function AddressDisplay(props: AddressDisplayProps): JSX.Element
```

**Purpose**: Truncated address display with copy-to-clipboard
**Called from**: User profiles, message headers, identity cards

#### IdentityCard

```typescript
interface IdentityCardProps {
  identity: StoredIdentity;
}

function IdentityCard({ identity }: IdentityCardProps): JSX.Element
```

**Purpose**: Visual identity card showing address, creation date, PoW difficulty
**Called from**: Profile pages, identity confirmation dialogs

---

## Library Functions

### Action PoW (`lib/action-pow.ts`)

Implements SPEC_03 Argon2id proof-of-work for content actions.

#### Action Types

```typescript
enum ActionType {
  SpaceCreation = 0x01,
  Post = 0x02,
  Reply = 0x03,
  Engage = 0x04,
  IdentityUpdate = 0x05,
}
```

#### Difficulty Constants

| Action | Mainnet | Testnet |
|--------|---------|---------|
| SpaceCreation | 22 | 12 |
| Post | 20 | 10 |
| Reply | 18 | 8 |
| Engage | 16 | 6 |
| IdentityUpdate | 20 | 10 |

#### PoW Configuration

| Config | Memory | Iterations | Parallelism | Use Case |
|--------|--------|------------|-------------|----------|
| PRODUCTION_CONFIG | 64 MiB | 3 | 4 | Production |
| TESTNET_CONFIG | 8 MiB | 1 | 2 | Testnet (browser-safe) |
| TEST_CONFIG | 1 MiB | 1 | 1 | Unit tests |

#### Key Functions

```typescript
// Create a challenge for content
async function createChallenge(
  actionType: ActionType,
  content: Uint8Array,
  authorPubkey: Uint8Array,
  difficulty: number
): Promise<PoWChallenge>

// Mine a solution (blocking)
async function computePow(
  challenge: PoWChallenge,
  config: PoWConfig,
  onProgress?: (attempts: number, elapsedMs: number, hashRate: number) => void,
  isCancelled?: () => boolean
): Promise<PoWSolution>

// Convert solution to RPC params
function solutionToRpcParams(solution: PoWSolution): {
  pow_nonce: number;
  pow_difficulty: number;
  pow_nonce_space: string;
  pow_hash: string;
  timestamp: number;
}

// Get difficulty for network
function getDifficulty(actionType: ActionType, isTestnet?: boolean): number

// Utility functions
async function sha256(data: Uint8Array): Promise<Uint8Array>
function leadingZeros(hash: Uint8Array): number
function serializeChallenge(challenge: PoWChallenge): Uint8Array  // 82 bytes
```

### Encryption (`lib/encryption.ts`)

AES-GCM encryption using Web Crypto API with PBKDF2 key derivation.

#### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| PBKDF2_ITERATIONS | 100,000 | Key derivation iterations |
| SALT_LENGTH | 16 bytes | Random salt per encryption |
| IV_LENGTH | 12 bytes | AES-GCM nonce |

#### Passphrase-Based Encryption

```typescript
// Check if content is encrypted
function isEncrypted(content: string): boolean  // Checks [ENCRYPTED:v1: prefix

// Encrypt/decrypt raw content
async function encryptContent(content: string, passphrase: string): Promise<string>
async function decryptContent(encryptedContent: string, passphrase: string): Promise<string | null>

// Encrypt/decrypt posts (title + body)
async function encryptPost(title: string, body: string, passphrase: string): Promise<{
  encryptedTitle: string;  // "[Encrypted Post]"
  encryptedBody: string;   // "[ENCRYPTED:v1:<base64>]"
}>
async function decryptPost(encryptedBody: string, passphrase: string): Promise<{
  title: string;
  body: string;
} | null>

// Encrypt/decrypt binary media (images)
async function encryptMedia(data: ArrayBuffer | Uint8Array, passphrase: string): Promise<Uint8Array>
async function decryptMedia(encryptedData: ArrayBuffer | Uint8Array, passphrase: string): Promise<Uint8Array | null>

// Generate random passphrase
function generatePassphrase(length?: number): string  // Default 16 chars
```

#### Space Key Encryption (Private Spaces)

For private spaces using pre-shared 32-byte AES keys:

```typescript
// Check if content uses space key encryption
function isPrivateEncrypted(content: string): boolean  // Checks [PRIVATE:v1: prefix

// Encrypt/decrypt with space key
async function encryptWithSpaceKey(content: string, spaceKey: Uint8Array): Promise<string>
async function decryptWithSpaceKey(encryptedContent: string, spaceKey: Uint8Array): Promise<string | null>

// Post encryption
async function encryptPrivatePost(title: string, body: string, spaceKey: Uint8Array): Promise<{
  encryptedTitle: string;  // "[Private]"
  encryptedBody: string;
}>
async function decryptPrivatePost(encryptedBody: string, spaceKey: Uint8Array): Promise<{
  title: string;
  body: string;
} | null>

// Media encryption
async function encryptPrivateMedia(data: ArrayBuffer | Uint8Array, spaceKey: Uint8Array): Promise<Uint8Array>
async function decryptPrivateMedia(encryptedData: ArrayBuffer | Uint8Array, spaceKey: Uint8Array): Promise<Uint8Array | null>

// Space name encryption
async function encryptSpaceName(name: string, spaceKey: Uint8Array): Promise<Uint8Array>
async function decryptSpaceName(encryptedName: Uint8Array, spaceKey: Uint8Array): Promise<string | null>
```

---

## WASM Integration

### Loader (`wasm/loader.ts`)

```typescript
// Initialize WASM (idempotent)
async function initWasm(): Promise<typeof wasm>

// Get WASM module (throws if not initialized)
function getWasm(): typeof wasm

// Check if loaded
function isWasmLoaded(): boolean
```

### WASM Functions

| Function | Description |
|----------|-------------|
| `encode_address(pubkey)` | Encode 32-byte pubkey to cs1... address |
| `decode_address(address)` | Decode cs1... address to pubkey |
| `is_valid_address(address)` | Validate address format |
| `mine_identity_pow(pubkey, difficulty)` | Mine SHA-256 identity PoW |
| `verify_identity_pow(pubkey, timestamp, nonce, difficulty)` | Verify PoW solution |
| `sha256(data)` | Compute SHA-256 hash |
| `content_id(data)` | Compute content ID (sha256:hex) |
| `calculate_decay(created, lastEngagement, now)` | Calculate decay state |
| `verify_signature(pubkey, message, signature)` | Verify Ed25519 signature |

---

## Behaviors

### WASM Initialization

- **Trigger**: `SwimchainProvider` mounts
- **Process**:
  1. Check if already initialized (`isWasmLoaded()`)
  2. Load WASM binary from bundled URL
  3. Call `init()` function
  4. Set `isLoaded = true`
- **Outcome**: WASM functions available, children render

### Identity Persistence

- **Trigger**: `setIdentity()` called
- **Process**:
  1. Serialize identity to JSON
  2. Write to `localStorage['swimchain-identity']`
  3. Update React state
- **Outcome**: Identity persists across sessions

### Identity PoW Mining

- **Trigger**: `usePow().mine(publicKey, difficulty)` called
- **Process**:
  1. Set state to 'initializing'
  2. Wait 100ms for UI update
  3. Call `mine_identity_pow(publicKey, difficulty)`
  4. Update attempts/elapsed on completion
  5. Set state to 'complete'
- **Outcome**: PoW solution with nonce, timestamp, hash

### Content Encryption Flow

- **Trigger**: User posts with passphrase or to private space
- **Process (passphrase)**:
  1. Generate random salt (16 bytes) and IV (12 bytes)
  2. Derive AES-256 key via PBKDF2 (100k iterations)
  3. Encrypt with AES-GCM
  4. Format as `[ENCRYPTED:v1:<base64(salt||iv||ciphertext)>]`
- **Process (space key)**:
  1. Generate random IV (12 bytes)
  2. Import 32-byte space key as AES-256
  3. Encrypt with AES-GCM
  4. Format as `[PRIVATE:v1:<base64(iv||ciphertext)>]`
- **Outcome**: Encrypted content string

---

## Configuration

### Package Exports

```json
{
  ".": "./dist/index.js",
  "./components": "./dist/components/index.js",
  "./hooks": "./dist/hooks/index.js",
  "./providers": "./dist/providers/index.js",
  "./lib": "./dist/lib/index.js",
  "./styles/*": "./dist/components/*"
}
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| react | ^18.2.0 |
| react-dom | ^18.2.0 |
| react-router-dom | ^6.20.0 |

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @noble/ciphers | ^2.1.1 | Cryptographic ciphers (unused) |
| @noble/curves | ^1.9.7 | Elliptic curve operations |
| @noble/hashes | ^1.8.0 | Hash functions |
| hash-wasm | ^4.12.0 | Argon2id for Action PoW |

---

## Constants

### Timing Constants

| Name | Value | Purpose |
|------|-------|---------|
| POOL_TARGET_SECONDS | 60 | Pool seconds required for persistence |
| ENGAGE_QUICK_SECONDS | 5 | Quick reaction contribution |
| ENGAGE_STANDARD_SECONDS | 15 | Standard engagement contribution |
| TYPING_TIMEOUT_MS | 5000 | Typing indicator duration |
| TYPING_BROADCAST_INTERVAL_MS | 3000 | Typing re-broadcast interval |
| PRESENCE_HEARTBEAT_MS | 30000 | Presence heartbeat |
| PRESENCE_AWAY_THRESHOLD_MS | 120000 | Transition to 'away' |
| POLL_INTERVAL_MS | 5000 | Message polling interval |
| HEAT_UPDATE_INTERVAL_MS | 60000 | Heat value refresh |

### PoW Difficulty Constants

| Name | Value | Purpose |
|------|-------|---------|
| REACTION_DIFFICULTY | 8 | PoW for reactions |
| MESSAGE_DIFFICULTY | 10 | PoW for messages |

### Encryption Constants

| Name | Value | Purpose |
|------|-------|---------|
| PBKDF2_ITERATIONS | 100,000 | Key derivation iterations |
| SALT_LENGTH | 16 | Salt bytes |
| IV_LENGTH | 12 | AES-GCM nonce bytes |

---

## Integration Points

### Consumer Applications

| Application | Components Used | Hooks Used |
|-------------|-----------------|------------|
| chat-client | SwimchainProvider, WaveLoader | useStoredIdentity, useStoredKeypair |
| search-client | SwimchainProvider, WaveLoader | - |
| forum-client | (local copies) | useStoredIdentity, useStoredKeypair, useActionPow |
| feed-client | (local copies) | useStoredIdentity, useStoredKeypair |

### Related SDKs

| SDK | Relationship |
|-----|--------------|
| `@swimchain/react` | More comprehensive, includes RPC hooks |
| `swimchain-wasm` | Source of WASM bindings |

### LocalStorage Keys

| Key | Content |
|-----|---------|
| `swimchain-identity` | Serialized `StoredIdentity` JSON |

---

## CSS Variables

### WaveLoader

```css
--wave-color: #00d4ff;
--wave-color-light: rgba(0, 212, 255, 0.3);
--wave-color-medium: rgba(0, 212, 255, 0.5);
--wave-bg: rgba(15, 15, 26, 0.95);
```

### PowProgress (expects global CSS vars)

```css
--spacing-lg
--spacing-md
--spacing-xl
--font-size-lg
--font-size-xl
--font-size-sm
--font-size-xs
--font-mono
--color-accent-primary
--color-accent-secondary
--color-bg-tertiary
--color-text-secondary
--color-text-tertiary
--radius-full
```

---

## Gap Analysis

### Documented vs Implemented

| Feature | Documented | Implemented | Notes |
|---------|------------|-------------|-------|
| WaveLoader | Yes | Yes | Complete |
| PageTransition | Yes | Yes | In WaveLoader.tsx, not separate file |
| PowProgress | Yes | Yes | Complete |
| AddressDisplay | Yes | Yes | Complete |
| IdentityCard | Yes | Yes | Complete |
| useKeypair | Yes | Yes | Complete |
| usePow | Yes | Yes | Complete |
| useStoredIdentity | Yes | Yes | Complete |
| useStoredKeypair | Yes | Yes | Complete |
| SwimchainProvider | Yes | Yes | Complete |
| IdentityProvider | Yes | Yes | Complete |
| **Action PoW (Argon2id)** | **No** | **Yes** | Full implementation in lib/action-pow.ts |
| **Encryption utilities** | **No** | **Yes** | Comprehensive AES-GCM in lib/encryption.ts |
| **Type definitions** | **No** | **Yes** | Extensive in types/index.ts |

### Quality Checklist Status

| Item | Status | Notes |
|------|--------|-------|
| All components typed | Partial | TypeScript interfaces defined, some JSX.Element returns |
| Hooks handle edge cases | Yes | Loading states, error handling present |
| Providers memoize values | Yes | useMemo in SwimchainProvider |
| CSS modules scoped | No | Regular CSS with BEM naming |
| Tree-shakeable exports | Yes | Named exports, ESM format |

### Client Duplication Issue

Many clients (forum-client, feed-client) have **local copies** of hooks instead of importing from `@swimchain/frontend`:
- `forum-client/src/hooks/useActionPow.ts`
- `forum-client/src/hooks/useStoredKeypair.ts`
- `forum-client/src/lib/action-pow.ts`
- etc.

This creates maintenance burden and potential inconsistencies.

---

## Usage Examples

### Basic Setup

```tsx
import { SwimchainProvider, IdentityProvider } from '@swimchain/frontend/providers';
import { WaveLoader } from '@swimchain/frontend/components';

function App() {
  return (
    <SwimchainProvider fallback={<WaveLoader text="Loading WASM..." fullScreen />}>
      <IdentityProvider>
        <Router>
          <Routes />
        </Router>
      </IdentityProvider>
    </SwimchainProvider>
  );
}
```

### Identity Creation

```tsx
import { useKeypair, usePow, useStoredIdentity } from '@swimchain/frontend/hooks';
import { PowProgress, IdentityCard } from '@swimchain/frontend/components';

function CreateIdentity() {
  const { keypair, address, generate } = useKeypair();
  const { state, solution, attempts, elapsedMs, mine, cancel } = usePow();
  const { setIdentity } = useStoredIdentity();

  useEffect(() => { generate(); }, []);

  const handleMine = () => {
    if (keypair) {
      mine(keypair.publicKey(), 16);
    }
  };

  const handleComplete = () => {
    if (keypair && solution) {
      setIdentity({
        address: address!,
        publicKey: bytesToHex(keypair.publicKey()),
        seed: bytesToHex(keypair.seed()),
        createdAt: Math.floor(Date.now() / 1000),
        powSolution: {
          nonce: solution.nonce.toString(),
          timestamp: solution.timestamp.toString(),
          difficulty: 16,
        },
      });
    }
  };

  if (state === 'mining') {
    return <PowProgress attempts={attempts} elapsedMs={elapsedMs} difficulty={16} onCancel={cancel} />;
  }

  // ...
}
```

### Action PoW for Posts

```tsx
import { createChallenge, computePow, getConfig, getDifficulty, ActionType } from '@swimchain/frontend/lib';
import { useStoredKeypair } from '@swimchain/frontend/hooks';

function PostEditor() {
  const { publicKey } = useStoredKeypair();

  const submitPost = async (content: string) => {
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(content);

    const challenge = await createChallenge(
      ActionType.Post,
      contentBytes,
      publicKey!,
      getDifficulty(ActionType.Post, true) // testnet
    );

    const solution = await computePow(
      challenge,
      getConfig(true), // testnet config
      (attempts, elapsedMs, hashRate) => {
        console.log(`Mining: ${attempts} attempts, ${hashRate.toFixed(1)} H/s`);
      }
    );

    // Submit with solution...
  };
}
```

### Content Encryption

```tsx
import { encryptPost, decryptPost, isEncrypted } from '@swimchain/frontend/lib';

// Encrypt a post
const { encryptedTitle, encryptedBody } = await encryptPost(
  "Secret Title",
  "Secret body content",
  "user-passphrase-123"
);

// Check and decrypt
if (isEncrypted(encryptedBody)) {
  const decrypted = await decryptPost(encryptedBody, "user-passphrase-123");
  if (decrypted) {
    console.log(decrypted.title, decrypted.body);
  }
}
```

---

## Security Considerations

1. **Seed Storage**: Seeds are stored as hex in localStorage. Consider additional encryption for high-security scenarios.

2. **PBKDF2 Iterations**: 100,000 iterations provides reasonable protection against brute-force on modern hardware.

3. **Action PoW Memory**: Testnet config uses 8 MiB which is browser-safe. Production 64 MiB may cause issues on low-memory devices.

4. **Key Cleanup**: Hooks call `keypair.free()` on cleanup to release WASM memory and zeroize key material.

---

## File References

| File | Line | Description |
|------|------|-------------|
| swimchain-frontend/src/index.ts | 1-22 | Main entry point |
| swimchain-frontend/src/types/index.ts | 1-356 | Type definitions |
| swimchain-frontend/src/providers/SwimchainProvider.tsx | 1-109 | WASM provider |
| swimchain-frontend/src/providers/IdentityProvider.tsx | 1-99 | Identity provider |
| swimchain-frontend/src/hooks/useKeypair.ts | 1-56 | Keypair hook |
| swimchain-frontend/src/hooks/usePow.ts | 1-114 | PoW mining hook |
| swimchain-frontend/src/hooks/useStoredIdentity.ts | 1-61 | Identity persistence |
| swimchain-frontend/src/hooks/useStoredKeypair.ts | 1-125 | Seed-to-keypair bridge |
| swimchain-frontend/src/lib/action-pow.ts | 1-342 | Argon2id PoW |
| swimchain-frontend/src/lib/encryption.ts | 1-610 | AES-GCM encryption |
| swimchain-frontend/src/components/WaveLoader.tsx | 1-87 | Loading + transition |
| swimchain-frontend/src/components/PowProgress.tsx | 1-117 | Mining progress |
| swimchain-frontend/src/components/AddressDisplay.tsx | 1-83 | Address display |
| swimchain-frontend/src/components/IdentityCard.tsx | 1-54 | Identity card |

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "WASM not initialized" | Calling `getWasm()` before `initWasm()` completes | Wrap app in `SwimchainProvider` or await `initWasm()` |
| "useIdentityContext must be used within IdentityProvider" | Using `useIdentityContext` outside provider | Wrap component tree in `IdentityProvider` |
| "Invalid seed length: X (expected 32)" | Corrupted stored identity | Clear identity with `clearIdentity()` and regenerate |
| "Space key must be 32 bytes" | Passing wrong-sized key to encryption | Ensure 32-byte key from X25519 key exchange |
| "Mining cancelled" | User cancelled via `isCancelled` callback | Handle gracefully, allow retry |
| `decryptContent` returns `null` | Wrong passphrase or corrupted ciphertext | Prompt user for correct passphrase |
| "Swimchain WASM not loaded yet" | `useRequireSwimchain` called before load | Wait for `isLoaded` to be true |

---

## Testing

### Component Testing

```bash
# Run component tests
cd swimchain-frontend && npm test
```

```tsx
// Example: Testing WaveLoader
import { render, screen } from '@testing-library/react';
import { WaveLoader } from '@swimchain/frontend/components';

test('WaveLoader renders with custom text', () => {
  render(<WaveLoader text="Loading data..." />);
  expect(screen.getByText('Loading data...')).toBeInTheDocument();
});

test('WaveLoader fullScreen mode has overlay', () => {
  const { container } = render(<WaveLoader fullScreen />);
  expect(container.querySelector('.wave-loader__overlay')).toBeInTheDocument();
});
```

### Hook Testing

```tsx
// Example: Testing useStoredIdentity
import { renderHook, act } from '@testing-library/react';
import { useStoredIdentity } from '@swimchain/frontend/hooks';

test('useStoredIdentity persists identity to localStorage', () => {
  const { result } = renderHook(() => useStoredIdentity());

  act(() => {
    result.current.setIdentity({
      address: 'cs1test...',
      publicKey: '00'.repeat(32),
      seed: 'ff'.repeat(32),
      createdAt: Date.now() / 1000,
    });
  });

  expect(localStorage.getItem('swimchain-identity')).toBeTruthy();
});
```

### Action PoW Testing

```typescript
// Example: Testing action PoW
import { createChallenge, computePow, ActionType, TEST_CONFIG, leadingZeros } from '@swimchain/frontend/lib';

test('computePow produces valid solution', async () => {
  const content = new TextEncoder().encode('test content');
  const pubkey = new Uint8Array(32);
  crypto.getRandomValues(pubkey);

  const challenge = await createChallenge(ActionType.Post, content, pubkey, 4);
  const solution = await computePow(challenge, TEST_CONFIG);

  expect(leadingZeros(solution.hash)).toBeGreaterThanOrEqual(4);
});
```

### Encryption Testing

```typescript
// Example: Testing encryption round-trip
import { encryptContent, decryptContent, isEncrypted } from '@swimchain/frontend/lib';

test('encryption round-trip preserves content', async () => {
  const original = 'Hello, World!';
  const passphrase = 'test-passphrase';

  const encrypted = await encryptContent(original, passphrase);
  expect(isEncrypted(encrypted)).toBe(true);

  const decrypted = await decryptContent(encrypted, passphrase);
  expect(decrypted).toBe(original);
});

test('wrong passphrase returns null', async () => {
  const encrypted = await encryptContent('secret', 'correct');
  const decrypted = await decryptContent(encrypted, 'wrong');
  expect(decrypted).toBeNull();
});
```

---

## Known Limitations

1. **Browser-only**: WASM requires browser environment with Web Crypto API; no Node.js/SSR support
2. **Main thread blocking**: Identity PoW (`usePow`) blocks the main thread during mining
3. **Action PoW memory**: Production config (64 MiB) may fail on low-memory mobile devices
4. **localStorage limits**: ~5MB storage limit per origin affects identity persistence
5. **Client duplication**: forum-client and feed-client have local copies of hooks instead of importing from SDK
6. **No Web Worker support**: Action PoW runs on main thread, may cause UI jank for high difficulties
7. **Synchronous WASM signing**: `keypair.sign()` is synchronous, may block for large messages

---

## Future Work

1. **Web Worker PoW**: Move Argon2id computation to dedicated Web Worker
2. **Progressive WASM loading**: Load only required WASM functions on-demand
3. **IndexedDB storage**: More robust identity storage with encryption-at-rest
4. **Hardware wallet support**: WebAuthn/FIDO2 integration for key storage
5. **SSR compatibility**: Server-side rendering support with client hydration
6. **SDK consolidation**: Merge overlapping functionality with `@swimchain/react`
7. **Streaming encryption**: Support for large file encryption with streams
8. **Multi-identity support**: Manage multiple identities per device

---

## Related Features

- [React SDK](./react-sdk_FEATURE_DOC.md) - RPC hooks, caching, content fetching
- [WASM Bindings](./wasm-bindings_FEATURE_DOC.md) - Browser cryptography implementation
- [Identity & Cryptography](./identity-cryptography_FEATURE_DOC.md) - Core identity concepts
- [Content Decay](./content-decay-engine_FEATURE_DOC.md) - Heat and decay system
- [Private Spaces](./private-spaces-encryption_FEATURE_DOC.md) - Space key encryption details
