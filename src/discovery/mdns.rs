//! mDNS peer discovery (SPEC_06 §4.1 - Layer 1)
//!
//! Zero-configuration LAN peer discovery via multicast DNS. Each node both
//! ADVERTISES its P2P endpoint as a `_swimchain._tcp.local` service and
//! BROWSES for other nodes' services, so two nodes on the same LAN find each
//! other with no seed and no manual configuration.
//!
//! Discovered peer socket addresses are reported on a channel; the node feeds
//! them into its PeerStore so the normal outbound-dial loop connects to them.
//!
//! Uses `mdns-sd`, which is a full responder (advertise) + browser. Android
//! requires a held `WifiManager.MulticastLock` for multicast to be received;
//! that is acquired in the mobile app's native layer.

use std::net::{IpAddr, SocketAddr};

use log::{debug, info};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use tokio::sync::mpsc;

use super::error::DiscoveryError;

/// mDNS service type for Swimchain nodes.
///
/// The trailing dot is required by `mdns-sd`.
pub const MDNS_SERVICE_TYPE: &str = "_swimchain._tcp.local.";

/// A running mDNS advertiser + browser.
///
/// Keep this alive for the lifetime of the node; dropping it unregisters the
/// service and stops browsing.
pub struct MdnsService {
    daemon: ServiceDaemon,
    fullname: String,
}

impl MdnsService {
    /// Start advertising this node and browsing for LAN peers.
    ///
    /// - `node_id` gives a stable, unique instance name so multiple nodes on
    ///   one host (or repeated restarts) don't collide.
    /// - `port` is our P2P listen port, published in the SRV record.
    ///
    /// Returns the service handle and a receiver of discovered peer socket
    /// addresses (our own advertisement is filtered out).
    ///
    /// # Errors
    ///
    /// Returns an error if the mDNS daemon cannot start, the service cannot be
    /// registered, or browsing cannot begin.
    pub fn start(
        node_id: &[u8; 32],
        port: u16,
    ) -> Result<(Self, mpsc::Receiver<SocketAddr>), DiscoveryError> {
        let daemon = ServiceDaemon::new().map_err(|e| DiscoveryError::MdnsError(e.to_string()))?;

        let instance = hex::encode(&node_id[..8]);
        let host_name = format!("{instance}.local.");

        // Advertise. enable_addr_auto() fills in this host's active interface
        // addresses (and keeps them current as interfaces change), so we don't
        // have to hand-pick the LAN IP.
        let info = ServiceInfo::new(
            MDNS_SERVICE_TYPE,
            &instance,
            &host_name,
            "",
            port,
            &[] as &[(&str, &str)],
        )
        .map_err(|e| DiscoveryError::MdnsError(e.to_string()))?
        .enable_addr_auto();

        let fullname = info.get_fullname().to_string();
        daemon
            .register(info)
            .map_err(|e| DiscoveryError::MdnsError(e.to_string()))?;
        info!("[mDNS] advertising '{instance}' on port {port} as {MDNS_SERVICE_TYPE}");

        let browse_rx = daemon
            .browse(MDNS_SERVICE_TYPE)
            .map_err(|e| DiscoveryError::MdnsError(e.to_string()))?;

        let (tx, rx) = mpsc::channel(64);
        let our_fullname = fullname.clone();

        // mdns-sd delivers browse events on a flume channel with a blocking
        // recv(); run it on a dedicated OS thread and forward resolved peers.
        std::thread::Builder::new()
            .name("mdns-browse".into())
            .spawn(move || {
                while let Ok(event) = browse_rx.recv() {
                    let ServiceEvent::ServiceResolved(info) = event else {
                        continue;
                    };
                    // Never dial ourselves.
                    if info.get_fullname() == our_fullname {
                        continue;
                    }
                    let peer_port = info.get_port();
                    for ip in info.get_addresses() {
                        // Only IPv4 LAN dialing for now (matches transport).
                        let IpAddr::V4(v4) = ip else { continue };
                        if v4.is_loopback() || v4.is_link_local() || v4.is_unspecified() {
                            continue;
                        }
                        let addr = SocketAddr::new(IpAddr::V4(*v4), peer_port);
                        debug!("[mDNS] resolved peer {} at {addr}", info.get_fullname());
                        if tx.blocking_send(addr).is_err() {
                            return; // receiver dropped -> node shutting down
                        }
                    }
                }
                debug!("[mDNS] browse channel closed");
            })
            .map_err(|e| DiscoveryError::MdnsError(format!("spawn browse thread: {e}")))?;

        Ok((Self { daemon, fullname }, rx))
    }
}

impl Drop for MdnsService {
    fn drop(&mut self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}
