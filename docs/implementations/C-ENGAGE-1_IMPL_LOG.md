# C-ENGAGE-1 Implementation Log

**Issue**: Signature Not Verified in submit_engagement RPC
**Status**: IMPLEMENTED
**Date**: 2026-01-13
**Priority**: Critical
**Effort**: S (actual: <1 hour)

## Problem

The `submit_engagement` RPC method in `src/rpc/methods.rs` parsed the signature from the request but never verified it. This allowed anyone to submit engagements on behalf of other users by simply providing their public key as `author_id`.

**Security Impact**: Critical - Complete identity spoofing for engagement actions.

## Files Modified

- `src/rpc/methods.rs:2772-2793` (22 lines added)

## Implementation

Added Ed25519 signature verification after parsing the signature bytes, before any engagement processing occurs.

### Code Change

```rust
// Verify Ed25519 signature (C-ENGAGE-1: Critical security fix)
// Message format matches frontend: "engage:{contentId}:{nonce}:{timestamp}[:emoji]"
let signing_message = if let Some(emoji) = params.emoji {
    format!(
        "engage:{}:{}:{}:{}",
        params.content_id, params.pow_nonce, params.timestamp, emoji
    )
} else {
    format!(
        "engage:{}:{}:{}",
        params.content_id, params.pow_nonce, params.timestamp
    )
};
let pubkey = PublicKey(author_bytes);
let sig = Signature(signature_bytes);
if !ed25519_verify(&pubkey, signing_message.as_bytes(), &sig) {
    return RpcResponse::error(
        RpcErrorCode::InvalidParams,
        "Invalid signature: engagement signature verification failed",
        id,
    );
}
```

### Message Format

The signing message format was determined by examining the frontend code in `forum-client/src/hooks/useRpc.tsx:987-988`:

```typescript
const signMessage = new TextEncoder().encode(
  `engage:${contentId}:${solution.nonce}:${timestamp}${emoji ? `:${emoji}` : ''}`
);
```

The backend now constructs the identical message format before verification.

## Pattern Followed

Followed the existing signature verification pattern used in:
- `submit_spam_attestation` (lines 7104-7113)
- `submit_counter_attestation` (lines 7306-7312)

Both use:
1. Construct signing message with domain separator
2. Create `PublicKey` and `Signature` wrappers
3. Call `ed25519_verify(&pubkey, &message, &sig)`
4. Return error on failure

## Validation

```
$ cargo check
Finished `dev` profile [unoptimized + debuginfo] target(s) in 4.79s
```

No errors. Only pre-existing warnings.

## Notes

- The `ed25519_verify` function was already imported at line 37
- The `PublicKey` and `Signature` types were already imported at line 39
- No new dependencies required
- Change is backwards compatible (valid signatures will pass, invalid will fail)

## Related

- Similar fix may be needed for other RPC methods that accept signatures
- C-BLOCK-1 (completed) fixed similar issue in block validation
