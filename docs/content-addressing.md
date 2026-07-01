# Content Addressing

**Milestone 3.1** - Content Distribution Layer

This document describes the content addressing system used in Swimchain for storing and retrieving content by its cryptographic hash.

## Overview

Content addressing separates chain records (identity chains, follows, etc.) from content blobs. This enables:

1. **Efficient storage**: Small content stored inline, large content deduplicated
2. **Integrity verification**: All content verified by hash on retrieval
3. **Flexible distribution**: Content can be fetched from any peer with the blob
4. **Mobile optimization**: Clients can fetch only the content they need

## Content ID Format

All content is addressed by SHA-256 hash in the format:

```
sha256:<64-hex-characters>
```

Examples:
- `sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08`
- `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty content)

This format is used consistently throughout the system (SPEC_07 §2).

## Hash Algorithm

**SHA-256** is used for all content hashing because:
- Simple and ubiquitous (widely supported across platforms)
- Sufficient security for content addressing (256-bit collision resistance)
- Fast computation on modern hardware
- Consistent with existing infrastructure

## Inline vs Referenced Storage

Per SPEC_02 §3.1 and SPEC_07 §3, content is stored differently based on size:

| Size | Storage Method | ContentItem Fields |
|------|----------------|-------------------|
| ≤1024 bytes | Inline | `body_inline = Some(text)` |
| >1024 bytes | Blob storage | `content_hash = Some(hash)`, `content_size = Some(size)` |

### Threshold: 1KB (1024 bytes)

The 1KB threshold balances:
- **Efficiency**: Small content in chain records avoids extra lookups
- **Chain size**: Large content externalized to prevent chain bloat
- **Network**: Inline content transferred with chain sync

### ContentItem Field Rules

- `body_inline` XOR `content_hash` - never both, never neither (except empty)
- When `content_hash` is set, `content_size` must also be set
- `content_type_mime` is optional (for blob content)

## API Reference

### Core Functions

```rust
use swimchain::content::addressing::*;

// Check if content should be inline
let inline = should_inline(data.len()); // true if ≤1024

// Classify content for storage
let reference = classify_content(data);  // Returns ContentReference

// Classify with MIME type
let reference = classify_content_with_mime(data, "image/png");

// Compute hash of content
let hash = compute_hash(data);  // Returns ContentBlobHash

// Verify content matches hash
verify_content(data, &expected_hash)?;  // Returns Result<()>
```

### ContentAddressedStore

```rust
use swimchain::content::ContentAddressedStore;

// Create store
let store = ContentAddressedStore::new("./blobs")?;

// Store content (automatic inline/blob decision)
let reference = store.store(data)?;

// Store with MIME type
let reference = store.store_with_mime(data, "application/json")?;

// Retrieve content
let data = store.retrieve(&reference)?;

// Retrieve by hash directly
let data = store.retrieve_by_hash(&hash)?;

// Check if blob exists
let exists = store.exists(&hash);

// Get storage statistics
let bytes = store.total_bytes();
```

### ContentItem Helpers

```rust
use swimchain::content::addressing::*;

// Apply reference to ContentItem
let mut item = ContentItem::default();
apply_content_reference(&mut item, &reference);

// Validate ContentItem fields
validate_content_item_fields(&item)?;

// Extract reference from ContentItem
let reference = extract_content_reference(&item)?;
```

## Verification

All content is verified against its expected hash on retrieval:

1. **On store**: Hash computed and used as key
2. **On retrieve**: Hash recomputed and compared
3. **On mismatch**: `StorageError::CorruptedData` returned

This ensures:
- Corrupted storage detected immediately
- Tampered content rejected
- Network transfer errors caught

## Directory Structure

Blobs are stored in a sharded directory structure:

```
blobs/
  ab/
    cdef1234...  (62 hex chars)
  cd/
    ef567890...
```

The first byte (2 hex chars) forms the directory, remaining 31 bytes (62 hex chars) form the filename. This provides:
- Up to 256 directories for efficient filesystem lookup
- No single directory with too many files

## Integration with Chain Records

Content is referenced from `ContentItem` records in identity chains:

```
ContentItem {
    content_id: ContentId,
    author_id: IdentityId,

    // Inline storage (≤1KB)
    body_inline: Option<String>,

    // Referenced storage (>1KB)
    content_hash: Option<ContentHash>,
    content_size: Option<u32>,
    content_type_mime: Option<String>,

    // ...other fields
}
```

## Error Handling

The `ContentAddressingError` enum covers:

| Error | Cause |
|-------|-------|
| `HashMismatch` | Content doesn't match expected hash |
| `ContentTooLargeForInline` | Inline content exceeds threshold |
| `InconsistentFields` | Invalid ContentItem field combination |
| `Storage(...)` | Underlying storage error |

## Test Coverage

Tests verify:
- Threshold boundary (1024/1025 bytes)
- Inline storage (no blob created)
- Referenced storage (blob created)
- Hash verification
- Corruption detection
- Round-trip (store → retrieve)
- ContentItem field validation

## References

- [SPEC_07: Content Distribution](../specs/SPEC_07_CONTENT_DISTRIBUTION.md) - Content layer specification
- [SPEC_02: Content & Decay](../specs/SPEC_02_CONTENT_DECAY.md) - Inline threshold definition
- [Storage Layer](./storage-layer.md) - BlobStore implementation details
