#!/usr/bin/env python3
"""
SwimChain Node Automator
========================
A script for automating posts, replies, and engagements on the SwimChain network,
with chain state visualization.

REQUIRED arguments:
    --host        RPC host address
    --port        RPC port
    --data-dir    Node data directory (for cookie auth and CLI identity)

Usage:
    ./node-automator.py --host 127.0.0.1 --port 19736 --data-dir genesis-identity-testnet
    ./node-automator.py --host 127.0.0.1 --port 39736 --data-dir ~/.swimchain-testnet-agents/alpha

Features:
- Interactive TUI for chain state visualization
- Automated content creation (posts, replies, engagements)
- Batch operations for stress testing
- Real-time sync status monitoring
"""

import argparse
import base64
import hashlib
import http.client
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any


# ============================================================================
# Configuration
# ============================================================================

@dataclass
class NodeConfig:
    """Configuration for connecting to a SwimChain node."""
    host: str = "127.0.0.1"
    port: int = 19736
    data_dir: Optional[Path] = None
    cookie: Optional[str] = None

    @property
    def rpc_url(self) -> str:
        return f"http://{self.host}:{self.port}"


# ============================================================================
# Cookie Authentication
# ============================================================================

def load_cookie(data_dir: Path) -> Optional[str]:
    """Load the authentication cookie from the specified data directory.

    No auto-discovery - requires explicit data_dir.
    """
    cookie_file = data_dir / ".cookie"
    if cookie_file.exists():
        try:
            cookie_value = cookie_file.read_text().strip()
            return cookie_value
        except Exception as e:
            print(f"Error: Failed to read cookie file {cookie_file}: {e}")
            return None
    else:
        print(f"Error: Cookie file not found at {cookie_file}")
        return None


def format_cookie_auth(cookie: str) -> str:
    """Format cookie for HTTP Basic Auth header."""
    auth_string = f"__cookie__:{cookie}"
    encoded = base64.b64encode(auth_string.encode()).decode()
    return f"Basic {encoded}"


# ============================================================================
# RPC Client
# ============================================================================

class RpcClient:
    """JSON-RPC client for SwimChain node."""

    def __init__(self, config: NodeConfig):
        self.config = config
        self._id = 0

    def call(self, method: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """Make an RPC call to the node."""
        self._id += 1

        body = json.dumps({
            "jsonrpc": "2.0",
            "id": self._id,
            "method": method,
            "params": params or {}
        })

        headers = {"Content-Type": "application/json"}

        if self.config.cookie:
            headers["Authorization"] = format_cookie_auth(self.config.cookie)

        try:
            conn = http.client.HTTPConnection(self.config.host, self.config.port, timeout=30)
            conn.request("POST", "/", body, headers)
            response = conn.getresponse()
            data = response.read().decode()
            conn.close()

            return json.loads(data)
        except Exception as e:
            return {"error": {"code": -1, "message": str(e)}}

    def is_error(self, response: Dict) -> bool:
        """Check if response is an error."""
        return "error" in response and response["error"] is not None

    def get_result(self, response: Dict) -> Optional[Dict]:
        """Extract result from response."""
        return response.get("result")


# ============================================================================
# Chain State Visualization
# ============================================================================

class ChainVisualizer:
    """Visualize chain state in terminal."""

    def __init__(self, client: RpcClient):
        self.client = client

    def print_header(self, text: str):
        """Print a section header."""
        width = 60
        print()
        print("=" * width)
        print(f" {text}".center(width))
        print("=" * width)

    def print_subheader(self, text: str):
        """Print a subsection header."""
        print()
        print(f"--- {text} ---")

    def show_node_info(self):
        """Display basic node information."""
        self.print_header("NODE INFO")

        response = self.client.call("get_info")
        if self.client.is_error(response):
            print(f"Error: {response['error']['message']}")
            return

        info = self.client.get_result(response)
        if info:
            print(f"  Node ID:      {info.get('node_id', 'N/A')[:16]}...")
            print(f"  Version:      {info.get('version', 'N/A')}")
            print(f"  Network:      {info.get('network', 'N/A')}")
            print(f"  Uptime:       {info.get('uptime_seconds', 0)}s")

    def show_sync_status(self):
        """Display sync status."""
        self.print_subheader("SYNC STATUS")

        response = self.client.call("get_sync_status")
        if self.client.is_error(response):
            print(f"  Error: {response['error']['message']}")
            return

        status = self.client.get_result(response)
        if status:
            print(f"  Block Height: {status.get('block_height', 0)}")
            print(f"  Peers:        {status.get('connected_peers', 0)}")
            print(f"  Syncing:      {'Yes' if status.get('is_syncing') else 'No'}")

    def show_peers(self):
        """Display connected peers."""
        self.print_subheader("CONNECTED PEERS")

        response = self.client.call("get_peers")
        if self.client.is_error(response):
            print(f"  Error: {response['error']['message']}")
            return

        result = self.client.get_result(response)
        # get_peers returns a list directly, not {"peers": [...]}
        peers = result if isinstance(result, list) else []

        if not peers:
            print("  No peers connected")
            return

        for peer in peers[:5]:  # Show first 5
            addr = peer.get("address", "unknown") if isinstance(peer, dict) else str(peer)
            direction = "Out" if isinstance(peer, dict) and peer.get("direction") == "Outbound" else "In"
            print(f"  [{direction}] {addr}")

        if len(peers) > 5:
            print(f"  ... and {len(peers) - 5} more")

    def show_spaces(self):
        """Display spaces."""
        self.print_header("SPACES")

        response = self.client.call("list_spaces", {"limit": 20})
        if self.client.is_error(response):
            print(f"  Error: {response['error']['message']}")
            return

        result = self.client.get_result(response)
        spaces = result.get("spaces", []) if result else []
        total = result.get("total", 0) if result else 0

        print(f"  Total: {total} spaces")
        print()

        if not spaces:
            print("  No spaces found")
            return

        for space in spaces:
            name = space.get("name", "Unnamed")
            space_id = space.get("space_id", "unknown")
            posts = space.get("post_count", 0)
            print(f"  [{posts:3d} posts] {name}")
            print(f"             {space_id[:40]}...")

        return spaces

    def show_space_content(self, space_id: str, limit: int = 10):
        """Display content in a specific space."""
        self.print_subheader(f"CONTENT IN {space_id[:16]}...")

        # Use list_space_content instead of list_space_posts to get all content
        # (list_space_posts relies on posts_by_space_index which may not be populated
        # correctly for content created with older versions of the indexing code)
        response = self.client.call("list_space_content", {"space_id": space_id, "limit": limit})
        if self.client.is_error(response):
            print(f"  Error: {response['error']['message']}")
            return

        result = self.client.get_result(response)
        # list_space_content returns {"items": [...], "total": n}
        posts = result.get("items", []) if result else []

        if not posts:
            print("  No content found")
            return []

        for post in posts:
            content_id = post.get("content_id", "unknown")
            title = post.get("title") or post.get("body_preview") or "Untitled"
            title = title[:40] if title else "Untitled"
            author = post.get("author_id", "unknown")[:16]
            replies = post.get("reply_count", 0)
            content_type = post.get("content_type", "?")

            print(f"  [{content_type:6s}] [{replies:2d} replies] {title}")
            print(f"              by {author}... | {content_id[:30]}...")

        return posts

    def show_full_status(self):
        """Show complete chain state."""
        self.show_node_info()
        self.show_sync_status()
        self.show_peers()
        spaces = self.show_spaces()

        # Show content for first space if available
        if spaces:
            first_space = spaces[0]
            space_id = first_space.get("space_id")
            if space_id:
                posts = self.show_space_content(space_id)
                return {"spaces": spaces, "posts": posts}

        return {"spaces": spaces or [], "posts": []}


# ============================================================================
# Content Creation (No PoW - requires node to have identity)
# ============================================================================

# Note: Creating content requires PoW mining which must be done by the node
# or a client with the Rust PoW implementation. This script focuses on
# visualization and can trigger CLI commands for actual content creation.

def run_cli_command(cmd: str, data_dir: Optional[Path] = None, network_mode: str = "testnet") -> str:
    """Run a sw CLI command and return output.

    network_mode: "testnet", "mainnet", or "regtest"
    """
    import subprocess
    import shlex

    full_cmd = ["./target/release/sw"]
    if network_mode == "testnet":
        full_cmd.append("--testnet")
    elif network_mode == "regtest":
        full_cmd.append("--regtest")
    # mainnet is the default, no flag needed
    if data_dir:
        full_cmd.extend(["--data-dir", str(data_dir)])
    # Use shlex.split to properly handle quoted strings
    full_cmd.extend(shlex.split(cmd))

    try:
        result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=120,  # PoW can take time
            cwd="/mnt/c/github/swimchain"
        )
        return result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return "Command timed out (PoW taking too long?)"
    except Exception as e:
        return f"Error: {e}"


# ============================================================================
# Interactive Menu
# ============================================================================

class NodeAutomator:
    """Interactive node automation tool."""

    def __init__(self, config: NodeConfig, network_mode: str = "testnet"):
        self.config = config
        self.network_mode = network_mode  # "testnet", "mainnet", or "regtest"
        self.client = RpcClient(config)
        self.visualizer = ChainVisualizer(self.client)

    def verify_connection(self) -> bool:
        """Verify we can connect to the node."""
        response = self.client.call("get_sync_status")
        if self.client.is_error(response):
            print(f"Connection failed: {response['error']['message']}")
            return False
        return True

    def run_interactive(self):
        """Run interactive menu."""
        print()
        print("=" * 60)
        print(" SwimChain Node Automator ".center(60))
        print("=" * 60)
        print(f"  Target: {self.config.rpc_url}")
        if self.config.data_dir:
            print(f"  Data:   {self.config.data_dir}")
        print(f"  Network: {self.network_mode}")
        print(f"  Auth:   {'Cookie' if self.config.cookie else 'None'}")
        print()

        if not self.verify_connection():
            print("Failed to connect to node. Exiting.")
            return

        print("Connected successfully!")

        while True:
            print()
            print("-" * 40)
            print("Commands:")
            print("  1. Show full chain state")
            print("  2. Show sync status")
            print("  3. Show spaces")
            print("  4. Show posts in space")
            print("  5. Create post (via CLI)")
            print("  6. Create reply (via CLI)")
            print("  7. Engage content (via CLI)")
            print("  8. Batch create posts")
            print("  9. Monitor (refresh every 5s)")
            print("  c. Connect to peer")
            print("  0. Exit")
            print("-" * 40)

            try:
                choice = input("Enter choice: ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nExiting...")
                break

            if choice == "0":
                print("Goodbye!")
                break
            elif choice == "1":
                self.visualizer.show_full_status()
            elif choice == "2":
                self.visualizer.show_node_info()
                self.visualizer.show_sync_status()
                self.visualizer.show_peers()
            elif choice == "3":
                self.visualizer.show_spaces()
            elif choice == "4":
                self.cmd_show_space_posts()
            elif choice == "5":
                self.cmd_create_post()
            elif choice == "6":
                self.cmd_create_reply()
            elif choice == "7":
                self.cmd_engage()
            elif choice == "8":
                self.cmd_batch_posts()
            elif choice == "9":
                self.cmd_monitor()
            elif choice == "c" or choice == "C":
                self.cmd_connect_peer()
            else:
                print("Invalid choice")

    def cmd_show_space_posts(self):
        """Show posts in a specific space."""
        # First list spaces
        response = self.client.call("list_spaces", {"limit": 10})
        if self.client.is_error(response):
            print(f"Error: {response['error']['message']}")
            return

        result = self.client.get_result(response)
        spaces = result.get("spaces", []) if result else []

        if not spaces:
            print("No spaces found")
            return

        print("\nAvailable spaces:")
        for i, space in enumerate(spaces):
            print(f"  {i+1}. {space.get('name', 'Unnamed')} ({space.get('post_count', 0)} posts)")

        try:
            idx = int(input("Select space number: ")) - 1
            if 0 <= idx < len(spaces):
                self.visualizer.show_space_content(spaces[idx]["space_id"])
            else:
                print("Invalid selection")
        except ValueError:
            print("Invalid input")

    def cmd_create_post(self):
        """Create a post via CLI."""
        # Get space
        response = self.client.call("list_spaces", {"limit": 10})
        result = self.client.get_result(response)
        spaces = result.get("spaces", []) if result else []

        if not spaces:
            print("No spaces available. Create a space first.")
            return

        print("\nSelect space:")
        for i, space in enumerate(spaces):
            print(f"  {i+1}. {space.get('name', 'Unnamed')}")

        try:
            idx = int(input("Space number: ")) - 1
            space_id = spaces[idx]["space_id"]
        except (ValueError, IndexError):
            print("Invalid selection")
            return

        title = input("Post title: ").strip()
        body = input("Post body: ").strip()

        if not title or not body:
            print("Title and body are required")
            return

        print("\nCreating post (this may take ~30s for PoW)...")
        output = run_cli_command(
            f'post create --space {space_id} --title "{title}" --body "{body}"',
            data_dir=self.config.data_dir,
            network_mode=self.network_mode
        )
        print(output)

    def cmd_create_reply(self):
        """Create a reply via CLI."""
        content_id = input("Parent content ID (sha256:...): ").strip()
        if not content_id.startswith("sha256:"):
            print("Invalid content ID format")
            return

        body = input("Reply body: ").strip()
        if not body:
            print("Body is required")
            return

        print("\nCreating reply (this may take ~15s for PoW)...")
        output = run_cli_command(
            f'post reply --parent {content_id} --body "{body}"',
            data_dir=self.config.data_dir,
            network_mode=self.network_mode
        )
        print(output)

    def cmd_engage(self):
        """Engage content via CLI."""
        content_id = input("Content ID to engage (sha256:...): ").strip()
        if not content_id.startswith("sha256:"):
            print("Invalid content ID format")
            return

        print("Emoji options: heart, thumbsup, thumbsdown, laugh, thinking, mindblown, fire, swimming")
        emoji = input("Emoji (optional): ").strip() or None

        emoji_arg = f"--emoji {emoji}" if emoji else ""

        print("\nEngaging content (this may take ~5s for PoW)...")
        output = run_cli_command(
            f'post engage {content_id} --seconds 5 {emoji_arg}',
            data_dir=self.config.data_dir,
            network_mode=self.network_mode
        )
        print(output)

    def cmd_batch_posts(self):
        """Create multiple posts for stress testing."""
        # Get space
        response = self.client.call("list_spaces", {"limit": 10})
        result = self.client.get_result(response)
        spaces = result.get("spaces", []) if result else []

        if not spaces:
            print("No spaces available")
            return

        print("\nSelect space:")
        for i, space in enumerate(spaces):
            print(f"  {i+1}. {space.get('name', 'Unnamed')}")

        try:
            idx = int(input("Space number: ")) - 1
            space_id = spaces[idx]["space_id"]
        except (ValueError, IndexError):
            print("Invalid selection")
            return

        try:
            count = int(input("Number of posts to create: "))
            if count < 1 or count > 100:
                print("Please enter 1-100")
                return
        except ValueError:
            print("Invalid number")
            return

        print(f"\nCreating {count} posts (this will take ~{count * 30}s)...")

        for i in range(count):
            title = f"Test Post #{i+1} - {datetime.now().strftime('%H:%M:%S')}"
            body = f"Automated test post created by node-automator. Index: {i+1}/{count}"

            print(f"\n[{i+1}/{count}] Creating: {title}")
            output = run_cli_command(
                f'post create --space {space_id} --title "{title}" --body "{body}"',
                data_dir=self.config.data_dir,
                network_mode=self.network_mode
            )

            if "Error" in output or "failed" in output.lower():
                print(f"  Failed: {output[:100]}")
            else:
                print(f"  Success!")

        print(f"\nBatch complete: Created {count} posts")

    def cmd_monitor(self):
        """Continuous monitoring mode."""
        print("\nStarting monitor mode (Ctrl+C to stop)...")

        try:
            while True:
                # Clear screen (cross-platform)
                os.system('cls' if os.name == 'nt' else 'clear')

                print(f"SwimChain Monitor - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                print(f"Node: {self.config.rpc_url}")

                self.visualizer.show_sync_status()
                self.visualizer.show_spaces()

                print("\n[Refreshing in 5s... Press Ctrl+C to stop]")
                time.sleep(5)
        except KeyboardInterrupt:
            print("\nMonitor stopped")

    def cmd_connect_peer(self):
        """Connect to another peer."""
        print("\nConnect to Peer")
        print("-" * 40)
        print("Enter the peer address to connect to.")
        print("Format: host:port (e.g., 127.0.0.1:19735)")
        print()

        try:
            address = input("Peer address: ").strip()
            if not address:
                print("Cancelled")
                return

            # Validate format
            if ":" not in address:
                print("Error: Address must include port (host:port)")
                return

            print(f"\nConnecting to {address}...")
            response = self.client.call("add_peer", {"address": address})

            if self.client.is_error(response):
                print(f"Failed: {response['error']['message']}")
            else:
                result = self.client.get_result(response)
                peer_id = result.get("peer_id", "unknown") if result else "unknown"
                print(f"Connected! Peer ID: {peer_id[:16]}...")

        except (KeyboardInterrupt, EOFError):
            print("\nCancelled")


# ============================================================================
# JSON Output Mode
# ============================================================================

def json_mode(config: NodeConfig, command: str):
    """Run a single command and output JSON."""
    client = RpcClient(config)

    commands = {
        "status": lambda: {
            "sync": client.call("get_sync_status"),
            "info": client.call("get_info"),
            "peers": client.call("get_peers"),
        },
        "spaces": lambda: client.call("list_spaces", {"limit": 100}),
        "peers": lambda: client.call("get_peers"),
        "sync": lambda: client.call("get_sync_status"),
    }

    # Handle posts:<space_id> command
    if command.startswith("posts:"):
        space_id = command.split(":", 1)[1]
        result = client.call("list_space_posts", {"space_id": space_id, "limit": 50})
        print(json.dumps(result, indent=2))
        return

    # Handle content:<space_id> command (list_space_content - includes all content types)
    if command.startswith("content:"):
        space_id = command.split(":", 1)[1]
        result = client.call("list_space_content", {"space_id": space_id, "limit": 50})
        print(json.dumps(result, indent=2))
        return

    if command in commands:
        result = commands[command]()
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="SwimChain Node Automator - Automate posts, replies, and view chain state",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --host 127.0.0.1 --port 19736 --data-dir genesis-identity-testnet
  %(prog)s --host 127.0.0.1 --port 39736 --data-dir ~/.swimchain-testnet-agents/alpha
  %(prog)s --host 64.225.115.108 --port 19736 --data-dir genesis-identity-testnet
  %(prog)s --host 127.0.0.1 --port 19736 --data-dir genesis-identity-testnet --json status
        """
    )

    parser.add_argument("--host", required=True, help="RPC host address (e.g., 127.0.0.1)")
    parser.add_argument("--port", type=int, required=True, help="RPC port (e.g., 19736)")
    parser.add_argument("--data-dir", type=Path, required=True, help="Node data directory (for cookie auth and CLI identity)")
    parser.add_argument("--cookie", help="Override: authentication cookie (hex string) instead of reading from data-dir")
    parser.add_argument("--testnet", action="store_true", help="Use testnet mode for CLI commands")
    parser.add_argument("--mainnet", action="store_true", help="Use mainnet mode for CLI commands")
    parser.add_argument("--regtest", action="store_true", help="Use regtest mode for CLI commands (fastest PoW)")
    parser.add_argument("--json", metavar="COMMAND", help="Output JSON for command (status, spaces, peers, sync)")

    args = parser.parse_args()

    # Determine network mode - default to testnet if nothing specified
    if args.regtest:
        network_mode = "regtest"
    elif args.mainnet:
        network_mode = "mainnet"
    else:
        network_mode = "testnet"

    # Build config
    config = NodeConfig(
        host=args.host,
        port=args.port,
        data_dir=args.data_dir,
    )

    # Load cookie
    if args.cookie:
        config.cookie = args.cookie
    else:
        config.cookie = load_cookie(args.data_dir)

    if not config.cookie:
        print("Error: No cookie found. Cannot proceed without authentication.")
        print(f"Ensure node is running and {args.data_dir / '.cookie'} exists.")
        sys.exit(1)

    # JSON mode
    if args.json:
        json_mode(config, args.json)
        return

    # Interactive mode
    automator = NodeAutomator(config, network_mode=network_mode)
    automator.run_interactive()


if __name__ == "__main__":
    main()
