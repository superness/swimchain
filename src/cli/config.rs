//! CLI configuration management
//!
//! Handles loading, saving, and validating CLI configuration from config.toml.

use crate::cli::error::{CliError, Result};
use crate::cli::output::OutputFormat;
use crate::network::NetworkMode;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Default network port (per SPEC_06)
const DEFAULT_NETWORK_PORT: u16 = 9735;

/// Default storage target in MB
const DEFAULT_STORAGE_TARGET_MB: u64 = 500;

/// CLI configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliConfig {
    /// Network mode (Mainnet, Testnet, Regtest)
    ///
    /// Runtime override via --regtest or --testnet flags.
    #[serde(default, skip_serializing_if = "is_default_network_mode")]
    pub network_mode: NetworkMode,

    /// Data directory override (None = platform default)
    #[serde(default)]
    pub data_dir: Option<PathBuf>,

    /// Network port (default: 9735 per SPEC_06)
    #[serde(default = "default_network_port")]
    pub network_port: u16,

    /// Storage target in MB (default: 500)
    #[serde(default = "default_storage_target")]
    pub storage_target_mb: u64,

    /// PoW parallelism (0=auto, 2=mobile, 4=desktop)
    #[serde(default)]
    pub pow_parallelism: u8,

    /// Sync on startup
    #[serde(default = "default_true")]
    pub sync_on_startup: bool,

    /// Followed spaces (format: sp1[a-z0-9]+)
    #[serde(default)]
    pub followed_spaces: Vec<String>,

    /// Space names (space_id -> display name)
    #[serde(default)]
    pub space_names: HashMap<String, String>,

    /// Output format (text/json)
    #[serde(default)]
    pub output_format: OutputFormat,
}

fn default_network_port() -> u16 {
    DEFAULT_NETWORK_PORT
}

fn default_storage_target() -> u64 {
    DEFAULT_STORAGE_TARGET_MB
}

fn default_true() -> bool {
    true
}

fn is_default_network_mode(mode: &NetworkMode) -> bool {
    matches!(mode, NetworkMode::Mainnet)
}

impl Default for CliConfig {
    fn default() -> Self {
        Self {
            network_mode: NetworkMode::default(),
            data_dir: None,
            network_port: DEFAULT_NETWORK_PORT,
            storage_target_mb: DEFAULT_STORAGE_TARGET_MB,
            pow_parallelism: 0,
            sync_on_startup: true,
            followed_spaces: Vec::new(),
            space_names: HashMap::new(),
            output_format: OutputFormat::Text,
        }
    }
}

impl CliConfig {
    /// Validate the configuration
    pub fn validate(&self) -> Result<()> {
        // Validate network port
        if self.network_port < 1024 {
            return Err(CliError::InvalidConfig(
                "network_port must be >= 1024".to_string(),
            ));
        }

        // Validate storage target
        if self.storage_target_mb < 100 || self.storage_target_mb > 100_000 {
            return Err(CliError::InvalidConfig(
                "storage_target_mb must be between 100 and 100000".to_string(),
            ));
        }

        // Validate PoW parallelism
        if !matches!(self.pow_parallelism, 0 | 2 | 4) {
            return Err(CliError::InvalidConfig(
                "pow_parallelism must be 0 (auto), 2 (mobile), or 4 (desktop)".to_string(),
            ));
        }

        // Validate followed spaces format
        use std::sync::LazyLock;
        static SPACE_REGEX: LazyLock<regex::Regex> = LazyLock::new(|| {
            regex::Regex::new(r"^sp1[a-z0-9]+$").expect("valid regex")
        });
        for space in &self.followed_spaces {
            if !SPACE_REGEX.is_match(space) {
                return Err(CliError::InvalidSpaceId(space.clone()));
            }
        }

        Ok(())
    }

    /// Get the data directory
    ///
    /// Priority:
    /// 1. SWIMCHAIN_DATA_DIR environment variable
    /// 2. Configuration file data_dir setting
    /// 3. Platform default directory
    ///
    /// The network mode suffix is appended to isolate data between networks:
    /// - Mainnet: <base_dir>/
    /// - Testnet: <base_dir>-testnet/
    /// - Regtest: <base_dir>-regtest/
    ///
    /// However, if SWIMCHAIN_DATA_DIR is explicitly set, we use it as-is
    /// without appending any suffix (user knows what they're doing).
    #[must_use]
    pub fn data_dir(&self) -> PathBuf {
        // Check if user explicitly set a data directory via env var
        if let Ok(env_dir) = std::env::var("SWIMCHAIN_DATA_DIR") {
            // User set explicit directory, use as-is without suffix
            return PathBuf::from(env_dir);
        }

        // Get base directory from config or default
        let base_dir = if let Some(ref dir) = self.data_dir {
            dir.clone()
        } else {
            get_default_data_dir()
        };

        // Append network suffix for non-mainnet modes
        match self.network_mode {
            crate::network::NetworkMode::Mainnet => base_dir,
            crate::network::NetworkMode::Testnet => {
                let mut path = base_dir.as_os_str().to_os_string();
                path.push("-testnet");
                PathBuf::from(path)
            }
            crate::network::NetworkMode::Regtest => {
                let mut path = base_dir.as_os_str().to_os_string();
                path.push("-regtest");
                PathBuf::from(path)
            }
        }
    }

    /// Get the path to the identity file
    #[must_use]
    pub fn identity_path(&self) -> PathBuf {
        self.data_dir().join("identity.enc")
    }

    /// Get the path to the config file
    #[must_use]
    pub fn config_path(&self) -> PathBuf {
        self.data_dir().join("config.toml")
    }

    /// Load configuration from file
    pub fn load() -> Result<Self> {
        let data_dir = get_effective_data_dir(None);
        let config_path = data_dir.join("config.toml");

        if !config_path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&config_path)?;
        let config: CliConfig =
            toml::from_str(&contents).map_err(|e| CliError::InvalidConfig(e.to_string()))?;

        config.validate()?;
        Ok(config)
    }

    /// Load configuration with network mode awareness
    ///
    /// This loads from the network-specific directory (e.g., -regtest suffix).
    /// Use this after determining the network mode from CLI flags.
    ///
    /// If SWIMCHAIN_DATA_DIR is set, we use it directly without appending a suffix,
    /// assuming the user knows what they're doing.
    pub fn load_with_network(network_mode: NetworkMode) -> Result<Self> {
        // Check if user explicitly set a data directory - if so, don't add suffix
        let env_override = std::env::var("SWIMCHAIN_DATA_DIR").ok();
        let base_dir = get_effective_data_dir(None);

        // Only append network suffix if no explicit SWIMCHAIN_DATA_DIR was set
        let data_dir = if env_override.is_some() {
            // User set explicit directory, use as-is
            base_dir
        } else {
            // Append network suffix to default directory
            match network_mode {
                NetworkMode::Mainnet => base_dir,
                NetworkMode::Testnet => {
                    let mut path = base_dir.as_os_str().to_os_string();
                    path.push("-testnet");
                    PathBuf::from(path)
                }
                NetworkMode::Regtest => {
                    let mut path = base_dir.as_os_str().to_os_string();
                    path.push("-regtest");
                    PathBuf::from(path)
                }
            }
        };
        let config_path = data_dir.join("config.toml");

        if !config_path.exists() {
            // Return default config with network mode set
            let mut config = Self::default();
            config.network_mode = network_mode;
            return Ok(config);
        }

        let contents = fs::read_to_string(&config_path)?;
        let mut config: CliConfig =
            toml::from_str(&contents).map_err(|e| CliError::InvalidConfig(e.to_string()))?;

        // Ensure network mode is set correctly
        config.network_mode = network_mode;
        config.validate()?;
        Ok(config)
    }

    /// Load configuration from a specific directory
    pub fn load_from_dir(data_dir: &PathBuf) -> Result<Self> {
        let config_path = data_dir.join("config.toml");

        if !config_path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&config_path)?;
        let config: CliConfig =
            toml::from_str(&contents).map_err(|e| CliError::InvalidConfig(e.to_string()))?;

        config.validate()?;
        Ok(config)
    }

    /// Save configuration to file
    pub fn save(&self) -> Result<()> {
        self.validate()?;

        let data_dir = self.data_dir();
        fs::create_dir_all(&data_dir)?;

        let config_path = data_dir.join("config.toml");
        let contents =
            toml::to_string_pretty(self).map_err(|e| CliError::InvalidConfig(e.to_string()))?;

        fs::write(&config_path, contents)?;
        Ok(())
    }

    /// Save configuration to a specific directory
    pub fn save_to_dir(&self, data_dir: &PathBuf) -> Result<()> {
        self.validate()?;

        fs::create_dir_all(data_dir)?;

        let config_path = data_dir.join("config.toml");
        let contents =
            toml::to_string_pretty(self).map_err(|e| CliError::InvalidConfig(e.to_string()))?;

        fs::write(&config_path, contents)?;
        Ok(())
    }

    /// Update a single config value by key
    pub fn set(&mut self, key: &str, value: &str) -> Result<()> {
        match key {
            "network_port" => {
                self.network_port = value
                    .parse()
                    .map_err(|_| CliError::InvalidConfig("network_port must be a number".into()))?;
            }
            "storage_target_mb" => {
                self.storage_target_mb = value.parse().map_err(|_| {
                    CliError::InvalidConfig("storage_target_mb must be a number".into())
                })?;
            }
            "pow_parallelism" => {
                self.pow_parallelism = value.parse().map_err(|_| {
                    CliError::InvalidConfig("pow_parallelism must be a number".into())
                })?;
            }
            "sync_on_startup" => {
                self.sync_on_startup = value.parse().map_err(|_| {
                    CliError::InvalidConfig("sync_on_startup must be true or false".into())
                })?;
            }
            "output_format" => {
                self.output_format = value.parse().map_err(|_| {
                    CliError::InvalidConfig("output_format must be text or json".into())
                })?;
            }
            "data_dir" => {
                self.data_dir = Some(PathBuf::from(value));
            }
            _ => {
                return Err(CliError::InvalidConfig(format!(
                    "Unknown config key: {key}"
                )));
            }
        }

        self.validate()?;
        Ok(())
    }

    /// Get a config value by key
    #[must_use]
    pub fn get(&self, key: &str) -> Option<String> {
        match key {
            "network_mode" => Some(self.network_mode.name().to_string()),
            "network_port" => Some(self.network_port.to_string()),
            "storage_target_mb" => Some(self.storage_target_mb.to_string()),
            "pow_parallelism" => Some(self.pow_parallelism.to_string()),
            "sync_on_startup" => Some(self.sync_on_startup.to_string()),
            "output_format" => Some(self.output_format.to_string()),
            "data_dir" => self.data_dir.as_ref().map(|p| p.display().to_string()),
            "followed_spaces" => Some(self.followed_spaces.join(",")),
            _ => None,
        }
    }

    /// Check if level checks should be bypassed
    ///
    /// Returns true in Regtest mode where level gating is disabled.
    #[must_use]
    pub fn skip_level_checks(&self) -> bool {
        self.network_mode.allows_skip_level_check()
    }

    /// Check if this is a development/testing mode
    #[must_use]
    pub fn is_dev_mode(&self) -> bool {
        self.network_mode.is_dev_mode()
    }

    /// Get network mode as string for RPC client configuration
    #[must_use]
    pub fn network_mode_str(&self) -> &'static str {
        self.network_mode.name()
    }
}

/// Get the platform-appropriate default data directory
///
/// - Linux: ~/.local/share/swimchain/
/// - macOS: ~/Library/Application Support/io.swimchain.swimchain/
/// - Windows: %APPDATA%\swimchain\swimchain\
#[must_use]
pub fn get_default_data_dir() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("io", "swimchain", "swimchain") {
        proj_dirs.data_dir().to_path_buf()
    } else {
        // Fallback if ProjectDirs fails
        PathBuf::from(".swimchain")
    }
}

/// Get the effective data directory considering environment and config
#[must_use]
pub fn get_effective_data_dir(config_override: Option<&PathBuf>) -> PathBuf {
    // Priority: env var > config override > platform default
    if let Ok(env_dir) = std::env::var("SWIMCHAIN_DATA_DIR") {
        return PathBuf::from(env_dir);
    }

    if let Some(dir) = config_override {
        return dir.clone();
    }

    get_default_data_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_default_config() {
        let config = CliConfig::default();
        assert_eq!(config.network_port, 9735);
        assert_eq!(config.storage_target_mb, 500);
        assert_eq!(config.pow_parallelism, 0);
        assert!(config.sync_on_startup);
        assert!(config.followed_spaces.is_empty());
    }

    #[test]
    fn test_config_validation_valid() {
        let config = CliConfig::default();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_config_validation_invalid_port() {
        let mut config = CliConfig::default();
        config.network_port = 80;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_invalid_storage() {
        let mut config = CliConfig::default();
        config.storage_target_mb = 50;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_invalid_parallelism() {
        let mut config = CliConfig::default();
        config.pow_parallelism = 3;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_invalid_space() {
        let mut config = CliConfig::default();
        config.followed_spaces = vec!["invalid".to_string()];
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_save_load() {
        let dir = tempdir().unwrap();
        let mut config = CliConfig::default();
        config.network_port = 12345;

        config.save_to_dir(&dir.path().to_path_buf()).unwrap();
        let loaded = CliConfig::load_from_dir(&dir.path().to_path_buf()).unwrap();

        assert_eq!(loaded.network_port, 12345);
    }

    #[test]
    fn test_config_set_get() {
        let mut config = CliConfig::default();

        config.set("network_port", "8080").unwrap();
        assert_eq!(config.get("network_port"), Some("8080".to_string()));

        config.set("storage_target_mb", "1000").unwrap();
        assert_eq!(config.get("storage_target_mb"), Some("1000".to_string()));
    }
}
