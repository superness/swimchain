//! Bech32m address encoding for identity addresses
//!
//! Per SPEC_01 §3.3, addresses use:
//! - Bech32m encoding (BIP-350)
//! - Human-readable prefix: "cs"
//! - Version byte: 0 (current)
//! - 32-byte identity ID payload

use bech32::{Bech32m, Hrp};

use crate::types::constants::{ADDRESS_HRP, ADDRESS_VERSION};
use crate::types::error::AddressError;
use crate::types::identity::{IdentityId, PublicKey};

/// Encode an identity ID as a Bech32m address
///
/// Format: cs1<version><identity_id>
/// Total: "cs" + "1" + encoded(33 bytes) = ~59 characters
///
/// Note: This encodes the `IdentityId` (which is SHA-256 of pubkey in this codebase).
/// For SPEC_01-compliant addresses that encode the raw public key, use
/// `encode_address_from_pubkey` instead.
#[must_use]
pub fn encode_address(identity_id: &IdentityId) -> String {
    let hrp = Hrp::parse(ADDRESS_HRP).expect("valid HRP");
    let mut data = Vec::with_capacity(33);
    data.push(ADDRESS_VERSION); // version byte
    data.extend_from_slice(&identity_id.0);
    bech32::encode::<Bech32m>(hrp, &data).expect("valid encoding")
}

/// Encode a public key directly as a Bech32m address (per SPEC_01 §4.2)
///
/// This is the canonical address encoding per the specification where
/// IdentityID = PublicKey (the raw 32-byte Ed25519 public key).
///
/// Format: cs1<version><pubkey>
/// Total: "cs" + "1" + encoded(33 bytes) = ~59 characters
#[must_use]
pub fn encode_address_from_pubkey(public_key: &PublicKey) -> String {
    let hrp = Hrp::parse(ADDRESS_HRP).expect("valid HRP");
    let mut data = Vec::with_capacity(33);
    data.push(ADDRESS_VERSION); // version byte
    data.extend_from_slice(public_key.as_bytes());
    bech32::encode::<Bech32m>(hrp, &data).expect("valid encoding")
}

/// Decode a Bech32m address to an identity ID
///
/// Validates:
/// - HRP is "cs"
/// - Version byte is 0
/// - Payload is 32 bytes
pub fn decode_address(address: &str) -> Result<IdentityId, AddressError> {
    let (hrp, data) =
        bech32::decode(address).map_err(|e| AddressError::Bech32Error(e.to_string()))?;

    // Check HRP
    if hrp.as_str() != ADDRESS_HRP {
        return Err(AddressError::InvalidHrp(hrp.to_string()));
    }

    // Check minimum length (version + 32 bytes)
    if data.is_empty() {
        return Err(AddressError::InvalidLength(0));
    }

    // Check version
    if data[0] != ADDRESS_VERSION {
        return Err(AddressError::UnsupportedVersion(data[0]));
    }

    // Check payload length
    if data.len() != 33 {
        return Err(AddressError::InvalidLength(data.len()));
    }

    // Extract identity ID
    let mut payload = [0u8; 32];
    payload.copy_from_slice(&data[1..]);
    Ok(IdentityId(payload))
}

/// Decode a Bech32m address to a public key (per SPEC_01 §4.3)
///
/// This is the inverse of `encode_address_from_pubkey`, returning the raw
/// 32-byte Ed25519 public key encoded in the address.
///
/// Validates:
/// - HRP is "cs"
/// - Version byte is 0
/// - Payload is 32 bytes
pub fn decode_address_to_pubkey(address: &str) -> Result<PublicKey, AddressError> {
    let (hrp, data) =
        bech32::decode(address).map_err(|e| AddressError::Bech32Error(e.to_string()))?;

    // Check HRP
    if hrp.as_str() != ADDRESS_HRP {
        return Err(AddressError::InvalidHrp(hrp.to_string()));
    }

    // Check minimum length (version + 32 bytes)
    if data.is_empty() {
        return Err(AddressError::InvalidLength(0));
    }

    // Check version
    if data[0] != ADDRESS_VERSION {
        return Err(AddressError::UnsupportedVersion(data[0]));
    }

    // Check payload length
    if data.len() != 33 {
        return Err(AddressError::InvalidLength(data.len()));
    }

    // Extract public key bytes
    let mut payload = [0u8; 32];
    payload.copy_from_slice(&data[1..]);
    Ok(PublicKey::from_bytes(payload))
}

/// Check if a string is a valid Swimchain address
#[must_use]
pub fn is_valid_address(address: &str) -> bool {
    decode_address(address).is_ok()
}

/// Get the version byte from an address without full decoding
pub fn address_version(address: &str) -> Result<u8, AddressError> {
    let (hrp, data) =
        bech32::decode(address).map_err(|e| AddressError::Bech32Error(e.to_string()))?;

    if hrp.as_str() != ADDRESS_HRP {
        return Err(AddressError::InvalidHrp(hrp.to_string()));
    }

    if data.is_empty() {
        return Err(AddressError::InvalidLength(0));
    }

    Ok(data[0])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        let original = IdentityId([0xab; 32]);
        let encoded = encode_address(&original);
        let decoded = decode_address(&encoded).unwrap();
        assert_eq!(original, decoded);
    }

    #[test]
    fn test_encode_starts_with_cs1() {
        let id = IdentityId([0x00; 32]);
        let encoded = encode_address(&id);
        // HRP is "cs" (ChainSocial), so addresses start with "cs1"
        assert!(encoded.starts_with("cs1"), "Expected cs1 prefix, got: {}", encoded);
    }

    #[test]
    fn test_encode_lowercase() {
        let id = IdentityId([0xff; 32]);
        let encoded = encode_address(&id);
        // Bech32 uses lowercase
        assert_eq!(encoded, encoded.to_lowercase());
    }

    #[test]
    fn test_decode_invalid_hrp() {
        // Create a valid bech32 address with wrong HRP
        let hrp = Hrp::parse("bc").unwrap(); // Bitcoin HRP
        let data = vec![0u8; 33];
        let wrong_hrp_addr = bech32::encode::<Bech32m>(hrp, &data).unwrap();

        let result = decode_address(&wrong_hrp_addr);
        assert!(matches!(result, Err(AddressError::InvalidHrp(_))));
    }

    #[test]
    fn test_decode_unsupported_version() {
        let hrp = Hrp::parse(ADDRESS_HRP).unwrap();
        let mut data = vec![1u8]; // version 1 (unsupported)
        data.extend_from_slice(&[0u8; 32]);
        let addr = bech32::encode::<Bech32m>(hrp, &data).unwrap();

        let result = decode_address(&addr);
        assert!(matches!(result, Err(AddressError::UnsupportedVersion(1))));
    }

    #[test]
    fn test_decode_invalid_length() {
        let hrp = Hrp::parse(ADDRESS_HRP).unwrap();
        let data = vec![0u8; 20]; // Too short
        let addr = bech32::encode::<Bech32m>(hrp, &data).unwrap();

        let result = decode_address(&addr);
        assert!(matches!(result, Err(AddressError::InvalidLength(20))));
    }

    #[test]
    fn test_decode_invalid_checksum() {
        let id = IdentityId([0xab; 32]);
        let mut encoded = encode_address(&id);
        // Corrupt the last character
        let len = encoded.len();
        let last_char = encoded.chars().last().unwrap();
        let replacement = if last_char == 'q' { 'p' } else { 'q' };
        encoded.replace_range(len - 1..len, &replacement.to_string());

        let result = decode_address(&encoded);
        assert!(matches!(result, Err(AddressError::Bech32Error(_))));
    }

    #[test]
    fn test_is_valid_address() {
        let id = IdentityId([0x12; 32]);
        let addr = encode_address(&id);
        assert!(is_valid_address(&addr));
        assert!(!is_valid_address("invalid"));
        assert!(!is_valid_address("cs1invalid"));
    }

    #[test]
    fn test_address_version() {
        let id = IdentityId([0x00; 32]);
        let addr = encode_address(&id);
        assert_eq!(address_version(&addr).unwrap(), 0);
    }

    #[test]
    fn test_different_ids_different_addresses() {
        let id1 = IdentityId([0x00; 32]);
        let id2 = IdentityId([0x01; 32]);
        let addr1 = encode_address(&id1);
        let addr2 = encode_address(&id2);
        assert_ne!(addr1, addr2);
    }

    #[test]
    fn test_zero_id_address() {
        let id = IdentityId([0u8; 32]);
        let addr = encode_address(&id);
        let decoded = decode_address(&addr).unwrap();
        assert_eq!(id, decoded);
    }
}
