# Content Chunking

This document describes the content chunking system implemented in Milestone 3.2 for handling large files (>1MB) in Swimchain.

## Overview

Files larger than 1MB are split into 1MB chunks for efficient P2P distribution. Each chunk is content-addressed (SHA-256), and a manifest file tracks all chunks. The manifest hash becomes the `content_hash` stored in the chain record.

## Size Thresholds

| Content Size | Storage Method | Notes |
|--------------|----------------|-------|
| ≤1KB | Inline in chain record | Stored in `body_inline` field |
| 1KB-1MB | Single blob | Stored as single content-addressed blob |
| >1MB-1GB | Chunked (manifest + chunks) | Split into 1MB chunks with manifest |
| >1GB | Rejected | Exceeds maximum file size |

## Chunking Algorithm

1. **Validate size**: Content must be >1KB and ≤1GB
2. **Split into chunks**: Divide into 1MB (1,048,576 byte) pieces
3. **Hash each chunk**: Compute SHA-256 for each chunk
4. **Generate manifest**: Create JSON manifest with chunk list
5. **Store chunks**: Store each chunk in blob storage
6. **Store manifest**: Store manifest as content-addressed blob
7. **Return reference**: Manifest hash becomes the `content_hash`

## Manifest Format

```json
{
  "version": 1,
  "total_size": 52428800,
  "chunk_size": 1048576,
  "chunks": [
    {"index": 0, "hash": "sha256:abc123...", "size": 1048576},
    {"index": 1, "hash": "sha256:def456...", "size": 1048576},
    {"index": 49, "hash": "sha256:xyz789...", "size": 428800}
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | u8 | Manifest format version (always 1) |
| `total_size` | u64 | Total size of original file in bytes |
| `chunk_size` | u32 | Size of each chunk (1,048,576 for v1) |
| `chunks` | array | Ordered list of chunk info |
| `chunks[].index` | u32 | Zero-based chunk index |
| `chunks[].hash` | string | SHA-256 hash in `sha256:<hex>` format |
| `chunks[].size` | u32 | Chunk size (last chunk may be smaller) |

## API Reference

### Core Functions

#### `chunk_data(data: &[u8]) -> Result<(Manifest, Vec<(ChunkInfo, Vec<u8>)>), ChunkingError>`

Chunks raw data into 1MB pieces.

**Arguments:**
- `data`: Raw bytes to chunk (must be >1KB, ≤1GB)

**Returns:**
- `Manifest`: The manifest describing all chunks
- `Vec<(ChunkInfo, Vec<u8>)>`: Chunk metadata paired with chunk data

**Errors:**
- `FileTooLarge`: Data exceeds 1GB
- `FileTooSmallForChunking`: Data ≤1KB (should use inline storage)
- `TooManyChunks`: Would exceed 1024 chunk limit

### ChunkedContentStore

High-level API for storing and retrieving chunked content.

```rust
use swimchain::content::ChunkedContentStore;

// Create store
let store = ChunkedContentStore::at_path("/path/to/blobs")?;

// Store content (returns manifest hash)
let reference = store.store(&large_data)?;
println!("Manifest hash: {}", reference.manifest_hash);
println!("Total size: {} bytes", reference.total_size);
println!("Chunks: {}", reference.chunk_count);

// Retrieve content
let data = store.reassemble(&reference.manifest_hash)?;

// Check partial availability
let availability = store.check_availability(&reference.manifest_hash)?;
if !availability.is_complete() {
    println!("Missing {} chunks", availability.missing_count());
    let missing = store.get_missing_chunk_hashes(&availability);
    // Request missing chunks from peers...
}
```

### Manifest

```rust
use swimchain::content::Manifest;

// Load manifest from storage
let manifest = Manifest::load(&hash, &blob_store)?;

// Validate integrity
manifest.validate()?;

// Serialize/deserialize
let json = manifest.to_json()?;
let parsed = Manifest::from_json(&json)?;

// Compute hash
let hash = manifest.compute_hash()?;
```

### ChunkAvailability

```rust
// Check what's available locally
let avail = store.check_availability(&manifest_hash)?;

avail.is_complete()           // All chunks present?
avail.availability_percent()  // e.g., 66.67%
avail.available_count()       // Number of chunks we have
avail.missing_count()         // Number of chunks missing
avail.available_indices()     // [0, 2, 3] - which chunks we have
avail.missing_indices()       // [1, 4] - which chunks we need
```

## Partial Availability

The chunking system supports partial downloads, enabling progressive loading and resumable transfers:

1. **Check availability**: Determine which chunks are locally available
2. **Get missing hashes**: Get list of chunk hashes to request from peers
3. **Request chunks**: Request specific chunks by hash over the network
4. **Store chunks**: Store received chunks (content-addressed, idempotent)
5. **Verify completeness**: Check if all chunks are now available
6. **Reassemble**: Combine chunks into original content

```rust
let availability = store.check_availability(&manifest_hash)?;

if !availability.is_complete() {
    // Get list of missing chunk hashes
    let missing = store.get_missing_chunk_hashes(&availability);

    // Request each missing chunk from peers
    for chunk_hash in missing {
        let chunk_data = request_from_peer(&chunk_hash).await?;
        store.blob_store().put_with_hash(&chunk_data, &chunk_hash)?;
    }

    // Now reassemble
    let complete_data = store.reassemble(&manifest_hash)?;
}
```

## Error Handling

```rust
use swimchain::content::ChunkingError;

match store.store(&data) {
    Ok(reference) => println!("Stored: {}", reference.manifest_hash),
    Err(ChunkingError::FileTooLarge { size, limit }) => {
        eprintln!("File {} bytes exceeds {} byte limit", size, limit);
    }
    Err(ChunkingError::FileTooSmallForChunking { size }) => {
        eprintln!("File {} bytes too small, use inline storage", size);
    }
    Err(ChunkingError::ChunkNotFound { hash }) => {
        eprintln!("Missing chunk: {}", hash);
    }
    Err(e) => eprintln!("Error: {}", e),
}
```

## Integration with ContentAddressedStore

The `ContentAddressedStore` automatically handles chunking for large content:

```rust
use swimchain::content::ContentAddressedStore;

let store = ContentAddressedStore::new("/path/to/storage")?;

// Store transparently handles all sizes
let reference = store.store(&any_size_data)?;

match reference {
    ContentReference::Inline(data) => {
        // ≤1KB, stored inline
    }
    ContentReference::Referenced { hash, size, .. } => {
        // 1KB-1MB, single blob
    }
    ContentReference::Chunked { manifest_hash, total_size, chunk_count, .. } => {
        // >1MB, chunked
    }
}

// Retrieve transparently handles all variants
let data = store.retrieve(&reference)?;
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CHUNK_SIZE` | 1,048,576 | 1MB chunk size |
| `MAX_CHUNKS` | 1,024 | Maximum chunks per file |
| `MAX_FILE_SIZE` | 1,073,741,824 | 1GB maximum file size |
| `MANIFEST_VERSION` | 1 | Current manifest format version |
| `INLINE_THRESHOLD` | 1,024 | 1KB inline threshold |

## Performance Considerations

1. **Memory usage**: Each chunk is loaded individually, avoiding full file in memory
2. **Parallelism**: Chunks can be downloaded from multiple peers simultaneously
3. **Deduplication**: Identical chunks across files are stored once
4. **Manifest overhead**: ~100 bytes per chunk (<0.01% overhead)

## See Also

- [Content Addressing](content-addressing.md) - How content is addressed and stored
- [Storage Layer](storage-layer.md) - Underlying blob storage implementation
- [Benchmarks](benchmarks/chunking.md) - Performance measurements
