# Swimchain WASM Integration Guide

This guide covers integrating Swimchain's WebAssembly library into browser-based applications.

## Overview

The Swimchain WASM library provides:
- **Identity management**: Ed25519 keypair generation, Bech32m address encoding
- **Cryptographic operations**: SHA-256 hashing, signature verification
- **Content decay**: Real-time decay calculations per SPEC_02
- **Proof-of-work**: Identity PoW mining (SHA-256 based)

### Limitations

- **No Argon2id PoW**: Action PoW (SPEC_03) requires 64 MiB memory, which is impractical in WASM
- **Identity PoW only**: The library supports identity creation PoW (SHA-256) only
- **In-memory storage**: No persistent storage in the WASM library

## Installation

```bash
npm install @swimchain/core @swimchain/react
```

## Quick Start

### With React

```tsx
import { SwimchainProvider, useKeypair, useDecay, usePow } from '@swimchain/react';

function App() {
  return (
    <SwimchainProvider fallback={<div>Loading WASM...</div>}>
      <MyApp />
    </SwimchainProvider>
  );
}

function MyApp() {
  const { keypair, address, generate } = useKeypair();
  const { mine, state, solution } = usePow();

  const handleCreateIdentity = async () => {
    if (keypair) {
      mine(keypair.publicKey(), 20);
    }
  };

  return (
    <div>
      <button onClick={generate}>Generate Keypair</button>
      {address && <p>Address: {address}</p>}
      <button onClick={handleCreateIdentity} disabled={state === 'mining'}>
        Create Identity
      </button>
      {state === 'mining' && <p>Mining PoW...</p>}
      {solution && <p>Identity created!</p>}
    </div>
  );
}
```

### Without React

```typescript
import { initWasm, Keypair, mineIdentityPow, verifyIdentityPow } from '@swimchain/core';

async function main() {
  // Initialize WASM (required once before using any functions)
  await initWasm();

  // Generate a keypair
  const keypair = new Keypair();
  console.log('Address:', keypair.address());

  // Mine identity PoW
  const solution = mineIdentityPow(keypair.publicKey(), 20);
  console.log(`Mining took ${solution.elapsedMs}ms`);

  // Verify the proof
  const isValid = verifyIdentityPow(
    keypair.publicKey(),
    solution.timestamp,
    solution.nonce,
    20
  );
  console.log('Valid:', isValid);

  // Clean up
  keypair.free();
}

main();
```

## API Reference

### WASM Initialization

```typescript
import { initWasm, isWasmLoaded, getVersion } from '@swimchain/core';

// Initialize (required once)
await initWasm();

// Check if loaded
if (isWasmLoaded()) {
  console.log('Version:', getVersion());
}
```

### Identity Management

```typescript
import {
  Keypair,
  encodeAddress,
  decodeAddress,
  verifySignature,
  isValidAddress,
} from '@swimchain/core';

// Generate keypair
const keypair = new Keypair();

// From seed (deterministic)
const keypair2 = Keypair.fromSeed(seed);

// Get public key and address
const publicKey = keypair.publicKey(); // Uint8Array(32)
const address = keypair.address();      // "cs1..."

// Sign a message
const message = new TextEncoder().encode('Hello');
const signature = keypair.sign(message);

// Verify signature
const isValid = verifySignature(publicKey, message, signature);

// Address utilities
const encoded = encodeAddress(publicKey);
const decoded = decodeAddress(encoded);
const valid = isValidAddress(encoded);

// Clean up (important!)
keypair.free();
```

### Cryptographic Operations

```typescript
import {
  sha256,
  leadingZeros,
  contentId,
  bytesToHex,
  hexToBytes,
} from '@swimchain/core';

// SHA-256
const hash = sha256(new TextEncoder().encode('data'));

// Leading zeros count (for PoW)
const zeros = leadingZeros(hash);

// Content ID
const id = contentId(data); // "sha256:..."

// Hex utilities
const hex = bytesToHex(hash);
const bytes = hexToBytes(hex);
```

### Content Decay

```typescript
import { calculateDecay, getDecayConstants, formatDecayState } from '@swimchain/core';

// Calculate decay state
const nowSecs = Math.floor(Date.now() / 1000);
const state = calculateDecay(createdAtSecs, lastEngagementSecs, nowSecs);

console.log('Heat:', state.currentHeat);       // 0.0 to 1.0
console.log('Decayed:', state.isDecayed);      // true if below threshold
console.log('Protected:', state.isProtected);   // true if in floor period
console.log('Description:', state.description);

// Get protocol constants
const constants = getDecayConstants();
console.log('Floor:', constants.floorSecs);     // 172800 (48 hours)
console.log('Half-life:', constants.halfLifeSecs); // 604800 (7 days)
console.log('Threshold:', constants.threshold); // 0.0625 (6.25%)
```

### Proof-of-Work

```typescript
import {
  mineIdentityPow,
  verifyIdentityPow,
  estimateMiningTime,
  formatMiningTimeEstimate,
} from '@swimchain/core';

// Estimate mining time
console.log(formatMiningTimeEstimate(20)); // "~2 seconds"

// Mine PoW
const solution = mineIdentityPow(publicKey, 20);

// Solution contains:
// - nonce: bigint
// - timestamp: bigint
// - hash: Uint8Array
// - attempts: bigint
// - elapsedMs: number
// - leadingZeros: number
// - hashRate: number

// Verify PoW
const isValid = verifyIdentityPow(publicKey, solution.timestamp, solution.nonce, 20);
```

### Non-Blocking PoW with Web Worker

```typescript
import { PowWorker, mineInBackground } from '@swimchain/core';

// One-shot mining
const solution = await mineInBackground(publicKey, 20);

// Or with worker control
const worker = new PowWorker();
await worker.init();

const solution = await worker.mine(publicKey, 20, (attempts, elapsed) => {
  console.log(`Progress: ${attempts} attempts in ${elapsed}ms`);
});

worker.cancel(); // Cancel if needed
worker.terminate(); // Clean up
```

## React Hooks

### SwimchainProvider

Wrap your app to initialize WASM:

```tsx
<SwimchainProvider
  fallback={<Loading />}
  onLoad={() => console.log('Ready!')}
  onError={(err) => console.error(err)}
>
  <App />
</SwimchainProvider>
```

### useKeypair

```tsx
const { keypair, address, publicKey, generate, sign, clear } = useKeypair();
```

### useDecay

Real-time decay tracking with requestAnimationFrame:

```tsx
const decay = useDecay(createdAtSecs, lastEngagementSecs, {
  updateInterval: 1000, // Update every second
  realTime: true,       // Enable continuous updates
});

if (decay) {
  console.log(decay.currentHeat, decay.isDecayed);
}
```

### usePow

Non-blocking PoW mining:

```tsx
const { state, solution, error, mine, cancel, reset } = usePow();

// States: 'idle' | 'initializing' | 'mining' | 'complete' | 'error' | 'cancelled'
```

## Browser Compatibility

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 89+ | Full support |
| Firefox | 89+ | Full support |
| Safari | 15+ | Full support |
| Edge | 89+ | Full support |

Requirements:
- WebAssembly support
- ES modules support
- BigInt support

## Bundle Size

The WASM bundle is optimized for size:
- Target: <500KB gzipped
- Actual: ~200-400KB gzipped (varies by wasm-pack version)

Optimization strategies:
- `opt-level = "z"` in Cargo.toml
- LTO enabled
- Minimal dependencies (no tokio, sled, argon2)
- `default-features = false` for crypto crates

## Error Handling

All errors are converted to JavaScript exceptions:

```typescript
try {
  const decoded = decodeAddress(invalidAddress);
} catch (error) {
  console.error('Invalid address:', error.message);
}
```

With React hooks, errors are captured in state:

```tsx
const { loadError } = useSwimchain();
const { error: powError } = usePow();
```

## Performance Tips

1. **Initialize once**: Call `initWasm()` during app startup
2. **Use workers for PoW**: The main thread will block during mining
3. **Throttle decay updates**: Use `updateInterval` option in `useDecay`
4. **Clean up keypairs**: Call `keypair.free()` when done
5. **Batch operations**: Multiple hash operations are faster in sequence

## Security Considerations

1. **Key storage**: The library doesn't persist keys - implement secure storage
2. **Entropy source**: Uses browser's crypto.getRandomValues()
3. **No secret export**: Secret keys cannot be directly exported from WasmKeypair
4. **PoW verification**: Always verify PoW proofs server-side

## Troubleshooting

### "WASM not initialized"

Ensure `initWasm()` is called and awaited before using other functions:

```typescript
await initWasm();
// Now safe to use other functions
```

### Worker fails to load

Ensure your bundler supports module workers:

```javascript
// Vite config
export default {
  worker: {
    format: 'es'
  }
}
```

### Bundle too large

Check that you're not importing the native crate:

```typescript
// Correct - import from JS package
import { Keypair } from '@swimchain/core';

// Wrong - don't import Rust crate directly
// import { WasmKeypair } from 'swimchain-wasm';
```
