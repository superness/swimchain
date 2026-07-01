//! Serialization traits and helpers
//!
//! Provides binary serialization/deserialization for protocol types.
//! All integers are little-endian. Optional fields use 0x00/0x01 presence bytes.

use super::error::SerializeError;

/// Trait for types that can be serialized to bytes
pub trait Serialize {
    /// Serialize to a byte vector
    fn to_bytes(&self) -> Vec<u8>;
}

/// Trait for types that can be deserialized from bytes
pub trait Deserialize: Sized {
    /// Deserialize from a byte slice
    fn from_bytes(bytes: &[u8]) -> Result<Self, SerializeError>;
}

/// Helper for writing binary data
#[derive(Debug, Default)]
pub struct ByteWriter {
    buf: Vec<u8>,
}

impl ByteWriter {
    /// Create a new empty writer
    #[must_use]
    pub fn new() -> Self {
        Self { buf: Vec::new() }
    }

    /// Create a new writer with pre-allocated capacity
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            buf: Vec::with_capacity(capacity),
        }
    }

    /// Write a single byte
    pub fn write_u8(&mut self, v: u8) {
        self.buf.push(v);
    }

    /// Write a u16 in little-endian
    pub fn write_u16_le(&mut self, v: u16) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    /// Write an i16 in little-endian
    pub fn write_i16_le(&mut self, v: i16) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    /// Write a u32 in little-endian
    pub fn write_u32_le(&mut self, v: u32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    /// Write a u64 in little-endian
    pub fn write_u64_le(&mut self, v: u64) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    /// Write raw bytes
    pub fn write_bytes(&mut self, v: &[u8]) {
        self.buf.extend_from_slice(v);
    }

    /// Write a 32-byte array
    pub fn write_bytes32(&mut self, v: &[u8; 32]) {
        self.buf.extend_from_slice(v);
    }

    /// Write a 64-byte array
    pub fn write_bytes64(&mut self, v: &[u8; 64]) {
        self.buf.extend_from_slice(v);
    }

    /// Write an optional value with presence byte
    pub fn write_optional<T, F>(&mut self, v: Option<&T>, write_fn: F)
    where
        F: FnOnce(&mut Self, &T),
    {
        match v {
            None => self.write_u8(0x00),
            Some(data) => {
                self.write_u8(0x01);
                write_fn(self, data);
            }
        }
    }

    /// Write a string with u8 length prefix
    pub fn write_string_u8(&mut self, s: &str) {
        let bytes = s.as_bytes();
        debug_assert!(bytes.len() <= 255, "string too long for u8 length prefix");
        self.write_u8(bytes.len() as u8);
        self.write_bytes(bytes);
    }

    /// Write a string with u16 length prefix
    pub fn write_string_u16(&mut self, s: &str) {
        let bytes = s.as_bytes();
        debug_assert!(
            bytes.len() <= 65535,
            "string too long for u16 length prefix"
        );
        self.write_u16_le(bytes.len() as u16);
        self.write_bytes(bytes);
    }

    /// Write bytes with u8 length prefix
    pub fn write_bytes_u8(&mut self, v: &[u8]) {
        debug_assert!(v.len() <= 255, "bytes too long for u8 length prefix");
        self.write_u8(v.len() as u8);
        self.write_bytes(v);
    }

    /// Write bytes with u16 length prefix
    pub fn write_bytes_u16(&mut self, v: &[u8]) {
        debug_assert!(v.len() <= 65535, "bytes too long for u16 length prefix");
        self.write_u16_le(v.len() as u16);
        self.write_bytes(v);
    }

    /// Write bytes with u32 length prefix
    pub fn write_bytes_u32(&mut self, v: &[u8]) {
        self.write_u32_le(v.len() as u32);
        self.write_bytes(v);
    }

    /// Get the current length
    #[must_use]
    pub fn len(&self) -> usize {
        self.buf.len()
    }

    /// Check if empty
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.buf.is_empty()
    }

    /// Finish and return the buffer
    #[must_use]
    pub fn finish(self) -> Vec<u8> {
        self.buf
    }
}

/// Helper for reading binary data
#[derive(Debug)]
pub struct ByteReader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> ByteReader<'a> {
    /// Create a new reader
    #[must_use]
    pub fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    /// Get remaining bytes
    #[must_use]
    pub fn remaining(&self) -> usize {
        self.buf.len().saturating_sub(self.pos)
    }

    /// Check if reader is at end
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.remaining() == 0
    }

    /// Get current position
    #[must_use]
    pub fn position(&self) -> usize {
        self.pos
    }

    /// Read a single byte
    pub fn read_u8(&mut self) -> Result<u8, SerializeError> {
        if self.remaining() < 1 {
            return Err(SerializeError::UnexpectedEof);
        }
        let v = self.buf[self.pos];
        self.pos += 1;
        Ok(v)
    }

    /// Read a u16 in little-endian
    pub fn read_u16_le(&mut self) -> Result<u16, SerializeError> {
        if self.remaining() < 2 {
            return Err(SerializeError::UnexpectedEof);
        }
        let bytes: [u8; 2] = self.buf[self.pos..self.pos + 2]
            .try_into()
            .map_err(|_| SerializeError::UnexpectedEof)?;
        self.pos += 2;
        Ok(u16::from_le_bytes(bytes))
    }

    /// Read an i16 in little-endian
    pub fn read_i16_le(&mut self) -> Result<i16, SerializeError> {
        if self.remaining() < 2 {
            return Err(SerializeError::UnexpectedEof);
        }
        let bytes: [u8; 2] = self.buf[self.pos..self.pos + 2]
            .try_into()
            .map_err(|_| SerializeError::UnexpectedEof)?;
        self.pos += 2;
        Ok(i16::from_le_bytes(bytes))
    }

    /// Read a u32 in little-endian
    pub fn read_u32_le(&mut self) -> Result<u32, SerializeError> {
        if self.remaining() < 4 {
            return Err(SerializeError::UnexpectedEof);
        }
        let bytes: [u8; 4] = self.buf[self.pos..self.pos + 4]
            .try_into()
            .map_err(|_| SerializeError::UnexpectedEof)?;
        self.pos += 4;
        Ok(u32::from_le_bytes(bytes))
    }

    /// Read a u64 in little-endian
    pub fn read_u64_le(&mut self) -> Result<u64, SerializeError> {
        if self.remaining() < 8 {
            return Err(SerializeError::UnexpectedEof);
        }
        let bytes: [u8; 8] = self.buf[self.pos..self.pos + 8]
            .try_into()
            .map_err(|_| SerializeError::UnexpectedEof)?;
        self.pos += 8;
        Ok(u64::from_le_bytes(bytes))
    }

    /// Read exact number of bytes
    pub fn read_bytes(&mut self, len: usize) -> Result<&'a [u8], SerializeError> {
        if self.remaining() < len {
            return Err(SerializeError::UnexpectedEof);
        }
        let bytes = &self.buf[self.pos..self.pos + len];
        self.pos += len;
        Ok(bytes)
    }

    /// Read a 32-byte array
    pub fn read_bytes32(&mut self) -> Result<[u8; 32], SerializeError> {
        let bytes = self.read_bytes(32)?;
        let mut arr = [0u8; 32];
        arr.copy_from_slice(bytes);
        Ok(arr)
    }

    /// Read a 64-byte array
    pub fn read_bytes64(&mut self) -> Result<[u8; 64], SerializeError> {
        let bytes = self.read_bytes(64)?;
        let mut arr = [0u8; 64];
        arr.copy_from_slice(bytes);
        Ok(arr)
    }

    /// Read an optional value with presence byte
    pub fn read_optional<T, F>(&mut self, read_fn: F) -> Result<Option<T>, SerializeError>
    where
        F: FnOnce(&mut Self) -> Result<T, SerializeError>,
    {
        let present = self.read_u8()?;
        match present {
            0x00 => Ok(None),
            0x01 => Ok(Some(read_fn(self)?)),
            _ => Err(SerializeError::UnknownType(present)),
        }
    }

    /// Read a string with u8 length prefix
    pub fn read_string_u8(&mut self) -> Result<String, SerializeError> {
        let len = self.read_u8()? as usize;
        let bytes = self.read_bytes(len)?;
        String::from_utf8(bytes.to_vec()).map_err(SerializeError::from)
    }

    /// Read a string with u16 length prefix
    pub fn read_string_u16(&mut self) -> Result<String, SerializeError> {
        let len = self.read_u16_le()? as usize;
        let bytes = self.read_bytes(len)?;
        String::from_utf8(bytes.to_vec()).map_err(SerializeError::from)
    }

    /// Read bytes with u8 length prefix
    pub fn read_bytes_u8(&mut self) -> Result<Vec<u8>, SerializeError> {
        let len = self.read_u8()? as usize;
        let bytes = self.read_bytes(len)?;
        Ok(bytes.to_vec())
    }

    /// Read bytes with u16 length prefix
    pub fn read_bytes_u16(&mut self) -> Result<Vec<u8>, SerializeError> {
        let len = self.read_u16_le()? as usize;
        let bytes = self.read_bytes(len)?;
        Ok(bytes.to_vec())
    }

    /// Read bytes with u32 length prefix
    pub fn read_bytes_u32(&mut self) -> Result<Vec<u8>, SerializeError> {
        let len = self.read_u32_le()? as usize;
        let bytes = self.read_bytes(len)?;
        Ok(bytes.to_vec())
    }
}

// Macro for implementing Serialize/Deserialize for 32-byte newtypes
macro_rules! impl_serialize_newtype32 {
    ($name:ty) => {
        impl Serialize for $name {
            fn to_bytes(&self) -> Vec<u8> {
                self.0.to_vec()
            }
        }

        impl Deserialize for $name {
            fn from_bytes(bytes: &[u8]) -> Result<Self, SerializeError> {
                if bytes.len() != 32 {
                    return Err(SerializeError::InvalidLength {
                        expected: 32,
                        actual: bytes.len(),
                    });
                }
                let mut arr = [0u8; 32];
                arr.copy_from_slice(bytes);
                Ok(Self(arr))
            }
        }
    };
}

// Apply macro to 32-byte newtypes
impl_serialize_newtype32!(super::identity::IdentityId);
impl_serialize_newtype32!(super::content::ContentHash);
impl_serialize_newtype32!(super::content::ContentId);
impl_serialize_newtype32!(super::content::SpaceId);
impl_serialize_newtype32!(super::block::BlockHash);
impl_serialize_newtype32!(super::block::ForkId);
impl_serialize_newtype32!(super::network::NodeId);

// Implement for PublicKey (also 32 bytes)
impl Serialize for super::identity::PublicKey {
    fn to_bytes(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl Deserialize for super::identity::PublicKey {
    fn from_bytes(bytes: &[u8]) -> Result<Self, SerializeError> {
        if bytes.len() != 32 {
            return Err(SerializeError::InvalidLength {
                expected: 32,
                actual: bytes.len(),
            });
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(bytes);
        Ok(Self(arr))
    }
}

// Implement for Signature (64 bytes)
impl Serialize for super::identity::Signature {
    fn to_bytes(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl Deserialize for super::identity::Signature {
    fn from_bytes(bytes: &[u8]) -> Result<Self, SerializeError> {
        if bytes.len() != 64 {
            return Err(SerializeError::InvalidLength {
                expected: 64,
                actual: bytes.len(),
            });
        }
        let mut arr = [0u8; 64];
        arr.copy_from_slice(bytes);
        Ok(Self(arr))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_byte_writer_u8() {
        let mut w = ByteWriter::new();
        w.write_u8(0x42);
        assert_eq!(w.finish(), vec![0x42]);
    }

    #[test]
    fn test_byte_writer_u16_le() {
        let mut w = ByteWriter::new();
        w.write_u16_le(0x1234);
        assert_eq!(w.finish(), vec![0x34, 0x12]);
    }

    #[test]
    fn test_byte_writer_i16_le() {
        let mut w = ByteWriter::new();
        w.write_i16_le(0x1234);
        assert_eq!(w.finish(), vec![0x34, 0x12]);
    }

    #[test]
    fn test_byte_writer_i16_le_negative() {
        let mut w = ByteWriter::new();
        w.write_i16_le(-500);
        // -500 in two's complement: 0xfe0c
        assert_eq!(w.finish(), vec![0x0c, 0xfe]);
    }

    #[test]
    fn test_i16_roundtrip() {
        let values: [i16; 5] = [0, 1234, -500, i16::MIN, i16::MAX];
        for v in values {
            let mut w = ByteWriter::new();
            w.write_i16_le(v);
            let data = w.finish();
            let mut r = ByteReader::new(&data);
            assert_eq!(r.read_i16_le().unwrap(), v);
        }
    }

    #[test]
    fn test_byte_writer_u32_le() {
        let mut w = ByteWriter::new();
        w.write_u32_le(0x12345678);
        assert_eq!(w.finish(), vec![0x78, 0x56, 0x34, 0x12]);
    }

    #[test]
    fn test_byte_writer_u64_le() {
        let mut w = ByteWriter::new();
        w.write_u64_le(0x0102030405060708);
        assert_eq!(
            w.finish(),
            vec![0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]
        );
    }

    #[test]
    fn test_byte_reader_u8() {
        let data = vec![0x42];
        let mut r = ByteReader::new(&data);
        assert_eq!(r.read_u8().unwrap(), 0x42);
        assert!(r.is_empty());
    }

    #[test]
    fn test_byte_reader_u32_le() {
        let data = vec![0x78, 0x56, 0x34, 0x12];
        let mut r = ByteReader::new(&data);
        assert_eq!(r.read_u32_le().unwrap(), 0x12345678);
    }

    #[test]
    fn test_byte_reader_unexpected_eof() {
        let data = vec![0x01];
        let mut r = ByteReader::new(&data);
        assert!(matches!(
            r.read_u32_le(),
            Err(SerializeError::UnexpectedEof)
        ));
    }

    #[test]
    fn test_optional_none() {
        let mut w = ByteWriter::new();
        w.write_optional::<u32, _>(None, |w, v| w.write_u32_le(*v));
        assert_eq!(w.finish(), vec![0x00]);
    }

    #[test]
    fn test_optional_some() {
        let mut w = ByteWriter::new();
        w.write_optional(Some(&0x12345678u32), |w, v| w.write_u32_le(*v));
        assert_eq!(w.finish(), vec![0x01, 0x78, 0x56, 0x34, 0x12]);
    }

    #[test]
    fn test_string_u8() {
        let mut w = ByteWriter::new();
        w.write_string_u8("hello");
        let data = w.finish();
        assert_eq!(data[0], 5);
        assert_eq!(&data[1..], b"hello");

        let mut r = ByteReader::new(&data);
        assert_eq!(r.read_string_u8().unwrap(), "hello");
    }

    #[test]
    fn test_roundtrip_identity_id() {
        use super::super::identity::IdentityId;
        let original = IdentityId([0xab; 32]);
        let bytes = original.as_bytes();
        let recovered = IdentityId::from_bytes(*bytes);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_roundtrip_content_hash() {
        use super::super::content::ContentHash;
        let original = ContentHash([0xcd; 32]);
        let bytes = original.as_bytes();
        let recovered = ContentHash::from_bytes(*bytes);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_bytes_roundtrip() {
        // Test ByteWriter/ByteReader roundtrip
        let original_bytes = [0xab; 32];
        let mut w = ByteWriter::new();
        w.write_bytes(&original_bytes);
        let bytes = w.finish();
        let mut r = ByteReader::new(&bytes);
        let recovered = r.read_bytes32().unwrap();
        assert_eq!(original_bytes, recovered);
    }
}
