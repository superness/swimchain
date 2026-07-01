# C-FORK-1 Implementation Log

**Issue**: CLI fork create doesn't pass secret_key to RPC
**Priority**: Critical
**Status**: IMPLEMENTED
**Date**: 2026-01-13

## Problem

The CLI `fork create` command verified that an identity file existed but never loaded or decrypted it to pass the secret key to the RPC. The `create_fork` RPC method requires a `secret_key` parameter (hex-encoded 32-byte Ed25519 seed) to sign the fork creation, but the CLI was sending:

```json
{
    "name": name,
    "description": description,
    "excluded_ids": excluded_ids,
    "content_mode": content_mode
}
```

This caused fork creation to fail because the RPC expects `secret_key` as a required parameter.

## Solution

Modified `src/cli/commands/fork.rs` to:

1. **Added imports** for identity handling:
   - `crate::identity::{deserialize_portable, import_identity, KeyPair}`

2. **Added `load_identity()` function** (lines 172-212):
   - Follows the same pattern as `src/cli/commands/node.rs:253-285`
   - Reads the encrypted identity file from `config.identity_path()`
   - Deserializes the portable identity format
   - Gets password from `SWIMCHAIN_PASSWORD` env var or prompts interactively via `rpassword`
   - Decrypts and returns the `KeyPair`

3. **Modified `create()` function** (lines 218-247):
   - Replaced simple identity file existence check with full `load_identity()` call
   - Extracts 32-byte secret key seed using `keypair.private_key.seed()`
   - Hex-encodes the secret key
   - Added `secret_key` to RPC params

## Files Changed

- `src/cli/commands/fork.rs`

## Changes Detail

### Added Import (line 11)
```rust
use crate::identity::{deserialize_portable, import_identity, KeyPair};
```

### Added load_identity Function (lines 172-212)
```rust
fn load_identity(config: &CliConfig) -> Result<KeyPair> {
    let identity_path = config.identity_path();
    if !identity_path.exists() {
        return Err(CliError::NoIdentity);
    }
    let data = std::fs::read(&identity_path)
        .map_err(|e| CliError::Storage(format!("Read error: {e}")))?;
    let portable = deserialize_portable(&data)
        .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?;
    let password = match std::env::var("SWIMCHAIN_PASSWORD") {
        Ok(pwd) => { eprintln!("..."); pwd }
        Err(_) => rpassword::prompt_password("Password: ")
            .map_err(|e| CliError::Other(...))?
    };
    let (keypair, _proof) = import_identity(&portable, &password)?;
    Ok(keypair)
}
```

### Modified create() Function (lines 220-247)
```rust
// Before:
let identity_path = config.identity_path();
if !identity_path.exists() {
    return Err(CliError::NoIdentity);
}
let params = json!({
    "name": name,
    "description": description,
    "excluded_ids": excluded_ids,
    "content_mode": content_mode,
});

// After:
println!("Loading identity...");
let keypair = load_identity(config)?;
let secret_key_hex = hex::encode(keypair.private_key.seed());
let params = json!({
    "name": name,
    "description": description,
    "excluded_ids": excluded_ids,
    "content_mode": content_mode,
    "secret_key": secret_key_hex,
});
```

## Validation

- `cargo check` passes with no errors
- Pattern matches existing `load_identity` in `node.rs`
- Secret key extraction follows the 32-byte seed format expected by RPC

## Security Notes

- Secret key is only held in memory during the RPC call
- `PrivateKey` struct implements `Drop` to zero memory when dropped
- Password prompt uses `rpassword` which disables terminal echo
- Supports `SWIMCHAIN_PASSWORD` env var for automation/testing scenarios

## Testing

Manual testing recommended:
1. Create an identity with `sw identity create`
2. Run `sw fork create --name "test-fork"`
3. Verify password prompt appears
4. Verify fork is created successfully with signature
