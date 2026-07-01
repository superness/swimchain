# H-DHT-3: No Message Authentication

**Status**: IMPLEMENTED ✅ VERIFIED
**Date**: 2026-01-14
**Verified**: 2026-01-14
**Effort**: M (actual: ~1.5 hours)

## Problem

DHT messages lacked authentication. Any node could send messages claiming to be from another node, enabling message forgery attacks. An attacker could:
- Send fake PING/PONG messages to manipulate routing tables
- Send forged FIND_NODE responses with malicious peer lists
- Send STORE messages with spoofed sender IDs

## Solution

Added envelope-level Ed25519 signature authentication for DHT messages via the `AuthenticatedDhtMessage` wrapper.

## Implementation Details

### New Types

**`AuthenticatedDhtMessage`** (`src/dht/messages.rs:31-156`)
- Wraps any `DhtMessage` with authentication envelope
- Fields:
  - `message: DhtMessage` - The inner message
  - `sender_pubkey: [u8; 32]` - Sender's Ed25519 public key
  - `timestamp: u64` - Unix timestamp in milliseconds (replay attack prevention)
  - `signature: [u8; 64]` - Ed25519 signature over the signing payload

**Signing Message Format** (`signing_message()` method):
```
"DHT_MESSAGE_V1" || msg_type[1] || payload[...] || timestamp[8]
```

This binds the signature to:
- A unique domain prefix (prevents cross-protocol attacks)
- The exact message type and content
- A timestamp (prevents replay attacks)

### New Error Variants

**`DhtError::InvalidMessageSignature`** (`src/dht/error.rs:95-99`)
- Returned when message signature verification fails
- Contains sender ID and reason string

**`DhtError::MessageTimestampInvalid`** (`src/dht/error.rs:101-106`)
- Returned when message timestamp is too old or too far in future
- Contains sender ID, message timestamp, and current time

### New Manager Methods

**`handle_authenticated_message()`** (`src/dht/manager.rs:454-541`)
- Verifies sender_id matches public key
- Validates timestamp (5 minute max age, 5 minute future tolerance)
- Verifies Ed25519 signature using callback
- Processes inner message via existing `handle_message()`
- Returns response wrapped in `AuthenticatedDhtMessage`

**`create_authenticated_response()`** (`src/dht/manager.rs:544-567`)
- Helper to create authenticated response messages
- Returns the message and signing payload (caller must sign)

### Constants

**`MESSAGE_MAX_AGE_MS`** (`src/dht/messages.rs:28-29`)
- 300,000 ms (5 minutes) maximum message age
- Prevents replay attacks with old captured messages

## Files Changed

| File | Changes |
|------|---------|
| `src/dht/messages.rs` | Added `AuthenticatedDhtMessage` struct with serialization, signing, and timestamp validation |
| `src/dht/error.rs` | Added `InvalidMessageSignature` and `MessageTimestampInvalid` error variants |
| `src/dht/manager.rs` | Added `handle_authenticated_message()` and `create_authenticated_response()` methods |
| `src/dht/mod.rs` | Exported `AuthenticatedDhtMessage` and `MESSAGE_MAX_AGE_MS` |

## Tests Added

### Message Tests (`src/dht/messages.rs`)
- `test_authenticated_message_roundtrip` - Serialization/deserialization
- `test_authenticated_message_signing_message` - Signing payload format verification
- `test_authenticated_message_timestamp_validation` - Past/future timestamp handling
- `test_authenticated_message_get_signing_payload` - Payload generation consistency
- `test_authenticated_message_with_store` - Complex message type handling
- `test_authenticated_message_from_bytes_too_short` - Error handling for truncated data

### Manager Tests (`src/dht/manager.rs`)
- `test_handle_authenticated_message_valid` - Happy path authentication
- `test_handle_authenticated_message_sender_id_mismatch` - Rejects mismatched pubkey/ID
- `test_handle_authenticated_message_expired_timestamp` - Rejects old messages
- `test_handle_authenticated_message_invalid_signature` - Rejects bad signatures
- `test_handle_authenticated_message_store_with_signature` - End-to-end STORE flow
- `test_create_authenticated_response` - Response helper method

## Validation

```bash
cargo check --lib          # Compiles successfully
cargo test --lib dht::     # All 92 DHT tests pass
```

## Backward Compatibility

The implementation is additive:
- `handle_message()` still exists for unauthenticated messages
- `handle_authenticated_message()` is the new authenticated path
- Nodes can gradually migrate by preferring authenticated messages
- Network operators can enforce authenticated-only mode at their discretion

## Usage

Callers should:
1. Use `AuthenticatedDhtMessage::signing_message()` to create signing payload
2. Sign with Ed25519 private key
3. Create `AuthenticatedDhtMessage::new()` with signature
4. Send serialized bytes via `to_bytes()`

Receivers should:
1. Parse with `AuthenticatedDhtMessage::from_bytes()`
2. Call `handle_authenticated_message()` with signature verifier callback
3. Sign any response using `create_authenticated_response()`

## Security Notes

- Timestamp validation prevents replay attacks (5 minute window)
- Domain prefix prevents cross-protocol signature reuse
- Sender ID must match public key (derived via `NodeId::from_bytes()`)
- Both message-level and provider-level signatures now supported
