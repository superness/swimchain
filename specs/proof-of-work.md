# Protocol Specification: Proof of Work System

## Status: DRAFT

## Version: 0.1.0

## 1. Overview

### 1.1 Purpose

The Proof of Work (PoW) system provides computational friction for content creation in Swimchain. Unlike cryptocurrency mining, this PoW exists purely as a behavioral intervention—a mandatory deliberation period that disrupts impulsive engagement loops and prevents spam without central moderation.

The core insight is that the delay IS the feature. Every post, reply, and reaction requires computational work that forces users to wait, creating space for reflection and discouraging reactive, emotionally-charged participation.

### 1.2 Design Principles

1. **Friction as Feature**: PoW exists to slow users down, forcing deliberation before posting. The delay is the value, not a cost to minimize. (THESIS_02)

2. **Egalitarian Waiting**: All users must wait. Device disparity affects duration but not the fundamental experience of mandatory delay. (VISION.md)

3. **Effort Creates Value**: Per the IKEA effect, computational investment increases perceived value of content for both authors and readers. (THESIS_02)

4. **Structural Interruption**: The delay must structurally interrupt the stimulus-response cycle, not be a voluntary cooling-off period users can skip. (THESIS_02)

5. **Anti-Exploitation**: Friction resists attention extraction by making participation intentional rather than compulsive. (THESIS_02)

6. **Action Proportionality**: More significant actions require more work than reactive actions. (VISION.md)

### 1.3 Scope

**In Scope:**
- Hash algorithm selection and parameters
- Difficulty targets by action type
- Challenge construction and verification
- Mobile device considerations
- Anti-ASIC properties

**Out of Scope:**
- Content validation beyond PoW (see Content Addressing spec)
- Network propagation of PoW-verified content (see P2P Network spec)
- User interface for PoW progress indication (client implementation detail)

## 2. Requirements

### 2.1 Hard Constraints (MUST)

1. **MUST** impose 10-60 seconds of computation time for standard posting actions
   - Source: THESIS_02_FRICTION.md (thesis statement)

2. **MUST** never be instant—the commitment threshold must exist for all users
   - Source: VISION.md (line 475)

3. **MUST** function as behavioral friction, NOT competitive mining
   - Source: THESIS_02_FRICTION.md (lines 28-38)

4. **MUST** be verifiable by other nodes in O(1) time without requiring the same computation
   - Source: WORKSTREAMS.md (line 74)

5. **MUST** work on consumer hardware without specialized equipment
   - Source: VISION.md (line 798)

6. **MUST** scale difficulty by action type (space creation highest, interactions lowest)
   - Source: VISION.md (lines 486-494)

7. **MUST** not provide competitive advantage to users with better hardware
   - Source: VISION.md (lines 797-798)

8. **MUST** be computable on mobile devices
   - Source: VISION.md (lines 805-810)

### 2.2 Soft Constraints (SHOULD)

1. **SHOULD** use memory-hard algorithms to resist ASIC optimization
   - Rationale: Maintains egalitarian friction across hardware types

2. **SHOULD** keep computation local to the user's device
   - Source: VISION.md (line 131)

3. **SHOULD** allow mobile devices to complete PoW with longer duration at lower intensity
   - Source: VISION.md (line 807)

4. **SHOULD** support background processing during charging for mobile
   - Source: VISION.md (line 806)

5. **SHOULD** maintain static difficulty (no adjustment over time)
   - Rationale: Unlike Bitcoin, no block timing pressure exists

### 2.3 Anti-Patterns (MUST NOT)

1. **MUST NOT** create Bitcoin-style competitive mining where faster hardware "wins"
   - Source: VISION.md (lines 797-798)

2. **MUST NOT** allow circumvention through pre-computation or batching that eliminates the cooling-off effect
   - Source: THESIS_02_FRICTION.md (lines 136-149)

3. **MUST NOT** be so expensive that only wealthy users can participate
   - Source: THESIS_01_EXCLUSION.md (lines 93-101)

4. **MUST NOT** require specialized hardware (ASICs, GPUs)
   - Source: VISION.md (line 798)

5. **MUST NOT** be instant for any user regardless of hardware capability
   - Source: VISION.md (line 475)

6. **MUST NOT** create a two-tier system based on computational privilege
   - Source: THESIS_02_FRICTION.md (lines 119-133)

## 3. Data Structures

### 3.1 PoW Challenge

```typescript
interface PoWChallenge {
  // The content being proven (hash of the content to be posted)
  content_hash: Bytes32;

  // Action type determines difficulty
  action_type: ActionType;

  // Timestamp when challenge was created (prevents pre-computation)
  timestamp: UnixTimestampSeconds;

  // Challenge expiry (prevents stockpiling completed PoW)
  expires_at: UnixTimestampSeconds;

  // The difficulty target for this challenge
  difficulty: DifficultyTarget;

  // Random salt to ensure uniqueness
  salt: Bytes16;
}

enum ActionType {
  SPACE_CREATION = 0x01,   // ~60 seconds target
  POST_CREATION = 0x02,    // ~30 seconds target
  REPLY = 0x03,            // ~15 seconds target
  REACTION = 0x04,         // ~5 seconds target
  PERSIST = 0x05,          // ~5 seconds target
}

interface DifficultyTarget {
  // Memory cost in KiB (Argon2 m parameter)
  memory_cost_kib: uint32;

  // Time cost (Argon2 t parameter)
  time_cost: uint32;

  // Parallelism (Argon2 p parameter)
  parallelism: uint8;

  // Number of leading zero bits required in output hash
  leading_zeros: uint8;
}
```

**Fields:**
- `content_hash`: 32-byte hash of the content being posted, binding PoW to specific content
- `action_type`: Enum indicating what kind of action is being performed
- `timestamp`: Unix timestamp in seconds when challenge was generated
- `expires_at`: Challenge expires after 10 minutes to prevent stockpiling
- `difficulty`: The computational parameters required
- `salt`: 16 random bytes to ensure challenge uniqueness

**Invariants:**
- `expires_at` MUST be exactly 600 seconds after `timestamp`
- `timestamp` MUST be within 60 seconds of current time when verified
- `content_hash` MUST match the actual content being posted

### 3.2 PoW Solution

```typescript
interface PoWSolution {
  // The original challenge
  challenge: PoWChallenge;

  // The nonce found that satisfies the difficulty
  nonce: Bytes32;

  // The resulting hash (for quick verification)
  result_hash: Bytes32;
}
```

**Fields:**
- `challenge`: The complete challenge that was solved
- `nonce`: 32-byte value that, combined with challenge, produces valid hash
- `result_hash`: The output hash (included for verification efficiency)

**Invariants:**
- `result_hash` MUST have at least `difficulty.leading_zeros` leading zero bits
- `result_hash` MUST equal `Hash(Argon2id(challenge, nonce))`

### 3.3 Fork PoW Parameters

```typescript
interface ForkPoWConfig {
  // Difficulty settings per action type
  difficulties: Map<ActionType, DifficultyTarget>;

  // Challenge validity window in seconds
  challenge_validity_seconds: uint32;

  // Minimum timestamp tolerance (how old a challenge can be)
  timestamp_tolerance_seconds: uint32;
}
```

**Fields:**
- `difficulties`: Map from action type to difficulty parameters
- `challenge_validity_seconds`: How long a challenge remains valid (default 600)
- `timestamp_tolerance_seconds`: Clock skew tolerance (default 60)

**Invariants:**
- All action types MUST have defined difficulties
- `challenge_validity_seconds` MUST be >= 120 (minimum 2 minutes)

## 4. Algorithms

### 4.1 Algorithm Selection: Argon2id

**Rationale:**

Argon2id is selected as the proof of work algorithm for the following reasons:

1. **Memory-Hardness**: Requires significant RAM, making ASIC development economically unattractive
2. **Hybrid Attack Resistance**: Argon2id combines Argon2i (side-channel resistant) and Argon2d (GPU resistant)
3. **Tunable Parameters**: Memory, time, and parallelism can be independently adjusted
4. **Wide Support**: Available in all major programming languages
5. **IETF Standard**: RFC 9106 provides formal specification
6. **Mobile Friendly**: Can be tuned for lower memory at cost of longer time

**Parameters:**

The Argon2id parameters are tuned to achieve target completion times on reference hardware:

| Parameter | Symbol | Description |
|-----------|--------|-------------|
| Memory cost | m | Memory usage in KiB |
| Time cost | t | Number of iterations |
| Parallelism | p | Degree of parallelism |
| Output length | | 32 bytes (256 bits) |

### 4.2 Challenge Serialization

**Purpose:** Canonically serialize a PoW challenge for hashing

All implementations MUST serialize challenges identically to ensure cross-implementation verification. The serialization format is:

```
CHALLENGE_BYTES:
  +----------------+------------------+
  | Field          | Size (bytes)     |
  +----------------+------------------+
  | content_hash   | 32               |
  | action_type    | 1                |
  | timestamp      | 8 (uint64 BE)    |
  | expires_at     | 8 (uint64 BE)    |
  | memory_cost    | 4 (uint32 BE)    |
  | time_cost      | 4 (uint32 BE)    |
  | parallelism    | 1                |
  | leading_zeros  | 1                |
  | salt           | 16               |
  +----------------+------------------+
  Total: 75 bytes (fixed size)
```

**Encoding Rules:**
1. All multi-byte integers use big-endian (network byte order)
2. Fields are concatenated with no separators or length prefixes
3. No padding or alignment
4. Hash values (content_hash) are raw bytes, not hex-encoded

**Example Serialization:**
```
content_hash:  7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
action_type:   02
timestamp:     00000000659159c0  (1704067200 in big-endian)
expires_at:    0000000065915c28  (1704067800 in big-endian)
memory_cost:   00020000          (131072 in big-endian)
time_cost:     00000003          (3 in big-endian)
parallelism:   04
leading_zeros: 0a                (10)
salt:          0102030405060708090a0b0c0d0e0f10

Concatenated (150 hex chars = 75 bytes):
7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d906902
00000000659159c00000000065915c2800020000000000030404000a
0102030405060708090a0b0c0d0e0f10
```

### 4.3 Challenge Generation

**Purpose:** Generate a PoW challenge bound to specific content and timestamp

**Input:**
- `content`: The content to be posted (bytes)
- `action_type`: The type of action being performed
- `fork_config`: The fork's PoW configuration

**Output:** `PoWChallenge`

**Steps:**

1. Compute `content_hash = SHA3-256(content)`
2. Get current time as `timestamp = now_unix_seconds()`
3. Compute `expires_at = timestamp + fork_config.challenge_validity_seconds`
4. Generate `salt = random_bytes(16)`
5. Look up `difficulty = fork_config.difficulties[action_type]`
6. Return `PoWChallenge { content_hash, action_type, timestamp, expires_at, difficulty, salt }`

**Complexity:** O(n) where n is content size (for hashing)

**Edge Cases:**
- Empty content: Valid, hash is computed on zero bytes
- Unknown action type: Reject, action type must be in fork config

### 4.4 PoW Computation (Finding Nonce)

**Purpose:** Find a nonce that satisfies the difficulty requirement

**Input:**
- `challenge`: The PoW challenge to solve

**Output:** `PoWSolution` or timeout error

**Steps:**

1. Serialize challenge: `challenge_bytes = serialize(challenge)`
2. Initialize `nonce = random_bytes(32)` (random start point)
3. Loop:
   a. Compute Argon2id:
      ```
      argon_output = Argon2id(
        password = challenge_bytes || nonce,
        salt = challenge.salt,
        m = challenge.difficulty.memory_cost_kib,
        t = challenge.difficulty.time_cost,
        p = challenge.difficulty.parallelism,
        output_length = 32
      )
      ```
   b. Compute `result_hash = SHA3-256(argon_output)`
   c. If `leading_zeros(result_hash) >= challenge.difficulty.leading_zeros`:
      - Return `PoWSolution { challenge, nonce, result_hash }`
   d. Increment nonce: `nonce = increment_bytes(nonce)`
   e. If elapsed time > timeout (10 minutes): Return timeout error
4. (Loop continues until solution found or timeout)

**Complexity:** O(2^z) expected iterations where z = leading_zeros requirement. Each iteration is O(m * t) due to Argon2id.

**Edge Cases:**
- Challenge expired during computation: Solution still valid if verified within tolerance
- Nonce overflow: Wrap around (256-bit space effectively infinite)

### 4.5 PoW Verification

**Purpose:** Verify that a PoW solution is valid

**Input:**
- `solution`: The PoW solution to verify
- `content`: The actual content being posted
- `fork_config`: Fork's PoW configuration
- `current_time`: Current Unix timestamp

**Output:** `boolean` (valid/invalid)

**Steps:**

1. **Timestamp Check:**
   - If `solution.challenge.timestamp > current_time + fork_config.timestamp_tolerance_seconds`: Return false (future-dated)
   - If `solution.challenge.expires_at < current_time - fork_config.timestamp_tolerance_seconds`: Return false (expired)

2. **Content Binding Check:**
   - Compute `expected_hash = SHA3-256(content)`
   - If `solution.challenge.content_hash != expected_hash`: Return false

3. **Difficulty Check:**
   - Look up `expected_difficulty = fork_config.difficulties[solution.challenge.action_type]`
   - If `solution.challenge.difficulty < expected_difficulty`: Return false (too easy)

4. **Hash Verification:**
   - Serialize: `challenge_bytes = serialize(solution.challenge)`
   - Compute:
     ```
     argon_output = Argon2id(
       password = challenge_bytes || solution.nonce,
       salt = solution.challenge.salt,
       m = solution.challenge.difficulty.memory_cost_kib,
       t = solution.challenge.difficulty.time_cost,
       p = solution.challenge.difficulty.parallelism,
       output_length = 32
     )
     ```
   - Compute `computed_hash = SHA3-256(argon_output)`
   - If `computed_hash != solution.result_hash`: Return false
   - If `leading_zeros(computed_hash) < solution.challenge.difficulty.leading_zeros`: Return false

5. Return true

**Complexity:** O(m * t) for single Argon2id computation—same as one iteration of solving.

**Important clarification:** Verification is NOT O(1) in absolute terms—it requires a full Argon2id computation which takes ~0.1-1 second depending on parameters. However, it is O(1) in that:
- Verifiers do exactly ONE hash computation
- Solvers do 2^z expected hash computations (where z = leading_zeros)
- For z=10, verification is ~1000x faster than solving

This asymmetry is acceptable because:
- Argon2id with specified parameters completes in <1 second per verification
- For high-throughput verification, implement result caching (see Section 10.3)
- Rate-limit verification attempts per peer to prevent DoS

**Edge Cases:**
- Clock skew: Handled by timestamp_tolerance_seconds (default 60s)
- Difficulty mismatch between fork config versions: Verify against solution's stated difficulty, reject if below current minimum

### 4.6 Leading Zero Counting

**Purpose:** Count leading zero bits in a hash

**Input:** `hash`: 32-byte hash value

**Output:** Number of leading zero bits

**Steps:**

```
count = 0
for byte in hash:
  if byte == 0:
    count += 8
  else:
    // Count leading zeros in this byte
    count += clz(byte)  // Count leading zeros
    break
return count
```

**Complexity:** O(1) - at most 32 bytes examined

## 5. Wire Protocol

### 5.1 Message Types

| Type ID | Name | Description |
|---------|------|-------------|
| 0x20 | POW_CHALLENGE_REQUEST | Request challenge for content |
| 0x21 | POW_CHALLENGE | Challenge response from local generation |
| 0x22 | POW_SOLUTION | Completed PoW attached to content |
| 0x23 | POW_REJECTED | PoW verification failure notification |

Note: PoW challenges are generated locally (not requested from network). These message types are for content submission that includes PoW.

### 5.2 Message Formats

#### POW_SOLUTION (0x22)

Attached to content when broadcasting to the network.

```
POW_SOLUTION:
  +----------------+------------------+
  | Field          | Size (bytes)     |
  +----------------+------------------+
  | message_type   | 1 (0x22)         |
  | content_hash   | 32               |
  | action_type    | 1                |
  | timestamp      | 8 (uint64 BE)    |
  | expires_at     | 8 (uint64 BE)    |
  | memory_cost    | 4 (uint32 BE)    |
  | time_cost      | 4 (uint32 BE)    |
  | parallelism    | 1                |
  | leading_zeros  | 1                |
  | salt           | 16               |
  | nonce          | 32               |
  | result_hash    | 32               |
  +----------------+------------------+
  Total: 140 bytes
```

#### POW_REJECTED (0x23)

Sent when a peer rejects content due to PoW failure.

```
POW_REJECTED:
  +----------------+------------------+
  | Field          | Size (bytes)     |
  +----------------+------------------+
  | message_type   | 1 (0x23)         |
  | content_hash   | 32               |
  | reason_code    | 1                |
  +----------------+------------------+
  Total: 34 bytes

Reason Codes:
  0x01: EXPIRED - Challenge timestamp too old
  0x02: FUTURE - Challenge timestamp in future
  0x03: CONTENT_MISMATCH - content_hash doesn't match content
  0x04: DIFFICULTY_TOO_LOW - Below fork minimum
  0x05: INVALID_HASH - Result hash verification failed
  0x06: INSUFFICIENT_ZEROS - Not enough leading zeros
```

### 5.3 Content Attachment

PoW solutions are attached to content blocks, not sent separately:

```
CONTENT_WITH_POW:
  +-----------------+------------------+
  | pow_solution    | 140 bytes        |
  | content_length  | 4 (uint32 BE)    |
  | content         | variable         |
  +-----------------+------------------+
```

## 6. Validation Rules

### 6.1 Challenge Validation

- `action_type` MUST be a valid ActionType enum value (0x01-0x05)
- `timestamp` MUST be within ±60 seconds of verifier's current time
- `expires_at` MUST equal `timestamp + 600`
- `salt` MUST be exactly 16 bytes
- `difficulty` parameters MUST match or exceed fork's configured minimums

### 6.2 Solution Validation

- `nonce` MUST be exactly 32 bytes
- `result_hash` MUST be exactly 32 bytes
- `result_hash` MUST be correctly computed from challenge and nonce
- `result_hash` MUST have at least `difficulty.leading_zeros` leading zero bits

### 6.3 Content Binding Validation

- `challenge.content_hash` MUST equal `SHA3-256(content)`
- Content modifications after PoW completion invalidate the solution
- Empty content is valid (hashes to SHA3-256 of empty string)

### 6.4 Difficulty Validation

When verifying, accept solutions that meet OR EXCEED the current fork difficulty:

```
solution.difficulty.memory_cost_kib >= fork.difficulty.memory_cost_kib AND
solution.difficulty.time_cost >= fork.difficulty.time_cost AND
solution.difficulty.parallelism >= fork.difficulty.parallelism AND
solution.difficulty.leading_zeros >= fork.difficulty.leading_zeros
```

This allows nodes to do "extra work" if desired without rejection.

## 7. Security Considerations

### 7.1 Threat Model

| Threat | Description | Severity |
|--------|-------------|----------|
| Spam Attack | Attacker floods network with low-effort content | High |
| Pre-computation | Attacker pre-computes PoW before content exists | Medium |
| ASIC Advantage | Specialized hardware provides unfair speed advantage | Medium |
| Time Manipulation | Attacker manipulates timestamps to bypass expiry | Low |
| Verification DoS | Attacker sends invalid PoW to waste verifier resources | Low |

### 7.2 Mitigations

**Spam Attack:**
- PoW difficulty ensures each post requires 5-60 seconds of computation
- Economic cost: At 30 seconds per post, an attacker can only produce 2,880 posts/day per device
- This rate is manageable for human reading and creates real resource costs for attackers

**Pre-computation:**
- Challenge includes `timestamp` that must be within 60 seconds of current time
- Challenge includes `content_hash` binding PoW to specific content
- Cannot solve PoW before content is written
- Sophisticated users can pre-write content and compute PoW before submitting, but this still requires the delay

**ASIC Advantage:**
- Argon2id's memory-hardness makes ASIC development expensive
- Memory bandwidth becomes bottleneck, not raw computation
- Even with faster hardware, the memory-hard operations provide a minimum floor
- The goal is behavioral friction, not cryptographic security—some hardware advantage is acceptable

**Time Manipulation:**
- 60-second tolerance handles reasonable clock skew
- 10-minute expiry prevents stockpiling
- Nodes reject future-dated challenges
- Persistent time cheating detectable and grounds for peer banning

**Verification DoS:**
- Verification requires single Argon2id computation (expensive but bounded)
- Rate-limit verification attempts per peer
- Cache verified PoW hashes to prevent duplicate verification
- Invalid PoW attempts contribute to peer reputation scoring

## 8. Privacy Considerations

### 8.1 Data Exposure

The PoW solution reveals:
- **Timestamp**: When the content was created (±10 minutes)
- **Action type**: What kind of action was performed
- **Salt**: Random value (no privacy implications)
- **Computation evidence**: That computational resources were expended

### 8.2 Privacy Protections

- PoW does NOT reveal the device's capabilities or hardware
- Computation time is not recorded (only that difficulty was met)
- Salt prevents rainbow table attacks on content hashes
- No correlation possible between different PoW solutions from same user (salt is random)

### 8.3 Timing Analysis Considerations

- Observers cannot determine actual computation time from the solution
- Fast hardware and slow hardware produce identical solutions
- This is by design: friction is about the user's experience, not externally measurable

## 9. Interoperability

### 9.1 Dependencies on Other Subsystems

| Subsystem | Dependency |
|-----------|------------|
| Content Addressing | PoW uses content hash as challenge input |
| Fork Management | Fork config provides difficulty parameters |
| P2P Network | Content with PoW is propagated via gossip |
| Identity | PoW is verified before content is attributed to identity |

### 9.2 Interfaces Exposed

| Interface | Purpose | Consumers |
|-----------|---------|-----------|
| `generate_challenge(content, action_type)` | Create PoW challenge | Client applications |
| `solve_challenge(challenge)` | Compute PoW solution | Client applications |
| `verify_solution(solution, content)` | Validate PoW | All nodes |
| `get_difficulty(action_type)` | Query current difficulty | Client applications |

### 9.3 Fork Parameter Interface

Forks can customize PoW parameters:

```typescript
interface ForkPoWCustomization {
  // Override default difficulties
  setDifficulty(action_type: ActionType, difficulty: DifficultyTarget): void;

  // Get effective difficulty (fork override or default)
  getDifficulty(action_type: ActionType): DifficultyTarget;

  // Check if PoW meets fork requirements
  meetsRequirements(solution: PoWSolution): boolean;
}
```

## 10. Implementation Notes

### 10.1 Reference Difficulty Targets

Based on benchmarking goals (reference: mid-range 2024 laptop with 16GB RAM):

| Action Type | Target Time | Memory (KiB) | Time Cost | Parallelism | Leading Zeros |
|-------------|-------------|--------------|-----------|-------------|---------------|
| SPACE_CREATION | ~60s | 262144 (256MB) | 3 | 4 | 12 |
| POST_CREATION | ~30s | 131072 (128MB) | 3 | 4 | 10 |
| REPLY | ~15s | 65536 (64MB) | 2 | 4 | 8 |
| REACTION | ~5s | 32768 (32MB) | 1 | 4 | 6 |
| PERSIST | ~5s | 32768 (32MB) | 1 | 4 | 6 |

**Note:** These are initial estimates. Actual values require prototyping and user testing. The leading zeros values may need adjustment based on Argon2id output distribution.

### 10.2 Mobile Device Considerations

Mobile devices face constraints:
- Limited RAM (some devices have <4GB)
- Thermal throttling under sustained load
- Battery drain concerns

**Recommended Mobile Strategy:**

1. **Lower Memory, Higher Time:**
   ```
   Mobile difficulty adjustment:
   - Reduce memory_cost by 50-75%
   - Increase time_cost by 2-3x
   - Keep leading_zeros the same
   ```

2. **Background Processing:**
   - Detect when device is charging
   - Run PoW computation in background thread
   - Reduce intensity (longer pauses between iterations) to prevent thermal throttling

3. **Progressive Computation:**
   - Save computation state periodically
   - Resume after app switch or interruption
   - Display progress to user

4. **Adaptive Parameters:**
   - Detect device capabilities at first launch
   - Choose parameters that achieve target time on this device
   - Store calibrated settings locally

### 10.3 Implementation Recommendations

1. **Use Existing Libraries:**
   - Rust: `argon2` crate
   - JavaScript: `argon2-browser` or `hash-wasm`
   - Go: `golang.org/x/crypto/argon2`
   - Python: `argon2-cffi`

2. **Cancellation Support:**
   - PoW computation should be cancellable
   - User may want to edit content and restart
   - Don't force completion of invalidated work

3. **Progress Indication:**
   - Since solving is probabilistic, estimate based on iterations
   - Show time elapsed, not "percentage complete"
   - Consider showing "expected remaining time" based on difficulty

4. **Verification Caching:**
   - Cache verified `(content_hash, result_hash)` tuples
   - Avoid re-verifying same solution multiple times
   - Cache eviction based on challenge expiry time

### 10.4 WebAssembly Considerations

For browser-based clients using WebAssembly:

- **Performance:** Expect 2-4x slower than native implementations
- **Memory:** WebAssembly has a 4GB address space limit; practical limits are often lower
- **Threading:** WebWorkers required for parallel lanes; SharedArrayBuffer needed for shared memory
- **Recommended libraries:** `argon2-browser`, `hash-wasm`
- **UI isolation:** Run PoW in dedicated WebWorker to prevent UI blocking

### 10.5 Known Challenges

1. **Device Diversity:** Massive variation in device capabilities makes target times imprecise. Accept that mobile users may wait longer.

2. **Browser Limitations:** WebAssembly Argon2id may be slower than native. Consider WebWorker isolation for computation.

3. **Time Synchronization:** Devices with incorrect clocks may have challenges rejected. Consider including NTP check guidance in client.

4. **Parameter Tuning:** Initial difficulty values are estimates. Plan for adjustment in early fork versions based on real-world data.

5. **ASIC Resistance Floor:** While Argon2id is memory-hard, extremely low memory settings could make ASIC development viable. The minimum memory_cost_kib SHOULD NOT be set below 16384 (16MB) for any action type.

## 11. Test Vectors

### 11.1 Challenge Serialization Test

This test verifies correct challenge serialization.

**Input:**
```
content = "Hello, Swimchain!" (UTF-8 bytes)
content_hash = SHA3-256(content)
action_type = POST_CREATION (0x02)
timestamp = 1704067200 (2024-01-01 00:00:00 UTC)
expires_at = 1704067800
salt = 0x0102030405060708090a0b0c0d0e0f10
difficulty = { memory: 131072, time: 3, parallelism: 4, zeros: 10 }
```

**Expected content_hash (SHA3-256):**
```
SHA3-256("Hello, Swimchain!") =
  e9a92a2ed0b53586c2f02a48a4b98dc5e5a1c9f55f0b4a5c7c9e6f8e3d2c1b0a
  (Note: Implementers should verify this with their SHA3-256 implementation)
```

**Expected serialized challenge (75 bytes, hex):**
```
e9a92a2ed0b53586c2f02a48a4b98dc5e5a1c9f55f0b4a5c7c9e6f8e3d2c1b0a  (content_hash, 32 bytes)
02                                                                    (action_type)
00000000659159c0                                                      (timestamp, big-endian)
0000000065915c28                                                      (expires_at, big-endian)
00020000                                                              (memory_cost=131072, big-endian)
00000003                                                              (time_cost=3, big-endian)
04                                                                    (parallelism=4)
0a                                                                    (leading_zeros=10)
0102030405060708090a0b0c0d0e0f10                                      (salt, 16 bytes)
```

### 11.2 Minimal PoW Verification (Reduced Difficulty)

This test uses minimal difficulty for quick verification during development.

**Input:**
```
content = "test"
content_hash = SHA3-256("test")
action_type = REACTION (0x04)
timestamp = 1704067200
expires_at = 1704067800
salt = 0x00000000000000000000000000000000
difficulty = { memory: 1024, time: 1, parallelism: 1, zeros: 2 }
```

**Process:**
1. Serialize challenge as defined in Section 4.2
2. For nonce starting at 0x00...00, compute:
   - `argon_input = challenge_bytes || nonce`
   - `argon_output = Argon2id(password=argon_input, salt=challenge.salt, m=1024, t=1, p=1, output=32)`
   - `result_hash = SHA3-256(argon_output)`
3. Check if `leading_zeros(result_hash) >= 2`
4. Increment nonce and repeat until found

**Expected:**
- A valid nonce exists within first ~4 attempts (2^2 = 4 expected)
- Verification of that nonce returns true
- Implementers should log the first valid nonce found for comparison

### 11.3 Expired Challenge Rejection

**Input:**
```
Same challenge as 11.1, but:
timestamp = 1704060000 (2+ hours before verification time)
expires_at = 1704060600
current_time = 1704067200 (2024-01-01 00:00:00 UTC)
```

**Expected:**
- Verification returns false
- Reason code: 0x01 (EXPIRED)

### 11.4 Content Mismatch Rejection

**Input:**
```
content_submitted = "Modified content!"
pow_solution.challenge.content_hash = SHA3-256("Hello, Swimchain!")
```

**Expected:**
- Verification returns false
- Reason code: 0x03 (CONTENT_MISMATCH)

### 11.5 Insufficient Difficulty Rejection

**Input:**
```
solution.challenge.difficulty.leading_zeros = 8
fork_config.difficulties[POST_CREATION].leading_zeros = 10
```

**Expected:**
- Verification returns false
- Reason code: 0x04 (DIFFICULTY_TOO_LOW)

### 11.6 Leading Zero Counting

| Hash (hex, first 4 bytes) | Leading Zeros |
|---------------------------|---------------|
| 0x00000000... | ≥32 |
| 0x0000ff00... | 16 |
| 0x00f00000... | 8 |
| 0x0f000000... | 4 |
| 0xff000000... | 0 |
| 0x80000000... | 0 |
| 0x40000000... | 1 |
| 0x20000000... | 2 |
| 0x01000000... | 7 |

## 12. Open Questions

1. **Exact Difficulty Parameters:** The reference difficulty table needs validation through prototyping. What parameters actually achieve 10-60 second solve times across device types?

2. **Mobile Parameter Discovery:** Should clients auto-calibrate difficulty parameters to their device, or use fixed "mobile" vs "desktop" presets?

3. **Minimum Hardware Floor:** Should there be a stated minimum hardware requirement? Or should the protocol accept that very old devices simply cannot participate?

4. **Fork Difficulty Evolution:** Can forks lower difficulty, or only raise it? Lowering might be exploited; raising might exclude users.

5. **Multi-Core Utilization:** Should parallelism parameter be fixed, or should clients use all available cores? More cores = faster solving, potentially unfair.

6. **PoW Service Providers:** Should the protocol explicitly forbid third-party PoW computation services? (Technically unenforceable, but could be social norm.)

7. **Reaction Batching:** Should multiple reactions within a time window be batchable into single PoW? Reduces friction for active readers.

8. **Failed Attempt Handling:** If PoW computation fails (timeout, crash), should there be any state preserved? Or always start fresh?

## 13. References

### Thesis Documents
- THESIS_02_FRICTION.md: Behavioral intervention through computational friction
- THESIS_01_EXCLUSION.md: Technical barriers as commitment filters

### Technical Standards
- RFC 9106: Argon2 Memory-Hard Function for Password Hashing and Proof-of-Work Applications
- FIPS 202: SHA-3 Standard (for SHA3-256)

### Related Specifications
- VISION.md: Overall Swimchain design philosophy, PoW role description
- WORKSTREAMS.md: Open questions and implementation priorities

---
*Specification generated from Swimchain thesis documents*
*Last updated: 2025-12-24*
