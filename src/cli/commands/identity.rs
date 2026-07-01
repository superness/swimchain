//! Identity management commands
//!
//! Implements create, show, export, and import operations for identities.

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::cli::output::short_address;
use crate::cli::progress::PowProgress;
use crate::identity::{
    create_identity_with_difficulty, encode_address_from_pubkey, export_identity, import_identity,
    KeyPair, PortableIdentity, PrivateKey, PublicKey,
};
use clap::Subcommand;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

/// Identity management commands
#[derive(Subcommand, Debug)]
pub enum IdentityCmd {
    /// Create a new cryptographic identity
    #[command(
        about = "Create a new cryptographic identity",
        long_about = "Generates an Ed25519 keypair, encrypts the private key with your password, \
                      and saves it to your data directory. This is your permanent identity in the \
                      Swimchain network.",
        after_help = "EXAMPLES:\n  sw identity create"
    )]
    Create {
        /// Skip PoW for faster identity creation (testing only)
        #[arg(long, hide = true)]
        no_pow: bool,
    },

    /// Show current identity information
    #[command(
        about = "Show current identity information",
        long_about = "Displays your identity address and data directory location.",
        after_help = "EXAMPLES:\n  sw identity show\n  sw identity show --json\n  sw identity show --seed"
    )]
    Show {
        /// Output in JSON format
        #[arg(long)]
        json: bool,

        /// Show the private seed (requires password, dangerous - keep secret!)
        #[arg(long)]
        seed: bool,
    },

    /// Export identity to a backup file
    #[command(
        about = "Export identity to a backup file",
        long_about = "Exports your encrypted identity to a portable backup file. \
                      You will be prompted for your current password and a new export password.",
        after_help = "EXAMPLES:\n  sw identity export backup.json\n  sw identity export --base64"
    )]
    Export {
        /// Output file path (or stdout if not specified)
        #[arg()]
        output: Option<PathBuf>,

        /// Output as base64 string instead of file
        #[arg(long)]
        base64: bool,
    },

    /// Import identity from a backup file
    #[command(
        about = "Import identity from a backup file",
        long_about = "Imports an identity from a portable backup file. \
                      You will be prompted for the export password.",
        after_help = "EXAMPLES:\n  sw identity import backup.json"
    )]
    Import {
        /// Input file path
        #[arg()]
        input: PathBuf,

        /// Input is base64 string (read from stdin)
        #[arg(long)]
        base64: bool,
    },

    /// Import identity from raw seed (dangerous - use only for recovery)
    #[command(
        about = "Import identity from raw seed hex",
        long_about = "Creates an identity from a 32-byte Ed25519 seed (64 hex characters). \
                      This is primarily for disaster recovery. The seed will be encrypted \
                      with the password from SWIMCHAIN_PASSWORD or prompted interactively.",
        after_help = "EXAMPLES:\n  sw identity import-seed 11b0b8c92806d893c77b547b87ad5763cb1005104ba13086e0bf184e3a277471"
    )]
    ImportSeed {
        /// The 32-byte seed as 64 hex characters
        #[arg()]
        seed_hex: String,
    },
}

/// JSON output for identity show
#[derive(Serialize)]
struct IdentityShowOutput {
    address: String,
    public_key: String,
    data_dir: String,
}

/// Prompt for password with optional confirmation
///
/// Password can be provided via:
/// 1. SWIMCHAIN_PASSWORD environment variable (for testing/automation)
/// 2. Interactive prompt (for normal use)
pub fn prompt_password(confirm: bool) -> Result<String> {
    // Check environment variable first
    if let Ok(pwd) = std::env::var("SWIMCHAIN_PASSWORD") {
        if !pwd.is_empty() {
            eprintln!("Using password from SWIMCHAIN_PASSWORD environment variable");
            return Ok(pwd);
        }
    }

    let pass =
        rpassword::prompt_password("Password: ").map_err(|e| CliError::Other(e.to_string()))?;

    if pass.is_empty() {
        return Err(CliError::Other("Password cannot be empty".into()));
    }

    if confirm {
        let confirm = rpassword::prompt_password("Confirm password: ")
            .map_err(|e| CliError::Other(e.to_string()))?;

        if pass != confirm {
            return Err(CliError::Other("Passwords do not match".into()));
        }
    }

    Ok(pass)
}

/// Execute an identity command
pub fn execute(cmd: IdentityCmd, config: &CliConfig) -> Result<()> {
    match cmd {
        IdentityCmd::Create { no_pow } => create(config, no_pow),
        IdentityCmd::Show { json, seed } => show(config, json, seed),
        IdentityCmd::Export { output, base64 } => export(config, output, base64),
        IdentityCmd::Import { input, base64 } => import_cmd(config, input, base64),
        IdentityCmd::ImportSeed { seed_hex } => import_seed(config, seed_hex),
    }
}

/// Create a new identity
fn create(config: &CliConfig, no_pow: bool) -> Result<()> {
    let identity_path = config.identity_path();

    // Check if identity already exists
    if identity_path.exists() {
        return Err(CliError::Other(
            "Identity already exists. Use 'sw identity export' to backup before creating a new one."
                .into(),
        ));
    }

    // Ensure data directory exists
    let data_dir = config.data_dir();
    fs::create_dir_all(&data_dir)?;

    println!("Creating new identity...");

    // Prompt for password
    let password = prompt_password(true)?;

    // Determine PoW difficulty
    let difficulty = if no_pow || cfg!(feature = "cli-testing") {
        4 // Very low for testing
    } else {
        20 // Default production difficulty
    };

    // Create identity with PoW
    let (keypair, proof) = if difficulty >= 16 {
        let progress = PowProgress::new("Creating identity", 30);

        let mut cancelled = false;
        let keypair = crate::identity::generate_keypair();
        let proof =
            crate::identity::mine_identity_pow_with_callback(&keypair, difficulty, |nonce| {
                if progress.is_cancelled() {
                    cancelled = true;
                }
                progress.update(nonce);
            });

        if cancelled {
            progress.finish_cancelled();
            return Err(CliError::PowCancelled);
        }

        progress.finish_success("Proof-of-work complete");
        (keypair, proof)
    } else {
        create_identity_with_difficulty(difficulty)
    };

    // Get address
    let address = encode_address_from_pubkey(&keypair.public_key);

    // Export to portable format (encrypted)
    let portable = export_identity(&keypair, Some(&proof), &password)?;

    // Serialize and save
    let serialized = crate::identity::serialize_portable(&portable);
    fs::write(&identity_path, serialized)?;

    println!();
    println!("Identity created successfully!");
    println!("Address: {address}");
    println!("Data directory: {}", data_dir.display());
    println!();
    println!("IMPORTANT: Remember your password. There is no way to recover it.");

    Ok(())
}

/// Show current identity
fn show(config: &CliConfig, json: bool, show_seed: bool) -> Result<()> {
    let identity_path = config.identity_path();

    if !identity_path.exists() {
        return Err(CliError::NoIdentity);
    }

    // Read and parse the identity file to get the public key
    let data = fs::read(&identity_path)?;
    let portable = crate::identity::deserialize_portable(&data)
        .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?;

    // Get address from public key
    let pubkey = crate::identity::PublicKey::from_bytes(portable.public_key);
    let address = encode_address_from_pubkey(&pubkey);

    // Convert public key bytes to hex
    let pubkey_hex = hex::encode(portable.public_key);

    // If user wants to see the seed, decrypt the identity
    let seed_hex = if show_seed {
        println!("WARNING: Your seed is your private key. Keep it secret!");
        println!();
        let password = prompt_password(false)?;
        let (keypair, _proof) = import_identity(&portable, &password)?;
        Some(hex::encode(keypair.private_key.seed()))
    } else {
        None
    };

    if json {
        let output = IdentityShowOutput {
            address,
            public_key: pubkey_hex,
            data_dir: config.data_dir().display().to_string(),
        };
        crate::cli::output::print_json(&output)?;
        if let Some(seed) = seed_hex {
            println!();
            println!("Seed: {seed}");
        }
    } else {
        println!("Address: {address}");
        println!("Public key: {pubkey_hex}");
        println!("Short: {}", short_address(&address));
        println!("Data directory: {}", config.data_dir().display());
        if let Some(seed) = seed_hex {
            println!();
            println!("Seed (private key): {seed}");
            println!();
            println!("KEEP THIS SECRET! Anyone with this seed can control your identity.");
        }
    }

    Ok(())
}

/// Export identity to backup
fn export(config: &CliConfig, output: Option<PathBuf>, base64_output: bool) -> Result<()> {
    let identity_path = config.identity_path();

    if !identity_path.exists() {
        return Err(CliError::NoIdentity);
    }

    // Read existing identity
    let data = fs::read(&identity_path)?;
    let portable = crate::identity::deserialize_portable(&data)
        .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?;

    // Prompt for current password to verify access
    println!("Enter your current password to verify access:");
    let current_password = prompt_password(false)?;

    // Try to decrypt to verify password
    let (_keypair, _proof) = import_identity(&portable, &current_password)?;

    // Prompt for export password
    println!("Enter a password for the export file:");
    let export_password = prompt_password(true)?;

    // Re-encrypt with export password
    let new_portable = export_identity(&_keypair, _proof.as_ref(), &export_password)?;

    if base64_output {
        let encoded = crate::identity::to_base64(&new_portable);
        if let Some(ref path) = output {
            fs::write(path, &encoded)?;
            println!("Identity exported to {}", path.display());
        } else {
            println!("{encoded}");
        }
    } else {
        let serialized = crate::identity::serialize_portable(&new_portable);
        if let Some(ref path) = output {
            fs::write(path, &serialized)?;
            println!("Identity exported to {}", path.display());
        } else {
            // Write binary to stdout
            use std::io::Write;
            std::io::stdout().write_all(&serialized)?;
        }
    }

    Ok(())
}

/// Import identity from backup
fn import_cmd(config: &CliConfig, input: PathBuf, base64_input: bool) -> Result<()> {
    let identity_path = config.identity_path();

    // Check if identity already exists
    if identity_path.exists() {
        return Err(CliError::Other(
            "Identity already exists. Delete or backup the existing identity first.".into(),
        ));
    }

    // Read and parse the backup
    let portable: PortableIdentity = if base64_input {
        let encoded = fs::read_to_string(&input)?;
        crate::identity::from_base64(encoded.trim())
            .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?
    } else {
        let data = fs::read(&input)?;
        crate::identity::deserialize_portable(&data)
            .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?
    };

    // Prompt for import password
    println!("Enter the password for the backup file:");
    let import_password = prompt_password(false)?;

    // Decrypt to verify
    let (keypair, proof) = import_identity(&portable, &import_password)?;

    // Get address for display
    let address = encode_address_from_pubkey(&keypair.public_key);

    // Prompt for new password
    println!("Enter a new password for local storage:");
    let local_password = prompt_password(true)?;

    // Re-encrypt with local password
    let new_portable = export_identity(&keypair, proof.as_ref(), &local_password)?;

    // Ensure data directory exists
    let data_dir = config.data_dir();
    fs::create_dir_all(&data_dir)?;

    // Save
    let serialized = crate::identity::serialize_portable(&new_portable);
    fs::write(&identity_path, serialized)?;

    println!();
    println!("Identity imported successfully!");
    println!("Address: {address}");
    println!("Data directory: {}", data_dir.display());

    Ok(())
}

/// Import identity from raw seed hex
fn import_seed(config: &CliConfig, seed_hex: String) -> Result<()> {
    let identity_path = config.identity_path();

    // Check if identity already exists
    if identity_path.exists() {
        return Err(CliError::Other(
            "Identity already exists. Delete or backup the existing identity first.".into(),
        ));
    }

    // Parse the seed hex
    let seed_hex = seed_hex.trim();
    if seed_hex.len() != 64 {
        return Err(CliError::Other(format!(
            "Seed must be exactly 64 hex characters (32 bytes), got {} characters",
            seed_hex.len()
        )));
    }

    let seed_bytes: Vec<u8> = (0..64)
        .step_by(2)
        .map(|i| u8::from_str_radix(&seed_hex[i..i + 2], 16))
        .collect::<std::result::Result<Vec<u8>, _>>()
        .map_err(|e| CliError::Other(format!("Invalid hex in seed: {e}")))?;

    let mut seed_array = [0u8; 32];
    seed_array.copy_from_slice(&seed_bytes);

    // Create keypair from seed
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&seed_array);
    let verifying_key = signing_key.verifying_key();

    // Create our KeyPair type
    let private_key = PrivateKey::from_bytes(signing_key.to_keypair_bytes());
    let public_key = PublicKey::from_bytes(*verifying_key.as_bytes());
    let keypair = KeyPair {
        private_key,
        public_key,
    };

    // Get address for display
    let address = encode_address_from_pubkey(&keypair.public_key);

    // Prompt for password
    println!("Enter a password to encrypt the identity:");
    let password = prompt_password(true)?;

    // Export (encrypt) the identity
    let portable = export_identity(&keypair, None, &password)?;

    // Ensure data directory exists
    let data_dir = config.data_dir();
    fs::create_dir_all(&data_dir)?;

    // Save
    let serialized = crate::identity::serialize_portable(&portable);
    fs::write(&identity_path, serialized)?;

    println!();
    println!("Identity imported from seed successfully!");
    println!("Address: {address}");
    println!("Public key: {}", hex::encode(keypair.public_key.as_bytes()));
    println!("Data directory: {}", data_dir.display());

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_create_and_show() {
        let dir = tempdir().unwrap();
        std::env::set_var("SWIMCHAIN_DATA_DIR", dir.path());

        let config = CliConfig::default();

        // Note: Can't easily test create because it requires password input
        // This test just verifies the code compiles and types are correct
    }
}
