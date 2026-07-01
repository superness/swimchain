# M-DEVICE-2: Settings Version Field Missing

**Status**: IMPLEMENTED ✅ VALIDATED
**Date**: 2026-01-14
**Validated**: 2026-01-14
**Effort**: M (actual: ~1 hour)

## Problem

Device constraint settings stored in sled lacked a version field, making the migration path unclear for future schema changes. Without versioning, adding new fields or changing the storage format would break existing user data.

## Solution

Added versioned storage format with automatic migration from legacy (unversioned) data.

### Changes Made

#### 1. `src/device_constraints/error.rs`
- Added `MigrationFailed` error variant with fields:
  - `from_version: u8` - Source version that failed to migrate
  - `to_version: u8` - Target version
  - `reason: String` - Failure reason
- Added Display implementation for the new error variant

#### 2. `src/device_constraints/storage.rs`
- Added `STORAGE_VERSION` constant (currently 1)
- Added `VersionedMode` struct wrapping `ContributionMode` with version field
- Added `VersionedSettings` struct wrapping `ContributionSettings` with version field
- Modified `get_mode()` to:
  - Try deserializing as versioned format first
  - Fall back to legacy (unversioned) format
  - Automatically migrate legacy data to versioned format on read
  - Return `MigrationFailed` error for unsupported versions
- Modified `get_settings()` with same migration logic
- Modified `set_mode()` to use `VersionedMode` wrapper
- Modified `set_settings()` to use `VersionedSettings` wrapper
- Added `storage_version()` public method to query current version

### Storage Format

**Version 1 (current)**:
```
VersionedMode {
    version: u8,    // = 1
    mode: ContributionMode,
}

VersionedSettings {
    version: u8,    // = 1
    settings: ContributionSettings,
}
```

**Legacy (pre-versioning)**:
- Direct bincode serialization of `ContributionMode` or `ContributionSettings`

### Migration Strategy

1. On read, try to deserialize as versioned format
2. If that fails, try legacy format
3. If legacy succeeds, write back as versioned format (automatic migration)
4. If version doesn't match current, return `MigrationFailed` error
5. Future versions can add migration logic in the version check branch

## Tests Added

4 new tests added to `storage.rs`:

1. `test_storage_version` - Verifies version constant is 1
2. `test_legacy_mode_migration` - Verifies legacy mode data is migrated to versioned format
3. `test_legacy_settings_migration` - Verifies legacy settings data is migrated to versioned format
4. `test_versioned_persistence_across_reopen` - Verifies versioned data persists correctly

## Validation

```
cargo check --lib                              # PASS (warnings only)
cargo test device_constraints::storage --lib   # PASS (13/13 tests)
cargo test device_constraints::error --lib     # PASS (3/3 tests)
```

**Final Validation**: 2026-01-14 - All checks passed

## Pattern Followed

Based on `src/achievement/storage.rs` which uses the same versioned struct wrapper pattern:
```rust
struct StoredAchievements {
    version: u8,
    records: Vec<AchievementRecord>,
}
```

## Future Migration Support

When version 2 is needed:
1. Update `STORAGE_VERSION` to 2
2. Add new versioned structs if needed
3. Add migration logic in the version check branch:
```rust
if versioned.version == 1 {
    // Migrate from v1 to v2
    let migrated = migrate_v1_to_v2(versioned);
    self.set_mode(migrated)?;
    return Ok(Some(migrated));
}
```
