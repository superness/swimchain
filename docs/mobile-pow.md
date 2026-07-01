# Swimchain Mobile PoW Implementation

Battery-conscious proof-of-work implementation for mobile devices using native Argon2id.

## Table of Contents

1. [Argon2id Configuration](#argon2id-configuration)
2. [Difficulty Recommendations](#difficulty-recommendations)
3. [Time Estimates](#time-estimates)
4. [Battery Estimates](#battery-estimates)
5. [Native Module API](#native-module-api)
6. [Progress Callback Format](#progress-callback-format)
7. [Error Handling](#error-handling)
8. [Testing](#testing)

## Argon2id Configuration

Per SPEC_03, mobile devices use standard Argon2id parameters:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Memory | 64 MiB (65536 KiB) | Memory cost |
| Iterations | 3 | Time cost |
| Parallelism | 2 | Parallel lanes |
| Hash Length | 32 bytes | Output size |

### TypeScript Configuration

```typescript
export const ARGON2_CONFIG = {
  memoryKib: 65536,  // 64 MiB
  iterations: 3,
  parallelism: 2,
  hashLength: 32,
} as const;
```

## Difficulty Recommendations

Mobile devices use difficulty 8-10 to balance user experience with spam prevention.

| Action | Difficulty | Expected Time | Battery Impact |
|--------|------------|---------------|----------------|
| New Post | 9 | ~51 seconds | ~8% |
| Reply | 8 | ~26 seconds | ~4% |
| Engagement | 8 | ~26 seconds | ~4% |

### Difficulty vs Time Relationship

The expected time doubles with each difficulty level increase:

- Difficulty 8: ~26 seconds
- Difficulty 9: ~51 seconds
- Difficulty 10: ~102 seconds
- Difficulty 11: ~205 seconds

Formula: `expectedTime = 2^difficulty * hashTime`

Where `hashTime` ≈ 100ms on mobile devices.

## Time Estimates

### Estimation Function

```typescript
function estimateDuration(difficulty: number): number {
  // Known estimates from mobile-viability.md
  const ESTIMATES: Record<number, number> = {
    8: 26000,   // ~26 seconds
    9: 51000,   // ~51 seconds
    10: 102000, // ~102 seconds
  };

  if (difficulty in ESTIMATES) {
    return ESTIMATES[difficulty];
  }

  // Fallback: 2^difficulty * 100ms average per hash
  return Math.pow(2, difficulty) * 100;
}
```

### Real-Time Updates

During mining, the native module sends progress updates every ~100ms:

```typescript
interface MiningProgress {
  currentNonce: string;          // Current nonce being tested
  hashesPerSecond: number;       // Actual mining rate
  elapsedMs: number;             // Time spent so far
  estimatedRemainingMs: number;  // Time to expected solution
}
```

## Battery Estimates

### Battery Usage Formula

Based on mobile-viability.md benchmarks:

```typescript
function estimateBattery(durationMs: number): number {
  // ~5% battery per 30 seconds of mining
  const thirtySecondIntervals = durationMs / 30000;
  return thirtySecondIntervals * 5;
}
```

### Battery by Action

| Action | Duration | Battery Usage |
|--------|----------|---------------|
| Quick engage (+5s) | ~5 seconds | <1% |
| Standard engage (+15s) | ~15 seconds | ~2% |
| Full engage (+30s) | ~30 seconds | ~5% |
| Reply (difficulty 8) | ~26 seconds | ~4% |
| New Post (difficulty 9) | ~51 seconds | ~8% |

### User Communication

The UI displays battery estimates before starting PoW:

```
Estimated mining time: ~26s (~4% battery)
```

## Native Module API

### TypeScript Interface

```typescript
export interface NativeArgon2Module {
  /**
   * Compute a single Argon2id hash
   */
  hash(
    input: Uint8Array,
    salt: Uint8Array,
    config: Argon2Config
  ): Promise<Uint8Array>;

  /**
   * Mine for a valid PoW solution
   */
  mine(
    challenge: Uint8Array,
    difficulty: number,
    config: Argon2Config,
    onProgress: (progress: MiningProgress) => void,
  ): Promise<PowSolution>;

  /**
   * Cancel ongoing mining operation
   */
  cancel(): void;

  /**
   * Check if native module is available
   */
  isAvailable(): boolean;
}
```

### Solution Format

```typescript
export interface PowSolution {
  nonce: string;        // BigInt as string
  hash: string;         // Hex-encoded hash
  attempts: number;     // Total hashes computed
  elapsedMs: number;    // Total mining time
}
```

### iOS Implementation (Swift)

```swift
@objc func mine(_ challengeBase64: String,
                difficulty: Int,
                memoryKib: Int,
                iterations: Int,
                parallelism: Int,
                hashLength: Int,
                startNonce: String,
                resolve: @escaping RCTPromiseResolveBlock,
                reject: @escaping RCTPromiseRejectBlock) {
    // Uses DispatchQueue.global(qos: .userInitiated)
    // Progress sent via RCTEventEmitter every 100ms
    // Atomic boolean for cancellation
}
```

### Android Implementation (Kotlin)

```kotlin
@ReactMethod
fun mine(
    challengeBase64: String,
    difficulty: Int,
    memoryKib: Int,
    iterations: Int,
    parallelism: Int,
    hashLength: Int,
    startNonce: String,
    promise: Promise
) {
    // Uses Executors.newSingleThreadExecutor()
    // Progress sent via DeviceEventEmitter every 100ms
    // AtomicBoolean for cancellation
}
```

## Progress Callback Format

### Event Structure

Progress events are emitted via the native event emitter:

```typescript
// Event name: "miningProgress"
interface MiningProgress {
  currentNonce: string;          // "12345"
  hashesPerSecond: number;       // 10.5
  elapsedMs: number;             // 15000
  estimatedRemainingMs: number;  // 11000
}
```

### Subscribing to Progress

```typescript
import { NativeEventEmitter, NativeModules } from 'react-native';

const eventEmitter = new NativeEventEmitter(NativeModules.NativeArgon2);

const listener = eventEmitter.addListener('miningProgress', (progress) => {
  console.log(`Progress: ${progress.hashesPerSecond} H/s`);
  console.log(`Remaining: ${progress.estimatedRemainingMs}ms`);
});

// Cleanup
listener.remove();
```

## Error Handling

### Error Types

| Code | Description | Recovery |
|------|-------------|----------|
| `INVALID_INPUT` | Bad base64 input | Check encoding |
| `HASH_ERROR` | Argon2 computation failed | Retry |
| `MINING_ERROR` | Mining failed | Retry with new challenge |
| `CANCELLED` | User cancelled mining | Normal termination |

### Handling Errors

```typescript
try {
  const solution = await NativeArgon2.mine(challenge, difficulty, config, onProgress);
  // Success
} catch (error) {
  if (error.message.includes('CANCELLED')) {
    // User cancelled - not an error
    return;
  }
  // Actual error - show message and retry option
  Alert.alert('Mining Failed', error.message);
}
```

### Challenge Expiry

Challenges expire after 10 minutes. The `ChallengeManager` handles refresh:

```typescript
// Check every 30 seconds during mining
if (challengeManager.shouldRefresh()) {
  // Pause mining
  cancel();
  // Fetch new challenge
  const newChallenge = await challengeManager.fetchChallenge(actionType, contentHash);
  // Resume with nonce offset
  await mine(newChallenge, difficulty, config, onProgress, currentNonce + 1n);
}
```

## Testing

### Unit Tests

1. **Hash Verification**: Verify native hash matches expected output
2. **Mining Success**: Find valid nonce for low difficulty
3. **Progress Callbacks**: Verify ~10 callbacks per second
4. **Cancellation**: Cancel stops within 500ms

### Test Cases

```typescript
describe('NativeArgon2', () => {
  test('hash produces correct output', async () => {
    const input = new Uint8Array([1, 2, 3, 4]);
    const salt = new Uint8Array(16);
    const hash = await NativeArgon2.hash(input, salt, ARGON2_CONFIG);
    expect(hash.length).toBe(32);
  });

  test('mine finds valid nonce for difficulty 4', async () => {
    const challenge = new Uint8Array(32);
    const solution = await NativeArgon2.mine(challenge, 4, ARGON2_CONFIG);
    expect(solution.nonce).toBeDefined();
    expect(solution.elapsedMs).toBeLessThan(2000);
  });

  test('progress callbacks fire regularly', async () => {
    const callbacks: MiningProgress[] = [];
    await NativeArgon2.mine(challenge, 6, ARGON2_CONFIG, (p) => callbacks.push(p));
    // Should get 8-12 callbacks per second
    expect(callbacks.length).toBeGreaterThan(5);
  });

  test('cancel stops mining within 500ms', async () => {
    const startTime = Date.now();
    const miningPromise = NativeArgon2.mine(challenge, 20, ARGON2_CONFIG);

    setTimeout(() => NativeArgon2.cancel(), 100);

    try {
      await miningPromise;
    } catch (e) {
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(600);
    }
  });
});
```

### Integration Tests

1. **Full Flow**: Challenge → Mine → Submit → Success
2. **Expiry Handling**: Challenge expires during mining → Auto-refresh
3. **Offline Queue**: Mine offline → Queue → Connectivity → Process

### Performance Testing

- Memory stays under 300MB during PoW
- UI maintains 60fps during background mining
- No JS thread blocking during native mining
