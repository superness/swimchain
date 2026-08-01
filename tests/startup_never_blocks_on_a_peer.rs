//! Node startup must never be hostage to a peer's socket.
//!
//! THE 2026-08-01 SEED WEDGE. The mainnet seed booted, logged
//! `[BOOTSTRAP] Sent 6587 I_HAVE messages`, logged the chain-sync height
//! comparison — and then went silent forever at ~0% CPU with its RPC port
//! never bound. Every web client (chips, reef, browse) was down while the
//! process looked "active" to systemd.
//!
//! It hung inside `peer_conn.send()`. Startup is sequential and, at the time,
//! unbounded: the I_HAVE flood filled a peer's socket faster than that peer
//! drained it, `write_all` parked holding the write-half mutex, and the very
//! next startup send waited on that mutex with no timeout. `start_rpc_server`
//! is called AFTER peer bootstrap (manager.rs), so the whole node never
//! finished starting.
//!
//! The property this file pins: a peer that accepts a connection and then
//! never reads a byte must not be able to block us indefinitely. A bounded
//! send fails; an unbounded one hangs forever, which is the bug.

use std::sync::Arc;
use std::time::Duration;

use swimchain::network::NetworkContext;
use swimchain::node::peer_connections::PeerConnection;
use swimchain::types::network::{MessageEnvelope, MessageType};

/// Enough payload that the kernel's send buffer plus the peer's receive
/// window cannot swallow it while nobody reads.
const BIG: usize = 512 * 1024;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_peer_that_never_reads_cannot_hang_a_bounded_send() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    // The pathological peer: accepts, then never reads. Holding the stream is
    // the whole point — dropping it would send RST and unblock us.
    let deaf = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        tokio::time::sleep(Duration::from_secs(30)).await;
        drop(stream);
    });

    let stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let conn = Arc::new(PeerConnection::new(stream, [7u8; 32], true));

    let envelope = MessageEnvelope::new_fork_agnostic(MessageType::IHave, vec![0xAB; BIG]);

    // Write until the pipe is full and the send would park — bounded, so a
    // full pipe surfaces as a timeout instead of a wedged task.
    let mut parked = false;
    for _ in 0..64 {
        match tokio::time::timeout(Duration::from_millis(500), conn.send(&envelope)).await {
            Ok(Ok(())) => continue, // still draining into buffers
            Ok(Err(_)) => {
                parked = true;
                break;
            } // socket error is also "not hung"
            Err(_) => {
                parked = true;
                break;
            } // timed out == the bug's trigger condition
        }
    }
    assert!(
        parked,
        "expected the deaf peer's socket to fill and a bounded send to give up; \
         if this never happens the test cannot prove anything about the wedge"
    );

    // THE ASSERTION THAT MATTERS: with the pipe full, a further bounded send
    // must still RETURN. Unbounded (as startup was), this awaits forever and
    // the node never reaches start_rpc_server.
    let outcome = tokio::time::timeout(Duration::from_secs(5), async {
        tokio::time::timeout(Duration::from_millis(250), conn.send(&envelope)).await
    })
    .await;

    assert!(
        outcome.is_ok(),
        "a bounded send against a peer that never reads must return, not hang — \
         this is the 2026-08-01 seed wedge (RPC never bound because startup \
         parked in send())"
    );

    deaf.abort();
}
