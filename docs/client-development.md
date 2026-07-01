# Swimchain Client Development Guide

This guide covers developing browser-based Swimchain clients using the WASM library.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      React Application                       │
├─────────────────────────────────────────────────────────────┤
│  @swimchain/react                                         │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │useKeypair │ │ useDecay  │ │  usePow   │ │useAddress │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
├─────────────────────────────────────────────────────────────┤
│  @swimchain/core                                          │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │ Identity  │ │  Crypto   │ │   Decay   │ │    PoW    │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
├─────────────────────────────────────────────────────────────┤
│  WASM Module (swimchain_wasm.wasm)                        │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │ ed25519   │ │   sha2    │ │  bech32   │ │  getrandom │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Package Structure

### @swimchain/core

Low-level WASM bindings and utilities:

```
swimchain-js/
├── src/
│   ├── index.ts          # Main exports
│   ├── wasm-loader.ts    # WASM initialization
│   ├── identity.ts       # Keypair, addresses
│   ├── crypto.ts         # Hash functions
│   ├── decay.ts          # Decay calculations
│   ├── pow.ts            # PoW mining
│   ├── pow-worker.ts     # Worker wrapper
│   └── types.ts          # TypeScript types
├── worker/
│   └── pow.worker.ts     # Web Worker for PoW
├── pkg/                  # Generated WASM files
└── tests/                # Test suite
```

### @swimchain/react

React hooks and components:

```
swimchain-react/
├── src/
│   ├── index.ts              # Main exports
│   ├── SwimchainProvider.tsx # Context provider
│   └── hooks/
│       ├── useIdentity.ts    # Identity management
│       ├── useDecay.ts       # Decay tracking
│       └── usePow.ts         # PoW mining
```

## Building from Source

### Prerequisites

- Rust 1.70+ with `wasm32-unknown-unknown` target
- Node.js 18+
- wasm-pack

### Build Steps

```bash
# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Build WASM
cd swimchain-wasm
wasm-pack build --target web --release

# Build JS package
cd ../swimchain-js
npm install
npm run build

# Build React package
cd ../swimchain-react
npm install
npm run build
```

## Module Details

### Identity Module

Handles Ed25519 keypairs and Bech32m addresses per SPEC_01.

```typescript
// Keypair lifecycle
const keypair = new Keypair();
const publicKey = keypair.publicKey();  // Uint8Array(32)
const address = keypair.address();      // "sw1..."
const signature = keypair.sign(message);
keypair.free();  // Release WASM memory

// Address encoding (SPEC_01 §3.3)
// Format: HRP("cs") + separator("1") + version(0) + pubkey(32 bytes)
const address = encodeAddress(publicKey);
const decoded = decodeAddress(address);
```

### Crypto Module

SHA-256 hashing and PoW utilities.

```typescript
// SHA-256 (SPEC_01 content hashing)
const hash = sha256(data);  // Uint8Array(32)

// Leading zeros count (PoW verification)
const zeros = leadingZeros(hash);  // 0-256

// Content addressing
const contentId = contentId(data);  // "sha256:<hex>"
```

### Decay Module

Implements SPEC_02 decay model:

```
survival_probability = 0.5^(effective_decay_time / half_life)
effective_decay_time = max(0, time_since_engagement - floor)
```

Constants:
- `DECAY_FLOOR_SECS` = 172,800 (48 hours)
- `HALF_LIFE_SECS` = 604,800 (7 days)
- `DECAY_THRESHOLD` = 0.0625 (6.25%)

```typescript
const state = calculateDecay(createdAt, lastEngagement, now);

// DecayState properties
state.currentHeat;       // 0.0-1.0 survival probability
state.isDecayed;         // true if below threshold
state.isProtected;       // true if in floor period
state.halfLivesElapsed;  // number of half-lives
state.timeUntilDecay;    // seconds until threshold
```

### PoW Module

Identity PoW per SPEC_01 §3.4:

```
hash = SHA-256(pubkey[32] || timestamp_le[8] || nonce_le[8])
valid if leading_zeros(hash) >= difficulty
```

```typescript
// Blocking (main thread)
const solution = mineIdentityPow(publicKey, difficulty);

// Non-blocking (Web Worker)
const worker = new PowWorker();
await worker.init();
const solution = await worker.mine(publicKey, difficulty);
worker.terminate();
```

## Error Handling

### Error Types

```typescript
// From WASM (string messages)
try {
  decodeAddress("invalid");
} catch (e) {
  // "Invalid address: ..."
}

// TypeScript types
interface WasmError {
  InvalidAddress: { reason: string };
  InvalidPublicKey: { reason: string };
  InvalidSignature: { reason: string };
  PowFailed: { difficulty: number; attempts: number };
  InvalidDifficulty: { min: number; max: number; provided: number };
  DecayCalculationError: { reason: string };
}
```

### React Error Boundaries

```tsx
function ErrorFallback({ error }: { error: Error }) {
  return <div>Swimchain error: {error.message}</div>;
}

function App() {
  return (
    <ErrorBoundary fallback={ErrorFallback}>
      <SwimchainProvider>
        <MyApp />
      </SwimchainProvider>
    </ErrorBoundary>
  );
}
```

## WebWorker Integration

### Worker Message Protocol

```typescript
// Main → Worker
type PowWorkerMessage =
  | { type: "init" }
  | { type: "mine"; publicKey: Uint8Array; difficulty: number; maxAttempts?: number }
  | { type: "cancel" };

// Worker → Main
type PowWorkerResponse =
  | { type: "ready" }
  | { type: "progress"; attempts: number; elapsedMs: number }
  | { type: "complete"; solution: PowSolution }
  | { type: "error"; message: string };
```

### Custom Worker Usage

```typescript
// Create worker with bundler-specific URL
const worker = new Worker(
  new URL('./pow.worker.ts', import.meta.url),
  { type: 'module' }
);

// Initialize
worker.postMessage({ type: 'init' });

// Mine
worker.postMessage({
  type: 'mine',
  publicKey: keypair.publicKey(),
  difficulty: 20,
});

// Handle responses
worker.onmessage = (e) => {
  if (e.data.type === 'complete') {
    console.log('Solution:', e.data.solution);
  }
};
```

## Testing

### Unit Tests

```bash
cd swimchain-js
npm test
```

Test structure:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initWasm, Keypair } from '../src';

describe('identity', () => {
  beforeAll(async () => {
    await initWasm();
  });

  it('generates keypairs', () => {
    const kp = new Keypair();
    expect(kp.publicKey()).toHaveLength(32);
    kp.free();
  });
});
```

### WASM Tests

```bash
cd swimchain-wasm
wasm-pack test --node
```

### Test Vectors

| Test | Input | Expected |
|------|-------|----------|
| SHA-256 empty | `""` | `e3b0c442...` |
| SHA-256 "abc" | `"abc"` | `ba7816bf...` |
| Address prefix | Any pubkey | Starts with "sw1" |
| Decay floor | 24h old | `isProtected: true` |
| Decay 32d | 32d old | `isDecayed: true`, heat ~0.051 |

## Performance Optimization

### Lazy Loading

```typescript
// Load WASM lazily
const initSwimchain = async () => {
  if (!isWasmLoaded()) {
    await initWasm();
  }
};
```

### Throttled Decay Updates

```tsx
// Update every 10 seconds instead of every frame
const decay = useDecay(createdAt, lastEngagement, {
  updateInterval: 10000,
});
```

### Worker Pool (Advanced)

```typescript
class PowWorkerPool {
  private workers: PowWorker[] = [];
  private available: PowWorker[] = [];

  async init(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new PowWorker();
      await worker.init();
      this.workers.push(worker);
      this.available.push(worker);
    }
  }

  async mine(publicKey: Uint8Array, difficulty: number): Promise<PowSolution> {
    const worker = this.available.pop();
    if (!worker) throw new Error('No workers available');

    try {
      return await worker.mine(publicKey, difficulty);
    } finally {
      this.available.push(worker);
    }
  }

  terminate() {
    this.workers.forEach(w => w.terminate());
  }
}
```

## Memory Management

### WASM Object Cleanup

Objects returned from WASM that have a `free()` method must be explicitly freed:

```typescript
const keypair = new Keypair();
// ... use keypair ...
keypair.free();  // Required!
```

### React Hook Cleanup

Hooks automatically clean up internal resources:

```tsx
function MyComponent() {
  // Keypair is freed when component unmounts
  const { keypair } = useKeypair();

  // RAF is cancelled when component unmounts
  const decay = useDecay(created, engaged);

  return <div>...</div>;
}
```

## Integration with Swimchain Network

### Creating an Identity

```typescript
// 1. Generate keypair
const keypair = new Keypair();

// 2. Mine identity PoW
const solution = await mineInBackground(keypair.publicKey(), 20);

// 3. Create identity record
const identity = {
  publicKey: keypair.publicKey(),
  address: keypair.address(),
  powTimestamp: solution.timestamp,
  powNonce: solution.nonce,
  powHash: solution.hash,
};

// 4. Submit to network (via your API)
await submitIdentity(identity);
```

### Signing Actions

```typescript
// Create action payload
const action = {
  type: 'post',
  content: 'Hello Swimchain!',
  timestamp: Date.now(),
};

// Serialize and sign
const payload = new TextEncoder().encode(JSON.stringify(action));
const signature = keypair.sign(payload);

// Submit with signature
await submitAction({ ...action, signature });
```

### Verifying Content

```typescript
// Verify author signature
const isAuthorValid = verifySignature(
  authorPublicKey,
  contentPayload,
  contentSignature
);

// Check decay status
const decay = calculateDecay(
  content.createdAt,
  content.lastEngagement,
  Math.floor(Date.now() / 1000)
);

if (decay.isDecayed) {
  console.log('Content has expired');
}
```

## Debugging

### Enable WASM Panic Hook

The library automatically sets up `console_error_panic_hook` for better error messages:

```rust
// Already included in lib.rs
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}
```

### Browser DevTools

1. Open Network tab to see WASM file load
2. Check Console for WASM errors
3. Use Performance tab to profile PoW mining
4. Memory tab shows WASM heap usage

### Common Issues

**"Cannot call WASM function: memory access out of bounds"**
- Usually means using an object after `free()` was called

**"Uncaught (in promise) RuntimeError: unreachable"**
- Usually a panic in Rust code - check console for details

**Worker fails silently**
- Check that worker URL is correct for your bundler
- Ensure CORS headers allow worker scripts
