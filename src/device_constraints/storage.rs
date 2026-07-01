//! Persistence for device constraint settings and mode
//!
//! Uses sled for embedded key-value storage.
//!
//! # Non-blocking Writes
//!
//! Write operations (`set_mode`, `set_settings`) only perform the sled insert
//! without calling flush. This prevents UI blocking on disk I/O. Sled handles
//! durability automatically through its internal write-ahead log and periodic
//! background flushes.
//!
//! For guaranteed immediate durability (e.g., before shutdown), call `flush()`
//! explicitly.
//!
//! # Storage Versioning
//!
//! Settings are stored with a version prefix byte to enable future migrations.
//! Version 1 (current) stores settings as: `[version_byte][bincode_payload]`.
//! Legacy data (pre-versioning) is automatically migrated on first read.

use serde::{Deserialize, Serialize};
use std::path::Path;

use super::error::DeviceConstraintError;
use super::types::{ContributionMode, ContributionSettings};

/// Tree name for device settings
const TREE_DEVICE_SETTINGS: &str = "device_settings";

/// Key for contribution mode
const KEY_CONTRIBUTION_MODE: &[u8] = b"contribution_mode";

/// Key for contribution settings
const KEY_CONTRIBUTION_SETTINGS: &[u8] = b"contribution_settings";

/// Current storage format version
const STORAGE_VERSION: u8 = 1;

/// Versioned storage format for contribution mode
#[derive(Debug, Serialize, Deserialize)]
struct VersionedMode {
    /// Storage format version
    version: u8,
    /// The contribution mode value
    mode: ContributionMode,
}

impl VersionedMode {
    fn new(mode: ContributionMode) -> Self {
        Self {
            version: STORAGE_VERSION,
            mode,
        }
    }
}

/// Versioned storage format for contribution settings
#[derive(Debug, Serialize, Deserialize)]
struct VersionedSettings {
    /// Storage format version
    version: u8,
    /// The contribution settings
    settings: ContributionSettings,
}

impl VersionedSettings {
    fn new(settings: ContributionSettings) -> Self {
        Self {
            version: STORAGE_VERSION,
            settings,
        }
    }
}

/// Device settings store using sled
pub struct DeviceSettingsStore {
    /// Sled database handle
    db: sled::Db,
    /// Tree for device settings
    tree: sled::Tree,
}

impl DeviceSettingsStore {
    /// Open or create the device settings store
    pub fn open(path: impl AsRef<Path>) -> Result<Self, DeviceConstraintError> {
        let db = sled::open(path)?;
        let tree = db.open_tree(TREE_DEVICE_SETTINGS)?;
        Ok(Self { db, tree })
    }

    /// Get the current contribution mode
    ///
    /// Returns None if no mode has been set yet.
    /// Automatically migrates legacy (unversioned) data to versioned format on read.
    pub fn get_mode(&self) -> Result<Option<ContributionMode>, DeviceConstraintError> {
        match self.tree.get(KEY_CONTRIBUTION_MODE)? {
            Some(bytes) => {
                // Try versioned format first
                if let Ok(versioned) = bincode::deserialize::<VersionedMode>(&bytes) {
                    if versioned.version == STORAGE_VERSION {
                        return Ok(Some(versioned.mode));
                    }
                    // Future: handle version migrations here
                    return Err(DeviceConstraintError::MigrationFailed {
                        from_version: versioned.version,
                        to_version: STORAGE_VERSION,
                        reason: "unsupported version".to_string(),
                    });
                }

                // Fall back to legacy format (direct ContributionMode)
                let mode: ContributionMode = bincode::deserialize(&bytes)?;

                // Migrate to versioned format
                self.set_mode(mode)?;

                Ok(Some(mode))
            }
            None => Ok(None),
        }
    }

    /// Set the contribution mode
    ///
    /// The insert is performed without calling flush to avoid blocking the UI.
    /// Sled's write-ahead log ensures durability. For immediate persistence
    /// guarantees, call `flush()` after this method.
    pub fn set_mode(&self, mode: ContributionMode) -> Result<(), DeviceConstraintError> {
        let versioned = VersionedMode::new(mode);
        let bytes = bincode::serialize(&versioned)?;
        self.tree.insert(KEY_CONTRIBUTION_MODE, bytes)?;
        Ok(())
    }

    /// Get the current contribution settings
    ///
    /// Returns None if no settings have been set yet.
    /// Automatically migrates legacy (unversioned) data to versioned format on read.
    pub fn get_settings(&self) -> Result<Option<ContributionSettings>, DeviceConstraintError> {
        match self.tree.get(KEY_CONTRIBUTION_SETTINGS)? {
            Some(bytes) => {
                // Try versioned format first
                if let Ok(versioned) = bincode::deserialize::<VersionedSettings>(&bytes) {
                    if versioned.version == STORAGE_VERSION {
                        return Ok(Some(versioned.settings));
                    }
                    // Future: handle version migrations here
                    return Err(DeviceConstraintError::MigrationFailed {
                        from_version: versioned.version,
                        to_version: STORAGE_VERSION,
                        reason: "unsupported version".to_string(),
                    });
                }

                // Fall back to legacy format (direct ContributionSettings)
                let settings: ContributionSettings = bincode::deserialize(&bytes)?;

                // Migrate to versioned format
                self.set_settings(&settings)?;

                Ok(Some(settings))
            }
            None => Ok(None),
        }
    }

    /// Set the contribution settings
    ///
    /// The insert is performed without calling flush to avoid blocking the UI.
    /// Sled's write-ahead log ensures durability. For immediate persistence
    /// guarantees, call `flush()` after this method.
    pub fn set_settings(
        &self,
        settings: &ContributionSettings,
    ) -> Result<(), DeviceConstraintError> {
        // Validate before storing
        settings
            .validate()
            .map_err(DeviceConstraintError::InvalidSettings)?;

        let versioned = VersionedSettings::new(settings.clone());
        let bytes = bincode::serialize(&versioned)?;
        self.tree.insert(KEY_CONTRIBUTION_SETTINGS, bytes)?;
        Ok(())
    }

    /// Get the storage format version
    ///
    /// Returns the current storage format version constant.
    #[must_use]
    pub fn storage_version() -> u8 {
        STORAGE_VERSION
    }

    /// Get mode with default
    ///
    /// Returns the stored mode or the default if none set.
    pub fn get_mode_or_default(&self) -> Result<ContributionMode, DeviceConstraintError> {
        Ok(self.get_mode()?.unwrap_or_default())
    }

    /// Get settings with default
    ///
    /// Returns the stored settings or the default if none set.
    pub fn get_settings_or_default(&self) -> Result<ContributionSettings, DeviceConstraintError> {
        Ok(self.get_settings()?.unwrap_or_default())
    }

    /// Clear all stored data
    ///
    /// The clear is performed without calling flush to avoid blocking the UI.
    /// Sled's write-ahead log ensures durability. For immediate persistence
    /// guarantees, call `flush()` after this method.
    pub fn clear(&self) -> Result<(), DeviceConstraintError> {
        self.tree.clear()?;
        Ok(())
    }

    /// Check if any settings are stored
    pub fn has_settings(&self) -> Result<bool, DeviceConstraintError> {
        Ok(self.tree.contains_key(KEY_CONTRIBUTION_SETTINGS)?)
    }

    /// Check if a mode is stored
    pub fn has_mode(&self) -> Result<bool, DeviceConstraintError> {
        Ok(self.tree.contains_key(KEY_CONTRIBUTION_MODE)?)
    }

    /// Flush to disk synchronously
    ///
    /// Use this when you need to ensure immediate durability before proceeding
    /// (e.g., before shutdown, in tests, or after critical writes). Normal
    /// writes via `set_mode` and `set_settings` are eventually persisted by
    /// sled's background flush mechanism.
    pub fn flush(&self) -> Result<(), DeviceConstraintError> {
        self.tree.flush()?;
        Ok(())
    }

    /// Get database size on disk (approximate)
    pub fn size_on_disk(&self) -> u64 {
        self.db.size_on_disk().unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_temp_store() -> (DeviceSettingsStore, TempDir) {
        let tmp = TempDir::new().unwrap();
        let store = DeviceSettingsStore::open(tmp.path()).unwrap();
        (store, tmp)
    }

    #[test]
    fn test_open_store() {
        let (store, _tmp) = create_temp_store();
        assert!(!store.has_mode().unwrap());
        assert!(!store.has_settings().unwrap());
    }

    #[test]
    fn test_mode_persistence() {
        let tmp = TempDir::new().unwrap();

        // Store a mode
        {
            let store = DeviceSettingsStore::open(tmp.path()).unwrap();
            store.set_mode(ContributionMode::AnchorMode).unwrap();
            // Wait for background flush before dropping
            store.flush().unwrap();
        }

        // Reopen and verify
        {
            let store = DeviceSettingsStore::open(tmp.path()).unwrap();
            let mode = store.get_mode().unwrap();
            assert_eq!(mode, Some(ContributionMode::AnchorMode));
        }
    }

    #[test]
    fn test_settings_persistence() {
        let tmp = TempDir::new().unwrap();

        let custom_settings = ContributionSettings {
            wifi_only: false,
            daily_bandwidth_cap: 1_000_000_000,
            battery_threshold: 30,
            thermal_pause: false,
        };

        // Store settings
        {
            let store = DeviceSettingsStore::open(tmp.path()).unwrap();
            store.set_settings(&custom_settings).unwrap();
            // Wait for background flush before dropping
            store.flush().unwrap();
        }

        // Reopen and verify
        {
            let store = DeviceSettingsStore::open(tmp.path()).unwrap();
            let settings = store.get_settings().unwrap().unwrap();
            assert_eq!(settings, custom_settings);
        }
    }

    #[test]
    fn test_get_mode_or_default() {
        let (store, _tmp) = create_temp_store();

        // No mode stored, should return default
        let mode = store.get_mode_or_default().unwrap();
        assert_eq!(mode, ContributionMode::Swimmer);

        // Store a mode
        store.set_mode(ContributionMode::DedicatedSwimmer).unwrap();

        // Should return stored mode
        let mode = store.get_mode_or_default().unwrap();
        assert_eq!(mode, ContributionMode::DedicatedSwimmer);
    }

    #[test]
    fn test_get_settings_or_default() {
        let (store, _tmp) = create_temp_store();

        // No settings stored, should return default
        let settings = store.get_settings_or_default().unwrap();
        assert_eq!(settings, ContributionSettings::default());

        // Store custom settings
        let custom = ContributionSettings::minimal();
        store.set_settings(&custom).unwrap();

        // Should return stored settings
        let settings = store.get_settings_or_default().unwrap();
        assert_eq!(settings, custom);
    }

    #[test]
    fn test_invalid_settings_rejected() {
        let (store, _tmp) = create_temp_store();

        let invalid = ContributionSettings {
            battery_threshold: 150, // Invalid: > 100
            ..Default::default()
        };

        let result = store.set_settings(&invalid);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            DeviceConstraintError::InvalidSettings(_)
        ));
    }

    #[test]
    fn test_clear() {
        let (store, _tmp) = create_temp_store();

        store.set_mode(ContributionMode::AnchorMode).unwrap();
        store.set_settings(&ContributionSettings::minimal()).unwrap();

        assert!(store.has_mode().unwrap());
        assert!(store.has_settings().unwrap());

        store.clear().unwrap();

        assert!(!store.has_mode().unwrap());
        assert!(!store.has_settings().unwrap());
    }

    #[test]
    fn test_mode_roundtrip_all_variants() {
        let (store, _tmp) = create_temp_store();

        for mode in ContributionMode::all() {
            store.set_mode(*mode).unwrap();
            let loaded = store.get_mode().unwrap().unwrap();
            assert_eq!(*mode, loaded);
        }
    }

    #[test]
    fn test_size_on_disk() {
        let (store, _tmp) = create_temp_store();

        // Empty store should have minimal size
        let initial_size = store.size_on_disk();

        // Add data
        store.set_mode(ContributionMode::AnchorMode).unwrap();
        store.set_settings(&ContributionSettings::default()).unwrap();
        store.flush().unwrap();

        // Size should have increased (or at least not decreased)
        let final_size = store.size_on_disk();
        assert!(final_size >= initial_size);
    }

    #[test]
    fn test_storage_version() {
        assert_eq!(DeviceSettingsStore::storage_version(), 1);
    }

    #[test]
    fn test_legacy_mode_migration() {
        let tmp = TempDir::new().unwrap();

        // Write legacy (unversioned) mode directly to sled
        {
            let db = sled::open(tmp.path()).unwrap();
            let tree = db.open_tree(TREE_DEVICE_SETTINGS).unwrap();

            // Serialize ContributionMode directly (legacy format)
            let legacy_bytes = bincode::serialize(&ContributionMode::DedicatedSwimmer).unwrap();
            tree.insert(KEY_CONTRIBUTION_MODE, legacy_bytes).unwrap();
            tree.flush().unwrap();
        }

        // Open with DeviceSettingsStore - should migrate
        {
            let store = DeviceSettingsStore::open(tmp.path()).unwrap();
            let mode = store.get_mode().unwrap().unwrap();
            assert_eq!(mode, ContributionMode::DedicatedSwimmer);

            // Verify data is now versioned by checking raw bytes
            let raw = store.tree.get(KEY_CONTRIBUTION_MODE).unwrap().unwrap();
            let versioned: VersionedMode = bincode::deserialize(&raw).unwrap();
            assert_eq!(versioned.version, STORAGE_VERSION);
            assert_eq!(versioned.mode, ContributionMode::DedicatedSwimmer);
        }
    }

    #[test]
    fn test_legacy_settings_migration() {
        let tmp = TempDir::new().unwrap();
        let legacy_settings = ContributionSettings {
            wifi_only: false,
            daily_bandwidth_cap: 999_000_000,
            battery_threshold: 15,
            thermal_pause: true,
        };

        // Write legacy (unversioned) settings directly to sled
        {
            let db = sled::open(tmp.path()).unwrap();
            let tree = db.open_tree(TREE_DEVICE_SETTINGS).unwrap();

            // Serialize ContributionSettings directly (legacy format)
            let legacy_bytes = bincode::serialize(&legacy_settings).unwrap();
            tree.insert(KEY_CONTRIBUTION_SETTINGS, legacy_bytes).unwrap();
            tree.flush().unwrap();
        }

        // Open with DeviceSettingsStore - should migrate
        {
            let store = DeviceSettingsStore::open(tmp.path()).unwrap();
            let settings = store.get_settings().unwrap().unwrap();
            assert_eq!(settings, legacy_settings);

            // Verify data is now versioned by checking raw bytes
            let raw = store.tree.get(KEY_CONTRIBUTION_SETTINGS).unwrap().unwrap();
            let versioned: VersionedSettings = bincode::deserialize(&raw).unwrap();
            assert_eq!(versioned.version, STORAGE_VERSION);
            assert_eq!(versioned.settings, legacy_settings);
        }
    }

    #[test]
    fn test_versioned_persistence_across_reopen() {
        let tmp = TempDir::new().unwrap();

        // Store versioned data
        {
            let store = DeviceSettingsStore::open(tmp.path()).unwrap();
            store.set_mode(ContributionMode::ActiveSwimmer).unwrap();
            store
                .set_settings(&ContributionSettings::minimal())
                .unwrap();
            store.flush().unwrap();
        }

        // Reopen and verify version is preserved
        {
            let store = DeviceSettingsStore::open(tmp.path()).unwrap();

            // Mode should load correctly
            let mode = store.get_mode().unwrap().unwrap();
            assert_eq!(mode, ContributionMode::ActiveSwimmer);

            // Settings should load correctly
            let settings = store.get_settings().unwrap().unwrap();
            assert_eq!(settings, ContributionSettings::minimal());

            // Verify raw data has version field
            let raw_mode = store.tree.get(KEY_CONTRIBUTION_MODE).unwrap().unwrap();
            let versioned_mode: VersionedMode = bincode::deserialize(&raw_mode).unwrap();
            assert_eq!(versioned_mode.version, STORAGE_VERSION);

            let raw_settings = store.tree.get(KEY_CONTRIBUTION_SETTINGS).unwrap().unwrap();
            let versioned_settings: VersionedSettings =
                bincode::deserialize(&raw_settings).unwrap();
            assert_eq!(versioned_settings.version, STORAGE_VERSION);
        }
    }
}
