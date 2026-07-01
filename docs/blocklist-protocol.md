# Blocklist Gossip Protocol

This document describes the distributed blocklist system for handling illegal content (CSAM, terrorism) as specified in SPEC_12 Section 4.6.

## Overview

The blocklist protocol provides a decentralized mechanism for identifying and blocking illegal content without relying on a central authority. Content hashes are propagated through gossip, verified by multiple independent attesters, and stored persistently at each node.

## Key Principles

1. **No Central Authority**: Blocklist decisions emerge from community attestation
2. **Sybil Resistance**: Uses sponsor tree deduplication (same as spam attestation)
3. **Eventual Consistency**: Merkle root exchange ensures network convergence
4. **High Threshold for Action**: Requires 3 independent attestations to block
5. **Even Higher for Reversal**: Requires 5 Anchor-level counter-attestations to remove

## Data Structures

### BlocklistEntry

```rust
struct BlocklistEntry {
    content_hash: [u8; 32],       // SHA-256 of blocked content
    reason: BlocklistReason,      // CSAM, Terrorism, or ExternalList
    attestations: Vec<SpamAttestation>,
    added_at: u64,                // Unix timestamp
    source_node: [u8; 32],        // Node that first reported
    propagation_confirmations: u32,
}
```

### BlocklistReason

- `CSAM (0x01)`: Child sexual abuse material
- `Terrorism (0x02)`: Terrorism-related content
- `ExternalList (0x03)`: From known external databases (e.g., NCMEC)

## Wire Protocol Messages

### MSG_BLOCKLIST_UPDATE (0x55)

Sent when content is added to or removed from the blocklist.

```
+---------------+---------------+---------------+---------------+
| Message Type  | Update Type   | Attestation   | Reserved      |
| (0x55)        | (add/remove)  | Count         |               |
+---------------+---------------+---------------+---------------+
|                     Content Hash (32 bytes)                   |
+---------------+---------------+---------------+---------------+
|                     Reporting Node Pubkey (32 bytes)          |
+---------------+---------------+---------------+---------------+
|                     Attestations (variable)                   |
+---------------+---------------+---------------+---------------+
|                     Timestamp (8 bytes)                       |
+---------------+---------------+---------------+---------------+
|                     Signature (64 bytes)                      |
+---------------+---------------+---------------+---------------+
```

### MSG_BLOCKLIST_SYNC (0x58)

Periodic Merkle root exchange for consistency.

```
+---------------+---------------+---------------+---------------+
| Message Type  | Reserved      | Entry Count (2 bytes)         |
| (0x58)        |               |                               |
+---------------+---------------+---------------+---------------+
|                     Blocklist Merkle Root (32 bytes)          |
+---------------+---------------+---------------+---------------+
|                     Last Update Timestamp (8 bytes)           |
+---------------+---------------+---------------+---------------+
|                     Node Signature (64 bytes)                 |
+---------------+---------------+---------------+---------------+
```

### MSG_BLOCKLIST_REQUEST (0x59)

Request specific blocklist entries or entries since a timestamp.

## Protocol Flow

### Adding Content to Blocklist

1. User submits `SpamAttestation` with `reason = IllegalContent`
2. Node validates attester is Resident+ level
3. Node accumulates attestations from independent sponsor trees
4. When 3+ independent attestations received:
   - Create `BlocklistUpdate` message
   - Sign with node identity
   - Add to local blocklist
   - Broadcast to all connected peers

### Receiving a Blocklist Update

1. Validate update timestamp (max 24 hours old)
2. Verify attestation count >= 3
3. Verify all attestations are for `IllegalContent`
4. Verify attestation signatures (if crypto available)
5. Add to local blocklist
6. Increment confirmation count
7. Forward to peers that haven't seen it

### Merkle Sync Protocol

1. Every `BLOCKLIST_SYNC_INTERVAL` (1 hour):
   - Exchange Merkle roots with peers
   - Compare roots for differences
   - Request missing entries from peers with larger lists

2. Convergence:
   - Entry is "confirmed" when `propagation_confirmations >= 10`
   - Expected network convergence within 2 hours

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `ILLEGAL_CONTENT_ATTESTATION_THRESHOLD` | 3 | Attestations to trigger blocklist |
| `BLOCKLIST_REMOVAL_THRESHOLD` | 5 | Anchor counter-attestations to remove |
| `MIN_BLOCKLIST_CONFIRMATIONS` | 10 | Confirmations for entry to be "confirmed" |
| `BLOCKLIST_SYNC_INTERVAL_SECS` | 3600 | Merkle sync interval (1 hour) |
| `BLOCKLIST_UPDATE_MAX_AGE_SECS` | 86400 | Max age for updates (24 hours) |

## Storage

Blocklist entries are persisted in sled with:
- `blocklist_entries` tree: Content hash → BlocklistEntry
- `blocklist_meta` tree: Merkle root, entry count, last update

## Removal Process

Removing content from the blocklist requires:

1. 5 counter-attestations from Anchor level (Level 4+) members
2. Counter-attesters must be from different sponsor trees
3. Removal propagates via `BlocklistUpdate` with `update_type = Remove`

This high bar prevents abuse of the removal process while allowing correction of false positives.

## Integration Points

### Content Creation
- Check content hash against blocklist before storage
- Reject content matching blocklist

### Content Retrieval
- Check content hash against blocklist before serving
- Return error for blocked content

### Gossip System
- Blocklist updates have CRITICAL priority
- Immediate propagation (no batching)

## Security Considerations

1. **False Positives**: SHA-256 collision is cryptographically negligible
2. **Abuse Prevention**: High threshold (3 attestations) prevents individual abuse
3. **Removal Safeguard**: Anchor-level requirement prevents easy reversal
4. **No Content Storage**: Only hashes stored, not actual content

## Related Documents

- SPEC_12: Anti-Abuse Mechanisms (Section 4.6)
- RESEARCH_08: Attestation Mechanisms
- RESEARCH_05: Legal Considerations
