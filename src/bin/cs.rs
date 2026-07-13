//! Swimchain CLI client
//!
//! The `sw` binary provides a command-line interface for interacting with
//! the Swimchain decentralized social network.
//!
//! # Quick Start
//!
//! ```bash
//! # Create an identity
//! sw identity create
//!
//! # Create a space
//! sw space create --name "My Space"
//!
//! # Create a post
//! sw post create --space <space_id> --title "Hello" --body "World"
//!
//! # Start a node
//! sw node start
//! ```
//!
//! # Commands
//!
//! - `identity` - Manage cryptographic identities
//! - `space` - Create, join, and manage spaces
//! - `post` - Create and view posts
//! - `search` - Search local content
//! - `sync` - Network synchronization
//! - `config` - Configuration management
//! - `node` - Node management (start, stop, status, peers)

use clap::{CommandFactory, Parser, Subcommand};
use std::path::PathBuf;
use swimchain::cli::commands::{
    block, blocklist, branch, completions, config, fork, identity, node, post, search, space,
    sponsor, sync, test,
};
use swimchain::cli::CliConfig;
use swimchain::network::{NetworkContext, NetworkMode};

/// Swimchain CLI client
#[derive(Parser)]
#[command(
    name = "sw",
    version,
    author = "Swimchain Contributors",
    about = "CLI client for the Swimchain decentralized social network",
    long_about = "A command-line interface for creating identities, managing spaces, \
                  posting content, and synchronizing with the Swimchain network.\n\n\
                  For more information, visit https://github.com/superness/swimchain",
    after_help = "GETTING STARTED:\n  \
                  1. Create an identity: sw identity create\n  \
                  2. Create or join a space: sw space create --name \"My Space\"\n  \
                  3. Post content: sw post create --space <id> --title \"Hello\" --body \"World\"\n\n\
                  For help on a specific command, use: sw <command> --help"
)]
struct Cli {
    /// Subcommand to execute
    #[command(subcommand)]
    command: Commands,

    /// Output format (overrides config)
    #[arg(long, global = true)]
    json: bool,

    /// Data directory override
    #[arg(long, global = true, env = "SWIMCHAIN_DATA_DIR")]
    data_dir: Option<std::path::PathBuf>,

    /// Run in regtest mode (local development)
    ///
    /// Bypasses level checks, reduces PoW difficulty, allows self-sponsorship.
    /// Use this for local testing and development.
    #[arg(long, global = true, conflicts_with = "testnet")]
    regtest: bool,

    /// Run in testnet mode
    ///
    /// Connects to the test network with reduced PoW difficulty.
    /// Level checks are still enforced.
    #[arg(long, global = true, conflicts_with = "regtest")]
    testnet: bool,

    /// Run as a seed node with short-term connections
    ///
    /// Seed nodes serve peer addresses and blocks, then disconnect after
    /// 30 seconds of inactivity to stay available for new connections.
    #[arg(long, global = true)]
    seed_node: bool,

    /// Log file path for persistent logging
    ///
    /// If specified, logs will be written to this file in addition to stderr.
    /// The file will be created if it doesn't exist, or appended to if it does.
    #[arg(long, global = true, env = "SWIMCHAIN_LOG_FILE")]
    log_file: Option<PathBuf>,
}

/// Available commands
#[derive(Subcommand)]
enum Commands {
    /// Query block and action information
    #[command(
        about = "Query block and action information",
        long_about = "View block details by height or hash, query actions by content hash, \
                      and display chain statistics."
    )]
    Block {
        #[command(subcommand)]
        cmd: block::BlockCmd,
    },

    /// Manage cryptographic identities
    #[command(
        about = "Manage cryptographic identities",
        long_about = "Create, export, import, and manage your cryptographic identity. \
                      Your identity is your Ed25519 keypair - there is no password recovery."
    )]
    Identity {
        #[command(subcommand)]
        cmd: identity::IdentityCmd,
    },

    /// Create, join, and manage spaces
    #[command(
        about = "Create, join, and manage spaces",
        long_about = "Spaces are communities where content is posted. \
                      Create your own space or join existing ones."
    )]
    Space {
        #[command(subcommand)]
        cmd: space::SpaceCmd,
    },

    /// Create and view posts
    #[command(
        about = "Create and view posts",
        long_about = "Create new posts with proof-of-work, reply to existing posts, \
                      or view post content and metadata."
    )]
    Post {
        #[command(subcommand)]
        cmd: post::PostCmd,
    },

    /// Search local content
    #[command(
        about = "Search local content",
        long_about = "Search for posts, replies, and other content stored locally. \
                      Network-wide search is planned for a future release."
    )]
    Search(search::SearchArgs),

    /// Network synchronization
    #[command(
        about = "Network synchronization",
        long_about = "Manage network connections and synchronization. \
                      View connected peers, trigger sync, and monitor status."
    )]
    Sync {
        #[command(subcommand)]
        cmd: sync::SyncCmd,
    },

    /// Branch-selective sync management
    #[command(
        about = "Manage branch subscriptions",
        long_about = "Subscribe to specific space branches for selective synchronization. \
                      Only content from subscribed branches will be downloaded and stored, \
                      reducing bandwidth and storage requirements."
    )]
    Branch {
        #[command(subcommand)]
        cmd: branch::BranchCmd,
    },

    /// Configuration management
    #[command(
        about = "Configuration management",
        long_about = "View and modify CLI configuration settings. \
                      Configuration is stored in config.toml in your data directory."
    )]
    Config {
        #[command(subcommand)]
        cmd: config::ConfigCmd,
    },

    /// Generate shell completions
    #[command(
        about = "Generate shell completion scripts",
        long_about = "Generate shell completion scripts for bash, zsh, fish, PowerShell, \
                      or elvish. Tab completion allows faster command entry."
    )]
    Completions {
        #[command(subcommand)]
        cmd: completions::CompletionsCmd,
    },

    /// Node management
    #[command(
        about = "Manage the Swimchain node",
        long_about = "Start, stop, and monitor the Swimchain network node. \
                      View connected peers, sync status, and contribution metrics."
    )]
    Node {
        #[command(subcommand)]
        cmd: node::NodeCmd,
    },

    /// Sponsorship and identity bootstrap
    #[command(
        about = "Manage sponsorships",
        long_about = "Manage the sponsorship system for Sybil resistance. \
                      Genesis identities can claim slots and sponsor new users. \
                      New users need sponsorship to participate in the network."
    )]
    Sponsor {
        #[command(subcommand)]
        cmd: sponsor::SponsorCmd,
    },

    /// Fork management for community escape
    #[command(
        about = "Manage chain forks",
        long_about = "Create, list, and switch between forks. Forks allow communities \
                      to escape captured chains while preserving identity (VISION §5). \
                      Keys work across all forks - only content isolation differs."
    )]
    Fork {
        #[command(subcommand)]
        cmd: fork::ForkCmd,
    },

    /// Test runner with reporting
    #[command(
        about = "Run tests and generate reports",
        long_about = "Execute cargo tests with optional filtering, collect results, \
                      run verification checks, and output reports in various formats \
                      (JSON, HTML, text)."
    )]
    Test {
        #[command(subcommand)]
        cmd: test::TestCmd,
    },

    /// Blocklist administration (CSAM/illegal-content hash seeding)
    #[command(
        about = "Administer the illegal-content blocklist",
        long_about = "Seed and inspect the local CSAM/illegal-content blocklist (SPEC_12). \
                      Import external hash lists with ExternalList provenance and list current \
                      entries. Operator-only: routes through the node's cookie-authenticated RPC."
    )]
    Blocklist {
        #[command(subcommand)]
        cmd: blocklist::BlocklistCmd,
    },
}

/// Setup logging with optional file output
fn setup_logging(log_file: Option<&PathBuf>) -> Result<(), fern::InitError> {
    let mut dispatch = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{} {} {}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                record.level(),
                record.target(),
                message
            ))
        })
        .level(log::LevelFilter::Warn)
        .level_for("swimchain", log::LevelFilter::Info);

    // Always log to stderr
    dispatch = dispatch.chain(std::io::stderr());

    // Optionally also log to file
    if let Some(path) = log_file {
        // Create parent directories if needed
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let file = fern::log_file(path)?;
        dispatch = dispatch.chain(file);
    }

    dispatch.apply()?;
    Ok(())
}

#[tokio::main]
async fn main() {
    // Parse CLI first to get log_file option
    let cli = Cli::parse();

    // Initialize logging (with optional file output)
    if let Err(e) = setup_logging(cli.log_file.as_ref()) {
        eprintln!("Warning: Failed to setup logging: {}", e);
    }

    // Determine network mode from CLI flags FIRST
    let network_mode = if cli.regtest {
        NetworkMode::Regtest
    } else if cli.testnet {
        NetworkMode::Testnet
    } else {
        NetworkMode::Mainnet
    };

    // Set global network context
    NetworkContext::set_mode(network_mode);

    // Load configuration with network mode awareness
    // This ensures we read from the correct network-specific directory
    let mut config = match CliConfig::load_with_network(network_mode) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Warning: Failed to load config: {e}");
            let mut default_config = CliConfig::default();
            default_config.network_mode = network_mode;
            default_config
        }
    };

    // Apply CLI overrides
    if let Some(ref dir) = cli.data_dir {
        config.data_dir = Some(dir.clone());
    }

    if cli.json {
        config.output_format = swimchain::cli::OutputFormat::Json;
    }

    // Print network mode banners
    if cli.regtest {
        eprintln!("╔══════════════════════════════════════════════════════════════════╗");
        eprintln!("║  REGTEST MODE - Local development network                        ║");
        eprintln!("║                                                                  ║");
        eprintln!("║  • Level checks bypassed (all users have Pool Keeper level)      ║");
        eprintln!("║  • PoW difficulty reduced to 0.1%                                ║");
        eprintln!("║  • Self-sponsorship allowed                                      ║");
        eprintln!("║  • Network isolation: regtest nodes only connect to regtest      ║");
        eprintln!("║  • Magic bytes: REGT (0x52454754)                                ║");
        eprintln!("╚══════════════════════════════════════════════════════════════════╝");
        eprintln!();
    } else if cli.testnet {
        eprintln!("╔══════════════════════════════════════════════════════════════════╗");
        eprintln!("║  TESTNET MODE - Connecting to test network                       ║");
        eprintln!("║                                                                  ║");
        eprintln!("║  • PoW difficulty reduced to 10%                                 ║");
        eprintln!("║  • Level checks still enforced                                   ║");
        // Derive from the actual magic bytes so this never goes stale on a re-bump.
        let m = NetworkMode::Testnet.magic_bytes();
        eprintln!(
            "║  • Magic bytes: {} (0x{:02x}{:02x}{:02x}{:02x})                                ║",
            String::from_utf8_lossy(&m),
            m[0],
            m[1],
            m[2],
            m[3]
        );
        eprintln!("╚══════════════════════════════════════════════════════════════════╝");
        eprintln!();
    }

    // Execute command
    let result = match cli.command {
        Commands::Block { cmd } => block::execute(cmd, &config),
        Commands::Identity { cmd } => identity::execute(cmd, &config),
        Commands::Space { cmd } => space::execute(cmd, &mut config),
        Commands::Post { cmd } => post::execute(cmd, &config),
        Commands::Search(args) => search::execute(args, &config),
        Commands::Sync { cmd } => sync::execute(cmd, &config),
        Commands::Branch { cmd } => branch::execute(cmd, &config),
        Commands::Config { cmd } => config::execute(cmd, &mut config),
        Commands::Completions { cmd } => {
            let mut cli_cmd = Cli::command();
            completions::execute(cmd, &mut cli_cmd)
        }
        Commands::Node { cmd } => node::execute(cmd, &config, cli.seed_node).await,
        Commands::Sponsor { cmd } => sponsor::execute(cmd, &config),
        Commands::Fork { cmd } => fork::execute(cmd, &mut config),
        Commands::Test { cmd } => test::execute(cmd, &config),
        Commands::Blocklist { cmd } => blocklist::execute(cmd, &config),
    };

    // Handle errors
    if let Err(e) = result {
        eprintln!("Error: {e}");
        std::process::exit(e.exit_code());
    }
}
