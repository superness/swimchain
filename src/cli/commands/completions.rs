//! Shell completion generation commands
//!
//! Generates shell completion scripts for bash, zsh, fish, PowerShell, and elvish.

use crate::cli::error::Result;
use clap::Subcommand;
use clap_complete::{generate, Shell};
use std::io;

/// Shell completions commands
#[derive(Subcommand, Debug)]
pub enum CompletionsCmd {
    /// Generate shell completion script
    #[command(
        about = "Generate completion script for your shell",
        long_about = "Generates a shell completion script that enables tab completion for \
                      sw commands. Supports bash, zsh, fish, PowerShell, and elvish.",
        after_help = "EXAMPLES:\n  \
                      sw completions generate bash > ~/.local/share/bash-completion/completions/sw\n  \
                      sw completions generate zsh > ~/.zfunc/_sw\n  \
                      sw completions generate fish > ~/.config/fish/completions/sw.fish\n  \
                      sw completions generate powershell >> $PROFILE"
    )]
    Generate {
        /// Shell to generate completions for
        #[arg(value_enum)]
        shell: Shell,
    },
}

/// Execute a completions command
pub fn execute(cmd: CompletionsCmd, cli_command: &mut clap::Command) -> Result<()> {
    match cmd {
        CompletionsCmd::Generate { shell } => {
            generate(shell, cli_command, "sw", &mut io::stdout());
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shell_variants() {
        // Verify all shells are supported
        let _bash = Shell::Bash;
        let _zsh = Shell::Zsh;
        let _fish = Shell::Fish;
        let _powershell = Shell::PowerShell;
        let _elvish = Shell::Elvish;
    }
}
