//! Man page generation script
//!
//! This script generates man pages for the cs CLI and all subcommands.
//!
//! Usage:
//!   cargo run --example generate-man-pages

use clap::CommandFactory;
use clap_mangen::Man;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

// Import the CLI struct
// Note: This requires the Cli struct to be public or re-exported
mod cli {
    use clap::{CommandFactory, Parser, Subcommand};

    #[derive(Parser)]
    #[command(
        name = "cs",
        version,
        author = "Chainsocial Contributors",
        about = "CLI client for the Chainsocial decentralized social network"
    )]
    pub struct Cli {
        #[command(subcommand)]
        pub command: Commands,
    }

    #[derive(Subcommand)]
    pub enum Commands {
        /// Manage cryptographic identities
        Identity,
        /// Create, join, and manage spaces
        Space,
        /// Create and view posts
        Post,
        /// Search local content
        Search,
        /// Network synchronization
        Sync,
        /// Configuration management
        Config,
        /// Generate shell completions
        Completions,
    }
}

fn main() -> std::io::Result<()> {
    let out_dir = Path::new("man/man1");

    // Create output directory
    fs::create_dir_all(out_dir)?;

    // Build the CLI command tree
    let cmd = cli::Cli::command();

    println!("Generating man pages...");

    // Generate main man page
    let man = Man::new(cmd.clone());
    let mut buffer = Vec::new();
    man.render(&mut buffer)?;

    let main_path = out_dir.join("cs.1");
    let mut file = File::create(&main_path)?;
    file.write_all(&buffer)?;
    println!("  Generated: {}", main_path.display());

    // Generate subcommand man pages
    for subcommand in cmd.get_subcommands() {
        let name = subcommand.get_name();

        let man = Man::new(subcommand.clone());
        let mut buffer = Vec::new();
        man.render(&mut buffer)?;

        let filename = format!("cs-{}.1", name);
        let path = out_dir.join(&filename);
        let mut file = File::create(&path)?;
        file.write_all(&buffer)?;
        println!("  Generated: {}", path.display());
    }

    println!();
    println!("Man pages generated in: {}", out_dir.display());
    println!();
    println!("Installation:");
    println!("  sudo cp man/man1/*.1 /usr/local/share/man/man1/");
    println!("  sudo mandb");
    println!();
    println!("View man pages:");
    println!("  man cs");
    println!("  man cs-identity");
    println!("  man cs-space");

    Ok(())
}
