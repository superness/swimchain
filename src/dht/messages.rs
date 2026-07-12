//! DHT Protocol Messages (SPEC_06 §3.8)
//!
//! Wire format for DHT operations.
//!
//! # Message Authentication (H-DHT-3)
//!
//! All DHT messages can optionally include an Ed25519 signature to authenticate
//! the sender. This prevents message forgery attacks where an attacker could
//! send messages claiming to be from another node.
//!
//! The signature covers:
//! - Message type byte
//! - Message payload
//! - Timestamp (u64, milliseconds since UNIX epoch)
//!
//! The `AuthenticatedDhtMessage` wrapper provides this envelope-level authentication.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

use super::constants::*;
use super::error::{DhtError, DhtResult};
use super::node_id::NodeId;

/// Magic prefix for DHT message signing (H-DHT-3)
const DHT_MESSAGE_PREFIX: &[u8] = b"DHT_MESSAGE_V1";

/// Maximum age of a message timestamp before rejection (5 minutes)
/// This prevents replay attacks with old messages
pub const MESSAGE_MAX_AGE_MS: u64 = 300_000;

/// Authenticated DHT message wrapper (H-DHT-3)
///
/// This provides envelope-level authentication for DHT messages.
/// The signature proves the message came from the claimed sender.
#[derive(Debug, Clone)]
pub struct AuthenticatedDhtMessage {
    /// The inner DHT message
    pub message: DhtMessage,
    /// Sender's Ed25519 public key (32 bytes)
    pub sender_pubkey: [u8; 32],
    /// Unix timestamp in milliseconds when message was created
    pub timestamp: u64,
    /// Ed25519 signature over (prefix || msg_type || payload || timestamp)
    pub signature: [u8; 64],
}

impl AuthenticatedDhtMessage {
    /// Create a new authenticated message (without signing - caller must sign)
    pub fn new(
        message: DhtMessage,
        sender_pubkey: [u8; 32],
        timestamp: u64,
        signature: [u8; 64],
    ) -> Self {
        Self {
            message,
            sender_pubkey,
            timestamp,
            signature,
        }
    }

    /// Create the canonical signing message for DHT message authentication
    ///
    /// Format: "DHT_MESSAGE_V1" || msg_type[1] || payload[...] || timestamp[8]
    ///
    /// This binds the signature to:
    /// - A unique domain prefix (prevents cross-protocol attacks)
    /// - The exact message type and content
    /// - A timestamp (prevents replay attacks)
    pub fn signing_message(msg_type: DhtMessageType, payload: &[u8], timestamp: u64) -> Vec<u8> {
        let mut msg = Vec::with_capacity(DHT_MESSAGE_PREFIX.len() + 1 + payload.len() + 8);
        msg.extend_from_slice(DHT_MESSAGE_PREFIX);
        msg.push(msg_type.to_byte());
        msg.extend_from_slice(payload);
        msg.extend_from_slice(&timestamp.to_be_bytes());
        msg
    }

    /// Check if the timestamp is valid (not too old, not in the future)
    ///
    /// Returns the current timestamp if provided as `None`.
    pub fn is_timestamp_valid(&self, current_time_ms: u64) -> bool {
        // Allow 5 minutes clock skew into the future
        if self.timestamp > current_time_ms + 300_000 {
            return false;
        }
        // Reject messages older than MESSAGE_MAX_AGE_MS
        if self.timestamp + MESSAGE_MAX_AGE_MS < current_time_ms {
            return false;
        }
        true
    }

    /// Serialize to bytes
    ///
    /// Format: msg_type[1] || payload_len[2] || payload[...] || sender_pubkey[32] || timestamp[8] || signature[64]
    pub fn to_bytes(&self) -> Vec<u8> {
        let payload = self.message.to_bytes();
        let mut bytes = Vec::with_capacity(1 + 2 + payload.len() + 32 + 8 + 64);

        bytes.push(self.message.msg_type().to_byte());
        bytes.extend_from_slice(&(payload.len() as u16).to_be_bytes());
        bytes.extend_from_slice(&payload);
        bytes.extend_from_slice(&self.sender_pubkey);
        bytes.extend_from_slice(&self.timestamp.to_be_bytes());
        bytes.extend_from_slice(&self.signature);

        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(data: &[u8]) -> DhtResult<Self> {
        // Minimum size: msg_type[1] + payload_len[2] + sender_pubkey[32] + timestamp[8] + signature[64] = 107
        if data.len() < 107 {
            return Err(DhtError::SerializationError {
                reason: "AuthenticatedDhtMessage too short".to_string(),
            });
        }

        let msg_type = DhtMessageType::from_byte(data[0])?;
        let payload_len = u16::from_be_bytes([data[1], data[2]]) as usize;

        if data.len() < 3 + payload_len + 32 + 8 + 64 {
            return Err(DhtError::SerializationError {
                reason: "AuthenticatedDhtMessage payload truncated".to_string(),
            });
        }

        let payload = &data[3..3 + payload_len];
        let message = DhtMessage::from_bytes(msg_type, payload)?;

        let offset = 3 + payload_len;
        let mut sender_pubkey = [0u8; 32];
        sender_pubkey.copy_from_slice(&data[offset..offset + 32]);

        let timestamp = u64::from_be_bytes(data[offset + 32..offset + 40].try_into().unwrap());

        let mut signature = [0u8; 64];
        signature.copy_from_slice(&data[offset + 40..offset + 104]);

        Ok(Self {
            message,
            sender_pubkey,
            timestamp,
            signature,
        })
    }

    /// Get the payload for signature verification
    pub fn get_signing_payload(&self) -> Vec<u8> {
        let payload = self.message.to_bytes();
        Self::signing_message(self.message.msg_type(), &payload, self.timestamp)
    }
}

/// DHT message types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DhtMessageType {
    /// Liveness check
    Ping,
    /// Ping response
    Pong,
    /// Find nodes close to target
    FindNode,
    /// Response with closest nodes
    Nodes,
    /// Find content providers
    FindValue,
    /// Response with providers
    Providers,
    /// Announce content availability
    Store,
    /// Store acknowledgment
    StoreAck,
}

impl DhtMessageType {
    /// Get the wire protocol byte for this message type
    pub fn to_byte(self) -> u8 {
        match self {
            Self::Ping => MSG_DHT_PING,
            Self::Pong => MSG_DHT_PONG,
            Self::FindNode => MSG_DHT_FIND_NODE,
            Self::Nodes => MSG_DHT_NODES,
            Self::FindValue => MSG_DHT_FIND_VALUE,
            Self::Providers => MSG_DHT_PROVIDERS,
            Self::Store => MSG_DHT_STORE,
            Self::StoreAck => MSG_DHT_STORE_ACK,
        }
    }

    /// Parse from wire protocol byte
    pub fn from_byte(byte: u8) -> DhtResult<Self> {
        match byte {
            MSG_DHT_PING => Ok(Self::Ping),
            MSG_DHT_PONG => Ok(Self::Pong),
            MSG_DHT_FIND_NODE => Ok(Self::FindNode),
            MSG_DHT_NODES => Ok(Self::Nodes),
            MSG_DHT_FIND_VALUE => Ok(Self::FindValue),
            MSG_DHT_PROVIDERS => Ok(Self::Providers),
            MSG_DHT_STORE => Ok(Self::Store),
            MSG_DHT_STORE_ACK => Ok(Self::StoreAck),
            _ => Err(DhtError::InvalidMessage {
                msg_type: byte,
                reason: "Unknown message type".to_string(),
            }),
        }
    }
}

/// A DHT protocol message
#[derive(Debug, Clone)]
pub enum DhtMessage {
    /// PING: Check if a node is alive
    Ping {
        /// Random nonce for correlation
        nonce: u64,
    },

    /// PONG: Response to PING
    Pong {
        /// Echo the nonce from PING
        nonce: u64,
    },

    /// FIND_NODE: Find K closest nodes to target
    FindNode {
        /// Target node ID to find
        target: NodeId,
    },

    /// NODES: Response to FIND_NODE
    Nodes {
        /// List of closest nodes
        nodes: Vec<NodeInfo>,
    },

    /// FIND_VALUE: Find providers for content
    FindValue {
        /// Content hash to find providers for
        content_hash: [u8; 32],
    },

    /// PROVIDERS: Response to FIND_VALUE
    Providers {
        /// Content hash this is for
        content_hash: [u8; 32],
        /// List of signed providers (each with Ed25519 signature)
        providers: Vec<SignedProviderInfo>,
        /// If we have the content ourselves
        has_value: bool,
    },

    /// STORE: Announce we have content
    Store {
        /// Content hash we're announcing
        content_hash: [u8; 32],
        /// Optional: TTL in seconds (0 = default)
        ttl: u32,
        /// Ed25519 public key of the provider
        public_key: [u8; 32],
        /// Ed25519 signature over the provider claim
        signature: [u8; 64],
    },

    /// STORE_ACK: Acknowledgment of STORE
    StoreAck {
        /// Content hash that was stored
        content_hash: [u8; 32],
        /// Whether the store was accepted
        accepted: bool,
    },
}

/// Information about a node (for NODES responses)
#[derive(Debug, Clone)]
pub struct NodeInfo {
    /// Node's DHT ID
    pub id: NodeId,
    /// Node's network address
    pub addr: SocketAddr,
}

/// Signed provider information (for PROVIDERS responses)
///
/// This includes the Ed25519 signature proving the provider claim is legitimate.
#[derive(Debug, Clone)]
pub struct SignedProviderInfo {
    /// Node's DHT ID
    pub id: NodeId,
    /// Node's network address
    pub addr: SocketAddr,
    /// Ed25519 public key of the provider
    pub public_key: [u8; 32],
    /// Ed25519 signature over the provider claim
    pub signature: [u8; 64],
}

impl NodeInfo {
    /// Create a new NodeInfo
    pub fn new(id: NodeId, addr: SocketAddr) -> Self {
        Self { id, addr }
    }

    /// Serialize to bytes
    /// Format: id[32] + addr_type[1] + addr[4 or 16] + port[2]
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(32 + 1 + 16 + 2);
        bytes.extend_from_slice(self.id.as_bytes());

        match self.addr.ip() {
            IpAddr::V4(ip) => {
                bytes.push(4); // IPv4
                bytes.extend_from_slice(&ip.octets());
            }
            IpAddr::V6(ip) => {
                bytes.push(6); // IPv6
                bytes.extend_from_slice(&ip.octets());
            }
        }

        bytes.extend_from_slice(&self.addr.port().to_be_bytes());
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(data: &[u8]) -> DhtResult<(Self, usize)> {
        if data.len() < 32 + 1 + 4 + 2 {
            return Err(DhtError::SerializationError {
                reason: "NodeInfo too short".to_string(),
            });
        }

        let mut id_bytes = [0u8; 32];
        id_bytes.copy_from_slice(&data[0..32]);
        let id = NodeId::from_bytes(id_bytes);

        let addr_type = data[32];
        let (addr, consumed) = match addr_type {
            4 => {
                if data.len() < 32 + 1 + 4 + 2 {
                    return Err(DhtError::SerializationError {
                        reason: "IPv4 NodeInfo too short".to_string(),
                    });
                }
                let ip = Ipv4Addr::new(data[33], data[34], data[35], data[36]);
                let port = u16::from_be_bytes([data[37], data[38]]);
                (SocketAddr::new(IpAddr::V4(ip), port), 39)
            }
            6 => {
                if data.len() < 32 + 1 + 16 + 2 {
                    return Err(DhtError::SerializationError {
                        reason: "IPv6 NodeInfo too short".to_string(),
                    });
                }
                let mut octets = [0u8; 16];
                octets.copy_from_slice(&data[33..49]);
                let ip = Ipv6Addr::from(octets);
                let port = u16::from_be_bytes([data[49], data[50]]);
                (SocketAddr::new(IpAddr::V6(ip), port), 51)
            }
            _ => {
                return Err(DhtError::SerializationError {
                    reason: format!("Unknown address type: {}", addr_type),
                });
            }
        };

        Ok((Self { id, addr }, consumed))
    }
}

impl SignedProviderInfo {
    /// Create a new SignedProviderInfo
    pub fn new(id: NodeId, addr: SocketAddr, public_key: [u8; 32], signature: [u8; 64]) -> Self {
        Self {
            id,
            addr,
            public_key,
            signature,
        }
    }

    /// Serialize to bytes
    /// Format: id[32] + addr_type[1] + addr[4 or 16] + port[2] + public_key[32] + signature[64]
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(32 + 1 + 16 + 2 + 32 + 64);
        bytes.extend_from_slice(self.id.as_bytes());

        match self.addr.ip() {
            IpAddr::V4(ip) => {
                bytes.push(4); // IPv4
                bytes.extend_from_slice(&ip.octets());
            }
            IpAddr::V6(ip) => {
                bytes.push(6); // IPv6
                bytes.extend_from_slice(&ip.octets());
            }
        }

        bytes.extend_from_slice(&self.addr.port().to_be_bytes());
        bytes.extend_from_slice(&self.public_key);
        bytes.extend_from_slice(&self.signature);
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(data: &[u8]) -> DhtResult<(Self, usize)> {
        // Minimum: id[32] + addr_type[1] + ipv4[4] + port[2] + public_key[32] + signature[64] = 135
        if data.len() < 135 {
            return Err(DhtError::SerializationError {
                reason: "SignedProviderInfo too short".to_string(),
            });
        }

        let mut id_bytes = [0u8; 32];
        id_bytes.copy_from_slice(&data[0..32]);
        let id = NodeId::from_bytes(id_bytes);

        let addr_type = data[32];
        let (addr, addr_end) = match addr_type {
            4 => {
                if data.len() < 135 {
                    return Err(DhtError::SerializationError {
                        reason: "IPv4 SignedProviderInfo too short".to_string(),
                    });
                }
                let ip = Ipv4Addr::new(data[33], data[34], data[35], data[36]);
                let port = u16::from_be_bytes([data[37], data[38]]);
                (SocketAddr::new(IpAddr::V4(ip), port), 39)
            }
            6 => {
                // id[32] + addr_type[1] + ipv6[16] + port[2] + public_key[32] + signature[64] = 147
                if data.len() < 147 {
                    return Err(DhtError::SerializationError {
                        reason: "IPv6 SignedProviderInfo too short".to_string(),
                    });
                }
                let mut octets = [0u8; 16];
                octets.copy_from_slice(&data[33..49]);
                let ip = Ipv6Addr::from(octets);
                let port = u16::from_be_bytes([data[49], data[50]]);
                (SocketAddr::new(IpAddr::V6(ip), port), 51)
            }
            _ => {
                return Err(DhtError::SerializationError {
                    reason: format!("Unknown address type: {}", addr_type),
                });
            }
        };

        let mut public_key = [0u8; 32];
        public_key.copy_from_slice(&data[addr_end..addr_end + 32]);
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&data[addr_end + 32..addr_end + 96]);

        Ok((
            Self {
                id,
                addr,
                public_key,
                signature,
            },
            addr_end + 96,
        ))
    }
}

impl DhtMessage {
    /// Get the message type
    pub fn msg_type(&self) -> DhtMessageType {
        match self {
            Self::Ping { .. } => DhtMessageType::Ping,
            Self::Pong { .. } => DhtMessageType::Pong,
            Self::FindNode { .. } => DhtMessageType::FindNode,
            Self::Nodes { .. } => DhtMessageType::Nodes,
            Self::FindValue { .. } => DhtMessageType::FindValue,
            Self::Providers { .. } => DhtMessageType::Providers,
            Self::Store { .. } => DhtMessageType::Store,
            Self::StoreAck { .. } => DhtMessageType::StoreAck,
        }
    }

    /// Serialize to bytes (without message type prefix)
    pub fn to_bytes(&self) -> Vec<u8> {
        match self {
            Self::Ping { nonce } => nonce.to_be_bytes().to_vec(),

            Self::Pong { nonce } => nonce.to_be_bytes().to_vec(),

            Self::FindNode { target } => target.as_bytes().to_vec(),

            Self::Nodes { nodes } => {
                let mut bytes = Vec::new();
                bytes.push(nodes.len() as u8);
                for node in nodes {
                    bytes.extend_from_slice(&node.to_bytes());
                }
                bytes
            }

            Self::FindValue { content_hash } => content_hash.to_vec(),

            Self::Providers {
                content_hash,
                providers,
                has_value,
            } => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(content_hash);
                bytes.push(if *has_value { 1 } else { 0 });
                bytes.push(providers.len() as u8);
                for provider in providers {
                    bytes.extend_from_slice(&provider.to_bytes());
                }
                bytes
            }

            Self::Store {
                content_hash,
                ttl,
                public_key,
                signature,
            } => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(content_hash);
                bytes.extend_from_slice(&ttl.to_be_bytes());
                bytes.extend_from_slice(public_key);
                bytes.extend_from_slice(signature);
                bytes
            }

            Self::StoreAck {
                content_hash,
                accepted,
            } => {
                let mut bytes = Vec::new();
                bytes.extend_from_slice(content_hash);
                bytes.push(if *accepted { 1 } else { 0 });
                bytes
            }
        }
    }

    /// Deserialize from bytes
    pub fn from_bytes(msg_type: DhtMessageType, data: &[u8]) -> DhtResult<Self> {
        match msg_type {
            DhtMessageType::Ping => {
                if data.len() < 8 {
                    return Err(DhtError::SerializationError {
                        reason: "Ping too short".to_string(),
                    });
                }
                let nonce = u64::from_be_bytes(data[0..8].try_into().unwrap());
                Ok(Self::Ping { nonce })
            }

            DhtMessageType::Pong => {
                if data.len() < 8 {
                    return Err(DhtError::SerializationError {
                        reason: "Pong too short".to_string(),
                    });
                }
                let nonce = u64::from_be_bytes(data[0..8].try_into().unwrap());
                Ok(Self::Pong { nonce })
            }

            DhtMessageType::FindNode => {
                if data.len() < 32 {
                    return Err(DhtError::SerializationError {
                        reason: "FindNode too short".to_string(),
                    });
                }
                let target = NodeId::from_slice(&data[0..32])?;
                Ok(Self::FindNode { target })
            }

            DhtMessageType::Nodes => {
                if data.is_empty() {
                    return Err(DhtError::SerializationError {
                        reason: "Nodes empty".to_string(),
                    });
                }
                let count = data[0] as usize;
                let mut nodes = Vec::with_capacity(count);
                let mut offset = 1;
                for _ in 0..count {
                    let (node, consumed) = NodeInfo::from_bytes(&data[offset..])?;
                    nodes.push(node);
                    offset += consumed;
                }
                Ok(Self::Nodes { nodes })
            }

            DhtMessageType::FindValue => {
                if data.len() < 32 {
                    return Err(DhtError::SerializationError {
                        reason: "FindValue too short".to_string(),
                    });
                }
                let mut content_hash = [0u8; 32];
                content_hash.copy_from_slice(&data[0..32]);
                Ok(Self::FindValue { content_hash })
            }

            DhtMessageType::Providers => {
                if data.len() < 34 {
                    return Err(DhtError::SerializationError {
                        reason: "Providers too short".to_string(),
                    });
                }
                let mut content_hash = [0u8; 32];
                content_hash.copy_from_slice(&data[0..32]);
                let has_value = data[32] != 0;
                let count = data[33] as usize;
                let mut providers = Vec::with_capacity(count);
                let mut offset = 34;
                for _ in 0..count {
                    let (provider, consumed) = SignedProviderInfo::from_bytes(&data[offset..])?;
                    providers.push(provider);
                    offset += consumed;
                }
                Ok(Self::Providers {
                    content_hash,
                    providers,
                    has_value,
                })
            }

            DhtMessageType::Store => {
                // content_hash[32] + ttl[4] + public_key[32] + signature[64] = 132 bytes
                if data.len() < 132 {
                    return Err(DhtError::SerializationError {
                        reason: "Store too short".to_string(),
                    });
                }
                let mut content_hash = [0u8; 32];
                content_hash.copy_from_slice(&data[0..32]);
                let ttl = u32::from_be_bytes(data[32..36].try_into().unwrap());
                let mut public_key = [0u8; 32];
                public_key.copy_from_slice(&data[36..68]);
                let mut signature = [0u8; 64];
                signature.copy_from_slice(&data[68..132]);
                Ok(Self::Store {
                    content_hash,
                    ttl,
                    public_key,
                    signature,
                })
            }

            DhtMessageType::StoreAck => {
                if data.len() < 33 {
                    return Err(DhtError::SerializationError {
                        reason: "StoreAck too short".to_string(),
                    });
                }
                let mut content_hash = [0u8; 32];
                content_hash.copy_from_slice(&data[0..32]);
                let accepted = data[32] != 0;
                Ok(Self::StoreAck {
                    content_hash,
                    accepted,
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    fn make_addr(port: u16) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), port)
    }

    fn make_id(byte: u8) -> NodeId {
        NodeId::from_bytes([byte; 32])
    }

    fn make_pubkey(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    fn make_signature(byte: u8) -> [u8; 64] {
        [byte; 64]
    }

    #[test]
    fn test_ping_roundtrip() {
        let msg = DhtMessage::Ping { nonce: 12345 };
        let bytes = msg.to_bytes();
        let parsed = DhtMessage::from_bytes(DhtMessageType::Ping, &bytes).unwrap();

        match parsed {
            DhtMessage::Ping { nonce } => assert_eq!(nonce, 12345),
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_find_node_roundtrip() {
        let target = make_id(42);
        let msg = DhtMessage::FindNode { target };
        let bytes = msg.to_bytes();
        let parsed = DhtMessage::from_bytes(DhtMessageType::FindNode, &bytes).unwrap();

        match parsed {
            DhtMessage::FindNode { target: t } => assert_eq!(t, target),
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_nodes_roundtrip() {
        let nodes = vec![
            NodeInfo::new(make_id(1), make_addr(8080)),
            NodeInfo::new(make_id(2), make_addr(8081)),
        ];
        let msg = DhtMessage::Nodes {
            nodes: nodes.clone(),
        };
        let bytes = msg.to_bytes();
        let parsed = DhtMessage::from_bytes(DhtMessageType::Nodes, &bytes).unwrap();

        match parsed {
            DhtMessage::Nodes { nodes: n } => {
                assert_eq!(n.len(), 2);
                assert_eq!(n[0].id, nodes[0].id);
                assert_eq!(n[1].id, nodes[1].id);
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_store_roundtrip() {
        let content_hash = [0xab; 32];
        let public_key = make_pubkey(1);
        let signature = make_signature(1);
        let msg = DhtMessage::Store {
            content_hash,
            ttl: 3600,
            public_key,
            signature,
        };
        let bytes = msg.to_bytes();
        let parsed = DhtMessage::from_bytes(DhtMessageType::Store, &bytes).unwrap();

        match parsed {
            DhtMessage::Store {
                content_hash: h,
                ttl,
                public_key: pk,
                signature: sig,
            } => {
                assert_eq!(h, content_hash);
                assert_eq!(ttl, 3600);
                assert_eq!(pk, public_key);
                assert_eq!(sig, signature);
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_providers_roundtrip() {
        let content_hash = [0xcd; 32];
        let public_key = make_pubkey(1);
        let signature = make_signature(1);
        let providers = vec![SignedProviderInfo::new(
            make_id(1),
            make_addr(8080),
            public_key,
            signature,
        )];
        let msg = DhtMessage::Providers {
            content_hash,
            providers: providers.clone(),
            has_value: true,
        };
        let bytes = msg.to_bytes();
        let parsed = DhtMessage::from_bytes(DhtMessageType::Providers, &bytes).unwrap();

        match parsed {
            DhtMessage::Providers {
                content_hash: h,
                providers: p,
                has_value,
            } => {
                assert_eq!(h, content_hash);
                assert_eq!(p.len(), 1);
                assert_eq!(p[0].id, providers[0].id);
                assert_eq!(p[0].public_key, public_key);
                assert_eq!(p[0].signature, signature);
                assert!(has_value);
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_node_info_roundtrip() {
        let info = NodeInfo::new(make_id(42), make_addr(9999));
        let bytes = info.to_bytes();
        let (parsed, consumed) = NodeInfo::from_bytes(&bytes).unwrap();

        assert_eq!(parsed.id, info.id);
        assert_eq!(parsed.addr, info.addr);
        assert_eq!(consumed, bytes.len());
    }

    #[test]
    fn test_signed_provider_info_roundtrip() {
        let public_key = make_pubkey(42);
        let signature = make_signature(42);
        let info = SignedProviderInfo::new(make_id(42), make_addr(9999), public_key, signature);
        let bytes = info.to_bytes();
        let (parsed, consumed) = SignedProviderInfo::from_bytes(&bytes).unwrap();

        assert_eq!(parsed.id, info.id);
        assert_eq!(parsed.addr, info.addr);
        assert_eq!(parsed.public_key, public_key);
        assert_eq!(parsed.signature, signature);
        assert_eq!(consumed, bytes.len());
    }

    // ========== H-DHT-3: Authenticated Message Tests ==========

    #[test]
    fn test_authenticated_message_roundtrip() {
        let inner_msg = DhtMessage::Ping { nonce: 12345 };
        let sender_pubkey = make_pubkey(42);
        let timestamp = 1704067200000u64; // 2024-01-01 00:00:00 UTC
        let signature = make_signature(42);

        let auth_msg = AuthenticatedDhtMessage::new(inner_msg, sender_pubkey, timestamp, signature);
        let bytes = auth_msg.to_bytes();
        let parsed = AuthenticatedDhtMessage::from_bytes(&bytes).unwrap();

        assert_eq!(parsed.sender_pubkey, sender_pubkey);
        assert_eq!(parsed.timestamp, timestamp);
        assert_eq!(parsed.signature, signature);
        match parsed.message {
            DhtMessage::Ping { nonce } => assert_eq!(nonce, 12345),
            _ => panic!("Wrong inner message type"),
        }
    }

    #[test]
    fn test_authenticated_message_signing_message() {
        let payload = vec![1u8, 2, 3, 4];
        let timestamp = 1704067200000u64;

        let signing_msg =
            AuthenticatedDhtMessage::signing_message(DhtMessageType::Ping, &payload, timestamp);

        // Verify structure: prefix + msg_type + payload + timestamp
        assert!(signing_msg.starts_with(b"DHT_MESSAGE_V1"));
        assert_eq!(signing_msg[14], DhtMessageType::Ping.to_byte());
        assert_eq!(&signing_msg[15..19], &payload);
        let ts_bytes: [u8; 8] = signing_msg[19..27].try_into().unwrap();
        assert_eq!(u64::from_be_bytes(ts_bytes), timestamp);
    }

    #[test]
    fn test_authenticated_message_timestamp_validation() {
        let inner_msg = DhtMessage::Ping { nonce: 1 };
        let sender_pubkey = make_pubkey(1);
        let current_time = 1704067200000u64;

        // Valid timestamp (current time)
        let auth_msg =
            AuthenticatedDhtMessage::new(inner_msg.clone(), sender_pubkey, current_time, [0; 64]);
        assert!(auth_msg.is_timestamp_valid(current_time));

        // Valid timestamp (slightly in the past)
        let past_ts = current_time - 60_000; // 1 minute ago
        let auth_msg =
            AuthenticatedDhtMessage::new(inner_msg.clone(), sender_pubkey, past_ts, [0; 64]);
        assert!(auth_msg.is_timestamp_valid(current_time));

        // Invalid timestamp (too old)
        let old_ts = current_time - 600_000; // 10 minutes ago (> 5 min limit)
        let auth_msg =
            AuthenticatedDhtMessage::new(inner_msg.clone(), sender_pubkey, old_ts, [0; 64]);
        assert!(!auth_msg.is_timestamp_valid(current_time));

        // Invalid timestamp (too far in future)
        let future_ts = current_time + 600_000; // 10 minutes in future (> 5 min tolerance)
        let auth_msg =
            AuthenticatedDhtMessage::new(inner_msg.clone(), sender_pubkey, future_ts, [0; 64]);
        assert!(!auth_msg.is_timestamp_valid(current_time));

        // Valid timestamp (slightly in the future - clock skew)
        let near_future_ts = current_time + 60_000; // 1 minute in future
        let auth_msg =
            AuthenticatedDhtMessage::new(inner_msg.clone(), sender_pubkey, near_future_ts, [0; 64]);
        assert!(auth_msg.is_timestamp_valid(current_time));
    }

    #[test]
    fn test_authenticated_message_get_signing_payload() {
        let inner_msg = DhtMessage::FindNode {
            target: make_id(99),
        };
        let sender_pubkey = make_pubkey(1);
        let timestamp = 1704067200000u64;
        let signature = make_signature(1);

        let auth_msg =
            AuthenticatedDhtMessage::new(inner_msg.clone(), sender_pubkey, timestamp, signature);
        let payload = auth_msg.get_signing_payload();

        // Verify it matches what signing_message would produce
        let inner_payload = inner_msg.to_bytes();
        let expected = AuthenticatedDhtMessage::signing_message(
            DhtMessageType::FindNode,
            &inner_payload,
            timestamp,
        );
        assert_eq!(payload, expected);
    }

    #[test]
    fn test_authenticated_message_with_store() {
        // Test with a more complex message type
        let inner_msg = DhtMessage::Store {
            content_hash: [0xab; 32],
            ttl: 3600,
            public_key: make_pubkey(10),
            signature: make_signature(10),
        };
        let sender_pubkey = make_pubkey(42);
        let timestamp = 1704067200000u64;
        let signature = make_signature(42);

        let auth_msg = AuthenticatedDhtMessage::new(inner_msg, sender_pubkey, timestamp, signature);
        let bytes = auth_msg.to_bytes();
        let parsed = AuthenticatedDhtMessage::from_bytes(&bytes).unwrap();

        assert_eq!(parsed.sender_pubkey, sender_pubkey);
        assert_eq!(parsed.timestamp, timestamp);
        match parsed.message {
            DhtMessage::Store {
                content_hash,
                ttl,
                public_key,
                signature: inner_sig,
            } => {
                assert_eq!(content_hash, [0xab; 32]);
                assert_eq!(ttl, 3600);
                assert_eq!(public_key, make_pubkey(10));
                assert_eq!(inner_sig, make_signature(10));
            }
            _ => panic!("Wrong inner message type"),
        }
    }

    #[test]
    fn test_authenticated_message_from_bytes_too_short() {
        let short_data = vec![0u8; 50]; // Less than minimum 107 bytes
        let result = AuthenticatedDhtMessage::from_bytes(&short_data);
        assert!(result.is_err());
    }
}
