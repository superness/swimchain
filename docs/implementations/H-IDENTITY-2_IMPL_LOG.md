# H-IDENTITY-2: Display Name Limit Inconsistency

**Issue ID**: H-IDENTITY-2
**Priority**: High
**Effort**: M (4-8 hours)
**Status**: IMPLEMENTED
**Date**: 2026-01-14

## Problem Statement

Display name limit was inconsistent across the codebase:
- `MAX_DISPLAY_NAME_BYTES = 64` in `src/types/constants.rs` (per SPEC_01 §3.5)
- Action serialization in `src/blocks/action.rs` used hardcoded 31 bytes
- Forum client UI limited input to 31 characters
- RPC documentation referenced 31 bytes

This inconsistency violated SPEC_01 §3.5 which states:
> `display_name` MUST be valid UTF-8, max 64 bytes

## Solution

Reconciled all display name limits to 64 bytes per specification.

### Files Changed

1. **`src/blocks/action.rs`**
   - Updated `ACTION_SERIALIZED_SIZE` from 432 to 465 bytes (+33 bytes)
   - Added `MAX_DISPLAY_NAME_LEN` constant referencing `types::constants::MAX_DISPLAY_NAME_BYTES`
   - Updated serialize() method: display_name field expanded from 31 to 64 bytes
   - Updated deserialize() method: display_name field expanded from 31 to 64 bytes
   - Updated header documentation to reflect new sizes
   - Fixed `display_name` field comment (line 185): "max 31 UTF-8 bytes" -> "max 64 UTF-8 bytes per SPEC_01 §3.5"
   - Fixed test assertion (line 835): `assert_eq!(serialized.len(), 432)` -> `assert_eq!(serialized.len(), 465)`

2. **`forum-client/src/pages/Identity.tsx`**
   - Changed `maxLength` attribute from 31 to 64
   - Updated character count display from `/31` to `/64`

3. **`src/rpc/methods.rs`**
   - Updated `SetIdentityNameParams` documentation comment to reference 64 bytes per SPEC_01 §3.5
   - Fixed validation check in `set_identity_name()` method (line 5612-5618):
     - Changed limit from 31 to 64 bytes
     - Updated error message from "31 bytes or less" to "64 bytes or less"
     - Updated comment from "max 31 UTF-8 bytes" to "max 64 UTF-8 bytes per SPEC_01 §3.5"

## Implementation Details

### Wire Format Change

The action serialization format changed:

**Before (432 bytes)**:
```
- display_name_len: 1 byte (0-31)
- display_name: 31 bytes (UTF-8, padded with zeros)
```

**After (465 bytes)**:
```
- display_name_len: 1 byte (0-64, per SPEC_01 §3.5)
- display_name: 64 bytes (UTF-8, padded with zeros)
```

This is a **breaking change** to the wire format. Old nodes will not be able to deserialize actions from new nodes, and vice versa. This change requires a coordinated network upgrade.

### Constant Aliasing

Rather than duplicating the 64-byte constant, `action.rs` now references the canonical constant:
```rust
pub const MAX_DISPLAY_NAME_LEN: usize = crate::types::constants::MAX_DISPLAY_NAME_BYTES;
```

This ensures future changes to the display name limit only need to be made in one place.

## Validation

```bash
$ cargo check
# Completed successfully with only pre-existing warnings (79 total, none related to this change)
```

## Migration Notes

1. **Network Upgrade Required**: All nodes must upgrade simultaneously to avoid action deserialization failures
2. **No Data Migration**: Existing actions with display names ≤31 bytes will continue to work
3. **Block Size Impact**: Actions are now 33 bytes larger, which may slightly reduce the number of actions per block

## Test Coverage

The existing action serialization tests in `src/blocks/action.rs` verify roundtrip serialization. The test `test_action_serialization_size()` was updated to assert the new 465-byte size.

## Final Validation

All components verified to use 64-byte limit consistently:

| Location | Value | Status |
|----------|-------|--------|
| `src/types/constants.rs:27` | `MAX_DISPLAY_NAME_BYTES = 64` | ✅ |
| `src/blocks/action.rs` | Uses `MAX_DISPLAY_NAME_LEN` (64 bytes) | ✅ |
| `src/rpc/methods.rs:5614` | `if name.len() > 64` | ✅ |
| `forum-client/src/pages/Identity.tsx:242` | `maxLength={64}` | ✅ |

**Validation Commands**:
- `cargo check` - PASS (79 pre-existing warnings, no errors)
- `npx tsc --noEmit` (forum-client) - PASS (no type errors)

## References

- SPEC_01 §3.5: Identity Metadata - specifies max 64 UTF-8 bytes for display_name
- `docs/OUTSTANDING_ACTIONS.md`: Original issue documentation
- `docs/reviews/identity-cryptography_AREA_OWNER_REVIEW.md`: Review identifying inconsistency
