# @swimchain/frontend

Shared React components, hooks, and utilities for Swimchain client applications.

## Installation

```bash
npm install @swimchain/frontend
# or
pnpm add @swimchain/frontend
```

## Usage

### Providers

Wrap your app with the required providers:

```tsx
import { SwimchainProvider, IdentityProvider } from '@swimchain/frontend';

function App() {
  return (
    <SwimchainProvider fallback={<Loading />}>
      <IdentityProvider>
        <YourApp />
      </IdentityProvider>
    </SwimchainProvider>
  );
}
```

### Hooks

```tsx
import { useKeypair, usePow, useStoredIdentity, useStoredKeypair } from '@swimchain/frontend';

// Generate a new keypair
const { keypair, address, generate, clear } = useKeypair();

// Mine proof-of-work
const { state, solution, mine, cancel, reset, attempts, elapsedMs } = usePow();

// Access stored identity
const { identity, isLoading } = useStoredIdentity();

// Get WASM keypair from stored identity
const { keypair, sign, publicKey, address } = useStoredKeypair();
```

### Components

```tsx
import { PowProgress, AddressDisplay, IdentityCard } from '@swimchain/frontend';

// Show PoW mining progress
<PowProgress
  attempts={attempts}
  elapsedMs={elapsedMs}
  difficulty={20}
  onCancel={cancel}
/>

// Display a Swimchain address with copy button
<AddressDisplay address="cs1abc..." truncate />

// Show identity card
<IdentityCard identity={identity} />
```

### Library Functions

```tsx
import {
  // Action PoW (Argon2id)
  computePow,
  ActionType,
  TESTNET_DIFFICULTY,
  TESTNET_CONFIG,

  // Encryption
  encryptContent,
  decryptContent,
  encryptMedia,
  decryptMedia,

  // Utilities
  hexToBytes,
  bytesToHex,
} from '@swimchain/frontend';

// Mine action PoW for a post
const solution = await computePow(challenge, TESTNET_CONFIG);

// Encrypt content
const encrypted = await encryptContent('Hello world', 'passphrase');
```

### WASM Functions

```tsx
import { wasm } from '@swimchain/frontend';

// Initialize WASM
await wasm.initWasm();

// Create keypair
const keypair = new wasm.WasmKeypair();
const address = wasm.encode_address(keypair.publicKey());
```

## Exports

| Module | Description |
|--------|-------------|
| `@swimchain/frontend` | All exports |
| `@swimchain/frontend/hooks` | React hooks |
| `@swimchain/frontend/components` | React components |
| `@swimchain/frontend/providers` | Context providers |
| `@swimchain/frontend/lib` | Utility functions |

## Peer Dependencies

- `react` ^18.2.0
- `react-dom` ^18.2.0
- `react-router-dom` ^6.20.0
