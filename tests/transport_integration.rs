//! Integration tests for TCP Transport layer (Milestone 2.2)
//!
//! These tests verify:
//! - Two nodes can connect
//! - Handshake completes successfully
//! - Messages are exchanged

use std::net::SocketAddr;

use swimchain::transport::{ConnectionDirection, ConnectionState, LocalNodeInfo, TcpTransport};
use swimchain::types::network::{MessageEnvelope, MessageType};

/// Test: Two nodes can connect and complete handshake
#[tokio::test]
async fn test_two_nodes_connect() {
    let local_info = LocalNodeInfo::default();

    // Create server
    let server = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .expect("server bind failed");
    let server_addr = server.local_addr();

    // Create client
    let client = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), local_info)
        .await
        .expect("client bind failed");

    // Server accepts in background
    let server_task = tokio::spawn(async move { server.accept().await });

    // Client connects
    let client_conn = client
        .connect(server_addr)
        .await
        .expect("client connect failed");

    // Wait for server to complete handshake
    let server_conn = server_task.await.unwrap().expect("server accept failed");

    // Verify both connections are established
    assert!(client_conn.is_established());
    assert!(server_conn.is_established());
    assert_eq!(client_conn.state(), ConnectionState::Established);
    assert_eq!(server_conn.state(), ConnectionState::Established);
}

/// Test: Handshake exchanges peer information correctly
#[tokio::test]
async fn test_handshake_peer_info() {
    let server_info = LocalNodeInfo {
        services: 0x0001,
        height: 100,
        user_agent: "TestServer/1.0".to_string(),
        relay: true,
    };

    let client_info = LocalNodeInfo {
        services: 0x0002,
        height: 200,
        user_agent: "TestClient/1.0".to_string(),
        relay: false,
    };

    let server = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), server_info)
        .await
        .unwrap();
    let server_addr = server.local_addr();

    let client = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), client_info)
        .await
        .unwrap();

    let server_task = tokio::spawn(async move { server.accept().await });

    let client_conn = client.connect(server_addr).await.unwrap();
    let server_conn = server_task.await.unwrap().unwrap();

    // Check client sees server's info
    let client_peer = client_conn
        .peer_info()
        .expect("client should have peer info");
    assert_eq!(client_peer.user_agent, "TestServer/1.0");
    assert_eq!(client_peer.start_height, 100);
    assert_eq!(client_peer.services, 0x0001);
    assert!(client_peer.relay);

    // Check server sees client's info
    let server_peer = server_conn
        .peer_info()
        .expect("server should have peer info");
    assert_eq!(server_peer.user_agent, "TestClient/1.0");
    assert_eq!(server_peer.start_height, 200);
    assert_eq!(server_peer.services, 0x0002);
    assert!(!server_peer.relay);
}

/// Test: Messages are exchanged after handshake
#[tokio::test]
async fn test_message_exchange() {
    let local_info = LocalNodeInfo::default();

    let server = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .unwrap();
    let server_addr = server.local_addr();

    let client = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), local_info)
        .await
        .unwrap();

    let server_task = tokio::spawn(async move { server.accept().await });

    let mut client_conn = client.connect(server_addr).await.unwrap();
    let mut server_conn = server_task.await.unwrap().unwrap();

    // Client sends PING
    let ping_payload = 0x123456789abcdef0u64.to_le_bytes().to_vec();
    let ping = MessageEnvelope::new_fork_agnostic(MessageType::Ping, ping_payload.clone());
    client_conn.send(&ping).await.expect("send ping failed");

    // Server receives PING
    let received = server_conn
        .recv()
        .await
        .expect("recv failed")
        .expect("no message");
    assert_eq!(received.message_type, MessageType::Ping);
    assert_eq!(received.payload, ping_payload);

    // Server sends PONG
    let pong = MessageEnvelope::new_fork_agnostic(MessageType::Pong, ping_payload.clone());
    server_conn.send(&pong).await.expect("send pong failed");

    // Client receives PONG
    let received = client_conn
        .recv()
        .await
        .expect("recv failed")
        .expect("no message");
    assert_eq!(received.message_type, MessageType::Pong);
    assert_eq!(received.payload, ping_payload);
}

/// Test: Multiple clients can connect to same server
#[tokio::test]
async fn test_multiple_clients() {
    let local_info = LocalNodeInfo::default();

    let server = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .unwrap();
    let server_addr = server.local_addr();

    let client1 = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .unwrap();
    let client2 = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), local_info)
        .await
        .unwrap();

    use std::sync::Arc;
    let server = Arc::new(server);

    // Accept two connections
    let server1 = Arc::clone(&server);
    let server2 = Arc::clone(&server);

    let accept_task1 = tokio::spawn(async move { server1.accept().await });
    let accept_task2 = tokio::spawn(async move { server2.accept().await });

    // Connect both clients
    let conn1 = client1.connect(server_addr).await.unwrap();
    let conn2 = client2.connect(server_addr).await.unwrap();

    let server_conn1 = accept_task1.await.unwrap().unwrap();
    let server_conn2 = accept_task2.await.unwrap().unwrap();

    // All connections established
    assert!(conn1.is_established());
    assert!(conn2.is_established());
    assert!(server_conn1.is_established());
    assert!(server_conn2.is_established());

    // Different nonces
    assert_ne!(conn1.our_nonce(), conn2.our_nonce());
    assert_ne!(server_conn1.our_nonce(), server_conn2.our_nonce());
}

/// Test: Connection direction is tracked correctly
#[tokio::test]
async fn test_connection_direction() {
    let local_info = LocalNodeInfo::default();

    let server = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .unwrap();
    let server_addr = server.local_addr();

    let client = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), local_info)
        .await
        .unwrap();

    let server_task = tokio::spawn(async move { server.accept().await });

    let client_conn = client.connect(server_addr).await.unwrap();
    let server_conn = server_task.await.unwrap().unwrap();

    // Client initiated = Outbound
    assert_eq!(client_conn.direction(), ConnectionDirection::Outbound);

    // Server received = Inbound
    assert_eq!(server_conn.direction(), ConnectionDirection::Inbound);
}

/// Test: Protocol version is validated
#[tokio::test]
async fn test_protocol_version_match() {
    let local_info = LocalNodeInfo::default();

    let server = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .unwrap();
    let server_addr = server.local_addr();

    let client = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), local_info)
        .await
        .unwrap();

    let server_task = tokio::spawn(async move { server.accept().await });

    let client_conn = client.connect(server_addr).await.unwrap();
    let server_conn = server_task.await.unwrap().unwrap();

    // Both peers should report version 1
    assert_eq!(client_conn.peer_info().unwrap().protocol_version, 1);
    assert_eq!(server_conn.peer_info().unwrap().protocol_version, 1);
}

/// Test: Empty payload messages (like VERACK) work correctly
#[tokio::test]
async fn test_empty_payload_message() {
    let local_info = LocalNodeInfo::default();

    let server = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .unwrap();
    let server_addr = server.local_addr();

    let client = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), local_info)
        .await
        .unwrap();

    let server_task = tokio::spawn(async move { server.accept().await });

    let mut client_conn = client.connect(server_addr).await.unwrap();
    let mut server_conn = server_task.await.unwrap().unwrap();

    // Send empty GetAddr message
    let getaddr = MessageEnvelope::new_fork_agnostic(MessageType::GetAddr, vec![]);
    client_conn.send(&getaddr).await.unwrap();

    let received = server_conn.recv().await.unwrap().unwrap();
    assert_eq!(received.message_type, MessageType::GetAddr);
    assert!(received.payload.is_empty());
}

/// Test: Large payload messages work correctly
#[tokio::test]
async fn test_large_payload_message() {
    let local_info = LocalNodeInfo::default();

    let server = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .unwrap();
    let server_addr = server.local_addr();

    let client = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), local_info)
        .await
        .unwrap();

    let server_task = tokio::spawn(async move { server.accept().await });

    let mut client_conn = client.connect(server_addr).await.unwrap();
    let mut server_conn = server_task.await.unwrap().unwrap();

    // Send a larger payload (64KB)
    let payload: Vec<u8> = (0..65536).map(|i| (i % 256) as u8).collect();
    let msg = MessageEnvelope::new_fork_agnostic(MessageType::Data, payload.clone());
    client_conn.send(&msg).await.unwrap();

    let received = server_conn.recv().await.unwrap().unwrap();
    assert_eq!(received.message_type, MessageType::Data);
    assert_eq!(received.payload.len(), 65536);
    assert_eq!(received.payload, payload);
}

/// Test: Connection nonce tracking works
#[tokio::test]
async fn test_nonce_tracking() {
    let local_info = LocalNodeInfo::default();

    let server = TcpTransport::bind(
        "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        local_info.clone(),
    )
    .await
    .unwrap();
    let server_addr = server.local_addr();

    let client = TcpTransport::bind("127.0.0.1:0".parse::<SocketAddr>().unwrap(), local_info)
        .await
        .unwrap();

    // Initially no active connections
    assert_eq!(server.active_connection_count().await, 0);
    assert_eq!(client.active_connection_count().await, 0);

    let server = std::sync::Arc::new(server);
    let server_clone = std::sync::Arc::clone(&server);

    let server_task = tokio::spawn(async move { server_clone.accept().await });

    let client_conn = client.connect(server_addr).await.unwrap();
    let server_conn = server_task.await.unwrap().unwrap();

    // Both should have 1 active connection
    assert_eq!(server.active_connection_count().await, 1);
    assert_eq!(client.active_connection_count().await, 1);

    // Nonces should match across the connection
    assert_eq!(server_conn.peer_nonce(), Some(client_conn.our_nonce()));
    assert_eq!(client_conn.peer_nonce(), Some(server_conn.our_nonce()));
}
