//! VERSION/VERACK handshake protocol (SPEC_06 §5.3)
//!
//! Implements the connection handshake:
//! - Outbound: Send VERSION → Receive VERSION → Send VERACK → Receive VERACK
//! - Inbound: Receive VERSION → Send VERSION + VERACK → Receive VERACK

use std::net::SocketAddr;
use std::time::Instant;

use sha2::{Digest, Sha256};
use tokio::time::{timeout, Duration};

use crate::network::{CompactAddr, VersionPayload};
use crate::types::constants::{HANDSHAKE_TIMEOUT_SECS, PROTOCOL_VERSION, VERSION_TIMEOUT_SECS};
use crate::types::network::{MessageEnvelope, MessageType};
use crate::types::serialize::{Deserialize, Serialize};

use super::connection::Connection;
use super::peer::{LocalNodeInfo, PeerInfo};
use super::state::ConnectionState;
use super::TransportError;

/// Build a VERSION payload
fn build_version_payload(
    local_info: &LocalNodeInfo,
    our_nonce: u64,
    sender_addr: SocketAddr,
    receiver_addr: SocketAddr,
) -> VersionPayload {
    VersionPayload {
        protocol_version: PROTOCOL_VERSION as u32,
        node_services: local_info.services,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or(std::time::Duration::ZERO)
            .as_secs(),
        sender_addr: socket_to_compact_addr(sender_addr),
        receiver_addr: socket_to_compact_addr(receiver_addr),
        nonce: our_nonce,
        user_agent: local_info.user_agent.clone(),
        start_height: local_info.height,
        relay: local_info.relay,
    }
}

/// Convert a SocketAddr to CompactAddr format
fn socket_to_compact_addr(addr: SocketAddr) -> CompactAddr {
    let mut address = [0u8; 16];
    match addr {
        SocketAddr::V4(v4) => {
            // IPv4-mapped IPv6: ::ffff:a.b.c.d
            address[10] = 0xff;
            address[11] = 0xff;
            address[12..16].copy_from_slice(&v4.ip().octets());
        }
        SocketAddr::V6(v6) => {
            address.copy_from_slice(&v6.ip().octets());
        }
    }
    CompactAddr {
        transport: 0x01, // TCP
        address,
        port: addr.port(),
        services: 0,
    }
}

/// Perform outbound handshake: we send VERSION first
///
/// Sequence:
/// 1. Send VERSION
/// 2. Wait for peer VERSION (10s timeout)
/// 3. Validate peer VERSION
/// 4. Send VERACK
/// 5. Wait for peer VERACK (remaining handshake time)
pub async fn perform_outbound_handshake(
    conn: &mut Connection,
    local_info: &LocalNodeInfo,
    local_addr: SocketAddr,
) -> Result<PeerInfo, TransportError> {
    let start = Instant::now();

    // 1. Send VERSION
    let version_payload =
        build_version_payload(local_info, conn.our_nonce(), local_addr, conn.remote_addr());
    let payload_bytes = version_payload.to_bytes();
    let envelope = MessageEnvelope::new_fork_agnostic(MessageType::Version, payload_bytes);
    conn.send(&envelope).await?;
    conn.set_state(ConnectionState::VersionSent)?;
    conn.mark_version_sent();

    // 2. Await peer VERSION (10s timeout)
    let peer_version = timeout(
        Duration::from_secs(VERSION_TIMEOUT_SECS),
        wait_for_message_type(conn, MessageType::Version),
    )
    .await
    .map_err(|_| TransportError::VersionTimeout(VERSION_TIMEOUT_SECS))??;

    let peer_info = parse_version_payload(&peer_version.payload, conn.remote_addr())?;

    // 3. Validate VERSION
    validate_version(&peer_info, conn.our_nonce())?;
    conn.set_peer_info(peer_info.clone());

    // 4. Send VERACK
    let verack = MessageEnvelope::new_fork_agnostic(MessageType::Verack, vec![]);
    conn.send(&verack).await?;
    conn.set_state(ConnectionState::VerackSent)?;

    // 5. Await peer VERACK (remaining handshake time)
    let elapsed = start.elapsed().as_secs();
    let remaining = HANDSHAKE_TIMEOUT_SECS.saturating_sub(elapsed);
    if remaining == 0 {
        return Err(TransportError::HandshakeTimeout(HANDSHAKE_TIMEOUT_SECS));
    }

    timeout(
        Duration::from_secs(remaining),
        wait_for_message_type(conn, MessageType::Verack),
    )
    .await
    .map_err(|_| TransportError::HandshakeTimeout(HANDSHAKE_TIMEOUT_SECS))??;

    conn.set_state(ConnectionState::Established)?;
    Ok(peer_info)
}

/// Perform inbound handshake: we receive VERSION first
///
/// Sequence:
/// 1. Wait for peer VERSION (10s timeout)
/// 2. Validate peer VERSION
/// 3. Send VERSION + VERACK
/// 4. Wait for peer VERACK (remaining handshake time)
pub async fn perform_inbound_handshake(
    conn: &mut Connection,
    local_info: &LocalNodeInfo,
    local_addr: SocketAddr,
) -> Result<PeerInfo, TransportError> {
    let start = Instant::now();

    // 1. Await peer VERSION (10s timeout)
    let peer_version = timeout(
        Duration::from_secs(VERSION_TIMEOUT_SECS),
        wait_for_message_type(conn, MessageType::Version),
    )
    .await
    .map_err(|_| TransportError::VersionTimeout(VERSION_TIMEOUT_SECS))??;

    let peer_info = parse_version_payload(&peer_version.payload, conn.remote_addr())?;
    conn.set_state(ConnectionState::VersionReceived)?;

    // 2. Validate VERSION
    validate_version(&peer_info, conn.our_nonce())?;
    conn.set_peer_info(peer_info.clone());

    // 3. Send VERSION + VERACK (inbound sends both together per spec)
    let version_payload =
        build_version_payload(local_info, conn.our_nonce(), local_addr, conn.remote_addr());
    let version_bytes = version_payload.to_bytes();
    let version_envelope = MessageEnvelope::new_fork_agnostic(MessageType::Version, version_bytes);
    conn.send(&version_envelope).await?;

    let verack = MessageEnvelope::new_fork_agnostic(MessageType::Verack, vec![]);
    conn.send(&verack).await?;
    conn.set_state(ConnectionState::VerackSent)?;

    // 4. Await peer VERACK
    let elapsed = start.elapsed().as_secs();
    let remaining = HANDSHAKE_TIMEOUT_SECS.saturating_sub(elapsed);
    if remaining == 0 {
        return Err(TransportError::HandshakeTimeout(HANDSHAKE_TIMEOUT_SECS));
    }

    timeout(
        Duration::from_secs(remaining),
        wait_for_message_type(conn, MessageType::Verack),
    )
    .await
    .map_err(|_| TransportError::HandshakeTimeout(HANDSHAKE_TIMEOUT_SECS))??;

    conn.set_state(ConnectionState::Established)?;
    Ok(peer_info)
}

/// Validate received VERSION payload
fn validate_version(peer_info: &PeerInfo, our_nonce: u64) -> Result<(), TransportError> {
    // Self-connection check (nonce collision)
    if peer_info.nonce == our_nonce {
        return Err(TransportError::SelfConnection);
    }

    // Version compatibility (we only support version 1)
    if peer_info.protocol_version != PROTOCOL_VERSION as u32 {
        return Err(TransportError::VersionMismatch {
            peer: peer_info.protocol_version,
            ours: PROTOCOL_VERSION as u32,
        });
    }

    Ok(())
}

/// Wait for a specific message type
async fn wait_for_message_type(
    conn: &mut Connection,
    expected: MessageType,
) -> Result<MessageEnvelope, TransportError> {
    loop {
        match conn.recv().await? {
            Some(envelope) if envelope.message_type == expected => return Ok(envelope),
            Some(envelope) => {
                return Err(TransportError::UnexpectedMessage(format!(
                    "expected {:?}, got {:?}",
                    expected, envelope.message_type
                )));
            }
            None => return Err(TransportError::ConnectionClosed),
        }
    }
}

/// Parse VERSION payload into PeerInfo
fn parse_version_payload(
    bytes: &[u8],
    remote_addr: SocketAddr,
) -> Result<PeerInfo, TransportError> {
    let payload = VersionPayload::from_bytes(bytes)?;

    // Compute node_id as SHA-256 of (nonce:user_agent)
    // NOTE: In production, VERSION should include public key
    let node_id_input = format!("{}:{}", payload.nonce, payload.user_agent);
    let node_id: [u8; 32] = Sha256::digest(node_id_input.as_bytes()).into();

    Ok(PeerInfo {
        node_id,
        protocol_version: payload.protocol_version,
        services: payload.node_services,
        user_agent: payload.user_agent,
        start_height: payload.start_height,
        relay: payload.relay,
        nonce: payload.nonce,
        remote_addr,
        timestamp: payload.timestamp,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;
    use tokio::net::TcpStream;

    #[tokio::test]
    async fn test_socket_to_compact_addr_ipv4() {
        let addr: SocketAddr = "192.168.1.1:9735".parse().unwrap();
        let compact = socket_to_compact_addr(addr);

        assert_eq!(compact.transport, 0x01);
        assert_eq!(compact.port, 9735);
        // Check IPv4-mapped IPv6 format
        assert_eq!(&compact.address[0..10], &[0u8; 10]);
        assert_eq!(compact.address[10], 0xff);
        assert_eq!(compact.address[11], 0xff);
        assert_eq!(&compact.address[12..16], &[192, 168, 1, 1]);
    }

    #[tokio::test]
    async fn test_build_version_payload() {
        let local_info = LocalNodeInfo::default();
        let sender_addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();
        let receiver_addr: SocketAddr = "192.168.1.1:9735".parse().unwrap();

        let payload = build_version_payload(&local_info, 12345, sender_addr, receiver_addr);

        assert_eq!(payload.protocol_version, PROTOCOL_VERSION as u32);
        assert_eq!(payload.nonce, 12345);
        assert!(payload.user_agent.starts_with("Swimchain/"));
        assert!(payload.relay);
    }

    #[tokio::test]
    async fn test_parse_version_payload() {
        let local_info = LocalNodeInfo {
            services: 0x0001,
            height: 100,
            user_agent: "Test/1.0".to_string(),
            relay: true,
        };
        let sender_addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();
        let receiver_addr: SocketAddr = "192.168.1.1:9735".parse().unwrap();

        let payload = build_version_payload(&local_info, 67890, sender_addr, receiver_addr);
        let bytes = payload.to_bytes();

        let peer_info = parse_version_payload(&bytes, receiver_addr).unwrap();

        assert_eq!(peer_info.protocol_version, PROTOCOL_VERSION as u32);
        assert_eq!(peer_info.services, 0x0001);
        assert_eq!(peer_info.user_agent, "Test/1.0");
        assert_eq!(peer_info.start_height, 100);
        assert!(peer_info.relay);
        assert_eq!(peer_info.nonce, 67890);
    }

    #[tokio::test]
    async fn test_validate_version_success() {
        let peer_info = PeerInfo {
            node_id: [0u8; 32],
            protocol_version: PROTOCOL_VERSION as u32,
            services: 0x0001,
            user_agent: "Test/1.0".to_string(),
            start_height: 100,
            relay: true,
            nonce: 67890,
            remote_addr: "127.0.0.1:9735".parse().unwrap(),
            timestamp: 0,
        };

        // Different nonce, same version = OK
        assert!(validate_version(&peer_info, 12345).is_ok());
    }

    #[tokio::test]
    async fn test_validate_version_self_connection() {
        let peer_info = PeerInfo {
            node_id: [0u8; 32],
            protocol_version: PROTOCOL_VERSION as u32,
            services: 0x0001,
            user_agent: "Test/1.0".to_string(),
            start_height: 100,
            relay: true,
            nonce: 12345, // Same as our nonce
            remote_addr: "127.0.0.1:9735".parse().unwrap(),
            timestamp: 0,
        };

        // Same nonce = self-connection
        let result = validate_version(&peer_info, 12345);
        assert!(matches!(result, Err(TransportError::SelfConnection)));
    }

    #[tokio::test]
    async fn test_validate_version_mismatch() {
        let peer_info = PeerInfo {
            node_id: [0u8; 32],
            protocol_version: 99, // Wrong version
            services: 0x0001,
            user_agent: "Test/1.0".to_string(),
            start_height: 100,
            relay: true,
            nonce: 67890,
            remote_addr: "127.0.0.1:9735".parse().unwrap(),
            timestamp: 0,
        };

        let result = validate_version(&peer_info, 12345);
        assert!(matches!(
            result,
            Err(TransportError::VersionMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn test_full_handshake() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let local_info = LocalNodeInfo::default();
        let local_info_clone = local_info.clone();

        // Spawn server (inbound)
        let server_task = tokio::spawn(async move {
            let (stream, peer_addr) = listener.accept().await.unwrap();
            let mut conn = Connection::new_inbound(stream, peer_addr, 111111);
            perform_inbound_handshake(&mut conn, &local_info_clone, addr).await
        });

        // Client (outbound)
        let client_task = tokio::spawn(async move {
            let stream = TcpStream::connect(addr).await.unwrap();
            let mut conn = Connection::new_outbound(stream, addr, 222222);
            perform_outbound_handshake(&mut conn, &local_info, addr).await
        });

        let (server_result, client_result) = tokio::join!(server_task, client_task);

        let server_peer = server_result.unwrap().unwrap();
        let client_peer = client_result.unwrap().unwrap();

        // Server should see client's nonce
        assert_eq!(server_peer.nonce, 222222);
        // Client should see server's nonce
        assert_eq!(client_peer.nonce, 111111);

        // Both should have version 1
        assert_eq!(server_peer.protocol_version, PROTOCOL_VERSION as u32);
        assert_eq!(client_peer.protocol_version, PROTOCOL_VERSION as u32);
    }
}
