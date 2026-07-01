//! Hardcoded seed list for network bootstrap (SPEC_06 §4.1)
//!
//! Seeds are introduction points with no protocol privilege - they're just
//! well-known addresses to help new nodes discover the network.
//!
//! Two types of seeds:
//! - **IP seeds**: Hardcoded IP addresses (legacy, doesn't scale)
//! - **DNS seeds**: Domain names that resolve to peer IPs (scalable, like Bitcoin)
//!
//! DNS seeds are preferred - they return IPs of regular nodes, not central hubs.

use crate::network::messages::WireAddr;
use crate::types::constants::DEFAULT_PORT;
use std::net::{SocketAddr, ToSocketAddrs};

/// Transport type (SPEC_06 §3.2)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TransportType {
    /// TCP over IPv4
    TcpV4 = 0x01,
    /// TCP over IPv6
    TcpV6 = 0x02,
    /// Tor hidden service
    Tor = 0x03,
    /// I2P
    I2P = 0x04,
    /// QUIC
    Quic = 0x05,
}

impl TryFrom<u8> for TransportType {
    type Error = u8;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(TransportType::TcpV4),
            0x02 => Ok(TransportType::TcpV6),
            0x03 => Ok(TransportType::Tor),
            0x04 => Ok(TransportType::I2P),
            0x05 => Ok(TransportType::Quic),
            _ => Err(value),
        }
    }
}

/// A seed entry for network bootstrap
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeedEntry {
    /// Transport type
    pub transport: TransportType,
    /// Address bytes (interpretation depends on transport)
    pub address: [u8; 64],
    /// Port number
    pub port: u16,
}

impl SeedEntry {
    /// Create a TcpV4 seed entry from IPv4 octets
    #[must_use]
    pub fn tcp_v4(ip: [u8; 4], port: u16) -> Self {
        let mut address = [0u8; 64];
        address[0..4].copy_from_slice(&ip);
        Self {
            transport: TransportType::TcpV4,
            address,
            port,
        }
    }

    /// Create a TcpV6 seed entry from IPv6 bytes
    #[must_use]
    pub fn tcp_v6(ip: [u8; 16], port: u16) -> Self {
        let mut address = [0u8; 64];
        address[0..16].copy_from_slice(&ip);
        Self {
            transport: TransportType::TcpV6,
            address,
            port,
        }
    }

    /// Convert to WireAddr for network transmission
    #[must_use]
    pub fn to_wire_addr(&self) -> WireAddr {
        WireAddr {
            transport: self.transport as u8,
            address: self.address,
            port: self.port,
            services: 0, // Seeds don't advertise services
            last_seen: 0,
        }
    }
}

/// Default development seeds (localhost on different ports)
///
/// These are for testing peer discovery locally.
#[must_use]
pub fn default_dev_seeds() -> Vec<SeedEntry> {
    vec![
        SeedEntry::tcp_v4([127, 0, 0, 1], DEFAULT_PORT),
        SeedEntry::tcp_v4([127, 0, 0, 1], DEFAULT_PORT + 1),
        SeedEntry::tcp_v4([127, 0, 0, 1], DEFAULT_PORT + 2),
    ]
}

/// Default mainnet seeds
///
/// These will be populated with real seed nodes before mainnet launch.
/// For now, returns an empty list.
#[must_use]
pub fn default_mainnet_seeds() -> Vec<SeedEntry> {
    // TODO: Add real mainnet seeds before launch
    Vec::new()
}

/// Testnet port (different from mainnet)
pub const TESTNET_PORT: u16 = 19735;

/// Default testnet seeds
///
/// These are the actual testnet seed nodes.
#[must_use]
pub fn default_testnet_seeds() -> Vec<SeedEntry> {
    vec![
        // DigitalOcean - Testnet seed
        SeedEntry::tcp_v4([167, 71, 241, 252], TESTNET_PORT),
    ]
}

// =============================================================================
// DNS Seeds (scalable peer discovery like Bitcoin)
// =============================================================================

/// DNS seed entry - a domain name that resolves to peer IPs
#[derive(Debug, Clone)]
pub struct DnsSeed {
    /// Domain name (e.g., "seed.swimchain.net")
    pub domain: String,
    /// Port to use for resolved IPs
    pub port: u16,
}

impl DnsSeed {
    /// Create a new DNS seed entry
    pub fn new(domain: impl Into<String>, port: u16) -> Self {
        Self {
            domain: domain.into(),
            port,
        }
    }

    /// Resolve DNS seed to get peer addresses (async)
    ///
    /// Returns a list of socket addresses from DNS resolution.
    /// This queries the DNS seed server which returns IPs of active peers.
    /// Uses async DNS resolution to avoid blocking the runtime.
    pub async fn resolve(&self) -> Vec<SocketAddr> {
        use std::time::Duration;
        use tokio::time::timeout;

        let lookup = (self.domain.clone(), self.port);
        // Use async DNS resolution with 10 second timeout to avoid blocking the runtime
        match timeout(Duration::from_secs(10), tokio::net::lookup_host(lookup)).await {
            Ok(Ok(addrs)) => addrs.collect(),
            Ok(Err(e)) => {
                log::warn!("[DNS-SEED] Failed to resolve {}: {}", self.domain, e);
                Vec::new()
            }
            Err(_) => {
                log::warn!("[DNS-SEED] DNS resolution timed out for {}", self.domain);
                Vec::new()
            }
        }
    }

    /// Resolve DNS seed and convert to SeedEntry format (async)
    pub async fn resolve_to_entries(&self) -> Vec<SeedEntry> {
        self.resolve()
            .await
            .into_iter()
            .filter_map(|addr| match addr {
                SocketAddr::V4(v4) => Some(SeedEntry::tcp_v4(v4.ip().octets(), v4.port())),
                SocketAddr::V6(v6) => Some(SeedEntry::tcp_v6(v6.ip().octets(), v6.port())),
            })
            .collect()
    }
}

/// Default testnet DNS seeds
///
/// These DNS servers return IPs of active testnet nodes.
/// Query them instead of connecting directly to seed nodes.
///
/// To set up:
/// 1. Run swimchain-dns-seeder on your server
/// 2. Point these DNS names to your seeder IP
/// 3. Seeder responds with IPs of healthy network peers
#[must_use]
pub fn default_testnet_dns_seeds() -> Vec<DnsSeed> {
    vec![
        // DNS seed servers - run swimchain-dns-seeder and point DNS here
        DnsSeed::new("seed1.testnet.swimchain.io", TESTNET_PORT),
        DnsSeed::new("seed2.testnet.swimchain.io", TESTNET_PORT),
    ]
}

/// Default mainnet DNS seeds
#[must_use]
pub fn default_mainnet_dns_seeds() -> Vec<DnsSeed> {
    vec![
        // TODO: Set up actual DNS seed servers before mainnet launch
        // DnsSeed::new("seed1.swimchain.net", DEFAULT_PORT),
        // DnsSeed::new("seed2.swimchain.net", DEFAULT_PORT),
    ]
}

/// Resolve all DNS seeds and return combined list of peer addresses (async)
pub async fn resolve_dns_seeds(dns_seeds: &[DnsSeed]) -> Vec<SeedEntry> {
    let mut entries = Vec::new();
    for seed in dns_seeds {
        log::info!("[DNS-SEED] Resolving {}...", seed.domain);
        let resolved = seed.resolve_to_entries().await;
        log::info!("[DNS-SEED] Got {} peers from {}", resolved.len(), seed.domain);
        entries.extend(resolved);
    }
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transport_type_try_from() {
        assert_eq!(TransportType::try_from(0x01), Ok(TransportType::TcpV4));
        assert_eq!(TransportType::try_from(0x02), Ok(TransportType::TcpV6));
        assert_eq!(TransportType::try_from(0x03), Ok(TransportType::Tor));
        assert_eq!(TransportType::try_from(0x04), Ok(TransportType::I2P));
        assert_eq!(TransportType::try_from(0x05), Ok(TransportType::Quic));
        assert_eq!(TransportType::try_from(0x00), Err(0x00));
        assert_eq!(TransportType::try_from(0xFF), Err(0xFF));
    }

    #[test]
    fn test_seed_entry_tcp_v4() {
        let seed = SeedEntry::tcp_v4([192, 168, 1, 1], 9735);
        assert_eq!(seed.transport, TransportType::TcpV4);
        assert_eq!(seed.address[0..4], [192, 168, 1, 1]);
        assert_eq!(seed.port, 9735);
        // Rest of address should be zero
        assert!(seed.address[4..].iter().all(|&b| b == 0));
    }

    #[test]
    fn test_seed_entry_tcp_v6() {
        let ip: [u8; 16] = [
            0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x01,
        ];
        let seed = SeedEntry::tcp_v6(ip, 9735);
        assert_eq!(seed.transport, TransportType::TcpV6);
        assert_eq!(seed.address[0..16], ip);
        assert_eq!(seed.port, 9735);
    }

    #[test]
    fn test_seed_entry_to_wire_addr() {
        let seed = SeedEntry::tcp_v4([127, 0, 0, 1], 9735);
        let wire = seed.to_wire_addr();

        assert_eq!(wire.transport, TransportType::TcpV4 as u8);
        assert_eq!(wire.address[0..4], [127, 0, 0, 1]);
        assert_eq!(wire.port, 9735);
        assert_eq!(wire.services, 0);
        assert_eq!(wire.last_seen, 0);
    }

    #[test]
    fn test_default_dev_seeds() {
        let seeds = default_dev_seeds();
        assert_eq!(seeds.len(), 3);

        for (i, seed) in seeds.iter().enumerate() {
            assert_eq!(seed.transport, TransportType::TcpV4);
            assert_eq!(seed.address[0..4], [127, 0, 0, 1]);
            assert_eq!(seed.port, DEFAULT_PORT + i as u16);
        }
    }

    #[test]
    fn test_default_mainnet_seeds_empty() {
        // Should be empty until mainnet
        let seeds = default_mainnet_seeds();
        assert!(seeds.is_empty());
    }
}
