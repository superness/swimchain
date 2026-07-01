# Illegal Content Handling

This document describes how Swimchain handles illegal content (CSAM, terrorism material) as specified in SPEC_12 Section 4.4.

## Philosophy

Swimchain operates on the principle that illegal content handling should be:

1. **Protocol-level**: Not dependent on platform operators
2. **Decentralized**: No central authority makes decisions
3. **Community-driven**: Requires attestation from multiple independent parties
4. **Immediate**: Blocked content is rejected instantly
5. **Permanent**: Removal from blocklist requires extraordinary proof

## Content Categories

### CSAM (Child Sexual Abuse Material)
- Hash-based detection
- Compatible with external databases (e.g., NCMEC PhotoDNA)
- Zero tolerance policy

### Terrorism Content
- Material promoting or celebrating terrorism
- Radicalization content
- Attack planning/instructions

### External Lists
- Integration with law enforcement databases
- Verified third-party blocklists
- Government-mandated lists (jurisdiction-specific)

## Detection Mechanisms

### Hash-Based Detection

Content is identified by SHA-256 hash, allowing detection without storing actual content:

```rust
fn is_illegal_content(content_hash: &[u8; 32]) -> bool {
    blocklist.is_blocked(content_hash)
}
```

### Community Attestation

When users encounter potentially illegal content:

1. Submit `SpamAttestation` with `reason = IllegalContent`
2. System tracks attestations by sponsor tree
3. When 3+ independent trees attest:
   - Content added to blocklist
   - Update propagated network-wide

### External Database Integration

Nodes can import hashes from external sources:

```rust
let entry = BlocklistEntry::new(
    content_hash,
    BlocklistReason::ExternalList,
    vec![],  // No attestations needed for external lists
    node_id,
    timestamp,
);
store.add(entry)?;
```

## Enforcement Points

### 1. Content Creation

Before storing any content:

```rust
if blocklist.is_blocked(&content_hash) {
    return Err(ContentRejected::IllegalContent);
}
```

### 2. Content Retrieval

Before serving content to requesters:

```rust
if blocklist.is_blocked(&content_hash) {
    return Err(ContentUnavailable::Blocked);
}
```

### 3. Gossip Propagation

Before forwarding content through gossip:

```rust
if blocklist.is_blocked(&content_hash) {
    // Do not propagate
    log::warn!("Blocked content propagation attempt");
    return;
}
```

## Sponsor Consequences

When content is confirmed as illegal:

1. **Content removed immediately** from local storage
2. **Author reputation devastated** (-1000 per flag)
3. **Sponsor tree notified** of violation
4. **Sponsor may be penalized** if pattern emerges

### Reputation Impact

```rust
let illegal_penalty = (rep.illegal_content_flags * 1000) as i32;
```

A single illegal content flag effectively bars the author from productive participation.

## False Positive Handling

If content is incorrectly flagged:

### Counter-Attestation Requirements

1. **5 Anchor-level (Level 4+) counter-attestations**
2. From **different sponsor trees**
3. With **valid explanations**

### Process

1. Anchor submits counter-attestation
2. System tracks counter-attestations
3. When threshold met:
   - Content removed from blocklist
   - Reputation penalties reversed
   - Counter-attestation recorded for audit

### Safeguards

- High level requirement (Anchor = 200GB+ contributed)
- Multiple independent trees required
- Audit trail maintained
- Abuse of counter-attestation penalized

## Node Operator Obligations

Node operators MUST:

1. **Not disable blocklist checking**
2. **Sync blocklist with peers** regularly
3. **Reject blocked content** at all enforcement points
4. **Report new illegal content** when discovered
5. **Comply with local laws** regarding reporting

Node operators SHOULD:

1. Import external database hashes where available
2. Configure automatic blocklist updates
3. Monitor for patterns indicating abuse
4. Participate in counter-attestation when appropriate

## Privacy Considerations

### What IS Stored

- SHA-256 hashes of blocked content
- Attestation signatures
- Source node identifiers
- Timestamps

### What is NOT Stored

- Actual illegal content
- User viewing history
- Personal identification (beyond public keys)

## Legal Compliance

### Reporting Requirements

In jurisdictions with mandatory reporting:
- Nodes may be configured to report to authorities
- CyberTips integration possible for US nodes
- Local law variations accommodated

### Liability Protection

- Protocol-level blocking demonstrates good faith
- Community attestation provides defense
- No human review of actual content
- Hash-only identification

## Implementation Notes

### Performance

- Blocklist lookups are O(1) with hash map
- No impact on legitimate content handling
- Merkle sync is bandwidth-efficient

### Storage

- ~100 bytes per blocked hash
- Estimated 1MB for 10,000 entries
- Negligible storage overhead

### Network

- CRITICAL priority for blocklist updates
- Immediate propagation (no batching)
- Expected convergence < 2 hours

## Related Documents

- [Blocklist Protocol](blocklist-protocol.md) - Technical protocol details
- SPEC_12: Anti-Abuse Mechanisms - Full specification
- RESEARCH_05: Legal Considerations - Jurisdictional analysis
