# Shell Completion Setup

Tab completion makes the `sw` CLI faster and easier to use. This guide covers setup for various shells.

## Generating Completions

Generate completion scripts using the built-in command:

```bash
# For bash
cs completions generate bash

# For zsh
cs completions generate zsh

# For fish
cs completions generate fish

# For PowerShell
cs completions generate powershell

# For elvish
cs completions generate elvish
```

Or use the helper script to generate all at once:

```bash
./scripts/generate-completions.sh
```

## Installation by Shell

### Bash

**System-wide (requires sudo):**
```bash
cs completions generate bash | sudo tee /usr/share/bash-completion/completions/sw > /dev/null
```

**User-only:**
```bash
mkdir -p ~/.local/share/bash-completion/completions
cs completions generate bash > ~/.local/share/bash-completion/completions/sw
```

**Verify:** Open a new terminal and type `cs <TAB>` to see completions.

### Zsh

**1. Create completions directory:**
```bash
mkdir -p ~/.zfunc
```

**2. Generate completion script:**
```bash
cs completions generate zsh > ~/.zfunc/_cs
```

**3. Add to ~/.zshrc (before compinit):**
```bash
fpath=(~/.zfunc $fpath)
autoload -Uz compinit && compinit
```

**4. Reload zsh:**
```bash
exec zsh
```

**Verify:** Type `cs <TAB>` to see completions.

### Fish

```bash
mkdir -p ~/.config/fish/completions
cs completions generate fish > ~/.config/fish/completions/sw.fish
```

Completions are loaded automatically on next shell start.

**Verify:** Type `cs <TAB>` in a new fish shell.

### PowerShell

**For current session only:**
```powershell
cs completions generate powershell | Out-String | Invoke-Expression
```

**Permanent installation:**
```powershell
# Ensure profile exists
if (!(Test-Path -Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force
}

# Add completions to profile
cs completions generate powershell >> $PROFILE
```

**Verify:** Restart PowerShell and type `cs <TAB>`.

### Elvish

```bash
mkdir -p ~/.elvish/lib
cs completions generate elvish > ~/.elvish/lib/cs.elv
```

Add to `~/.elvish/rc.elv`:
```elvish
use cs
```

**Verify:** Restart elvish and type `cs <TAB>`.

## What Gets Completed

Completions work for:

- **Commands:** `cs id<TAB>` → `sw identity`
- **Subcommands:** `sw identity <TAB>` → `create`, `show`, `export`, `import`
- **Flags:** `sw post create --<TAB>` → `--space`, `--title`, `--body`
- **Flag values:** Some shells complete known values for options

## Troubleshooting

### Completions not working after installation

1. **Start a new shell session** - Completions are loaded at shell startup
2. **Check file permissions:**
   ```bash
   ls -la ~/.local/share/bash-completion/completions/sw
   # Should be readable
   ```
3. **Verify bash-completion is installed:**
   ```bash
   # Debian/Ubuntu
   sudo apt install bash-completion

   # macOS
   brew install bash-completion
   ```

### Zsh: "command not found: compdef"

Add this to `~/.zshrc` before loading completions:
```bash
autoload -Uz compinit && compinit
```

### PowerShell: Script execution disabled

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Completions are outdated

Regenerate after updating `sw`:
```bash
cs completions generate bash > ~/.local/share/bash-completion/completions/sw
```

## Uninstalling Completions

### Bash
```bash
rm ~/.local/share/bash-completion/completions/sw
# Or for system-wide
sudo rm /usr/share/bash-completion/completions/sw
```

### Zsh
```bash
rm ~/.zfunc/_cs
```

### Fish
```bash
rm ~/.config/fish/completions/sw.fish
```

### PowerShell
Remove the completion block from `$PROFILE`.

### Elvish
Remove `use cs` from `~/.elvish/rc.elv` and delete `~/.elvish/lib/cs.elv`.
