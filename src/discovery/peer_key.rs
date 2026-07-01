//! Peer identification key (SPEC_06 §4.1)
//!
//! PeerKey provides a unique, stable identifier for peers based on
//! their transport, address, and port - excluding volatile fields
//! like services and last_seen.

use crate::network::messages::WireAddr;

/// Unique key for peer identification (67 bytes)
///
/// Derived from WireAddr by extracting stable identity fields:
/// - transport: 1 byte
/// - address: 64 bytes (zero-padded)
/// - port: 2 bytes (little-endian)
///
/// Volatile fields (services, last_seen) are excluded to ensure
/// the same peer always maps to the same key.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PeerKey([u8; 67]);

impl PeerKey {
    /// Size in bytes
    pub const SIZE: usize = 67;

    /// Create a PeerKey from a WireAddr
    ///
    /// Extracts the stable identity fields (transport, address, port)
    /// and ignores volatile fields (services, last_seen).
    #[must_use]
    pub fn from_wire_addr(addr: &WireAddr) -> Self {
        let mut key = [0u8; 67];
        key[0] = addr.transport;
        key[1..65].copy_from_slice(&addr.address);
        key[65..67].copy_from_slice(&addr.port.to_le_bytes());
        Self(key)
    }

    /// Get as byte slice for use as sled key
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    /// Create from raw bytes (must be exactly 67 bytes)
    ///
    /// Returns None if the slice is not exactly 67 bytes.
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() != Self::SIZE {
            return None;
        }
        let mut key = [0u8; 67];
        key.copy_from_slice(bytes);
        Some(Self(key))
    }

    /// Get the transport type byte
    #[must_use]
    pub fn transport(&self) -> u8 {
        self.0[0]
    }

    /// Get the address bytes (64 bytes, zero-padded)
    #[must_use]
    pub fn address(&self) -> &[u8; 64] {
        self.0[1..65].try_into().unwrap()
    }

    /// Get the port number
    #[must_use]
    pub fn port(&self) -> u16 {
        u16::from_le_bytes([self.0[65], self.0[66]])
    }
}

impl From<&WireAddr> for PeerKey {
    fn from(addr: &WireAddr) -> Self {
        Self::from_wire_addr(addr)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::constants::DEFAULT_PORT;

    fn make_wire_addr(transport: u8, port: u16) -> WireAddr {
        let mut address = [0u8; 64];
        // Put some test data in address
        address[0] = 127;
        address[1] = 0;
        address[2] = 0;
        address[3] = 1;
        WireAddr {
            transport,
            address,
            port,
            services: 0xFFFF, // Should be ignored
            last_seen: 12345, // Should be ignored
        }
    }

    #[test]
    fn test_peer_key_size() {
        assert_eq!(PeerKey::SIZE, 67);
    }

    #[test]
    fn test_peer_key_from_wire_addr() {
        let addr = make_wire_addr(0x01, DEFAULT_PORT);
        let key = PeerKey::from_wire_addr(&addr);

        assert_eq!(key.transport(), 0x01);
        assert_eq!(key.port(), DEFAULT_PORT);
        assert_eq!(key.address()[0], 127);
    }

    #[test]
    fn test_peer_key_ignores_volatile_fields() {
        let mut addr1 = make_wire_addr(0x01, 9735);
        let mut addr2 = make_wire_addr(0x01, 9735);

        addr1.services = 0x0000;
        addr1.last_seen = 1000;

        addr2.services = 0xFFFF;
        addr2.last_seen = 9999;

        let key1 = PeerKey::from_wire_addr(&addr1);
        let key2 = PeerKey::from_wire_addr(&addr2);

        assert_eq!(key1, key2);
    }

    #[test]
    fn test_peer_key_different_ports() {
        let addr1 = make_wire_addr(0x01, 9735);
        let addr2 = make_wire_addr(0x01, 9736);

        let key1 = PeerKey::from_wire_addr(&addr1);
        let key2 = PeerKey::from_wire_addr(&addr2);

        assert_ne!(key1, key2);
    }

    #[test]
    fn test_peer_key_different_transport() {
        let addr1 = make_wire_addr(0x01, 9735); // TcpV4
        let addr2 = make_wire_addr(0x02, 9735); // TcpV6

        let key1 = PeerKey::from_wire_addr(&addr1);
        let key2 = PeerKey::from_wire_addr(&addr2);

        assert_ne!(key1, key2);
    }

    #[test]
    fn test_peer_key_from_bytes_roundtrip() {
        let addr = make_wire_addr(0x01, 9735);
        let key = PeerKey::from_wire_addr(&addr);
        let bytes = key.as_bytes();
        let recovered = PeerKey::from_bytes(bytes).unwrap();
        assert_eq!(key, recovered);
    }

    #[test]
    fn test_peer_key_from_bytes_wrong_size() {
        assert!(PeerKey::from_bytes(&[0u8; 66]).is_none());
        assert!(PeerKey::from_bytes(&[0u8; 68]).is_none());
        assert!(PeerKey::from_bytes(&[]).is_none());
    }
}
