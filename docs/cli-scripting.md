# CLI Scripting Guide

This guide covers automating Chainsocial operations using the `sw` command-line interface.

## Table of Contents

- [JSON Output Mode](#json-output-mode)
- [Exit Codes](#exit-codes)
- [Environment Variables](#environment-variables)
- [Common Scripting Patterns](#common-scripting-patterns)
- [Example Scripts](#example-scripts)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## JSON Output Mode

All commands support JSON output via the `--json` flag:

```bash
# Global flag (before command)
cs --json identity show

# Per-command flag
sw identity show --json
sw sync status --json
sw search --json "query"
```

### Parsing JSON with jq

The `jq` tool is recommended for parsing JSON output:

```bash
# Get identity address
sw identity show --json | jq -r '.address'

# Get list of spaces
sw space list --json | jq -r '.spaces[].id'

# Get search results
sw search --json "topic" | jq -r '.results[] | "\(.title) - \(.heat)%"'

# Get config values
sw config show --json | jq -r '.network_port'
```

### JSON Output Examples

**Identity:**
```json
{
  "address": "sw1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "public_key_hex": "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
}
```

**Search results:**
```json
{
  "query": "rust programming",
  "results": [
    {
      "content_id": "sha256:abc123...",
      "space_id": "sp1...",
      "author": "sw1...",
      "title": "Learning Rust",
      "snippet": "An introduction to...",
      "heat": 85.5,
      "timestamp": 1700000000
    }
  ],
  "count": 1,
  "note": "Local search only."
}
```

**Sync status:**
```json
{
  "connected_peers": 5,
  "local_chain_height": 12345,
  "best_known_height": 12350,
  "storage_used_bytes": 524288000,
  "storage_target_bytes": 1073741824,
  "syncing": false,
  "note": "Network connected."
}
```

## Exit Codes

| Code | Meaning | Example |
|------|---------|---------|
| 0 | Success | Command completed without errors |
| 1 | General error | Invalid arguments, file not found |
| 2 | Network error | Connection failed, sync error |
| 3 | Not found | Content or identity not found |

Check exit codes in scripts:

```bash
sw sync now
if [ $? -eq 0 ]; then
    echo "Sync completed successfully"
elif [ $? -eq 2 ]; then
    echo "Network unavailable"
else
    echo "Error occurred"
fi
```

Or using set -e:

```bash
#!/bin/bash
set -e  # Exit on first error
sw identity create
sw space create --name "My Space"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHAINSOCIAL_DATA_DIR` | Data directory path | `~/.swimchain` (Linux), `%APPDATA%\swimchain` (Windows) |

Example:
```bash
# Use custom data directory
export CHAINSOCIAL_DATA_DIR=/path/to/custom/data
sw identity show

# Or per-command
CHAINSOCIAL_DATA_DIR=/tmp/test-data sw identity create
```

## Common Scripting Patterns

### Check if identity exists

```bash
if sw identity show --json 2>/dev/null | jq -e '.address' > /dev/null; then
    echo "Identity exists"
else
    echo "No identity found"
fi
```

### Create identity if not exists

```bash
if ! sw identity show &>/dev/null; then
    sw identity create
fi
```

### Monitor sync progress

```bash
while true; do
    STATUS=$(sw sync status --json)
    HEIGHT=$(echo "$STATUS" | jq -r '.local_chain_height')
    TARGET=$(echo "$STATUS" | jq -r '.best_known_height')
    SYNCING=$(echo "$STATUS" | jq -r '.syncing')

    if [ "$SYNCING" = "true" ]; then
        echo "Syncing: $HEIGHT / $TARGET"
    else
        echo "Synced at height $HEIGHT"
        break
    fi
    sleep 5
done
```

### Search with filters

```bash
# Search in specific space with minimum heat
sw search --json --space "sp1abc..." --min-heat 50 "topic" | \
    jq -r '.results[] | "\(.title): \(.heat)%"'
```

## Example Scripts

### 1. Auto-Engagement Script

Automatically engage posts above a heat threshold:

```bash
#!/bin/bash
# auto-engage.sh - Engage posts with heat above threshold
# Usage: ./auto-engage.sh <space_id> <min_heat>

SPACE_ID="${1:?Space ID required}"
MIN_HEAT="${2:-70}"

echo "Searching for posts in $SPACE_ID with heat >= $MIN_HEAT%..."

# Search for posts
RESULTS=$(sw search --json --space "$SPACE_ID" --min-heat "$MIN_HEAT" "*")

# Extract content IDs
echo "$RESULTS" | jq -r '.results[].content_id' | while read -r CONTENT_ID; do
    if [ -n "$CONTENT_ID" ]; then
        echo "Engaging: $CONTENT_ID"
        sw post engage "$CONTENT_ID" --seconds 5
        sleep 1
    fi
done

echo "Done!"
```

### 2. Daily Digest Script

Generate a daily digest of new posts:

```bash
#!/bin/bash
# daily-digest.sh - Summarize new posts from followed spaces
# Usage: ./daily-digest.sh

OUTPUT_FILE="digest-$(date +%Y-%m-%d).md"

echo "# Daily Digest - $(date +%Y-%m-%d)" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Get followed spaces
SPACES=$(sw config show --json | jq -r '.followed_spaces[]')

for SPACE_ID in $SPACES; do
    echo "## Space: $SPACE_ID" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    # Search for recent posts (sort by newest)
    sw search --json --space "$SPACE_ID" --sort newest --limit 10 "*" | \
        jq -r '.results[] | "- **\(.title)** (\(.heat | floor)% heat)\n  \(.snippet)\n"' >> "$OUTPUT_FILE"

    echo "" >> "$OUTPUT_FILE"
done

echo "Digest saved to: $OUTPUT_FILE"
```

### 3. Backup Script

Export posts to files:

```bash
#!/bin/bash
# backup-posts.sh - Export posts to files
# Usage: ./backup-posts.sh <space_id> <output_dir>

SPACE_ID="${1:?Space ID required}"
OUTPUT_DIR="${2:-./backup}"

mkdir -p "$OUTPUT_DIR"

echo "Backing up posts from $SPACE_ID..."

# Search all posts in space
sw search --json --space "$SPACE_ID" --limit 1000 "*" | \
    jq -c '.results[]' | while read -r POST; do

    CONTENT_ID=$(echo "$POST" | jq -r '.content_id' | sed 's/sha256://')
    TITLE=$(echo "$POST" | jq -r '.title' | tr '/' '-')

    # Save as JSON
    echo "$POST" > "$OUTPUT_DIR/${CONTENT_ID:0:16}-$TITLE.json"
done

COUNT=$(ls -1 "$OUTPUT_DIR"/*.json 2>/dev/null | wc -l)
echo "Backed up $COUNT posts to $OUTPUT_DIR"
```

### 4. Space Health Monitor

Monitor engagement pool status:

```bash
#!/bin/bash
# space-health.sh - Monitor space health and engagement
# Usage: ./space-health.sh <space_id>

SPACE_ID="${1:?Space ID required}"

echo "Monitoring space: $SPACE_ID"
echo "Press Ctrl+C to stop"
echo ""

while true; do
    clear
    echo "=== Space Health: $SPACE_ID ==="
    echo "Time: $(date)"
    echo ""

    # Get sync status
    sw sync status --json | jq -r '"Peers: \(.connected_peers) | Chain: \(.local_chain_height)/\(.best_known_height)"'
    echo ""

    # Get top posts by heat
    echo "Top Posts (by heat):"
    sw search --json --space "$SPACE_ID" --sort heat --limit 5 "*" | \
        jq -r '.results[] | "  [\(.heat | floor)%] \(.title)"'

    echo ""
    echo "Refreshing in 30 seconds..."
    sleep 30
done
```

### 5. CI/CD Integration

Post release notes automatically:

```bash
#!/bin/bash
# release-post.sh - Post release notes
# Usage: ./release-post.sh <version> <changelog_file>

VERSION="${1:?Version required}"
CHANGELOG_FILE="${2:?Changelog file required}"

SPACE_ID="${RELEASE_SPACE_ID:?Set RELEASE_SPACE_ID environment variable}"

# Check identity
if ! sw identity show &>/dev/null; then
    echo "Error: No identity configured. Run 'sw identity create' first."
    exit 1
fi

# Read changelog
BODY=$(cat "$CHANGELOG_FILE")
TITLE="Release $VERSION"

echo "Posting release notes..."
sw post create --space "$SPACE_ID" --title "$TITLE" --body "$BODY"

if [ $? -eq 0 ]; then
    echo "Release $VERSION posted successfully!"
else
    echo "Failed to post release notes"
    exit 1
fi
```

### 6. Content Migration

Import/export between instances:

```bash
#!/bin/bash
# migrate.sh - Migrate content between instances
# Usage: ./migrate.sh export <output_file>
#        ./migrate.sh import <input_file>

ACTION="${1:?Specify 'export' or 'import'}"
FILE="${2:?Specify file path}"

case "$ACTION" in
    export)
        echo "Exporting to $FILE..."

        # Export all data
        {
            echo '{"version": 1, "exported_at": "'$(date -Iseconds)'"}'
            echo '{"type": "identity", "data": '$(sw identity show --json)'}'

            sw space list --json | jq -c '.spaces[]' | while read -r SPACE; do
                echo '{"type": "space", "data": '"$SPACE"'}'
            done

            # Export posts from each space
            sw space list --json | jq -r '.spaces[].id' | while read -r SPACE_ID; do
                sw search --json --space "$SPACE_ID" --limit 10000 "*" | \
                    jq -c '.results[]' | while read -r POST; do
                    echo '{"type": "post", "space": "'"$SPACE_ID"'", "data": '"$POST"'}'
                done
            done
        } > "$FILE"

        echo "Export complete!"
        ;;

    import)
        echo "Importing from $FILE..."
        echo "Note: Import functionality requires manual review of exported data."
        echo "Each entry in the file is a JSON object with type and data fields."
        ;;

    *)
        echo "Unknown action: $ACTION"
        echo "Usage: $0 export|import <file>"
        exit 1
        ;;
esac
```

## Error Handling

### Capturing errors

```bash
# Capture both stdout and stderr
OUTPUT=$(sw identity show 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "Command failed with exit code $EXIT_CODE"
    echo "Error: $OUTPUT"
fi
```

### Timeout handling

```bash
# Set timeout for operations
timeout 60 sw sync now || echo "Sync timed out after 60 seconds"
```

### Retry logic

```bash
MAX_RETRIES=3
RETRY_DELAY=5

for i in $(seq 1 $MAX_RETRIES); do
    if sw sync now; then
        echo "Sync successful"
        break
    else
        echo "Attempt $i failed, retrying in $RETRY_DELAY seconds..."
        sleep $RETRY_DELAY
    fi
done
```

## Best Practices

1. **Always check exit codes** - Don't assume commands succeed
   ```bash
   sw post create ... || exit 1
   ```

2. **Use --json for parsing** - Human-readable output may change between versions
   ```bash
   # Good
   sw sync status --json | jq -r '.connected_peers'

   # Fragile
   sw sync status | grep "Connected peers"
   ```

3. **Quote variables** - Prevent word splitting and globbing
   ```bash
   CONTENT_ID="sha256:abc..."
   sw post view "$CONTENT_ID"
   ```

4. **Handle timeouts** - Network operations may hang
   ```bash
   timeout 30 sw sync now
   ```

5. **Use environment variables for secrets** - Never hardcode sensitive data
   ```bash
   export CHAINSOCIAL_DATA_DIR=/secure/path
   ```

6. **Log operations** - Keep audit trails
   ```bash
   sw post create ... 2>&1 | tee -a /var/log/swimchain.log
   ```

## Troubleshooting

### Command not found

Ensure `sw` is in your PATH:
```bash
# Check if installed
which cs

# Add to PATH if needed
export PATH="$PATH:/path/to/swimchain/bin"
```

### Permission denied

Check file permissions:
```bash
ls -la ~/.swimchain/
chmod 700 ~/.swimchain/
```

### JSON parsing errors

Validate JSON output:
```bash
sw sync status --json | jq .
# If this fails, the output isn't valid JSON
```

### Network timeouts

Increase timeout or check connectivity:
```bash
# Check if network is available
sw sync peers --json | jq -r '.count'

# Use longer timeout
timeout 120 sw sync now
```

### Identity not found

Initialize or import an identity:
```bash
# Create new identity
sw identity create

# Or import existing
sw identity import --file identity.json
```

---

For more information:
- Run `cs --help` for command reference
- Run `cs <command> --help` for subcommand details
- See `docs/cli-reference.md` for full command documentation
