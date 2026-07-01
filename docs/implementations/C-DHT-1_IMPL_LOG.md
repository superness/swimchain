# C-DHT-1 Implementation Log

**Issue**: Unsigned Provider Records Enable Content Poisoning
**Date**: 2026-01-13
**Status**: COMPLETED

## Problem

Provider records in the DHT were unsigned, allowing any node to falsely claim they have content they don't possess. This enables content poisoning attacks where malicious nodes could:
- Intercept content requests by claiming to provide popular content
- Waste network resources on failed content retrievals
- Potentially serve malicious content in place of legitimate content

The vulnerable code paths were:
- `ProviderRecord` struct (src/dht/provider_store.rs:14-22) - Only contained node_id, addr, timestamp
- `add_provider()` in manager.rs (line 95-99) - Accepted records without signature verification
- `DhtMessage::Store` message (src/dht/messages.rs:109-115) - Only contained content_hash and ttl

## Solution

Implemented Ed25519 signature verification for all provider records following the callback-based pattern established in C-BLOCKLIST-1.

### Changes Made

**File**: `src/dht/error.rs`
1. Added `InvalidProviderSignature` error variant (lines 71-75)
2. Added Display implementation for the new error variant (lines 119-129)

**File**: `src/dht/provider_store.rs`
1. Added `public_key: [u8; 32]` and `signature: [u8; 64]` fields to `ProviderRecord` (lines 22-25)
2. Updated `ProviderRecord::new()` constructor to accept signature fields (lines 33-46)
3. Added `ProviderRecord::signing_message()` static method for canonical message creation (lines 48-75):
   ```rust
   pub fn signing_message(content_hash: &[u8; 32], node_id: &NodeId, addr: &SocketAddr) -> Vec<u8>
   ```
   Format: `"PROVIDER_RECORD" || content_hash[32] || node_id[32] || addr_bytes`

**File**: `src/dht/messages.rs`
1. Added `SignedProviderInfo` struct for PROVIDERS responses (lines 139-152)
2. Added serialization/deserialization for `SignedProviderInfo` (lines 228-326)
3. Added `public_key` and `signature` fields to `DhtMessage::Store` variant (lines 115-118)
4. Updated Store message serialization to include signature fields (lines 263-275)
5. Updated Store message deserialization to expect 132 bytes minimum (lines 374-394)
6. Changed `Providers` message to use `Vec<SignedProviderInfo>` instead of `Vec<NodeInfo>` (line 104)

**File**: `src/dht/manager.rs`
1. Updated `add_provider()` to accept verification callback (lines 99-124):
   ```rust
   pub async fn add_provider<F>(
       &self,
       content_hash: [u8; 32],
       node_id: NodeId,
       addr: SocketAddr,
       public_key: [u8; 32],
       signature: [u8; 64],
       verify_signature: F,
   ) -> DhtResult<()>
   where
       F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool
   ```
2. Updated `handle_message()` to accept verification callback (lines 195-204)
3. Updated Store handler to verify signature before storing (lines 297-328)
4. Updated Providers handler to verify each provider's signature (lines 269-294)
5. Updated `get_local_providers()` to return `Vec<SignedProviderInfo>` (lines 142-150)
6. Added `add_provider_unchecked()` for internal use (lines 126-140)

**File**: `src/dht/mod.rs`
1. Added `SignedProviderInfo` to public exports (line 70)

**File**: `src/node/router/router.rs`
1. Added Ed25519 verification imports (lines 32-33)
2. Updated all 8 `handle_message()` calls to pass verification callback (lines 4663-4861)

**File**: `src/rpc/methods.rs`
1. Added signing imports and `ProviderRecord` import (lines 37, 39)
2. Updated both `submit_post` and `submit_reply` methods to create signed Store messages:
   - Derive node_id and local_addr
   - Create signing message using `ProviderRecord::signing_message()`
   - Sign with node's keypair
   - Include public_key and signature in Store message

## Design Decisions

1. **Callback-based verification**: Following the pattern from C-BLOCKLIST-1, signature verification is passed as a callback. This:
   - Allows testing with mock signatures
   - Decouples validation from crypto implementation
   - Enables flexibility for different verification strategies

2. **Signing message format**: The canonical message binds:
   - Magic prefix `"PROVIDER_RECORD"` for domain separation
   - Content hash being claimed (32 bytes)
   - Node's DHT ID (32 bytes)
   - Serialized network address (1 + 4-16 + 2 bytes)

3. **Local content uses zero signatures**: When adding our own content via `add_local_content()`, we use zero-filled signatures since we trust ourselves. Proper signatures are created when broadcasting Store messages to the network.

4. **Separate types for signed vs unsigned node info**: Introduced `SignedProviderInfo` for provider claims (includes signature) while keeping `NodeInfo` for peer discovery (no signature needed).

5. **Invalid signatures are logged and skipped**: When processing Providers messages, invalid signatures don't fail the entire message - each provider is individually validated and logged.

## Verification

- `cargo check` passes with no errors
- All 49 DHT tests pass:
  - `test_provider_operations_with_valid_signature` - Valid signature accepted
  - `test_provider_operations_with_invalid_signature` - Invalid signature rejected
  - `test_handle_store_with_valid_signature` - Store message with valid sig accepted
  - `test_handle_store_with_invalid_signature` - Store message with invalid sig rejected
  - `test_signing_message` - Signing message format verified
  - `test_provider_record_has_signature_fields` - Struct has signature fields
  - `test_signed_provider_info_roundtrip` - Serialization works correctly
  - Plus all existing tests updated to use new API

## Production Usage

When calling `handle_message()` in production code, pass the actual Ed25519 verification function:

```rust
use crate::crypto::signature::verify as ed25519_verify;
use crate::types::identity::{PublicKey, Signature};

dht.handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
    ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
}).await
```

When creating Store messages to broadcast:

```rust
use crate::dht::{ProviderRecord, NodeId as DhtNodeId};
use crate::crypto::signature::sign as ed25519_sign;

let signing_msg = ProviderRecord::signing_message(&content_hash, &node_id, &local_addr);
let signature = ed25519_sign(&keypair.private_key, &signing_msg);

let store_msg = DhtMessage::Store {
    content_hash,
    ttl: 0,
    public_key: keypair.public_key.0,
    signature: signature.0,
};
```

## Files Modified

- `src/dht/error.rs` - Added InvalidProviderSignature error
- `src/dht/provider_store.rs` - Added signature fields and signing_message method
- `src/dht/messages.rs` - Added SignedProviderInfo struct and signature fields to Store
- `src/dht/manager.rs` - Updated add_provider and handle_message with verification
- `src/dht/mod.rs` - Updated exports
- `src/node/router/router.rs` - Updated all handle_message calls
- `src/rpc/methods.rs` - Updated Store message creation with signatures

## Security Impact

This fix prevents content poisoning attacks by ensuring:
- Only the legitimate content holder can create valid provider claims
- Ed25519 signature cryptographically proves ownership
- Unsigned or invalid records are rejected at storage time
- Attack requires compromising the actual provider's private key
