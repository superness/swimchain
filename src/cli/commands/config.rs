//! Configuration management commands
//!
//! Implements show, get, and set operations for CLI configuration.

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use clap::Subcommand;
use serde::Serialize;

/// Configuration management commands
#[derive(Subcommand, Debug)]
pub enum ConfigCmd {
    /// Show all configuration settings
    #[command(
        about = "Show all configuration settings",
        long_about = "Displays all current configuration values and their sources.",
        after_help = "EXAMPLES:\n  sw config show\n  sw config show --json"
    )]
    Show {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Get a specific configuration value
    #[command(
        about = "Get a specific configuration value",
        long_about = "Retrieves the value of a single configuration key.",
        after_help = "EXAMPLES:\n  sw config get network_port\n  sw config get --json network_port"
    )]
    Get {
        /// Configuration key to get
        #[arg()]
        key: String,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Set a configuration value
    #[command(
        about = "Set a configuration value",
        long_about = "Sets a configuration value and saves to config.toml.",
        after_help = "EXAMPLES:\n  sw config set network_port 9736\n  sw config set storage_target_mb 1000"
    )]
    Set {
        /// Configuration key to set
        #[arg()]
        key: String,

        /// Value to set
        #[arg()]
        value: String,
    },

    /// Show the data directory path
    #[command(
        about = "Show the data directory path",
        long_about = "Displays the current data directory where identity and config are stored.",
        after_help = "EXAMPLES:\n  sw config path"
    )]
    Path,

    /// Reset configuration to defaults
    #[command(
        about = "Reset configuration to defaults",
        long_about = "Resets all configuration values to their defaults. Does not affect identity.",
        after_help = "EXAMPLES:\n  sw config reset"
    )]
    Reset {
        /// Skip confirmation prompt
        #[arg(long, short)]
        yes: bool,
    },
}

/// JSON output for config show
#[derive(Serialize)]
struct ConfigShowOutput {
    data_dir: String,
    config_path: String,
    network_port: u16,
    storage_target_mb: u64,
    pow_parallelism: u8,
    sync_on_startup: bool,
    followed_spaces: Vec<String>,
    output_format: String,
}

/// JSON output for config get
#[derive(Serialize)]
struct ConfigGetOutput {
    key: String,
    value: serde_json::Value,
}

/// Available config keys for help
const CONFIG_KEYS: &[(&str, &str)] = &[
    ("network_port", "Network port (1024-65535, default: 9735)"),
    (
        "storage_target_mb",
        "Storage target in MB (100-100000, default: 500)",
    ),
    (
        "pow_parallelism",
        "PoW parallelism (0=auto, 2=mobile, 4=desktop)",
    ),
    ("sync_on_startup", "Sync on startup (true/false)"),
    ("output_format", "Default output format (text/json)"),
    ("data_dir", "Data directory path"),
];

/// Execute a config command
pub fn execute(cmd: ConfigCmd, config: &mut CliConfig) -> Result<()> {
    match cmd {
        ConfigCmd::Show { json } => show(config, json),
        ConfigCmd::Get { key, json } => get(config, &key, json),
        ConfigCmd::Set { key, value } => set(config, &key, &value),
        ConfigCmd::Path => path(config),
        ConfigCmd::Reset { yes } => reset(config, yes),
    }
}

/// Show all configuration
fn show(config: &CliConfig, json: bool) -> Result<()> {
    if json {
        let output = ConfigShowOutput {
            data_dir: config.data_dir().display().to_string(),
            config_path: config.config_path().display().to_string(),
            network_port: config.network_port,
            storage_target_mb: config.storage_target_mb,
            pow_parallelism: config.pow_parallelism,
            sync_on_startup: config.sync_on_startup,
            followed_spaces: config.followed_spaces.clone(),
            output_format: config.output_format.to_string(),
        };
        crate::cli::output::print_json(&output)?;
    } else {
        println!("Configuration:");
        println!("  Data directory:     {}", config.data_dir().display());
        println!("  Config file:        {}", config.config_path().display());
        println!("  Network port:       {}", config.network_port);
        println!("  Storage target:     {} MB", config.storage_target_mb);
        println!(
            "  PoW parallelism:    {} ({})",
            config.pow_parallelism,
            match config.pow_parallelism {
                0 => "auto",
                2 => "mobile",
                4 => "desktop",
                _ => "custom",
            }
        );
        println!("  Sync on startup:    {}", config.sync_on_startup);
        println!("  Output format:      {}", config.output_format);

        if !config.followed_spaces.is_empty() {
            println!("  Followed spaces:");
            for space in &config.followed_spaces {
                println!("    - {space}");
            }
        }
    }

    Ok(())
}

/// Get a specific config value
fn get(config: &CliConfig, key: &str, json_output: bool) -> Result<()> {
    match config.get(key) {
        Some(value) => {
            if json_output {
                // Convert the string value to appropriate JSON type
                let json_value = match key {
                    "network_port" | "storage_target_mb" | "pow_parallelism" => {
                        value.parse::<u64>().map_or_else(
                            |_| serde_json::Value::String(value.clone()),
                            serde_json::Value::from,
                        )
                    }
                    "sync_on_startup" => value.parse::<bool>().map_or_else(
                        |_| serde_json::Value::String(value.clone()),
                        serde_json::Value::from,
                    ),
                    _ => serde_json::Value::String(value.clone()),
                };

                let output = ConfigGetOutput {
                    key: key.to_string(),
                    value: json_value,
                };
                crate::cli::output::print_json(&output)?;
            } else {
                println!("{value}");
            }
            Ok(())
        }
        None => {
            if json_output {
                let output = ConfigGetOutput {
                    key: key.to_string(),
                    value: serde_json::Value::Null,
                };
                crate::cli::output::print_json(&output)?;
            } else {
                eprintln!("Unknown config key: {key}");
                eprintln!();
                eprintln!("Available keys:");
                for (k, desc) in CONFIG_KEYS {
                    eprintln!("  {k}: {desc}");
                }
            }
            Err(CliError::InvalidConfig(format!("Unknown key: {key}")))
        }
    }
}

/// Set a config value
fn set(config: &mut CliConfig, key: &str, value: &str) -> Result<()> {
    config.set(key, value)?;
    config.save()?;
    println!("Set {key} = {value}");
    Ok(())
}

/// Show data directory path
fn path(config: &CliConfig) -> Result<()> {
    println!("{}", config.data_dir().display());
    Ok(())
}

/// Reset configuration to defaults
fn reset(config: &mut CliConfig, yes: bool) -> Result<()> {
    if !yes {
        println!("This will reset all configuration to defaults.");
        println!("Your identity will NOT be affected.");
        print!("Continue? [y/N] ");

        use std::io::Write;
        std::io::stdout().flush()?;

        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        if !input.trim().eq_ignore_ascii_case("y") {
            println!("Cancelled.");
            return Ok(());
        }
    }

    let data_dir = config.data_dir();
    *config = CliConfig::default();
    config.save_to_dir(&data_dir)?;

    println!("Configuration reset to defaults.");
    Ok(())
}
