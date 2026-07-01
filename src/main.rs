//! Swimchain CLI entry point

use clap::Parser;

/// Swimchain - Decentralized social media
#[derive(Parser, Debug)]
#[command(name = "swimchain")]
#[command(version, about, long_about = None)]
struct Args {
    /// Enable verbose output
    #[arg(short, long, default_value_t = false)]
    verbose: bool,
}

fn main() {
    let args = Args::parse();

    if args.verbose {
        println!("Swimchain v{}", swimchain::VERSION);
    }

    println!("Swimchain node starting...");
    println!("Protocol initialized: {}", swimchain::is_initialized());
}
