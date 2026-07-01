# Identity Display

**Feature Group**: Identity & Onboarding
**Route**: All pages (header component)

## Overview

The Identity Display feature shows the user's Swimchain identity throughout the application. The identity is derived from an Ed25519 keypair and displayed as a Bech32m-encoded address (prefix: `cs1`).

## UI Components

### Header Identity Badge

![Header Identity](01-header-identity.png)

The header displays:
- **Profile Avatar**: Unique visual identifier (emoji-based) generated from public key
- **Truncated Address**: Shows first and last characters of the address (e.g., `cs1qqx...2705`)
- **Copy Button**: Click to copy full address to clipboard

### Identity Modal

![Identity Modal](02-profile-modal.png)

Clicking the header badge opens the identity details:
- **ADDRESS**: Full Bech32m address with copy button
- **PUBLIC KEY**: Raw hexadecimal Ed25519 public key
- **Display Name**: Optional human-readable name for posts
- **Use a Different Identity**: Import/export options (see Identity Import/Export feature)

## Technical Details

- Address format: `cs1` + Bech32m encoding of SHA-256(public_key)
- Avatar generation: Deterministic emoji selection based on address hash
- Storage: Keypair stored in browser localStorage (encrypted if passphrase set)

## Related Features

- Identity Generation
- Identity Import/Export
- Display Name Management
