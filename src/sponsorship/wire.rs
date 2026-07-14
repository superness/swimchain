//! Wire protocol serialization for sponsorship offers
//!
//! Implements binary serialization/deserialization for sponsorship offer
//! messages per SPEC_11 §5.2.
//!
//! # Wire Format
//!
//! ## SPONSORSHIP_OFFER (0x49)
//! ```text
//! sponsor(32) + offer_id(16) + created_at(8 LE) + expires_at(8 LE) +
//! max_sponsees(1) + offer_type(1) + requirements_len(2 LE) +
//! requirements(var, bincode) + signature(64) + [auto_approve(1)]
//! ```
//!
//! The trailing `auto_approve` byte is optional for backwards compatibility:
//! offers serialized by older nodes omit it (interpreted as false), and older
//! nodes ignore the trailing byte when deserializing newer offers.
//!
//! ## SPONSORSHIP_OFFER_CLAIM (0x4A)
//! ```text
//! offer_id(16) + claimant(32) + claimed_at(8 LE) +
//! pow_proof(bincode) + application_len(2 LE) + application(var) +
//! attestation_sig(65: 1 has_sig + 64 sig) + claimant_signature(64)
//! ```

use std::fmt;

use crate::sponsorship::types::{
    PublicSponsorshipOffer, SponsorshipClaim, SponsorshipOfferType, SponsorshipRequirements,
};
use crate::types::identity::{IdentityCreationProof, PublicKey, Signature};

/// Minimum wire size for SPONSORSHIP_OFFER message
/// sponsor(32) + offer_id(16) + created_at(8) + expires_at(8) +
/// max_sponsees(1) + offer_type(1) + requirements_len(2) + signature(64) = 132
pub const MIN_OFFER_WIRE_SIZE: usize = 132;

/// Maximum requirements bincode size
pub const MAX_REQUIREMENTS_SIZE: usize = 128;

/// Maximum application text size in wire format
pub const MAX_APPLICATION_WIRE_SIZE: usize = 2000;

/// Wire protocol errors
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WireError {
    /// Buffer is too short
    BufferTooShort { expected: usize, actual: usize },
    /// Invalid offer type byte
    InvalidOfferType(u8),
    /// Invalid UTF-8 in application text
    InvalidUtf8,
    /// Bincode deserialization failed
    BincodeError(String),
    /// Requirements too large
    RequirementsTooLarge { max: usize, actual: usize },
    /// Application too large
    ApplicationTooLarge { max: usize, actual: usize },
}

impl fmt::Display for WireError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BufferTooShort { expected, actual } => {
                write!(
                    f,
                    "buffer too short: need {} bytes, got {}",
                    expected, actual
                )
            }
            Self::InvalidOfferType(v) => write!(f, "invalid offer type: {}", v),
            Self::InvalidUtf8 => write!(f, "invalid UTF-8 in application text"),
            Self::BincodeError(e) => write!(f, "bincode error: {}", e),
            Self::RequirementsTooLarge { max, actual } => {
                write!(f, "requirements too large: {} bytes, max {}", actual, max)
            }
            Self::ApplicationTooLarge { max, actual } => {
                write!(f, "application too large: {} bytes, max {}", actual, max)
            }
        }
    }
}

impl std::error::Error for WireError {}

// === Offer Serialization ===

/// Serialize a sponsorship offer for wire transmission
///
/// Wire format:
/// - sponsor(32): Ed25519 public key
/// - offer_id(16): Unique offer identifier
/// - created_at(8 LE): Creation timestamp
/// - expires_at(8 LE): Expiration timestamp
/// - max_sponsees(1): Maximum claimants
/// - offer_type(1): Offer type enum
/// - requirements_len(2 LE): Length of requirements blob
/// - requirements(var): Bincode-serialized requirements
/// - signature(64): Ed25519 signature
/// - auto_approve(1): 1 if claims auto-approve (trailing, optional on read)
pub fn serialize_offer(offer: &PublicSponsorshipOffer) -> Result<Vec<u8>, WireError> {
    let requirements_bytes = bincode::serialize(&offer.requirements)
        .map_err(|e| WireError::BincodeError(e.to_string()))?;

    if requirements_bytes.len() > MAX_REQUIREMENTS_SIZE {
        return Err(WireError::RequirementsTooLarge {
            max: MAX_REQUIREMENTS_SIZE,
            actual: requirements_bytes.len(),
        });
    }

    let mut buf = Vec::with_capacity(MIN_OFFER_WIRE_SIZE + requirements_bytes.len());

    buf.extend_from_slice(offer.sponsor.as_bytes()); // 32
    buf.extend_from_slice(&offer.offer_id); // 16
    buf.extend_from_slice(&offer.created_at.to_le_bytes()); // 8 LE
    buf.extend_from_slice(&offer.expires_at.to_le_bytes()); // 8 LE
    buf.push(offer.max_sponsees); // 1
    buf.push(offer.offer_type as u8); // 1
    buf.extend_from_slice(&(requirements_bytes.len() as u16).to_le_bytes()); // 2 LE
    buf.extend_from_slice(&requirements_bytes); // var
    buf.extend_from_slice(offer.signature.as_bytes()); // 64
    buf.push(if offer.auto_approve { 1 } else { 0 }); // 1 (trailing, optional)

    Ok(buf)
}

/// Deserialize a sponsorship offer from wire format
pub fn deserialize_offer(data: &[u8]) -> Result<PublicSponsorshipOffer, WireError> {
    if data.len() < MIN_OFFER_WIRE_SIZE {
        return Err(WireError::BufferTooShort {
            expected: MIN_OFFER_WIRE_SIZE,
            actual: data.len(),
        });
    }

    let mut pos = 0;

    // sponsor(32)
    let sponsor = PublicKey::from_bytes(data[pos..pos + 32].try_into().expect("slice is 32 bytes"));
    pos += 32;

    // offer_id(16)
    let offer_id: [u8; 16] = data[pos..pos + 16].try_into().expect("slice is 16 bytes");
    pos += 16;

    // created_at(8 LE)
    let created_at = u64::from_le_bytes(data[pos..pos + 8].try_into().expect("slice is 8 bytes"));
    pos += 8;

    // expires_at(8 LE)
    let expires_at = u64::from_le_bytes(data[pos..pos + 8].try_into().expect("slice is 8 bytes"));
    pos += 8;

    // max_sponsees(1)
    let max_sponsees = data[pos];
    pos += 1;

    // offer_type(1)
    let offer_type = SponsorshipOfferType::try_from(data[pos])
        .map_err(|_| WireError::InvalidOfferType(data[pos]))?;
    pos += 1;

    // requirements_len(2 LE)
    let requirements_len =
        u16::from_le_bytes(data[pos..pos + 2].try_into().expect("slice is 2 bytes")) as usize;
    pos += 2;

    // Check we have enough data
    let remaining_needed = requirements_len + 64; // requirements + signature
    if data.len() < pos + remaining_needed {
        return Err(WireError::BufferTooShort {
            expected: pos + remaining_needed,
            actual: data.len(),
        });
    }

    // requirements(var)
    let requirements: SponsorshipRequirements =
        bincode::deserialize(&data[pos..pos + requirements_len])
            .map_err(|e| WireError::BincodeError(e.to_string()))?;
    pos += requirements_len;

    // signature(64)
    let signature =
        Signature::from_bytes(data[pos..pos + 64].try_into().expect("slice is 64 bytes"));
    pos += 64;

    // auto_approve(1) — optional trailing byte for backwards compatibility
    let auto_approve = data.get(pos).is_some_and(|&b| b == 1);

    Ok(PublicSponsorshipOffer {
        sponsor,
        offer_id,
        created_at,
        expires_at,
        max_sponsees,
        offer_type,
        requirements,
        signature,
        auto_approve,
    })
}

// === Claim Serialization ===

/// Serialize a sponsorship claim for wire transmission
///
/// Wire format:
/// - offer_id(16): Offer identifier
/// - claimant(32): Claimant's public key
/// - claimed_at(8 LE): Claim timestamp
/// - pow_proof_len(2 LE): Length of PoW proof
/// - pow_proof(var): Bincode-serialized PoW proof
/// - application_len(2 LE): Length of application text (0 if none)
/// - application(var): UTF-8 application text
/// - has_attestation(1): 1 if attestation signature present
/// - attestation_sig(64): Attestation signature (if has_attestation)
/// - claimant_signature(64): Claimant's signature
pub fn serialize_claim(claim: &SponsorshipClaim) -> Result<Vec<u8>, WireError> {
    let pow_proof_bytes = bincode::serialize(&claim.identity_pow_proof)
        .map_err(|e| WireError::BincodeError(e.to_string()))?;

    let application_bytes = claim.application_text.as_deref().unwrap_or("").as_bytes();
    if application_bytes.len() > MAX_APPLICATION_WIRE_SIZE {
        return Err(WireError::ApplicationTooLarge {
            max: MAX_APPLICATION_WIRE_SIZE,
            actual: application_bytes.len(),
        });
    }

    let attestation_size = if claim.attestation_signature.is_some() {
        65
    } else {
        1
    };
    let buf_size = 16
        + 32
        + 8
        + 2
        + pow_proof_bytes.len()
        + 2
        + application_bytes.len()
        + attestation_size
        + 64;

    let mut buf = Vec::with_capacity(buf_size);

    buf.extend_from_slice(&claim.offer_id); // 16
    buf.extend_from_slice(claim.claimant.as_bytes()); // 32
    buf.extend_from_slice(&claim.claimed_at.to_le_bytes()); // 8 LE
    buf.extend_from_slice(&(pow_proof_bytes.len() as u16).to_le_bytes()); // 2 LE
    buf.extend_from_slice(&pow_proof_bytes); // var
    buf.extend_from_slice(&(application_bytes.len() as u16).to_le_bytes()); // 2 LE
    buf.extend_from_slice(application_bytes); // var

    // Attestation signature (optional)
    if let Some(sig) = &claim.attestation_signature {
        buf.push(1); // has attestation
        buf.extend_from_slice(sig.as_bytes()); // 64
    } else {
        buf.push(0); // no attestation
    }

    buf.extend_from_slice(claim.claimant_signature.as_bytes()); // 64

    Ok(buf)
}

/// Deserialize a sponsorship claim from wire format
pub fn deserialize_claim(data: &[u8]) -> Result<SponsorshipClaim, WireError> {
    // Minimum: offer_id(16) + claimant(32) + claimed_at(8) + pow_len(2) + app_len(2) + has_att(1) + sig(64)
    const MIN_CLAIM_SIZE: usize = 125;

    if data.len() < MIN_CLAIM_SIZE {
        return Err(WireError::BufferTooShort {
            expected: MIN_CLAIM_SIZE,
            actual: data.len(),
        });
    }

    let mut pos = 0;

    // offer_id(16)
    let offer_id: [u8; 16] = data[pos..pos + 16].try_into().expect("slice is 16 bytes");
    pos += 16;

    // claimant(32)
    let claimant =
        PublicKey::from_bytes(data[pos..pos + 32].try_into().expect("slice is 32 bytes"));
    pos += 32;

    // claimed_at(8 LE)
    let claimed_at = u64::from_le_bytes(data[pos..pos + 8].try_into().expect("slice is 8 bytes"));
    pos += 8;

    // pow_proof_len(2 LE)
    let pow_proof_len =
        u16::from_le_bytes(data[pos..pos + 2].try_into().expect("slice is 2 bytes")) as usize;
    pos += 2;

    // Check remaining data
    if data.len() < pos + pow_proof_len {
        return Err(WireError::BufferTooShort {
            expected: pos + pow_proof_len,
            actual: data.len(),
        });
    }

    // pow_proof(var)
    let identity_pow_proof: IdentityCreationProof =
        bincode::deserialize(&data[pos..pos + pow_proof_len])
            .map_err(|e| WireError::BincodeError(e.to_string()))?;
    pos += pow_proof_len;

    // application_len(2 LE)
    if data.len() < pos + 2 {
        return Err(WireError::BufferTooShort {
            expected: pos + 2,
            actual: data.len(),
        });
    }
    let application_len =
        u16::from_le_bytes(data[pos..pos + 2].try_into().expect("slice is 2 bytes")) as usize;
    pos += 2;

    // Check remaining data
    if data.len() < pos + application_len {
        return Err(WireError::BufferTooShort {
            expected: pos + application_len,
            actual: data.len(),
        });
    }

    // application(var)
    let application_text = if application_len > 0 {
        let text = std::str::from_utf8(&data[pos..pos + application_len])
            .map_err(|_| WireError::InvalidUtf8)?;
        Some(text.to_string())
    } else {
        None
    };
    pos += application_len;

    // has_attestation(1)
    if data.len() < pos + 1 {
        return Err(WireError::BufferTooShort {
            expected: pos + 1,
            actual: data.len(),
        });
    }
    let has_attestation = data[pos] == 1;
    pos += 1;

    // attestation_sig (optional)
    let attestation_signature = if has_attestation {
        if data.len() < pos + 64 {
            return Err(WireError::BufferTooShort {
                expected: pos + 64,
                actual: data.len(),
            });
        }
        let sig = Signature::from_bytes(data[pos..pos + 64].try_into().expect("slice is 64 bytes"));
        pos += 64;
        Some(sig)
    } else {
        None
    };

    // claimant_signature(64)
    if data.len() < pos + 64 {
        return Err(WireError::BufferTooShort {
            expected: pos + 64,
            actual: data.len(),
        });
    }
    let claimant_signature =
        Signature::from_bytes(data[pos..pos + 64].try_into().expect("slice is 64 bytes"));

    Ok(SponsorshipClaim {
        offer_id,
        claimant,
        claimed_at,
        identity_pow_proof,
        pow_nonce_space: [0u8; 32],
        application_text,
        attestation_signature,
        claimant_signature,
        sponsor_approval: None, // Not transmitted in claim message
    })
}

// === Claim Response Serialization ===

/// Claim response type
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaimResponseType {
    /// Claim approved
    Approved = 0,
    /// Claim rejected
    Rejected = 1,
}

impl TryFrom<u8> for ClaimResponseType {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Approved),
            1 => Ok(Self::Rejected),
            _ => Err(()),
        }
    }
}

/// Claim response for wire transmission
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaimResponse {
    /// Offer ID
    pub offer_id: [u8; 16],
    /// Claimant's public key
    pub claimant: PublicKey,
    /// Response type (approve/reject)
    pub response_type: ClaimResponseType,
    /// Approval signature (only present if approved)
    pub approval_signature: Option<Signature>,
}

/// Serialize a claim response for wire transmission
///
/// Wire format:
/// - offer_id(16): Offer identifier
/// - claimant(32): Claimant's public key
/// - response_type(1): 0=approved, 1=rejected
/// - approval_signature(64): Present only if approved
pub fn serialize_claim_response(response: &ClaimResponse) -> Vec<u8> {
    let buf_size = if response.response_type == ClaimResponseType::Approved {
        16 + 32 + 1 + 64
    } else {
        16 + 32 + 1
    };

    let mut buf = Vec::with_capacity(buf_size);

    buf.extend_from_slice(&response.offer_id); // 16
    buf.extend_from_slice(response.claimant.as_bytes()); // 32
    buf.push(response.response_type as u8); // 1

    if let Some(sig) = &response.approval_signature {
        buf.extend_from_slice(sig.as_bytes()); // 64
    }

    buf
}

/// Deserialize a claim response from wire format
pub fn deserialize_claim_response(data: &[u8]) -> Result<ClaimResponse, WireError> {
    const MIN_RESPONSE_SIZE: usize = 49; // 16 + 32 + 1

    if data.len() < MIN_RESPONSE_SIZE {
        return Err(WireError::BufferTooShort {
            expected: MIN_RESPONSE_SIZE,
            actual: data.len(),
        });
    }

    let mut pos = 0;

    // offer_id(16)
    let offer_id: [u8; 16] = data[pos..pos + 16].try_into().expect("slice is 16 bytes");
    pos += 16;

    // claimant(32)
    let claimant =
        PublicKey::from_bytes(data[pos..pos + 32].try_into().expect("slice is 32 bytes"));
    pos += 32;

    // response_type(1)
    let response_type = ClaimResponseType::try_from(data[pos])
        .map_err(|_| WireError::InvalidOfferType(data[pos]))?;
    pos += 1;

    // approval_signature (optional, only if approved)
    let approval_signature = if response_type == ClaimResponseType::Approved {
        if data.len() < pos + 64 {
            return Err(WireError::BufferTooShort {
                expected: pos + 64,
                actual: data.len(),
            });
        }
        Some(Signature::from_bytes(
            data[pos..pos + 64].try_into().expect("slice is 64 bytes"),
        ))
    } else {
        None
    };

    Ok(ClaimResponse {
        offer_id,
        claimant,
        response_type,
        approval_signature,
    })
}

/// A signed offer-cancellation announcement (SponsorshipOfferCancel, 0x4E).
///
/// Wire: offer_id(16) || sponsor(32) || timestamp(8 BE) || signature(64) = 120 bytes.
/// The signature is over `offer_id(16) || timestamp(8 BE)` — the exact message
/// `cancel_sponsorship_offer` already produces — so any peer can verify the
/// canceller owns the offer without holding extra state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfferCancel {
    pub offer_id: [u8; 16],
    pub sponsor: [u8; 32],
    pub timestamp: u64,
    pub signature: [u8; 64],
}

impl OfferCancel {
    pub const WIRE_LEN: usize = 16 + 32 + 8 + 64;

    /// The message the signature covers: offer_id(16) || timestamp(8 BE).
    #[must_use]
    pub fn signing_message(&self) -> Vec<u8> {
        let mut m = Vec::with_capacity(24);
        m.extend_from_slice(&self.offer_id);
        m.extend_from_slice(&self.timestamp.to_be_bytes());
        m
    }
}

/// Serialize an offer cancellation to its 120-byte wire form.
#[must_use]
pub fn serialize_offer_cancel(c: &OfferCancel) -> Vec<u8> {
    let mut buf = Vec::with_capacity(OfferCancel::WIRE_LEN);
    buf.extend_from_slice(&c.offer_id);
    buf.extend_from_slice(&c.sponsor);
    buf.extend_from_slice(&c.timestamp.to_be_bytes());
    buf.extend_from_slice(&c.signature);
    buf
}

/// Deserialize an offer cancellation from its wire form.
///
/// # Errors
/// `BufferTooShort` if fewer than 120 bytes.
pub fn deserialize_offer_cancel(data: &[u8]) -> Result<OfferCancel, WireError> {
    if data.len() < OfferCancel::WIRE_LEN {
        return Err(WireError::BufferTooShort {
            expected: OfferCancel::WIRE_LEN,
            actual: data.len(),
        });
    }
    let mut offer_id = [0u8; 16];
    offer_id.copy_from_slice(&data[0..16]);
    let mut sponsor = [0u8; 32];
    sponsor.copy_from_slice(&data[16..48]);
    let timestamp = u64::from_be_bytes(data[48..56].try_into().unwrap());
    let mut signature = [0u8; 64];
    signature.copy_from_slice(&data[56..120]);
    Ok(OfferCancel {
        offer_id,
        sponsor,
        timestamp,
        signature,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_offer() -> PublicSponsorshipOffer {
        PublicSponsorshipOffer {
            sponsor: PublicKey::from_bytes([1u8; 32]),
            offer_id: [2u8; 16],
            created_at: 1735689600,
            expires_at: 1738281600,
            max_sponsees: 5,
            offer_type: SponsorshipOfferType::Probationary,
            requirements: SponsorshipRequirements {
                min_pow_difficulty: 15,
                required_attester: Some(PublicKey::from_bytes([3u8; 32])),
                application_required: true,
            },
            signature: Signature::from_bytes([4u8; 64]),
            auto_approve: false,
        }
    }

    fn make_test_claim() -> SponsorshipClaim {
        SponsorshipClaim {
            offer_id: [2u8; 16],
            claimant: PublicKey::from_bytes([5u8; 32]),
            claimed_at: 1735689600,
            identity_pow_proof: IdentityCreationProof {
                public_key: PublicKey::from_bytes([5u8; 32]),
                timestamp: 1735689600,
                nonce: 12345,
                pow_hash: [0u8; 32],
            },
            pow_nonce_space: [0u8; 32],
            application_text: Some("I want to join".to_string()),
            attestation_signature: Some(Signature::from_bytes([6u8; 64])),
            claimant_signature: Signature::from_bytes([7u8; 64]),
            sponsor_approval: None,
        }
    }

    #[test]
    fn test_offer_roundtrip() {
        let offer = make_test_offer();
        let bytes = serialize_offer(&offer).unwrap();
        let decoded = deserialize_offer(&bytes).unwrap();

        assert_eq!(offer.sponsor, decoded.sponsor);
        assert_eq!(offer.offer_id, decoded.offer_id);
        assert_eq!(offer.created_at, decoded.created_at);
        assert_eq!(offer.expires_at, decoded.expires_at);
        assert_eq!(offer.max_sponsees, decoded.max_sponsees);
        assert_eq!(offer.offer_type, decoded.offer_type);
        assert_eq!(offer.requirements, decoded.requirements);
        assert_eq!(offer.signature, decoded.signature);
    }

    #[test]
    fn test_offer_buffer_too_short() {
        let result = deserialize_offer(&[0u8; 10]);
        assert!(matches!(result, Err(WireError::BufferTooShort { .. })));
    }

    #[test]
    fn test_offer_invalid_type() {
        let mut bytes = serialize_offer(&make_test_offer()).unwrap();
        // offer_type is at position 65 (32 + 16 + 8 + 8 + 1)
        bytes[65] = 99; // Invalid type
        let result = deserialize_offer(&bytes);
        assert!(matches!(result, Err(WireError::InvalidOfferType(99))));
    }

    #[test]
    fn test_claim_roundtrip() {
        let claim = make_test_claim();
        let bytes = serialize_claim(&claim).unwrap();
        let decoded = deserialize_claim(&bytes).unwrap();

        assert_eq!(claim.offer_id, decoded.offer_id);
        assert_eq!(claim.claimant, decoded.claimant);
        assert_eq!(claim.claimed_at, decoded.claimed_at);
        assert_eq!(claim.application_text, decoded.application_text);
        assert_eq!(claim.attestation_signature, decoded.attestation_signature);
        assert_eq!(claim.claimant_signature, decoded.claimant_signature);
        // pow_proof fields
        assert_eq!(
            claim.identity_pow_proof.public_key,
            decoded.identity_pow_proof.public_key
        );
        assert_eq!(
            claim.identity_pow_proof.nonce,
            decoded.identity_pow_proof.nonce
        );
    }

    #[test]
    fn test_claim_no_application() {
        let mut claim = make_test_claim();
        claim.application_text = None;

        let bytes = serialize_claim(&claim).unwrap();
        let decoded = deserialize_claim(&bytes).unwrap();

        assert!(decoded.application_text.is_none());
    }

    #[test]
    fn test_claim_no_attestation() {
        let mut claim = make_test_claim();
        claim.attestation_signature = None;

        let bytes = serialize_claim(&claim).unwrap();
        let decoded = deserialize_claim(&bytes).unwrap();

        assert!(decoded.attestation_signature.is_none());
    }

    #[test]
    fn test_claim_response_approved_roundtrip() {
        let response = ClaimResponse {
            offer_id: [1u8; 16],
            claimant: PublicKey::from_bytes([2u8; 32]),
            response_type: ClaimResponseType::Approved,
            approval_signature: Some(Signature::from_bytes([3u8; 64])),
        };

        let bytes = serialize_claim_response(&response);
        let decoded = deserialize_claim_response(&bytes).unwrap();

        assert_eq!(response.offer_id, decoded.offer_id);
        assert_eq!(response.claimant, decoded.claimant);
        assert_eq!(response.response_type, decoded.response_type);
        assert_eq!(response.approval_signature, decoded.approval_signature);
    }

    #[test]
    fn test_claim_response_rejected_roundtrip() {
        let response = ClaimResponse {
            offer_id: [1u8; 16],
            claimant: PublicKey::from_bytes([2u8; 32]),
            response_type: ClaimResponseType::Rejected,
            approval_signature: None,
        };

        let bytes = serialize_claim_response(&response);
        let decoded = deserialize_claim_response(&bytes).unwrap();

        assert_eq!(response.offer_id, decoded.offer_id);
        assert_eq!(response.claimant, decoded.claimant);
        assert_eq!(response.response_type, decoded.response_type);
        assert!(decoded.approval_signature.is_none());
    }

    #[test]
    fn test_offer_all_types() {
        for offer_type in [
            SponsorshipOfferType::Open,
            SponsorshipOfferType::Probationary,
            SponsorshipOfferType::Conditional,
        ] {
            let mut offer = make_test_offer();
            offer.offer_type = offer_type;

            let bytes = serialize_offer(&offer).unwrap();
            let decoded = deserialize_offer(&bytes).unwrap();

            assert_eq!(offer.offer_type, decoded.offer_type);
        }
    }

    #[test]
    fn test_offer_auto_approve_roundtrip() {
        let mut offer = make_test_offer();
        offer.auto_approve = true;

        let bytes = serialize_offer(&offer).unwrap();
        let decoded = deserialize_offer(&bytes).unwrap();
        assert!(decoded.auto_approve);

        offer.auto_approve = false;
        let bytes = serialize_offer(&offer).unwrap();
        let decoded = deserialize_offer(&bytes).unwrap();
        assert!(!decoded.auto_approve);
    }

    #[test]
    fn test_offer_legacy_wire_without_auto_approve_byte() {
        // Offers serialized by older nodes end at the signature; the missing
        // trailing byte must deserialize as auto_approve = false.
        let offer = make_test_offer();
        let mut bytes = serialize_offer(&offer).unwrap();
        bytes.pop(); // strip the auto_approve byte to simulate legacy format

        let decoded = deserialize_offer(&bytes).unwrap();
        assert!(!decoded.auto_approve);
        assert_eq!(decoded.signature, offer.signature);
    }

    #[test]
    fn test_offer_minimal_requirements() {
        let mut offer = make_test_offer();
        offer.requirements = SponsorshipRequirements::default();

        let bytes = serialize_offer(&offer).unwrap();
        let decoded = deserialize_offer(&bytes).unwrap();

        assert_eq!(offer.requirements, decoded.requirements);
    }

    #[test]
    fn test_offer_cancel_roundtrip() {
        let c = OfferCancel {
            offer_id: [0xAB; 16],
            sponsor: [0xCD; 32],
            timestamp: 1_784_000_000,
            signature: [0xEF; 64],
        };
        let bytes = serialize_offer_cancel(&c);
        assert_eq!(bytes.len(), OfferCancel::WIRE_LEN);
        assert_eq!(deserialize_offer_cancel(&bytes).unwrap(), c);

        // Truncated buffer is rejected.
        assert!(matches!(
            deserialize_offer_cancel(&bytes[..OfferCancel::WIRE_LEN - 1]),
            Err(WireError::BufferTooShort { .. })
        ));

        // Signing message is offer_id || timestamp(8 BE).
        let mut expected = Vec::new();
        expected.extend_from_slice(&c.offer_id);
        expected.extend_from_slice(&c.timestamp.to_be_bytes());
        assert_eq!(c.signing_message(), expected);
    }

    #[test]
    fn test_wire_error_display() {
        assert!(WireError::InvalidUtf8.to_string().contains("UTF-8"));
        assert!(WireError::InvalidOfferType(42).to_string().contains("42"));
        assert!(WireError::BufferTooShort {
            expected: 100,
            actual: 50
        }
        .to_string()
        .contains("100"));
    }
}
