//! Message framing (SPEC_06 §3.4)
//!
//! Reads and writes MessageEnvelope frames over TCP streams.
//! Uses the 46-byte header format from the wire protocol.

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::TransportError;
use crate::network::{NetworkContext, WireError};
use crate::types::constants::{MAX_PAYLOAD_SIZE, MESSAGE_HEADER_SIZE};
use crate::types::network::{MessageEnvelope, MessageType};

/// Read a complete MessageEnvelope from the stream
///
/// Returns `Ok(None)` on clean EOF (peer closed connection gracefully),
/// `Err(TransportError)` on any other error.
pub async fn read_envelope(
    stream: &mut TcpStream,
) -> Result<Option<MessageEnvelope>, TransportError> {
    // Read 46-byte header
    let mut header = [0u8; MESSAGE_HEADER_SIZE];
    match stream.read_exact(&mut header).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(TransportError::Io(e)),
    }

    // Parse header fields
    let magic = [header[0], header[1], header[2], header[3]];
    if !NetworkContext::validate_magic(magic) {
        return Err(TransportError::Wire(WireError::InvalidMagic(magic)));
    }

    let version = header[4];
    let message_type_byte = header[5];
    let message_type = MessageType::try_from(message_type_byte)
        .map_err(|e| TransportError::Wire(WireError::from(e)))?;

    let mut fork_id = [0u8; 32];
    fork_id.copy_from_slice(&header[6..38]);

    let payload_length = u32::from_le_bytes([header[38], header[39], header[40], header[41]]);
    let checksum = [header[42], header[43], header[44], header[45]];

    // Validate payload size before allocating
    if payload_length > MAX_PAYLOAD_SIZE {
        return Err(TransportError::MessageTooLarge {
            size: payload_length,
            max: MAX_PAYLOAD_SIZE,
        });
    }

    // Read payload
    let mut payload = vec![0u8; payload_length as usize];
    if payload_length > 0 {
        stream.read_exact(&mut payload).await?;
    }

    let envelope = MessageEnvelope {
        magic,
        version,
        message_type,
        fork_id,
        payload_length,
        checksum,
        payload,
    };

    // Validate using existing V-MSG-01 through V-MSG-06
    envelope.validate()?;

    Ok(Some(envelope))
}

/// Write a MessageEnvelope to the stream
pub async fn write_envelope(
    stream: &mut TcpStream,
    envelope: &MessageEnvelope,
) -> Result<(), TransportError> {
    // Build header (46 bytes)
    let mut header = [0u8; MESSAGE_HEADER_SIZE];
    header[0..4].copy_from_slice(&envelope.magic);
    header[4] = envelope.version;
    header[5] = envelope.message_type as u8;
    header[6..38].copy_from_slice(&envelope.fork_id);
    header[38..42].copy_from_slice(&envelope.payload_length.to_le_bytes());
    header[42..46].copy_from_slice(&envelope.checksum);

    // Write header then payload
    stream.write_all(&header).await?;
    stream.write_all(&envelope.payload).await?;
    stream.flush().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_roundtrip_encode_decode() {
        // Create a pair of connected streams
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });

        let (server_stream, _) = listener.accept().await.unwrap();
        let mut client_stream = client_task.await.unwrap();
        let mut server_stream = server_stream;

        // Create and send an envelope
        let original = MessageEnvelope::new_fork_agnostic(MessageType::Ping, vec![1, 2, 3, 4, 5]);

        write_envelope(&mut client_stream, &original).await.unwrap();

        // Read it back
        let received = read_envelope(&mut server_stream).await.unwrap().unwrap();

        assert_eq!(received.magic, original.magic);
        assert_eq!(received.version, original.version);
        assert_eq!(received.message_type, original.message_type);
        assert_eq!(received.fork_id, original.fork_id);
        assert_eq!(received.payload_length, original.payload_length);
        assert_eq!(received.checksum, original.checksum);
        assert_eq!(received.payload, original.payload);
    }

    #[tokio::test]
    async fn test_empty_payload() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });

        let (server_stream, _) = listener.accept().await.unwrap();
        let mut client_stream = client_task.await.unwrap();
        let mut server_stream = server_stream;

        // VERACK has empty payload
        let original = MessageEnvelope::new_fork_agnostic(MessageType::Verack, vec![]);

        write_envelope(&mut client_stream, &original).await.unwrap();
        let received = read_envelope(&mut server_stream).await.unwrap().unwrap();

        assert_eq!(received.message_type, MessageType::Verack);
        assert!(received.payload.is_empty());
    }

    #[tokio::test]
    async fn test_connection_closed_returns_none() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move {
            let stream = TcpStream::connect(addr).await.unwrap();
            // Close immediately
            drop(stream);
        });

        let (mut server_stream, _) = listener.accept().await.unwrap();
        client_task.await.unwrap();

        // Should return None on clean close
        let result = read_envelope(&mut server_stream).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_invalid_magic_returns_error() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move {
            let mut stream = TcpStream::connect(addr).await.unwrap();
            // Write invalid header with wrong magic
            let mut header = [0u8; MESSAGE_HEADER_SIZE];
            header[0..4].copy_from_slice(&[0xFF, 0xFF, 0xFF, 0xFF]); // Invalid magic
            header[4] = 1; // version
            header[5] = 0x02; // Ping type
            stream.write_all(&header).await.unwrap();
        });

        let (mut server_stream, _) = listener.accept().await.unwrap();
        client_task.await.unwrap();

        let result = read_envelope(&mut server_stream).await;
        assert!(matches!(
            result,
            Err(TransportError::Wire(WireError::InvalidMagic(_)))
        ));
    }
}
