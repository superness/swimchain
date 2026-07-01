# Chunking Benchmarks

Performance measurements for the content chunking system (Milestone 3.2).

## Test Environment

Run benchmarks with:
```sh
cargo bench --bench chunking
```

Results will be written to `target/criterion/`.

## Expected Results

### Chunking Performance (chunk_data)

The `chunk_data()` function splits data into 1MB chunks and computes SHA-256 hashes.

| File Size | Expected Time | Throughput |
|-----------|---------------|------------|
| 2MB | ~5-10ms | ~200-400 MB/s |
| 10MB | ~25-50ms | ~200-400 MB/s |
| 50MB | ~125-250ms | ~200-400 MB/s |
| 100MB | ~250-500ms | ~200-400 MB/s |

Performance is dominated by SHA-256 hashing (approximately 200-400 MB/s depending on CPU).

### Store Chunked Content

Complete store operation including chunking, hashing, and disk I/O.

| File Size | Expected Time | Notes |
|-----------|---------------|-------|
| 2MB | ~10-20ms | 2 chunks |
| 10MB | ~50-100ms | 10 chunks |
| 50MB | ~250-500ms | 50 chunks |

I/O adds overhead to pure chunking time. SSD vs HDD will significantly affect results.

### Reassemble Content

Load chunks from disk and verify integrity via hash comparison.

| File Size | Expected Time | Notes |
|-----------|---------------|-------|
| 2MB | ~5-15ms | Hash verification on read |
| 10MB | ~25-75ms | |
| 50MB | ~125-375ms | |

Reading is slightly faster than writing due to OS caching.

### Manifest Serialization

JSON encoding/decoding of manifest structures.

| Chunks | Manifest Size | Serialize | Deserialize |
|--------|---------------|-----------|-------------|
| 2 | ~300 bytes | ~1μs | ~2μs |
| 10 | ~1.5KB | ~5μs | ~10μs |
| 50 | ~7KB | ~25μs | ~50μs |
| 100 | ~14KB | ~50μs | ~100μs |
| 500 | ~70KB | ~250μs | ~500μs |
| 1024 | ~140KB | ~500μs | ~1ms |

### Manifest Overhead

Storage overhead for manifest metadata.

| File Size | Chunks | Manifest Size | Overhead % |
|-----------|--------|---------------|------------|
| 1MB | 1 | ~150 bytes | 0.014% |
| 10MB | 10 | ~1.5KB | 0.015% |
| 100MB | 100 | ~14KB | 0.014% |
| 500MB | 500 | ~70KB | 0.014% |
| 1GB | 1024 | ~140KB | 0.013% |

Manifest overhead is negligible (<0.02%) at all file sizes.

### Availability Checking

Time to check which chunks are locally available.

| Chunks | Expected Time |
|--------|---------------|
| 10 | ~100-200μs |
| 50 | ~500-1000μs |
| 100 | ~1-2ms |

Performance is O(n) with number of chunks (filesystem existence checks).

## Conclusions

### Optimal Chunk Size Analysis

The 1MB chunk size was chosen for these reasons:

1. **Network efficiency**: Large enough for efficient TCP transfers
2. **Parallelism**: 1024 max chunks allows up to 1GB files with good parallelism
3. **Memory footprint**: 1MB is reasonable for mobile devices
4. **Manifest overhead**: <0.02% is negligible

Alternative chunk sizes considered:

| Chunk Size | Max File Size | Overhead | Trade-offs |
|------------|---------------|----------|------------|
| 64KB | 64MB | 0.2% | Too small max size, high overhead |
| 256KB | 256MB | 0.05% | Limited file size |
| 1MB | 1GB | 0.014% | Good balance (chosen) |
| 4MB | 4GB | 0.003% | Less parallelism |

### Critical Measurements

1. **Optimal chunk size for network efficiency?**
   - 1MB provides good balance between overhead and parallelism
   - Allows parallel downloads from 10+ peers for typical files

2. **Overhead of manifest structure?**
   - <0.02% for all file sizes
   - ~140 bytes per chunk entry in JSON format
   - Negligible compared to content size

3. **Memory usage during chunking?**
   - Peak: ~1MB (one chunk buffer) + ~140KB (manifest for 1GB file)
   - Constant memory regardless of file size during reassembly

4. **I/O patterns?**
   - Sequential write during store (optimal for SSDs)
   - Random reads during reassembly (chunks may be stored out of order)

## Running Benchmarks

```sh
# Run all chunking benchmarks
cargo bench --bench chunking

# Run specific benchmark
cargo bench --bench chunking -- chunk_data

# Generate HTML report
cargo bench --bench chunking -- --verbose

# View results
open target/criterion/report/index.html
```

## Interpreting Results

Criterion provides statistical analysis:

- **Mean**: Average time per iteration
- **Std. Dev.**: Variability between runs
- **Outliers**: Runs affected by system noise

Look for:
- Consistent throughput across file sizes (linear scaling)
- Low standard deviation (<10% of mean)
- Minimal outliers

## Performance Tuning

If benchmarks show poor performance:

1. **Check disk type**: SSD vs HDD makes 10x difference
2. **Verify filesystem**: ext4/APFS perform better than NTFS
3. **Check available memory**: Low memory causes swapping
4. **Monitor CPU frequency**: Thermal throttling affects hashing

## See Also

- [Content Chunking](../content-chunking.md) - Implementation details
- [Storage Benchmarks](../storage-layer.md) - I/O performance baseline
