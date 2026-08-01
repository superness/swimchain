//! Every peer write must be bounded. A peer that accepts a socket and then
//! never reads it must cost us a timeout, never a task.
//!
//! On 2026-08-01 the mainnet seed wedged on exactly this: a bootstrap I_HAVE
//! flood filled a peer's socket, `write_all` parked holding the write-half
//! mutex, and the next unbounded send waited forever. Startup is sequential
//! and `start_rpc_server` runs after peer bootstrap, so the RPC port never
//! bound — every web client down while systemd read "active" and the process
//! burned 0% CPU. That path was bounded in #254.
//!
//! Three sites of the SAME shape survived, found by auditing for the pattern
//! instead of waiting for the next outage:
//!
//! - the inventory I_HAVE flood to each newly-connected peer, one message per
//!   stored content item (6587 on the seed) — now routed through
//!   `PeerConnectionPool::send_to`, which bounds the write AND keeps strike
//!   accounting, rather than a raw handle;
//! - the handshake's VERSION write, whose READ side has had a 10s timeout all
//!   along while the write side had none;
//! - the keepalive PING — the very task meant to notice a dead peer.
//!
//! None could take the node down the way the startup path did (they live in
//! spawned tasks), but each parks a task for ever holding a peer's write-half
//! mutex, which silently stops every other write to that peer. "Silently" is
//! what makes it a lurking outage rather than a bug.

use std::sync::Arc;
use std::time::Duration;

use swimchain::node::peer_connections::{PeerConnection, PEER_SEND_TIMEOUT};
use swimchain::types::constants::PEER_WRITE_TIMEOUT_SECS;
use swimchain::types::network::{MessageEnvelope, MessageType};

/// A peer that accepts and never reads. The returned guard keeps the socket
/// alive: dropping it would send RST and unblock the writer, hiding the very
/// condition under test.
async fn deaf_peer() -> (std::net::SocketAddr, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let handle = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        tokio::time::sleep(Duration::from_secs(60)).await;
        drop(stream);
    });
    (addr, handle)
}

/// Fill the socket until a write would park, so the next send exercises the
/// blocking condition rather than a healthy buffer.
async fn stuff_until_full(conn: &Arc<PeerConnection>) {
    let envelope = MessageEnvelope::new_fork_agnostic(MessageType::IHave, vec![0xCD; 512 * 1024]);
    for _ in 0..64 {
        match tokio::time::timeout(Duration::from_millis(400), conn.send(&envelope)).await {
            Ok(Ok(())) => continue,
            _ => return, // parked or errored: the pipe is full, which is the point
        }
    }
    panic!("the deaf peer's socket never filled — the test cannot prove anything");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_bounded_write_returns_against_a_peer_that_never_reads() {
    let (addr, deaf) = deaf_peer().await;
    let stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let conn = Arc::new(PeerConnection::new(stream, [9u8; 32], true));

    stuff_until_full(&conn).await;

    // The contract every caller relies on. An unbounded call site parks a task
    // here for ever and wedges that peer's write half; a bounded one returns.
    let envelope = MessageEnvelope::new_fork_agnostic(MessageType::IHave, vec![0xCD; 64 * 1024]);
    let outcome = tokio::time::timeout(
        PEER_SEND_TIMEOUT + Duration::from_secs(2),
        tokio::time::timeout(PEER_SEND_TIMEOUT, conn.send(&envelope)),
    )
    .await;

    assert!(
        outcome.is_ok(),
        "a bounded send must return against a peer that never reads"
    );

    deaf.abort();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_transport_write_bound_is_short_enough_to_matter() {
    // The handshake and keepalive now wrap their writes in
    // PEER_WRITE_TIMEOUT_SECS. A bound only helps if it is far below the
    // intervals that depend on it: the handshake's own read timeout is 10s and
    // the keepalive ticks on a similar order, so a write bound of minutes
    // would be indistinguishable from no bound at all.
    assert!(
        PEER_WRITE_TIMEOUT_SECS > 0 && PEER_WRITE_TIMEOUT_SECS <= 5,
        "PEER_WRITE_TIMEOUT_SECS ({PEER_WRITE_TIMEOUT_SECS}s) must be a few \
         seconds — long enough for a healthy slow link, short enough that a \
         dead peer is noticed within one handshake or keepalive window"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_healthy_peer_is_unaffected_by_the_bound() {
    // The bound must not become a throughput cap on working links: a reader on
    // the other end means writes complete immediately.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let reader = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut sink = vec![0u8; 64 * 1024];
        loop {
            use tokio::io::AsyncReadExt;
            if stream.read(&mut sink).await.unwrap_or(0) == 0 {
                break;
            }
        }
    });

    let stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let conn = Arc::new(PeerConnection::new(stream, [4u8; 32], true));
    let envelope = MessageEnvelope::new_fork_agnostic(MessageType::IHave, vec![0x11; 256 * 1024]);

    for _ in 0..16 {
        let sent = tokio::time::timeout(
            Duration::from_secs(PEER_WRITE_TIMEOUT_SECS),
            conn.send(&envelope),
        )
        .await;
        assert!(
            matches!(sent, Ok(Ok(()))),
            "a peer that reads must never hit the write bound"
        );
    }

    reader.abort();
}
