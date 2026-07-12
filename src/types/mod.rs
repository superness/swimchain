//! Core data structures for Swimchain protocol
//!
//! This module defines all fundamental types used throughout the protocol:
//! - **Identity**: Keys, signatures, and identity proofs (SPEC_01)
//! - **Content**: Posts, replies, media, and engagement (SPEC_02)
//! - **Block**: Block headers, block types, and chain structure (SPEC_08)
//! - **Network**: Peer identity, messages, and sync (SPEC_06)
//! - **Serialization**: Binary encoding/decoding helpers

pub mod block;
pub mod constants;
pub mod content;
pub mod error;
pub mod identity;
pub mod network;
pub mod serialize;
pub mod space_class;

// Re-export commonly used types
pub use block::{
    Block, BlockHash, BlockHeader, BlockType, ContentAction, ContentBlock, ForkId,
    PreservationProof, RootBlock, SpaceBlock,
};
pub use constants::*;
pub use content::{
    ContentHash, ContentId, ContentItem, ContentLifecycle, ContentType, DecayState,
    EngagementRecord, EngagementType, Manifest, MediaRef, MediaType, PinState, PinType, SpaceId,
    Tombstone,
};
pub use error::{AddressError, ContentError, IdentityError, SerializeError};
pub use identity::{
    ActionType, FirstAppearance, IdentityAddress, IdentityCreationProof, IdentityId,
    IdentityMetadata, KeyPair, PrivateKey, PublicKey, ReputationSummary, Signature,
    SignatureEnvelope,
};
pub use network::{
    capability, DhtRecord, GossipMessage, GossipType, InvType, InvVector, MessageEnvelope,
    MessageType, NodeId, PeerAddress, PeerIdentity, PeerInfo, SyncFilter, SyncRequest,
    SyncResponse, TransportType,
};
pub use serialize::{ByteReader, ByteWriter, Deserialize, Serialize};
