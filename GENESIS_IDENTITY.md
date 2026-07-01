# Genesis Identity Credentials

**KEEP THIS FILE SECURE - Contains private key material!**

This file contains the official genesis identity for the SwimChain testnet.
The public key is hardcoded in `src/sponsorship/genesis_list.rs` as a genesis sponsor.

## Identity Details

| Field | Value |
|-------|-------|
| **Address** | `cs1qz0vjesa82t4452pe2jal8c5k0zxeae92z08lgzycxwjdlnkh5zzqed2kj7` |
| **Public Key** | `9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420` |
| **Password** | `testpass123` |
| **Seed (hex)** | `11b0b8c92806d893c77b547b87ad5763cb1005104ba13086e0bf184e3a277471` |

## How to Restore

### Using node-manager.sh (Recommended)

The genesis identity is hardcoded in `scripts/node-manager.sh`. Simply run:

```bash
# If genesis identity is corrupted/wrong
./scripts/node-manager.sh nuke genesis
./scripts/node-manager.sh create genesis
./scripts/node-manager.sh start genesis
```

### Manual Import

```bash
export SWIMCHAIN_PASSWORD="testpass123"
./target/release/sw --testnet --data-dir=genesis identity import --seed "11b0b8c92806d893c77b547b87ad5763cb1005104ba13086e0bf184e3a277471"
```

### Verify Identity

```bash
export SWIMCHAIN_PASSWORD="testpass123"
./target/release/sw --testnet --data-dir=genesis identity show
# Should show: cs1qz0vjesa82t4452pe2jal8c5k0zxeae92z08lgzycxwjdlnkh5zzqed2kj7
```

## Genesis List Entry

This identity is in `src/sponsorship/genesis_list.rs`:

```rust
const HARDCODED_GENESIS_LIST: &[(IdentityId, &str)] = &[
    // ... other entries ...
    (
        IdentityId([
            0x9e, 0xc9, 0x66, 0x1d, 0x3a, 0x97, 0x5a, 0xd1,
            0x41, 0xca, 0xa5, 0xdf, 0x9f, 0x14, 0xb3, 0xc4,
            0x6c, 0xf7, 0x25, 0x50, 0x9e, 0x7f, 0xa0, 0x44,
            0xc1, 0x9d, 0x26, 0xfe, 0x76, 0xbd, 0x04, 0x20,
        ]),
        "genesis-testnet-2",
    ),
];
```

## Backup Locations

This identity is backed up in multiple places:
1. `/mnt/c/github/swimchain/GENESIS_IDENTITY.md` (this file)
2. `/mnt/c/github/swimchain/scripts/node-manager.sh` (hardcoded in script)
3. `~/.claude/skills/swimchain-services/GENESIS_SEED.txt`

## History

- **Created**: 2026-01-30
- **Purpose**: Official testnet genesis identity with sponsor privileges
- **Last verified**: 2026-02-04
