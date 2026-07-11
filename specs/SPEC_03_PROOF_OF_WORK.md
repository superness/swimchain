# Protocol Specification: Proof of Work System (Swimming)

Every stroke requires effort. You can't fake swimming.

## Status: DRAFT

## Version: 2.0.0

## 1. Overview

### 1.1 Purpose

The Proof of Work (PoW) system implements computational friction for ALL actions on Swimchain. Like swimming, every stroke requires effort. This PoW serves dual purposes:

**Behavioral Intervention:**
- Prevents spam without central moderation
- Creates mandatory deliberation periods before posting
- Disrupts impulsive engagement loops
- Makes participation intentional rather than compulsive

**Economic Foundation:**
- **ALL engagement costs PoW** - no free persistence
- Each engagement is an individual PoW action that resets content decay
- Content persistence reflects actual community investment
- Sybil attacks provide zero advantage (each engagement costs the same work)

**Key Insight: Mining IS Paying.** There is no distinction between "mining" and "paying for actions." Users mine to post, mine to engage, mine to persist content. The mechanism is identical to Bitcoin - the difference is that reward is the action itself, not a token.

The delay IS the feature, not a cost to minimize.

### 1.2 Design Principles

1. **Friction as Feature**: PoW exists to slow users down, forcing deliberation before posting. The delay IS the value, not a cost to minimize.

2. **Egalitarian Waiting**: All users should wait. Device disparity affects duration but not the fundamental experience of mandatory delay.

3. **Effort Creates Value**: Per the IKEA effect, computational investment increases perceived value of content for both authors and readers.

4. **Structural Interruption**: The delay must structurally interrupt the stimulus-response cycle, not be a voluntary cooling-off period users can skip.

5. **Anti-Exploitation**: Friction resists attention extraction by making participation intentional rather than compulsive.

6. **Action Proportionality**: More significant actions (creating spaces, starting threads) require more work than reactive actions (replies, reactions).

### 1.3 Scope

This specification covers:
- Hash algorithm selection and parameters
- Difficulty targets by action type
- Challenge generation and verification
- Wire protocol for PoW exchange
- Mobile device considerations
- Anti-ASIC properties

## 2. Requirements

### 2.1 Hard Constraints

| ID | Requirement | Source |
|----|-------------|--------|
| HC-1 | MUST impose 10-60 seconds of computation time for standard posting | THESIS_02_FRICTION.md |
| HC-2 | MUST never be instant - the commitment threshold must exist for all users | VISION.md |
| HC-3 | MUST function as behavioral friction, NOT competitive mining | THESIS_02_FRICTION.md |
| HC-4 | MUST be verifiable by other nodes without requiring the same computation time | WORKSTREAMS.md |
| HC-5 | MUST work on consumer hardware without specialized equipment | VISION.md |
| HC-6 | MUST scale difficulty by action type (space creation highest, interactions lowest) | VISION.md |
| HC-7 | MUST NOT provide competitive advantage to better hardware | VISION.md |
| HC-8 | MUST be computable on mobile devices | VISION.md |

### 2.2 Soft Constraints

| ID | Requirement | Rationale |
|----|-------------|-----------|
| SC-1 | SHOULD use memory-hard algorithms to resist ASIC optimization | Prevents specialized hardware advantage |
| SC-2 | SHOULD keep computation local to the user's device | VISION.md |
| SC-3 | SHOULD allow mobile devices to complete PoW with longer duration, lower intensity | VISION.md |
| SC-4 | SHOULD support background processing during charging for mobile | VISION.md |
| SC-5 | SHOULD NOT require difficulty adjustment over time | No block timing pressure; friction is the goal |

### 2.3 Anti-Patterns

| ID | Anti-Pattern | Source |
|----|--------------|--------|
| AP-1 | MUST NOT create Bitcoin-style competitive mining where faster hardware "wins" | VISION.md |
| AP-2 | MUST NOT allow circumvention through pre-computation that eliminates cooling-off | THESIS_02_FRICTION.md |
| AP-3 | MUST NOT be so expensive that only wealthy users can participate | THESIS_01_EXCLUSION.md |
| AP-4 | MUST NOT require specialized hardware (ASICs, GPUs) | VISION.md |
| AP-5 | MUST NOT be instant for any user regardless of hardware | VISION.md |
| AP-6 | MUST NOT create a two-tier system based on computational privilege | THESIS_02_FRICTION.md |

## 3. Data Structures

### 3.1 PoWChallenge

```
struct PoWChallenge {
    action_type: ActionType,      // Type of action being performed
    content_hash: bytes32,        // SHA-256 hash of content being created
    author_id: bytes32,           // Identity public key of author
    timestamp: uint64,            // Unix timestamp (seconds)
    difficulty: uint8,            // Number of leading zero bits required
    nonce_space: bytes8,          // Random bytes to prevent challenge reuse
}

enum ActionType {
    SPACE_CREATION = 0x01,        // Creating a new space
    POST = 0x02,                  // Creating a new post/thread
    REPLY = 0x03,                 // Replying to existing content
    ENGAGE = 0x04,                // Engagement action (persistence)
    IDENTITY_UPDATE = 0x05,       // Updating identity metadata
}

// Note: REACTION (0x04) renamed to ENGAGE in v2.0.0 to reflect the per-engagement PoW model
```

### 3.2 PoWSolution

```
struct PoWSolution {
    challenge: PoWChallenge,      // The challenge being solved
    nonce: uint64,                // The nonce that produces valid hash
    hash: bytes32,                // The resulting Argon2id hash
}
```

### 3.3 ForkPoWConfig

```
struct ForkPoWConfig {
    algorithm: AlgorithmId,       // Currently only ARGON2ID
    memory_kib: uint32,           // Memory parameter (default: 65536 = 64 MiB)
    iterations: uint32,           // Time parameter (default: 3)
    parallelism: uint8,           // Parallelism parameter (default: 4)
    difficulties: map<ActionType, uint8>,  // Per-action difficulty
}
```

## 4. Algorithms

### 4.1 Algorithm Selection: Argon2id

Swimchain uses **Argon2id** (RFC 9106) for proof of work.

**Rationale:**
- Memory-hard: Resists ASIC/GPU optimization
- IETF standardized: Wide implementation availability
- Tunable: Memory, time, and parallelism parameters
- Hybrid: Combines Argon2i (side-channel resistance) and Argon2d (GPU resistance)

**Default Parameters:**
- Memory: 64 MiB (65536 KiB)
- Iterations: 3
- Parallelism: 4
- Hash length: 32 bytes

### 4.2 Challenge Serialization

Canonical serialization format for PoWChallenge (75 bytes total):

```
Offset  Size  Field
------  ----  -----
0       1     action_type (uint8)
1       32    content_hash (bytes32)
33      32    author_id (bytes32)
65      8     timestamp (uint64, big-endian)
73      1     difficulty (uint8)
74      8     nonce_space (bytes8)
```

All multi-byte integers are big-endian. This format MUST be used for all implementations to ensure consistent verification.

### 4.3 Challenge Generation

```
function generate_challenge(
    action: ActionType,
    content: bytes,
    author: Identity,
    fork_config: ForkPoWConfig
) -> PoWChallenge {
    return PoWChallenge {
        action_type: action,
        content_hash: sha256(content),
        author_id: author.public_key,
        timestamp: current_unix_time(),
        difficulty: fork_config.difficulties[action],
        nonce_space: random_bytes(8),
    }
}
```

### 4.4 PoW Computation

```
function compute_pow(
    challenge: PoWChallenge,
    config: ForkPoWConfig
) -> PoWSolution {
    nonce = 0

    while true {
        // Construct input: serialized challenge || nonce
        input = serialize(challenge) || uint64_be(nonce)

        // Compute Argon2id hash
        hash = argon2id(
            password: input,
            salt: challenge.nonce_space,
            memory: config.memory_kib,
            iterations: config.iterations,
            parallelism: config.parallelism,
            hash_length: 32
        )

        // Check if hash meets difficulty target
        if leading_zeros(hash) >= challenge.difficulty {
            return PoWSolution {
                challenge: challenge,
                nonce: nonce,
                hash: hash
            }
        }

        nonce += 1
    }
}
```

### 4.5 PoW Verification

```
function verify_pow(
    solution: PoWSolution,
    config: ForkPoWConfig
) -> bool {
    // Reconstruct input
    input = serialize(solution.challenge) || uint64_be(solution.nonce)

    // Recompute hash (single computation, not O(1) but constant)
    expected_hash = argon2id(
        password: input,
        salt: solution.challenge.nonce_space,
        memory: config.memory_kib,
        iterations: config.iterations,
        parallelism: config.parallelism,
        hash_length: 32
    )

    // Verify hash matches and meets difficulty
    return expected_hash == solution.hash
        && leading_zeros(solution.hash) >= solution.challenge.difficulty
}
```

**Note on Verification Complexity:** Verification requires a single Argon2id computation, which takes 50-200ms depending on parameters. This is NOT O(1) in absolute terms, but it is constant-time relative to the solving work (which may require millions of attempts). The asymmetry between solving (many attempts) and verifying (one attempt) makes this viable.

### 4.6 Leading Zero Counting

```
function leading_zeros(hash: bytes32) -> uint8 {
    count = 0
    for byte in hash {
        if byte == 0 {
            count += 8
        } else {
            // Count leading zeros in this byte
            count += clz(byte)  // Count leading zeros
            break
        }
    }
    return count
}
```

## 5. Wire Protocol

### 5.1 Message Types

| Type | ID | Description |
|------|-----|-------------|
| POW_CHALLENGE | 0x30 | Request PoW parameters for an action |
| POW_SOLUTION | 0x31 | Submit completed PoW with content |
| POW_REJECT | 0x32 | Reject invalid PoW solution |

### 5.2 Message Formats

**POW_CHALLENGE Request:**
```
[1 byte: message type (0x30)]
[1 byte: action_type]
[32 bytes: content_hash]
```

**POW_CHALLENGE Response:**
```
[1 byte: message type (0x30)]
[75 bytes: serialized PoWChallenge]
```

**POW_SOLUTION:**
```
[1 byte: message type (0x31)]
[75 bytes: serialized PoWChallenge]
[8 bytes: nonce (big-endian)]
[32 bytes: hash]
[4 bytes: content_length]
[N bytes: content]
```

**POW_REJECT:**
```
[1 byte: message type (0x32)]
[1 byte: rejection_reason]
[32 bytes: challenge content_hash]
```

Rejection reasons:
- 0x01: Invalid hash (doesn't meet difficulty)
- 0x02: Challenge expired
- 0x03: Content mismatch
- 0x04: Duplicate submission

### 5.3 Content Attachment

PoW solutions are attached to content during propagation:

```
struct SignedContent {
    content: bytes,
    signature: bytes64,
    pow_solution: PoWSolution,  // Attached PoW proof
}
```

Nodes MUST verify PoW before accepting and propagating content.

## 6. Validation Rules

### 6.1 Challenge Validation

1. `action_type` MUST be a valid ActionType
2. `timestamp` MUST be within 10 minutes of current time
3. `difficulty` MUST match fork configuration for action type
4. `content_hash` MUST match SHA-256 of associated content

### 6.2 Solution Validation

1. Recomputed hash MUST equal provided hash
2. Hash MUST have at least `difficulty` leading zero bits
3. Challenge timestamp MUST not be expired (10 minute window)
4. Nonce MUST be a valid uint64

### 6.3 Content Binding

1. `content_hash` in challenge MUST match SHA-256 of submitted content
2. `author_id` MUST match signer of content
3. Content timestamp MUST be within 1 minute of challenge timestamp

### 6.4 Difficulty Requirements

Per-action minimum difficulties (leading zero bits):

| Action | Difficulty | Target Time | Notes |
|--------|------------|-------------|-------|
| SPACE_CREATION | 22 | ~60 seconds | One-time per space |
| POST | 20 | ~30 seconds | Creates new thread |
| REPLY | 18 | ~15 seconds | Adds to existing thread |
| ENGAGE | 16 | ~5 seconds | Individual PoW action, resets decay |
| IDENTITY_UPDATE | 20 | ~30 seconds | Updating profile |

**Engagement (ENGAGE action):**

Engagement to persist content is an **individual PoW action**. Each engagement is a self-contained proof of work, comparable in cost to a REPLY, and a valid engagement resets the target content's decay timer immediately.

| Parameter | Value | Notes |
|-----------|-------|-------|
| Difficulty | 16 leading zero bits | ~5 seconds on reference hardware |
| Effect | Resets decay timer | Updates last_engagement, increments engagement_count |
| Repeatable | Yes | Any identity can engage again later to keep resetting decay |

**Why Sybils don't help:** Each engagement costs the same PoW regardless of identity. Splitting engagement across 100 identities costs 100 separate proofs of work, not a discount.

Note: These are reference values. Actual difficulty should be calibrated through prototyping to achieve target times on reference hardware.

## 7. Engagement PoW System

### 7.1 Purpose

**ALL engagement costs PoW.** This prevents free self-persistence and ensures content survival reflects genuine community investment.

Without engagement PoW:
- Attacker posts content (30s PoW)
- Attacker self-interacts for free forever
- Content persists indefinitely at no ongoing cost

With engagement PoW:
- Attacker posts content (30s PoW)
- Each engagement to persist content costs its own PoW
- Ongoing cost makes abuse economically irrational

### 7.2 Engagement Mechanics

Each engagement is a self-contained PoW action carried in the normal action/mempool flow. There is no shared accumulator and no multi-contributor coordination - one valid engagement resets the target content's decay timer on its own.

```
Engagement {
    target_content:     ContentHash     // Content being engaged
    engager:            PublicKey        // Who engaged
    pow_nonce:          uint64          // PoW solution
    pow_work:           uint64          // Work amount in seconds
    timestamp:          Timestamp       // When engaged
    signature:          Signature       // Proof of engagement
}
```

### 7.3 Engagement Lifecycle

```
1. COMPUTE
   ├── User selects content X to keep alive
   ├── PoW target: H(nonce || content_hash || prev_block)
   └── User computes a solution meeting ENGAGE difficulty

2. BROADCAST
   ├── Engagement action broadcast to peers via the mempool
   ├── Peers validate the PoW and signature
   └── Valid engagement is included in the content block

3. EFFECT
   ├── Content decay timer reset (last_engagement updated)
   ├── engagement_count incremented
   └── Engager credited as keeping content alive

4. REPEAT
   ├── Any identity can engage again later
   └── Each new engagement resets decay again
```

### 7.4 Content-Specific PoW

Engagement PoW includes the content hash, preventing reuse:

```
PoW Target = H(nonce || content_hash || prev_block_hash)

This ensures:
├── PoW is specific to target content
├── PoW is tied to chain state (prev_block_hash)
└── Cannot reuse PoW for different content
```

### 7.5 Attack Resistance

**Private Space Abuse:**
```
Attack: Use private space as personal storage
├── Post 100 files: 100 × 30s = 50 min initial
├── Ongoing persistence: an engagement per content, repeatedly
└── Vs. actual hosting: $0.10/month

Result: Economically irrational
```

**Sybil Attack:**
```
Attack: Create 100 identities to cheapen engagement
├── Each engagement costs its own PoW
├── 100 identities × full engagement PoW each
├── 1 identity × full engagement PoW per engagement
└── Same per-engagement cost regardless

Result: No advantage to Sybils
```

**Self-Persistence:**
```
Attack: Keep own content alive via self-engagement
├── Author pays full engagement PoW per engagement
├── Same cost as anyone else
├── No free ride
└── Must actually invest compute

Result: Expensive, can't scale
```

## 8. Security Considerations

### 8.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| Pre-computation attacks | Content hash binding; timestamp expiry |
| Challenge stockpiling | 10-minute expiry; nonce_space uniqueness |
| ASIC optimization | Memory-hard Argon2id; 64 MiB minimum |
| Outsourced computation | Acceptable - user still waits; content binding prevents resale |
| Replay attacks | Challenge includes timestamp, author, content hash |
| Difficulty manipulation | Fork consensus governs parameters |

### 7.2 Mitigations

**Pre-computation Prevention:**
- Challenge includes content hash, forcing PoW after content is composed
- Timestamp prevents storing solutions for future use
- nonce_space adds per-challenge entropy

**Spam Resistance:**
- Difficulty calibrated so spam attacks are economically irrational
- No batching: each piece of content requires separate PoW
- Rate-limit verification attempts per peer (recommended: 10/second)

**ASIC Resistance:**
- Argon2id memory-hardness makes specialized hardware impractical
- 64 MiB memory requirement exceeds typical ASIC cache
- Minimum memory floor of 32 MiB recommended for any fork parameters

## 8. Privacy Considerations

- PoW computation is local; no information leakage during solving
- Challenge requests reveal intent to post before content is ready
- Timing analysis could correlate challenges with solutions
- Mitigation: Clients SHOULD add random delay (0-5s) before submitting

## 9. Interoperability

### 9.1 Dependencies

- SPEC_01_IDENTITY.md: Author identity verification
- SPEC_04_SPACES.md: Space-specific difficulty overrides (future)
- SPEC_05_FORKS_CONSENSUS.md: Fork-level parameter governance

### 9.2 Interfaces

**Required by Content Layer:**
```
function validate_content_pow(content: SignedContent) -> bool
function get_required_difficulty(action: ActionType, fork: ForkId) -> uint8
```

**Required by Network Layer:**
```
function propagate_with_pow(content: SignedContent, pow: PoWSolution) -> bool
```

### 9.3 Fork Parameters

Forks MAY customize:
- Per-action difficulties
- Argon2id memory/iterations/parallelism
- Challenge expiry window
- Additional action types

Forks MUST NOT:
- Reduce memory below 32 MiB (ASIC resistance floor)
- Set difficulty to zero for any action
- Remove content binding requirement

## 10. Implementation Notes

### 10.1 Reference Difficulty Calibration

Target times assume "reference hardware":
- Desktop: 4-core CPU, 8 GB RAM, 2020-era
- Mobile: 4-core ARM, 4 GB RAM, 2022-era smartphone

Calibration should target median completion time, accepting variance.

### 10.2 Mobile Considerations

Mobile implementations SHOULD:
- Use reduced parallelism (2 instead of 4) to manage heat
- Extend duration for same difficulty (60s instead of 30s)
- Support background computation during charging
- Pause computation when battery < 20%
- Show progress indicator with time estimate

### 10.3 Implementation Recommendations

1. Use established Argon2id libraries (libsodium, argon2-cffi, etc.)
2. Implement progress callbacks for UI feedback
3. Cache fork configurations locally
4. Pre-fetch challenges while user composes content
5. Allow cancellation of in-progress PoW

### 10.4 WebAssembly Considerations

For browser/WebAssembly implementations:
- Memory allocation may be limited; use 32 MiB if 64 MiB unavailable
- SharedArrayBuffer required for parallelism > 1
- Expect 2-3x slowdown vs native; adjust difficulty expectations
- Consider WebWorker offloading to prevent UI blocking

### 10.5 ASIC Resistance Recommendations

To maintain ASIC resistance:
- Memory parameter MUST NOT drop below 32 MiB
- Parallelism should not exceed CPU core counts of typical devices
- Monitor hardware landscape; adjust parameters if specialized devices emerge

### 10.6 Known Challenges

1. **WebAssembly Performance**: Browser-based clients may be 2-3x slower
2. **Battery Impact**: Extended PoW drains mobile batteries
3. **User Expectations**: Users accustomed to instant posting may find friction frustrating initially
4. **Accessibility**: Users with very old devices may have difficulty participating

## 11. Test Vectors

### 11.1 Serialization Test

```
Input:
  action_type: POST (0x02)
  content_hash: 0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  author_id: 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  timestamp: 1703980800 (2024-12-31 00:00:00 UTC)
  difficulty: 20
  nonce_space: 0xdeadbeefcafebabe

Expected serialization (75 bytes, hex):
02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8550123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00000000658f508014deadbeefcafebabe
```

### 11.2 Verification Test (Reduced Difficulty)

```
Config:
  memory_kib: 1024 (reduced for testing)
  iterations: 1
  parallelism: 1

Challenge:
  action_type: REACTION (0x04)
  content_hash: sha256("test")
  author_id: zeros(32)
  timestamp: 0
  difficulty: 8 (only 8 leading zeros for fast test)
  nonce_space: zeros(8)

Verification steps:
1. Serialize challenge per section 4.2
2. Iterate nonce from 0
3. Compute argon2id(serialize || nonce, salt=nonce_space, ...)
4. Check leading_zeros(hash) >= 8
5. First valid nonce is the solution
```

### 11.3 Difficulty Boundary

```
Hash: 0x00ff... (8 leading zeros) -> difficulty 8: PASS
Hash: 0x007f... (9 leading zeros) -> difficulty 9: PASS
Hash: 0x0080... (8 leading zeros) -> difficulty 9: FAIL
```

### 11.4 Expired Challenge

```
Challenge with timestamp = current_time - 11 minutes
Expected: REJECT with reason 0x02 (Challenge expired)
```

### 11.5 Content Mismatch

```
Challenge.content_hash = sha256("original content")
Submitted content = "modified content"
Expected: REJECT with reason 0x03 (Content mismatch)
```

### 11.6 Leading Zero Calculation

```
0x00000000... -> 32+ zeros
0x00000001... -> 31 zeros
0x0000007f... -> 25 zeros
0x00000080... -> 24 zeros
0x000000ff... -> 24 zeros
0x00000100... -> 23 zeros
```

## 12. Open Questions

1. **Parallelism Variance**: Should parallelism parameter vary by device class, or remain fixed for consistency?

2. **Progressive Difficulty**: Should difficulty increase slightly for rapid successive posts from same author?

3. **Offline PoW**: How to handle PoW for content composed offline? Timestamp binding creates issues.

4. **Challenge Distribution**: Should challenges be self-generated or require server round-trip?

5. **Verification Caching**: Can nodes cache verification results, or must each node verify independently?

6. **Fork Migration**: How are in-progress PoW solutions handled during fork parameter changes?

7. **Accessibility Accommodations**: Should there be alternative friction mechanisms for users with hardware constraints?

8. **Difficulty Calibration**: What benchmark suite should be used for calibrating difficulty targets?

### 12.1 Engagement-Specific Questions

9. **Engagement Difficulty**: Is 16 leading zero bits (~5 seconds) the right cost for a single engagement?

10. **Engagement Rate**: Should there be a limit on how frequently the same identity can re-engage the same content?

## 13. References

- RFC 9106: Argon2 Memory-Hard Function
- THESIS_02_FRICTION.md: Friction as behavioral intervention
- THESIS_01_EXCLUSION.md: Exclusion as feature
- VISION.md: Swimchain design principles
- Bitcoin Whitepaper: Original PoW concept (mining = paying)
- scrypt paper: Memory-hard function design rationale
- **SPEC_08_RECURSIVE_BLOCKS.md: Block hierarchy and PoW aggregation**

---

*Specification Version: 2.0.0 DRAFT*
*Last Updated: 2024-12-25*
*Changes in 2.0.0:*
- *Added per-engagement PoW (Section 7)*
- *Renamed REACTION to ENGAGE action type*
- *Added content-specific PoW targeting*
- *Integrated with recursive block architecture*
*Authors: Swimchain Protocol Team*
