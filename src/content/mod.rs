//! Content & Decay Engine (SPEC_02)
//!
//! Implements organic moderation through engagement-based decay.
//!
//! The content system uses a half-life model where content survives based on
//! community engagement. Unengaged content naturally decays and is eventually
//! pruned, while engaged content persists.
//!
//! Key concepts:
//! - **Decay Floor**: Content is protected from decay for 48 hours after creation
//! - **Half-Life**: Time for survival probability to halve (default 7 days)
//! - **Survival Probability**: `0.5^(effective_decay_time / half_life)`
//! - **Decay Threshold**: Content with survival < 6.25% is considered decayed
//! - **Adaptive Decay**: Half-life adjusts based on storage pressure
//! - **Engagement Pools**: Pooled PoW for collective content engagement

pub mod addressing;
pub mod chunking;
pub mod content_format;
pub mod decay;
pub mod decay_integration;
pub mod engagement;
pub mod lifecycle;
pub mod pool;
pub mod pruning;
pub mod retrieval;
pub mod storage;

pub use decay::{
    calculate_adaptive_half_life, calculate_decay_state, calculate_decay_state_full, NodeState,
};
pub use engagement::{on_pool_complete, process_engagement, EngagementRejection, EngagementResult};
pub use lifecycle::ContentManager;
pub use pool::{
    compute_pool_pow_target, CompletionResult, EngagementPool, PoolContribution, PoolError, PoolId,
    PoolInfo, PoolManager, PoolStatus,
};
pub use pruning::{prune_decayed_content, PruneStats};
pub use storage::{estimate_item_size, ContentStore, InMemoryContentStore};

// Re-export decay integration API
pub use decay_integration::{DecayError, DecayIntegration, DecayMetadata, DecayPruneStats};

// Re-export content addressing API
pub use addressing::{
    apply_content_reference, classify_content, classify_content_with_mime, compute_hash,
    extract_content_reference, should_inline, validate_content_item_fields, ContentAddressHash,
    ContentAddressedStore, ContentAddressingError, ContentBlobHash, ContentReference,
    INLINE_THRESHOLD,
};

// Re-export content chunking API (Milestone 3.2)
pub use chunking::{
    chunk_data, ChunkAvailability, ChunkInfo, ChunkedContentStore, ChunkedReference, ChunkingError,
    Manifest, MANIFEST_VERSION, MAX_CHUNKS, MAX_FILE_SIZE,
};

// Re-export content retrieval API (Milestone 3.3)
pub use retrieval::{
    ChunkFetchStatus, ContentMessageSender, ContentRetrievalConfig, ContentRetrievalError,
    ContentRetrievalManager, ContentRetrievalMessage, ParallelFetcher, PeerId,
};

// Re-export content format API (Milestone 10.1)
pub use content_format::{
    ContentFormat, ContentFormatError, ContentFormatResult, ContentFormatValidator, ImageFormat,
    ALLOWED_IMAGE_FORMATS, MAX_IMAGE_DIMENSION, MAX_IMAGE_SIZE, MAX_TEXT_LENGTH,
};
