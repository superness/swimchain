//! PING/PONG keepalive handler
//!
//! Runs a connection handler loop that:
//! - Sends periodic PING messages
//! - Responds to incoming PING with PONG
//! - Detects PONG timeout (connection dead)
//! - Forwards other messages as events

use std::time::Instant;

use tokio::sync::{broadcast, oneshot};
use tokio::time::{interval, Duration};

use crate::types::constants::{PING_INTERVAL_SECS, PONG_TIMEOUT_SECS};
use crate::types::network::{MessageEnvelope, MessageType};

use super::connection::Connection;
use super::peer::PeerEvent;

/// Run connection handler loop with keepalive
///
/// This function takes ownership of the connection and runs until:
/// - Shutdown signal received
/// - PONG timeout exceeded
/// - Connection closed or errored
///
/// All received messages (except PING/PONG) are forwarded via `event_tx`.
pub async fn connection_handler(
    mut conn: Connection,
    event_tx: broadcast::Sender<PeerEvent>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    let mut ping_interval = interval(Duration::from_secs(PING_INTERVAL_SECS));
    let mut last_pong = Instant::now();
    let mut _pending_ping_nonce: Option<u64> = None;

    loop {
        tokio::select! {
            // Shutdown signal
            _ = &mut shutdown_rx => {
                let _ = event_tx.send(PeerEvent::Disconnected {
                    reason: "shutdown".to_string(),
                });
                break;
            }

            // Periodic ping tick
            _ = ping_interval.tick() => {
                // Check PONG timeout
                if last_pong.elapsed().as_secs() > PONG_TIMEOUT_SECS {
                    let _ = event_tx.send(PeerEvent::Disconnected {
                        reason: "pong timeout".to_string(),
                    });
                    break;
                }

                // Send PING
                let nonce = rand::random();
                _pending_ping_nonce = Some(nonce);
                let payload = serialize_ping(nonce);
                let envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, payload);
                if conn.send(&envelope).await.is_err() {
                    let _ = event_tx.send(PeerEvent::Disconnected {
                        reason: "send failed".to_string(),
                    });
                    break;
                }
            }

            // Incoming message
            result = conn.recv() => {
                match result {
                    Ok(Some(envelope)) => {
                        match envelope.message_type {
                            MessageType::Pong => {
                                // Reset PONG timeout
                                last_pong = Instant::now();
                            }
                            MessageType::Ping => {
                                // Respond with PONG using same nonce
                                let nonce = parse_ping(&envelope.payload);
                                let payload = serialize_ping(nonce);
                                let pong = MessageEnvelope::new_fork_agnostic(MessageType::Pong, payload);
                                if conn.send(&pong).await.is_err() {
                                    let _ = event_tx.send(PeerEvent::Disconnected {
                                        reason: "pong send failed".to_string(),
                                    });
                                    break;
                                }
                            }
                            _ => {
                                // Forward other messages as events
                                let _ = event_tx.send(PeerEvent::MessageReceived { envelope });
                            }
                        }
                    }
                    Ok(None) => {
                        // Clean connection close
                        let _ = event_tx.send(PeerEvent::Disconnected {
                            reason: "connection closed".to_string(),
                        });
                        break;
                    }
                    Err(e) => {
                        // Connection error
                        let _ = event_tx.send(PeerEvent::Disconnected {
                            reason: format!("error: {}", e),
                        });
                        break;
                    }
                }
            }
        }
    }
}

/// Serialize PING/PONG nonce to bytes
fn serialize_ping(nonce: u64) -> Vec<u8> {
    nonce.to_le_bytes().to_vec()
}

/// Parse PING/PONG nonce from bytes
fn parse_ping(bytes: &[u8]) -> u64 {
    if bytes.len() >= 8 {
        u64::from_le_bytes(bytes[0..8].try_into().unwrap())
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_ping() {
        let nonce = 0x123456789abcdef0u64;
        let bytes = serialize_ping(nonce);
        assert_eq!(bytes.len(), 8);

        let recovered = parse_ping(&bytes);
        assert_eq!(recovered, nonce);
    }

    #[test]
    fn test_parse_ping_short_payload() {
        // Handle short payloads gracefully
        assert_eq!(parse_ping(&[]), 0);
        assert_eq!(parse_ping(&[1, 2, 3]), 0);
    }

    #[test]
    fn test_parse_ping_exact() {
        let bytes = [0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12];
        let nonce = parse_ping(&bytes);
        assert_eq!(nonce, 0x123456789abcdef0u64);
    }
}
