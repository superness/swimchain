//! Wire protocol serialization (SPEC_06 §5)
//!
//! Serialization and deserialization of wire protocol messages using
//! the existing ByteWriter/ByteReader infrastructure.

use super::error::WireError;
use super::messages::*;
use crate::types::constants;
use crate::types::serialize::{ByteReader, ByteWriter, Deserialize, Serialize};

/// Serialize a 16-byte array
fn write_bytes16(w: &mut ByteWriter, v: &[u8; 16]) {
    w.write_bytes(v);
}

/// Read a 16-byte array
fn read_bytes16(r: &mut ByteReader) -> Result<[u8; 16], WireError> {
    let bytes = r.read_bytes(16)?;
    let mut arr = [0u8; 16];
    arr.copy_from_slice(bytes);
    Ok(arr)
}

// === CompactAddr (26 bytes) ===

impl Serialize for CompactAddr {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(constants::COMPACT_ADDRESS_SIZE);
        w.write_u8(self.transport);
        write_bytes16(&mut w, &self.address);
        w.write_u16_le(self.port);
        w.write_u32_le(self.services);
        w.write_bytes(&[0u8; 3]); // padding
        w.finish()
    }
}

impl Deserialize for CompactAddr {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let transport = r.read_u8()?;
        let address = read_bytes16(&mut r).map_err(|e| match e {
            WireError::Serialize(s) => s,
            _ => crate::types::error::SerializeError::UnexpectedEof,
        })?;
        let port = r.read_u16_le()?;
        let services = r.read_u32_le()?;
        let _padding = r.read_bytes(3)?; // ignore padding
        Ok(Self {
            transport,
            address,
            port,
            services,
        })
    }
}

// === WireAddr (75 bytes) ===

impl Serialize for WireAddr {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(constants::WIRE_ADDRESS_SIZE);
        w.write_u8(self.transport);
        w.write_bytes64(&self.address);
        w.write_u16_le(self.port);
        w.write_u32_le(self.services);
        w.write_u32_le(self.last_seen);
        w.finish()
    }
}

impl Deserialize for WireAddr {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let transport = r.read_u8()?;
        let address = r.read_bytes64()?;
        let port = r.read_u16_le()?;
        let services = r.read_u32_le()?;
        let last_seen = r.read_u32_le()?;
        Ok(Self {
            transport,
            address,
            port,
            services,
            last_seen,
        })
    }
}

// === PingPongPayload (8 bytes) ===

impl Serialize for PingPongPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(8);
        w.write_u64_le(self.nonce);
        w.finish()
    }
}

impl Deserialize for PingPongPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let nonce = r.read_u64_le()?;
        Ok(Self { nonce })
    }
}

// === GetMempoolPayload ===

impl Serialize for GetMempoolPayload {
    fn to_bytes(&self) -> Vec<u8> {
        // Empty payload - no data needed
        Vec::new()
    }
}

impl Deserialize for GetMempoolPayload {
    fn from_bytes(_bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        // Empty payload - just return default
        Ok(Self)
    }
}

// === VersionPayload ===

impl Serialize for VersionPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(128);
        w.write_u32_le(self.protocol_version);
        w.write_u64_le(self.node_services);
        w.write_u64_le(self.timestamp);
        w.write_bytes(&self.sender_addr.to_bytes());
        w.write_bytes(&self.receiver_addr.to_bytes());
        w.write_u64_le(self.nonce);
        w.write_string_u8(&self.user_agent);
        w.write_u32_le(self.start_height);
        w.write_u8(if self.relay { 1 } else { 0 });
        w.finish()
    }
}

impl Deserialize for VersionPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let protocol_version = r.read_u32_le()?;
        let node_services = r.read_u64_le()?;
        let timestamp = r.read_u64_le()?;

        let sender_bytes = r.read_bytes(constants::COMPACT_ADDRESS_SIZE)?;
        let sender_addr = CompactAddr::from_bytes(sender_bytes)?;

        let receiver_bytes = r.read_bytes(constants::COMPACT_ADDRESS_SIZE)?;
        let receiver_addr = CompactAddr::from_bytes(receiver_bytes)?;

        let nonce = r.read_u64_le()?;
        let user_agent = r.read_string_u8()?;
        let start_height = r.read_u32_le()?;
        let relay = r.read_u8()? != 0;

        Ok(Self {
            protocol_version,
            node_services,
            timestamp,
            sender_addr,
            receiver_addr,
            nonce,
            user_agent,
            start_height,
            relay,
        })
    }
}

// === GetAddrPayload ===

impl Serialize for GetAddrPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(34);
        w.write_bytes32(&self.fork_id);
        w.write_u16_le(self.max_addrs);
        w.finish()
    }
}

impl Deserialize for GetAddrPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let fork_id = r.read_bytes32()?;
        let max_addrs = r.read_u16_le()?;
        Ok(Self { fork_id, max_addrs })
    }
}

// === AddrPayload ===

impl Serialize for AddrPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w =
            ByteWriter::with_capacity(2 + self.addresses.len() * constants::WIRE_ADDRESS_SIZE);
        w.write_u16_le(self.addresses.len() as u16);
        for addr in &self.addresses {
            w.write_bytes(&addr.to_bytes());
        }
        w.finish()
    }
}

impl Deserialize for AddrPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let count = r.read_u16_le()? as usize;
        let mut addresses = Vec::with_capacity(count);
        for _ in 0..count {
            let addr_bytes = r.read_bytes(constants::WIRE_ADDRESS_SIZE)?;
            addresses.push(WireAddr::from_bytes(addr_bytes)?);
        }
        Ok(Self { addresses })
    }
}

// === InvItem (33 bytes) ===

impl Serialize for InvItem {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(33);
        w.write_u8(self.inv_type);
        w.write_bytes32(&self.hash);
        w.finish()
    }
}

impl Deserialize for InvItem {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let inv_type = r.read_u8()?;
        let hash = r.read_bytes32()?;
        Ok(Self { inv_type, hash })
    }
}

// === InvPayload ===

impl Serialize for InvPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(4 + self.items.len() * 33);
        w.write_u32_le(self.items.len() as u32);
        for item in &self.items {
            w.write_bytes(&item.to_bytes());
        }
        w.finish()
    }
}

impl Deserialize for InvPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let count = r.read_u32_le()? as usize;
        let mut items = Vec::with_capacity(count.min(constants::MAX_INV_ITEMS));
        for _ in 0..count {
            let item_bytes = r.read_bytes(33)?;
            items.push(InvItem::from_bytes(item_bytes)?);
        }
        Ok(Self { items })
    }
}

// === GetBlocksPayload ===

impl Serialize for GetBlocksPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(19);
        w.write_u64_le(self.start_height);
        w.write_u64_le(self.end_height);
        w.write_u8(if self.include_content { 1 } else { 0 });
        w.write_u16_le(self.max_blocks);
        w.finish()
    }
}

impl Deserialize for GetBlocksPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let start_height = r.read_u64_le()?;
        let end_height = r.read_u64_le()?;
        let include_content = r.read_u8()? != 0;
        let max_blocks = r.read_u16_le()?;
        Ok(Self {
            start_height,
            end_height,
            include_content,
            max_blocks,
        })
    }
}

// === GetBlocksLocatorPayload ===

impl Serialize for GetBlocksLocatorPayload {
    fn to_bytes(&self) -> Vec<u8> {
        // 1 byte count + (32 * count) locator hashes + 32 stop_hash + 2 max_blocks
        let count = self.locator_hashes.len().min(GetBlocksLocatorPayload::MAX_LOCATOR_HASHES);
        let size = 1 + (32 * count) + 32 + 2;
        let mut w = ByteWriter::with_capacity(size);

        w.write_u8(count as u8);
        for hash in self.locator_hashes.iter().take(count) {
            w.write_bytes(hash);
        }
        w.write_bytes(&self.stop_hash);
        w.write_u16_le(self.max_blocks);
        w.finish()
    }
}

impl Deserialize for GetBlocksLocatorPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);

        let count = r.read_u8()? as usize;
        if count > GetBlocksLocatorPayload::MAX_LOCATOR_HASHES {
            return Err(crate::types::error::SerializeError::InvalidLength {
                expected: GetBlocksLocatorPayload::MAX_LOCATOR_HASHES,
                actual: count,
            });
        }

        let mut locator_hashes = Vec::with_capacity(count);
        for _ in 0..count {
            let hash_bytes = r.read_bytes(32)?;
            let mut hash = [0u8; 32];
            hash.copy_from_slice(hash_bytes);
            locator_hashes.push(hash);
        }

        let stop_bytes = r.read_bytes(32)?;
        let mut stop_hash = [0u8; 32];
        stop_hash.copy_from_slice(stop_bytes);

        let max_blocks = r.read_u16_le()?;

        Ok(Self {
            locator_hashes,
            stop_hash,
            max_blocks,
        })
    }
}

// === GetHeadersLocatorPayload ===

impl Serialize for GetHeadersLocatorPayload {
    fn to_bytes(&self) -> Vec<u8> {
        // 1 byte count + (32 * count) locator hashes + 32 stop_hash + 2 max_headers
        let count = self.locator_hashes.len().min(GetHeadersLocatorPayload::MAX_LOCATOR_HASHES);
        let size = 1 + (32 * count) + 32 + 2;
        let mut w = ByteWriter::with_capacity(size);

        w.write_u8(count as u8);
        for hash in self.locator_hashes.iter().take(count) {
            w.write_bytes(hash);
        }
        w.write_bytes(&self.stop_hash);
        w.write_u16_le(self.max_headers);
        w.finish()
    }
}

impl Deserialize for GetHeadersLocatorPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);

        let count = r.read_u8()? as usize;
        if count > GetHeadersLocatorPayload::MAX_LOCATOR_HASHES {
            return Err(crate::types::error::SerializeError::InvalidLength {
                expected: GetHeadersLocatorPayload::MAX_LOCATOR_HASHES,
                actual: count,
            });
        }

        let mut locator_hashes = Vec::with_capacity(count);
        for _ in 0..count {
            let hash_bytes = r.read_bytes(32)?;
            let mut hash = [0u8; 32];
            hash.copy_from_slice(hash_bytes);
            locator_hashes.push(hash);
        }

        let stop_bytes = r.read_bytes(32)?;
        let mut stop_hash = [0u8; 32];
        stop_hash.copy_from_slice(stop_bytes);

        let max_headers = r.read_u16_le()?;

        Ok(Self {
            locator_hashes,
            stop_hash,
            max_headers,
        })
    }
}

// === SerializedBlock ===

impl Serialize for SerializedBlock {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(4 + self.data.len());
        w.write_bytes_u32(&self.data);
        w.finish()
    }
}

impl Deserialize for SerializedBlock {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let data = r.read_bytes_u32()?;
        Ok(Self { data })
    }
}

// === BlocksPayload ===

impl Serialize for BlocksPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(256);
        w.write_u16_le(self.blocks.len() as u16);
        for block in &self.blocks {
            w.write_bytes(&block.to_bytes());
        }
        w.finish()
    }
}

impl Deserialize for BlocksPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let count = r.read_u16_le()? as usize;
        let mut blocks = Vec::with_capacity(count);
        for _ in 0..count {
            let len = r.read_u32_le()? as usize;
            let data = r.read_bytes(len)?.to_vec();
            blocks.push(SerializedBlock { data });
        }
        Ok(Self { blocks })
    }
}

// === GetHeadersPayload ===

impl Serialize for GetHeadersPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(18);
        w.write_u64_le(self.start_height);
        w.write_u64_le(self.end_height);
        w.write_u16_le(self.max_headers);
        w.finish()
    }
}

impl Deserialize for GetHeadersPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let start_height = r.read_u64_le()?;
        let end_height = r.read_u64_le()?;
        let max_headers = r.read_u16_le()?;
        Ok(Self {
            start_height,
            end_height,
            max_headers,
        })
    }
}

// === HeadersPayload ===

impl Serialize for HeadersPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(256);
        w.write_u16_le(self.headers.len() as u16);
        for header in &self.headers {
            w.write_bytes(&header.to_bytes());
        }
        w.finish()
    }
}

impl Deserialize for HeadersPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let count = r.read_u16_le()? as usize;
        let mut headers = Vec::with_capacity(count);
        for _ in 0..count {
            let len = r.read_u32_le()? as usize;
            let data = r.read_bytes(len)?.to_vec();
            headers.push(SerializedBlock { data });
        }
        Ok(Self { headers })
    }
}

// === ChainStatusPayload (60 bytes) ===

impl Serialize for ChainStatusPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(60);
        w.write_u64_le(self.height);
        w.write_bytes32(&self.tip_hash);
        w.write_u64_le(self.cumulative_work);
        w.write_u32_le(self.pending_content_count);
        w.write_u64_le(self.timestamp);
        w.finish()
    }
}

impl Deserialize for ChainStatusPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let height = r.read_u64_le()?;
        let tip_hash = r.read_bytes32()?;
        let cumulative_work = r.read_u64_le()?;
        let pending_content_count = r.read_u32_le()?;
        let timestamp = r.read_u64_le()?;
        Ok(Self {
            height,
            tip_hash,
            cumulative_work,
            pending_content_count,
            timestamp,
        })
    }
}

// === GossipPayload ===

impl Serialize for GossipPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(64);
        w.write_u8(self.gossip_type);
        w.write_bytes32(&self.content_id);
        w.write_u64_le(self.timestamp);
        w.write_u8(self.ttl);
        w.write_optional(self.payload.as_ref(), |w, p| w.write_bytes_u32(p));
        w.finish()
    }
}

impl Deserialize for GossipPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let gossip_type = r.read_u8()?;
        let content_id = r.read_bytes32()?;
        let timestamp = r.read_u64_le()?;
        let ttl = r.read_u8()?;
        let payload = r.read_optional(|r| r.read_bytes_u32())?;
        Ok(Self {
            gossip_type,
            content_id,
            timestamp,
            ttl,
            payload,
        })
    }
}

// === RejectPayload ===

impl Serialize for RejectPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(64);
        w.write_u8(self.rejected_type);
        w.write_u8(self.code as u8);
        w.write_string_u8(&self.reason);
        w.write_optional(self.hash.as_ref(), |w, h| w.write_bytes32(h));
        w.finish()
    }
}

impl Deserialize for RejectPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        use crate::types::error::SerializeError;
        let mut r = ByteReader::new(bytes);
        let rejected_type = r.read_u8()?;
        let code_byte = r.read_u8()?;
        let code = RejectionCode::try_from(code_byte)
            .map_err(|_| SerializeError::UnknownType(code_byte))?;
        let reason = r.read_string_u8()?;
        let hash = r.read_optional(|r| r.read_bytes32())?;
        Ok(Self {
            rejected_type,
            code,
            reason,
            hash,
        })
    }
}

// === NotFoundPayload ===

impl Serialize for NotFoundPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(4 + self.items.len() * 33);
        w.write_u32_le(self.items.len() as u32);
        for item in &self.items {
            w.write_bytes(&item.to_bytes());
        }
        w.finish()
    }
}

impl Deserialize for NotFoundPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let count = r.read_u32_le()? as usize;
        let mut items = Vec::with_capacity(count);
        for _ in 0..count {
            let item_bytes = r.read_bytes(33)?;
            items.push(InvItem::from_bytes(item_bytes)?);
        }
        Ok(Self { items })
    }
}

// === DataPayload ===

impl Serialize for DataPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(4 + self.data.len());
        w.write_bytes_u32(&self.data);
        w.finish()
    }
}

impl Deserialize for DataPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let data = r.read_bytes_u32()?;
        Ok(Self { data })
    }
}

// === AlertPayload ===

impl Serialize for AlertPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(1 + self.message.len() + 64);
        w.write_string_u8(&self.message);
        w.write_bytes64(&self.signature);
        w.finish()
    }
}

impl Deserialize for AlertPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let message = r.read_string_u8()?;
        let signature = r.read_bytes64()?;
        Ok(Self { message, signature })
    }
}

// === ForkAnnouncePayload ===

impl Serialize for ForkAnnouncePayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(32);
        w.write_bytes32(&self.fork_id);
        w.finish()
    }
}

impl Deserialize for ForkAnnouncePayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let fork_id = r.read_bytes32()?;
        Ok(Self { fork_id })
    }
}

// === ForkQueryPayload ===

impl Serialize for ForkQueryPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(32);
        w.write_bytes32(&self.fork_id);
        w.finish()
    }
}

impl Deserialize for ForkQueryPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let fork_id = r.read_bytes32()?;
        Ok(Self { fork_id })
    }
}

// === ForkInfoPayload ===

impl Serialize for ForkInfoPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(36 + self.info.len());
        w.write_bytes32(&self.fork_id);
        w.write_bytes_u32(&self.info);
        w.finish()
    }
}

impl Deserialize for ForkInfoPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let fork_id = r.read_bytes32()?;
        let info = r.read_bytes_u32()?;
        Ok(Self { fork_id, info })
    }
}

// === SPEC_07: Content Retrieval Message Serialization (§4) ===

// === WhoHasPayload (32 bytes) ===

impl Serialize for WhoHasPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(32);
        w.write_bytes32(&self.hash);
        w.finish()
    }
}

impl Deserialize for WhoHasPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let hash = r.read_bytes32()?;
        Ok(Self { hash })
    }
}

// === IHavePayload (64 bytes) ===

impl Serialize for IHavePayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(64);
        w.write_bytes32(&self.hash);
        w.write_bytes32(&self.provider_id);
        w.finish()
    }
}

impl Deserialize for IHavePayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let hash = r.read_bytes32()?;
        // Support backwards compatibility: if only 32 bytes, provider_id is zeros (self-announcement)
        let provider_id = if bytes.len() >= 64 {
            r.read_bytes32()?
        } else {
            [0u8; 32]
        };
        Ok(Self { hash, provider_id })
    }
}

// === GetPayload (32 bytes) ===

impl Serialize for GetPayload {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(32);
        w.write_bytes32(&self.hash);
        w.finish()
    }
}

impl Deserialize for GetPayload {
    fn from_bytes(bytes: &[u8]) -> Result<Self, crate::types::error::SerializeError> {
        let mut r = ByteReader::new(bytes);
        let hash = r.read_bytes32()?;
        Ok(Self { hash })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping_pong_roundtrip() {
        let original = PingPongPayload::new(0x1234567890abcdef);
        let bytes = original.to_bytes();
        assert_eq!(bytes.len(), 8);
        let recovered = PingPongPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_compact_addr_size() {
        let addr = CompactAddr::default();
        let bytes = addr.to_bytes();
        assert_eq!(bytes.len(), constants::COMPACT_ADDRESS_SIZE);
    }

    #[test]
    fn test_compact_addr_roundtrip() {
        let original = CompactAddr {
            transport: 0x02,
            address: [0xab; 16],
            port: 9735,
            services: 0x0003,
        };
        let bytes = original.to_bytes();
        let recovered = CompactAddr::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_wire_addr_size() {
        let addr = WireAddr::default();
        let bytes = addr.to_bytes();
        assert_eq!(bytes.len(), constants::WIRE_ADDRESS_SIZE);
    }

    #[test]
    fn test_wire_addr_roundtrip() {
        let original = WireAddr {
            transport: 0x01,
            address: [0xcd; 64],
            port: 9735,
            services: 0x0007,
            last_seen: 1700000000,
        };
        let bytes = original.to_bytes();
        let recovered = WireAddr::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_inv_item_size() {
        let item = InvItem::block([0xab; 32]);
        let bytes = item.to_bytes();
        assert_eq!(bytes.len(), 33);
    }

    #[test]
    fn test_inv_item_roundtrip() {
        let original = InvItem::content([0xef; 32]);
        let bytes = original.to_bytes();
        let recovered = InvItem::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_version_payload_roundtrip() {
        let original = VersionPayload {
            protocol_version: 1,
            node_services: 0x0003,
            timestamp: 1700000000,
            sender_addr: CompactAddr::default(),
            receiver_addr: CompactAddr::default(),
            nonce: 0xdeadbeef,
            user_agent: "test/1.0".to_string(),
            start_height: 12345,
            relay: true,
        };
        let bytes = original.to_bytes();
        let recovered = VersionPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_chain_status_roundtrip() {
        let original = ChainStatusPayload {
            height: 100000,
            tip_hash: [0xab; 32],
            cumulative_work: 999999,
            pending_content_count: 42,
            timestamp: 1700000000,
        };
        let bytes = original.to_bytes();
        assert_eq!(bytes.len(), 60);
        let recovered = ChainStatusPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_gossip_payload_with_data() {
        let original = GossipPayload {
            gossip_type: 0x02,
            content_id: [0xab; 32],
            timestamp: 1700000000,
            ttl: 5,
            payload: Some(vec![1, 2, 3, 4]),
        };
        let bytes = original.to_bytes();
        let recovered = GossipPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_gossip_payload_without_data() {
        let original = GossipPayload {
            gossip_type: 0x01,
            content_id: [0x00; 32],
            timestamp: 0,
            ttl: 6,
            payload: None,
        };
        let bytes = original.to_bytes();
        let recovered = GossipPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_reject_payload_roundtrip() {
        let original = RejectPayload {
            rejected_type: 0x20, // Inv
            code: RejectionCode::NotFound,
            reason: "Item not found".to_string(),
            hash: Some([0xef; 32]),
        };
        let bytes = original.to_bytes();
        let recovered = RejectPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_inv_payload_roundtrip() {
        let original = InvPayload {
            items: vec![
                InvItem::block([0x11; 32]),
                InvItem::content([0x22; 32]),
                InvItem::identity([0x33; 32]),
            ],
        };
        let bytes = original.to_bytes();
        let recovered = InvPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_get_blocks_roundtrip() {
        let original = GetBlocksPayload {
            start_height: 1000,
            end_height: 2000,
            include_content: true,
            max_blocks: 100,
        };
        let bytes = original.to_bytes();
        let recovered = GetBlocksPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_fork_info_roundtrip() {
        let original = ForkInfoPayload {
            fork_id: [0xab; 32],
            info: vec![1, 2, 3, 4, 5],
        };
        let bytes = original.to_bytes();
        let recovered = ForkInfoPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    // === SPEC_07: Content Retrieval Message Tests ===

    #[test]
    fn test_who_has_payload_roundtrip() {
        let original = WhoHasPayload::new([0xab; 32]);
        let bytes = original.to_bytes();
        assert_eq!(bytes.len(), 32);
        let recovered = WhoHasPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_who_has_payload_exact_32_bytes() {
        let payload = WhoHasPayload::new([0xcd; 32]);
        let bytes = payload.to_bytes();
        assert_eq!(bytes.len(), 32, "WHO_HAS payload must be exactly 32 bytes");
        assert_eq!(&bytes[..32], &[0xcd; 32]);
    }

    #[test]
    fn test_i_have_payload_roundtrip() {
        let original = IHavePayload::with_provider([0xef; 32], [0xab; 32]);
        let bytes = original.to_bytes();
        assert_eq!(bytes.len(), 64);
        let recovered = IHavePayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_i_have_payload_exact_64_bytes() {
        let payload = IHavePayload::with_provider([0x12; 32], [0x34; 32]);
        let bytes = payload.to_bytes();
        assert_eq!(bytes.len(), 64, "I_HAVE payload must be exactly 64 bytes");
        assert_eq!(&bytes[..32], &[0x12; 32]);
        assert_eq!(&bytes[32..64], &[0x34; 32]);
    }

    #[test]
    fn test_i_have_payload_backwards_compat() {
        // Old 32-byte format should parse with zero provider_id
        let old_payload = [0xab; 32];
        let recovered = IHavePayload::from_bytes(&old_payload).unwrap();
        assert_eq!(recovered.hash, [0xab; 32]);
        assert_eq!(recovered.provider_id, [0u8; 32]); // Zero = self-announcement
        assert!(recovered.is_self_announcement());
    }

    #[test]
    fn test_i_have_payload_self_announcement() {
        // new() creates a self-announcement with zero provider_id
        let payload = IHavePayload::new([0xcc; 32]);
        assert!(payload.is_self_announcement());

        // with_provider creates explicit provider
        let payload2 = IHavePayload::with_provider([0xcc; 32], [0xdd; 32]);
        assert!(!payload2.is_self_announcement());
    }

    #[test]
    fn test_get_payload_roundtrip() {
        let original = GetPayload::new([0x34; 32]);
        let bytes = original.to_bytes();
        assert_eq!(bytes.len(), 32);
        let recovered = GetPayload::from_bytes(&bytes).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_get_payload_exact_32_bytes() {
        let payload = GetPayload::new([0x56; 32]);
        let bytes = payload.to_bytes();
        assert_eq!(bytes.len(), 32, "GET payload must be exactly 32 bytes");
        assert_eq!(&bytes[..32], &[0x56; 32]);
    }

    #[test]
    fn test_content_retrieval_payload_default() {
        // Test Default implementations
        let who_has = WhoHasPayload::default();
        assert_eq!(who_has.hash, [0u8; 32]);

        let i_have = IHavePayload::default();
        assert_eq!(i_have.hash, [0u8; 32]);

        let get = GetPayload::default();
        assert_eq!(get.hash, [0u8; 32]);
    }
}
