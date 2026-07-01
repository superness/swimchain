# C-BLOCKLIST-1 Implementation Log

**Issue**: Missing Ed25519 Signature Verification
**Date**: 2026-01-13
**Status**: COMPLETED

## Problem

Blocklist updates (`BlocklistUpdate` messages) lacked Ed25519 signature verification, enabling malicious injection of false blocklist entries. The `validate_update()` function in `src/blocklist/gossip.rs` had a comment placeholder for signature verification but no actual implementation.

## Solution

Modified `validate_update()` to accept a generic signature verification callback and verify the Ed25519 signature from the reporting node before accepting the update.

### Changes Made

**File**: `src/blocklist/gossip.rs`

1. **Updated function signature** (lines 129-136):
   - Changed from `validate_update(&self, update: &BlocklistUpdate, current_time: u64)`
   - To `validate_update<F>(&self, update: &BlocklistUpdate, current_time: u64, verify_signature: F)`
   - Where `F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool`

2. **Added signature verification** (lines 167-171):
   ```rust
   // Verify Ed25519 signature from reporting node
   let signing_message = update.signing_message();
   if !verify_signature(&update.reporting_node, &signing_message, &update.signature) {
       return Err(BlocklistError::InvalidSignature);
   }
   ```

3. **Added unit tests**:
   - `test_validate_update_invalid_signature` - Verifies that invalid signatures are rejected
   - `test_validate_update_signature_uses_correct_data` - Verifies callback receives correct parameters

4. **Updated existing tests** to pass signature verification callback.

## Design Decisions

1. **Callback-based verification**: Following the pattern established in `src/spam_attestation/validation.rs:114-121`, the signature verification is passed as a callback. This:
   - Allows testing with mock signatures
   - Decouples the validation logic from the crypto implementation
   - Enables future flexibility in verification strategies

2. **Verification order**: Signature is verified last (after timestamp and attestation checks) to fail fast on cheaper checks before expensive crypto operations.

## Verification

- `cargo check` passes with no errors
- All 14 blocklist gossip tests pass:
  - `test_validate_update` - Valid update with valid signature
  - `test_validate_update_invalid_signature` - Invalid signature rejected
  - `test_validate_update_signature_uses_correct_data` - Correct data passed to verifier
  - `test_validate_update_too_old` - Old timestamp rejected before signature check
  - `test_validate_update_insufficient_attestations` - Insufficient attestations rejected before signature check

## Production Usage

When calling `validate_update()` in production code, pass the actual Ed25519 verification function:

```rust
use crate::crypto::signature::verify as ed25519_verify;
use crate::types::identity::{PublicKey, Signature};

gossip.validate_update(&update, current_time, |pubkey, msg, sig| {
    ed25519_verify(
        &PublicKey::from_bytes(*pubkey),
        msg,
        &Signature::from_bytes(*sig),
    )
})
```

## Signing Message Format

The `BlocklistUpdate::signing_message()` method (in `src/blocklist/types.rs:211-221`) creates a canonical message for signing:

```rust
pub fn signing_message(&self) -> Vec<u8> {
    let mut msg = Vec::with_capacity(128);
    msg.extend_from_slice(b"BLOCKLIST_UPDATE");  // Magic prefix
    msg.push(self.update_type.as_u8());          // Add/Remove
    msg.extend_from_slice(&self.content_hash);   // 32 bytes
    msg.push(self.reason.as_u8());               // CSAM/Terrorism/etc
    msg.extend_from_slice(&self.timestamp.to_le_bytes()); // 8 bytes
    msg.extend_from_slice(&(self.attestations.len() as u32).to_le_bytes()); // Attestation count
    msg
}
```

This ensures:
- Unique domain separation with magic prefix
- All critical fields are bound to the signature
- Attestation count is included for integrity

## Related Files

- `src/blocklist/types.rs` - `BlocklistUpdate::signing_message()` method (lines 211-221)
- `src/blocklist/error.rs` - `BlocklistError::InvalidSignature` variant (line 34)
- `src/spam_attestation/validation.rs` - Reference implementation pattern
