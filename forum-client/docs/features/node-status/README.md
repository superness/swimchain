# Node Status Bar

**Feature Group**: UI Shell & Components
**Route**: All pages (footer component)

## Overview

The Node Status Bar provides real-time information about the local Swimchain node's connection status, peer count, and storage usage. It appears at the bottom of every page.

## UI Components

### Status Bar

![Status Bar](01-status-bar.png)

The status bar displays (left to right):

| Component | Description | States |
|-----------|-------------|--------|
| **Connection Status** | Node's network state | Online (green), Offline (red), Syncing (yellow) |
| **Peer Count** | Number of connected P2P peers | "X peers" |
| **Storage** | Local content storage usage | "X/500 MB" |
| **Shortcuts** | Keyboard shortcut help | Click to view shortcuts |

### Status States

#### Offline (Red)
- Node not connected to network
- Cannot sync content
- Can still browse local/cached content

#### Online (Green)
- Node connected to at least one peer
- Actively syncing content
- Full functionality available

#### Syncing (Yellow)
- Node catching up with network
- Downloading blocks/content
- Limited functionality

## Technical Details

- Status updates via WebSocket connection to local node
- Polls node RPC every 5 seconds for status updates
- Storage limit is configurable per node (default: 500 MB)
- Peer count reflects active P2P connections

## Related Features

- Debug Panel (detailed node diagnostics)
- Settings (configure storage limits)
