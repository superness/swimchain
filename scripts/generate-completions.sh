#!/bin/bash
# Generate shell completion scripts for the cs CLI
# This script creates completion files for bash, zsh, fish, and PowerShell

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPLETIONS_DIR="$PROJECT_ROOT/completions"

# Ensure cs binary is built
cargo build --release -p swimchain --bin cs

CS_BIN="$PROJECT_ROOT/target/release/cs"

# Create completions directory
mkdir -p "$COMPLETIONS_DIR"

echo "Generating shell completion scripts..."

# Bash
echo "  Generating bash completions..."
"$CS_BIN" completions generate bash > "$COMPLETIONS_DIR/cs.bash"

# Zsh
echo "  Generating zsh completions..."
"$CS_BIN" completions generate zsh > "$COMPLETIONS_DIR/_cs"

# Fish
echo "  Generating fish completions..."
"$CS_BIN" completions generate fish > "$COMPLETIONS_DIR/cs.fish"

# PowerShell
echo "  Generating PowerShell completions..."
"$CS_BIN" completions generate powershell > "$COMPLETIONS_DIR/_cs.ps1"

# Elvish
echo "  Generating elvish completions..."
"$CS_BIN" completions generate elvish > "$COMPLETIONS_DIR/cs.elv"

echo ""
echo "Completion scripts generated in: $COMPLETIONS_DIR"
echo ""
echo "Installation instructions:"
echo ""
echo "  Bash:"
echo "    sudo cp $COMPLETIONS_DIR/cs.bash /usr/share/bash-completion/completions/cs"
echo "    # Or for user-only: cp $COMPLETIONS_DIR/cs.bash ~/.local/share/bash-completion/completions/cs"
echo ""
echo "  Zsh:"
echo "    cp $COMPLETIONS_DIR/_cs ~/.zfunc/_cs"
echo "    # Ensure ~/.zfunc is in your fpath (add 'fpath=(~/.zfunc \$fpath)' to ~/.zshrc)"
echo ""
echo "  Fish:"
echo "    cp $COMPLETIONS_DIR/cs.fish ~/.config/fish/completions/cs.fish"
echo ""
echo "  PowerShell:"
echo "    cat $COMPLETIONS_DIR/_cs.ps1 >> \$PROFILE"
echo ""
echo "  Elvish:"
echo "    cp $COMPLETIONS_DIR/cs.elv ~/.elvish/lib/cs.elv"
echo ""
