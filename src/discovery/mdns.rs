//! mDNS peer discovery (SPEC_06 §4.1 - Layer 1)
//!
//! This module implements LAN-based peer discovery using multicast DNS.
//! Service name: `_swimchain._tcp.local`
//!
//! mDNS is Layer 1 in the discovery stack, providing zero-configuration
//! peer discovery for nodes on the same local network.

use std::net::IpAddr;
use std::pin::pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures::stream::StreamExt;
use log::{debug, info, warn};
use tokio::sync::mpsc;

use crate::network::messages::WireAddr;
use crate::types::constants::DEFAULT_PORT;

use super::error::DiscoveryError;

/// mDNS service name for Swimchain nodes
pub const MDNS_SERVICE_NAME: &str = "_swimchain._tcp.local";

/// Default mDNS query interval (30 seconds)
pub const MDNS_QUERY_INTERVAL_SECS: u64 = 30;

/// Maximum peers to return from a single discovery round
pub const MDNS_MAX_PEERS_PER_ROUND: usize = 16;

/// A discovered peer from mDNS
#[derive(Debug, Clone)]
pub struct MdnsDiscoveredPeer {
    /// IP address of the discovered peer
    pub addr: IpAddr,
    /// Port (from SRV record or default)
    pub port: u16,
    /// Instance name (hostname or custom name)
    pub instance_name: String,
}

impl MdnsDiscoveredPeer {
    /// Convert to WireAddr for use with discovery manager
    #[must_use]
    pub fn to_wire_addr(&self) -> WireAddr {
        let mut address = [0u8; 64];
        match self.addr {
            IpAddr::V4(ipv4) => {
                let octets = ipv4.octets();
                address[0] = octets[0];
                address[1] = octets[1];
                address[2] = octets[2];
                address[3] = octets[3];
            }
            IpAddr::V6(ipv6) => {
                let octets = ipv6.octets();
                address[..16].copy_from_slice(&octets);
            }
        }

        let transport = match self.addr {
            IpAddr::V4(_) => 0x01, // TCPv4
            IpAddr::V6(_) => 0x02, // TCPv6
        };

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as u32;

        WireAddr {
            transport,
            address,
            port: self.port,
            services: 0x01, // Full node service
            last_seen: now,
        }
    }
}

/// mDNS discovery service
///
/// Runs periodic queries for `_swimchain._tcp.local` services on the LAN
/// and reports discovered peers via a channel.
pub struct MdnsDiscovery {
    /// Channel sender for discovered peers
    discovered_tx: mpsc::Sender<MdnsDiscoveredPeer>,
    /// Channel receiver for discovered peers
    discovered_rx: Option<mpsc::Receiver<MdnsDiscoveredPeer>>,
    /// Shutdown flag
    shutdown: Arc<AtomicBool>,
}

impl MdnsDiscovery {
    /// Create a new mDNS discovery service
    #[must_use]
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(64);
        Self {
            discovered_tx: tx,
            discovered_rx: Some(rx),
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Take the receiver for discovered peers
    ///
    /// This can only be called once. Returns None on subsequent calls.
    pub fn take_receiver(&mut self) -> Option<mpsc::Receiver<MdnsDiscoveredPeer>> {
        self.discovered_rx.take()
    }

    /// Get a clone of the shutdown flag
    #[must_use]
    pub fn shutdown_flag(&self) -> Arc<AtomicBool> {
        self.shutdown.clone()
    }

    /// Signal the discovery service to stop
    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::Release);
    }

    /// Run a single discovery query
    ///
    /// Returns discovered peers from the current round.
    pub async fn discover_once(&self) -> Result<Vec<MdnsDiscoveredPeer>, DiscoveryError> {
        self.discover_with_timeout(Duration::from_secs(5)).await
    }

    /// Run a discovery query with custom timeout
    pub async fn discover_with_timeout(
        &self,
        timeout: Duration,
    ) -> Result<Vec<MdnsDiscoveredPeer>, DiscoveryError> {
        let mut peers = Vec::new();

        // Create mDNS stream
        let stream = match mdns::discover::all(MDNS_SERVICE_NAME, timeout) {
            Ok(s) => s,
            Err(e) => {
                warn!("mDNS discover failed: {}", e);
                return Err(DiscoveryError::MdnsError(e.to_string()));
            }
        };

        // Pin the stream for async iteration
        let mut stream = pin!(stream.listen());

        // Process responses until timeout or max peers
        while let Some(result) = stream.next().await {
            if self.shutdown.load(Ordering::Acquire) {
                break;
            }

            match result {
                Ok(response) => {
                    // Extract IP addresses from A/AAAA records
                    for record in response.records() {
                        let (addr, port) = match &record.kind {
                            mdns::RecordKind::A(ipv4) => {
                                (IpAddr::V4(*ipv4), DEFAULT_PORT)
                            }
                            mdns::RecordKind::AAAA(ipv6) => {
                                (IpAddr::V6(*ipv6), DEFAULT_PORT)
                            }
                            mdns::RecordKind::SRV { port, target, .. } => {
                                // SRV record - extract port, need to resolve target
                                debug!("mDNS SRV: target={} port={}", target, port);
                                continue; // Skip SRV for now, we get IP from A/AAAA
                            }
                            _ => continue,
                        };

                        // Skip loopback and link-local
                        if addr.is_loopback() {
                            continue;
                        }
                        if let IpAddr::V4(v4) = addr {
                            if v4.is_link_local() {
                                continue;
                            }
                        }

                        let peer = MdnsDiscoveredPeer {
                            addr,
                            port,
                            instance_name: record.name.clone(),
                        };

                        debug!("mDNS discovered peer: {:?}", peer);

                        // Send to channel (non-blocking)
                        let _ = self.discovered_tx.try_send(peer.clone());

                        // Add to result
                        if !peers.iter().any(|p: &MdnsDiscoveredPeer| p.addr == peer.addr) {
                            peers.push(peer);
                        }

                        if peers.len() >= MDNS_MAX_PEERS_PER_ROUND {
                            break;
                        }
                    }
                }
                Err(e) => {
                    debug!("mDNS response error: {}", e);
                }
            }

            if peers.len() >= MDNS_MAX_PEERS_PER_ROUND {
                break;
            }
        }

        if !peers.is_empty() {
            info!("mDNS discovered {} peers on LAN", peers.len());
        }

        Ok(peers)
    }

    /// Run continuous discovery loop
    ///
    /// Queries for peers every `interval` seconds and sends discovered
    /// peers to the channel.
    pub async fn run_discovery_loop(self, interval: Duration) {
        info!(
            "Starting mDNS discovery loop (service: {}, interval: {}s)",
            MDNS_SERVICE_NAME,
            interval.as_secs()
        );

        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;

            if self.shutdown.load(Ordering::Acquire) {
                info!("mDNS discovery loop shutting down");
                break;
            }

            match self.discover_once().await {
                Ok(peers) => {
                    debug!("mDNS round complete: {} peers found", peers.len());
                }
                Err(e) => {
                    warn!("mDNS discovery round failed: {}", e);
                }
            }
        }
    }
}

impl Default for MdnsDiscovery {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn test_service_name() {
        assert_eq!(MDNS_SERVICE_NAME, "_swimchain._tcp.local");
    }

    #[test]
    fn test_mdns_discovered_peer_to_wire_addr_v4() {
        let peer = MdnsDiscoveredPeer {
            addr: IpAddr::V4(Ipv4Addr::new(192, 168, 1, 100)),
            port: 9735,
            instance_name: "test-node".to_string(),
        };

        let wire = peer.to_wire_addr();
        assert_eq!(wire.transport, 0x01); // TCPv4
        assert_eq!(wire.address[0], 192);
        assert_eq!(wire.address[1], 168);
        assert_eq!(wire.address[2], 1);
        assert_eq!(wire.address[3], 100);
        assert_eq!(wire.port, 9735);
        assert_eq!(wire.services, 0x01);
    }

    #[test]
    fn test_mdns_discovered_peer_to_wire_addr_v6() {
        let peer = MdnsDiscoveredPeer {
            addr: IpAddr::V6("::1".parse().unwrap()),
            port: 9736,
            instance_name: "test-node-v6".to_string(),
        };

        let wire = peer.to_wire_addr();
        assert_eq!(wire.transport, 0x02); // TCPv6
        assert_eq!(wire.port, 9736);
    }

    #[test]
    fn test_mdns_discovery_new() {
        let mut discovery = MdnsDiscovery::new();
        assert!(!discovery.shutdown.load(Ordering::Acquire));
        assert!(discovery.take_receiver().is_some());
        assert!(discovery.take_receiver().is_none()); // Second call returns None
    }

    #[test]
    fn test_mdns_discovery_shutdown() {
        let discovery = MdnsDiscovery::new();
        assert!(!discovery.shutdown.load(Ordering::Acquire));
        discovery.shutdown();
        assert!(discovery.shutdown.load(Ordering::Acquire));
    }
}
