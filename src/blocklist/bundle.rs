//! Signed, versioned blocklist bundles (SPEC_12, CSAM hash-seeding workstream A.3).
//!
//! A [`BlocklistBundle`] is a monotonically-versioned, Ed25519-signed set of
//! blocklist entries published by a trusted list maintainer. Nodes apply a
//! bundle only when it is signed by a configured trusted key *and* its version
//! is newer than what they already hold, so a maintainer can distribute "the
//! network's accumulated blocklist" to fresh nodes without every node importing
//! manually and without any peer being able to forge entries.
//!
//! Unlike a [`crate::blocklist::BlocklistUpdate`] (which carries community
//! attestations for a single hash), a bundle carries *no* attestations: its
//! authority derives entirely from the maintainer signature verified against
//! the node's trusted-key set. See [`BlocklistBundle::validate`].

use std::collections::HashSet;

use super::types::BlocklistReason;

/// Current bundle wire format version.
pub const BUNDLE_FORMAT_VERSION: u16 = 1;

/// Maximum entries accepted in a single bundle (memory-exhaustion guard).
pub const MAX_BUNDLE_ENTRIES: usize = 2_000_000;

/// Domain-separation tag mixed into the signed message.
const BUNDLE_SIGNING_TAG: &[u8] = b"BLOCKLIST_BUNDLE_V1";

/// Flag bit: entry carries a SHA-1 digest.
const FLAG_SHA1: u8 = 0b0000_0001;
/// Flag bit: entry carries an MD5 digest.
const FLAG_MD5: u8 = 0b0000_0010;

/// A single entry within a signed bundle.
///
/// `content_hash` (SHA-256) is the protocol content id and is always present;
/// optional SHA-1/MD5 digests let the bundle carry industry file digests for
/// local recompute-and-match at content ingest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundleEntry {
    /// SHA-256 content hash (protocol content id).
    pub content_hash: [u8; 32],
    /// Classification reason.
    pub reason: BlocklistReason,
    /// Optional SHA-1 file digest for local matching.
    pub sha1: Option<[u8; 20]>,
    /// Optional MD5 file digest for local matching.
    pub md5: Option<[u8; 16]>,
}

impl BundleEntry {
    /// Serialized size of this entry in bytes.
    fn serialized_len(&self) -> usize {
        let mut len = 32 + 1 + 1; // content_hash + reason + flags
        if self.sha1.is_some() {
            len += 20;
        }
        if self.md5.is_some() {
            len += 16;
        }
        len
    }

    fn write_into(&self, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.content_hash);
        out.push(self.reason.as_u8());
        let mut flags = 0u8;
        if self.sha1.is_some() {
            flags |= FLAG_SHA1;
        }
        if self.md5.is_some() {
            flags |= FLAG_MD5;
        }
        out.push(flags);
        if let Some(s) = &self.sha1 {
            out.extend_from_slice(s);
        }
        if let Some(m) = &self.md5 {
            out.extend_from_slice(m);
        }
    }

    /// Parse one entry from `bytes`, returning the entry and bytes consumed.
    fn read_from(bytes: &[u8]) -> Option<(Self, usize)> {
        if bytes.len() < 34 {
            return None;
        }
        let mut content_hash = [0u8; 32];
        content_hash.copy_from_slice(&bytes[0..32]);
        let reason = BlocklistReason::from_u8(bytes[32])?;
        let flags = bytes[33];
        let mut offset = 34;

        let sha1 = if flags & FLAG_SHA1 != 0 {
            if bytes.len() < offset + 20 {
                return None;
            }
            let mut s = [0u8; 20];
            s.copy_from_slice(&bytes[offset..offset + 20]);
            offset += 20;
            Some(s)
        } else {
            None
        };

        let md5 = if flags & FLAG_MD5 != 0 {
            if bytes.len() < offset + 16 {
                return None;
            }
            let mut m = [0u8; 16];
            m.copy_from_slice(&bytes[offset..offset + 16]);
            offset += 16;
            Some(m)
        } else {
            None
        };

        Some((
            Self {
                content_hash,
                reason,
                sha1,
                md5,
            },
            offset,
        ))
    }
}

/// A versioned, signed set of blocklist entries from a trusted maintainer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlocklistBundle {
    /// Wire format version.
    pub format_version: u16,
    /// Monotonic bundle version (nodes apply only strictly-newer bundles).
    pub bundle_version: u64,
    /// Unix timestamp the bundle was produced.
    pub timestamp: u64,
    /// Ed25519 public key of the maintainer that signed this bundle.
    pub maintainer: [u8; 32],
    /// Blocklist entries carried by this bundle.
    pub entries: Vec<BundleEntry>,
    /// Ed25519 signature over [`Self::signing_message`].
    pub signature: [u8; 64],
}

impl BlocklistBundle {
    /// Build an unsigned bundle (signature zeroed). Call [`Self::sign`] or set
    /// `signature` before distributing.
    pub fn new(
        bundle_version: u64,
        timestamp: u64,
        maintainer: [u8; 32],
        entries: Vec<BundleEntry>,
    ) -> Self {
        Self {
            format_version: BUNDLE_FORMAT_VERSION,
            bundle_version,
            timestamp,
            maintainer,
            entries,
            signature: [0u8; 64],
        }
    }

    /// Canonical bytes covered by the maintainer signature.
    ///
    /// Deterministic in entry order, so the signer and every verifier agree.
    pub fn signing_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(BUNDLE_SIGNING_TAG.len() + 54 + self.entries.len() * 34);
        msg.extend_from_slice(BUNDLE_SIGNING_TAG);
        msg.extend_from_slice(&self.format_version.to_le_bytes());
        msg.extend_from_slice(&self.bundle_version.to_le_bytes());
        msg.extend_from_slice(&self.timestamp.to_le_bytes());
        msg.extend_from_slice(&self.maintainer);
        msg.extend_from_slice(&(self.entries.len() as u32).to_le_bytes());
        for entry in &self.entries {
            entry.write_into(&mut msg);
        }
        msg
    }

    /// Sign this bundle with `sign_fn` (typically an Ed25519 signer bound to the
    /// maintainer secret key). Sets [`Self::signature`].
    pub fn sign<F>(&mut self, sign_fn: F)
    where
        F: FnOnce(&[u8]) -> [u8; 64],
    {
        let msg = self.signing_message();
        self.signature = sign_fn(&msg);
    }

    /// Serialize the full bundle (including signature) for network transmission.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = self.signing_message();
        bytes.extend_from_slice(&self.signature);
        bytes
    }

    /// Deserialize a bundle from wire bytes.
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let tag_len = BUNDLE_SIGNING_TAG.len();
        // tag + format(2) + version(8) + ts(8) + maintainer(32) + count(4)
        let header_len = tag_len + 2 + 8 + 8 + 32 + 4;
        if bytes.len() < header_len + 64 {
            return None;
        }
        if &bytes[0..tag_len] != BUNDLE_SIGNING_TAG {
            return None;
        }
        let mut cursor = tag_len;

        let format_version = u16::from_le_bytes(bytes[cursor..cursor + 2].try_into().ok()?);
        cursor += 2;
        let bundle_version = u64::from_le_bytes(bytes[cursor..cursor + 8].try_into().ok()?);
        cursor += 8;
        let timestamp = u64::from_le_bytes(bytes[cursor..cursor + 8].try_into().ok()?);
        cursor += 8;
        let mut maintainer = [0u8; 32];
        maintainer.copy_from_slice(&bytes[cursor..cursor + 32]);
        cursor += 32;
        let entry_count = u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().ok()?) as usize;
        cursor += 4;

        if entry_count > MAX_BUNDLE_ENTRIES {
            return None;
        }

        // Bound the pre-allocation by what the remaining bytes could possibly
        // hold (min entry size 34) so a crafted small message can't over-alloc.
        let remaining = bytes.len().saturating_sub(cursor + 64);
        let cap = entry_count.min(remaining / 34 + 1);
        let mut entries = Vec::with_capacity(cap);
        for _ in 0..entry_count {
            let (entry, consumed) = BundleEntry::read_from(&bytes[cursor..])?;
            cursor += consumed;
            entries.push(entry);
        }

        // Signature occupies the final 64 bytes.
        if bytes.len() < cursor + 64 {
            return None;
        }
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[cursor..cursor + 64]);

        Some(Self {
            format_version,
            bundle_version,
            timestamp,
            maintainer,
            entries,
            signature,
        })
    }

    /// Validate this bundle against the node's trusted-maintainer key set.
    ///
    /// Accepts only if the maintainer is in `trusted_keys` and `verify_fn`
    /// confirms the Ed25519 signature over [`Self::signing_message`]. No
    /// community attestations are required — trust is anchored entirely in the
    /// configured key set.
    pub fn validate<F>(
        &self,
        trusted_keys: &HashSet<[u8; 32]>,
        verify_fn: F,
    ) -> Result<(), BundleValidationError>
    where
        F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool,
    {
        if self.format_version != BUNDLE_FORMAT_VERSION {
            return Err(BundleValidationError::UnsupportedFormat(
                self.format_version,
            ));
        }
        if self.entries.len() > MAX_BUNDLE_ENTRIES {
            return Err(BundleValidationError::TooManyEntries(self.entries.len()));
        }
        if !trusted_keys.contains(&self.maintainer) {
            return Err(BundleValidationError::UntrustedMaintainer(self.maintainer));
        }
        let msg = self.signing_message();
        if !verify_fn(&self.maintainer, &msg, &self.signature) {
            return Err(BundleValidationError::InvalidSignature);
        }
        Ok(())
    }

    /// Total serialized size (for capacity hints / metrics).
    pub fn serialized_len(&self) -> usize {
        let entries_len: usize = self.entries.iter().map(BundleEntry::serialized_len).sum();
        BUNDLE_SIGNING_TAG.len() + 2 + 8 + 8 + 32 + 4 + entries_len + 64
    }
}

/// Errors from [`BlocklistBundle::validate`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BundleValidationError {
    /// Bundle format version is not supported by this node.
    UnsupportedFormat(u16),
    /// Bundle carries more entries than allowed.
    TooManyEntries(usize),
    /// The maintainer key is not in the node's trusted set.
    UntrustedMaintainer([u8; 32]),
    /// The Ed25519 signature did not verify.
    InvalidSignature,
}

impl std::fmt::Display for BundleValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedFormat(v) => write!(f, "unsupported bundle format version {}", v),
            Self::TooManyEntries(n) => write!(f, "bundle has too many entries ({})", n),
            Self::UntrustedMaintainer(k) => {
                write!(
                    f,
                    "bundle signed by untrusted maintainer {}",
                    hex::encode(&k[..8])
                )
            }
            Self::InvalidSignature => write!(f, "bundle signature verification failed"),
        }
    }
}

impl std::error::Error for BundleValidationError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::signature::{generate_keypair, sign, verify};
    use crate::types::identity::{PublicKey, Signature};

    fn entry(seed: u8, sha1: bool, md5: bool) -> BundleEntry {
        BundleEntry {
            content_hash: [seed; 32],
            reason: BlocklistReason::CSAM,
            sha1: if sha1 { Some([seed; 20]) } else { None },
            md5: if md5 { Some([seed; 16]) } else { None },
        }
    }

    #[test]
    fn test_bundle_roundtrip() {
        let bundle = BlocklistBundle::new(
            7,
            1_700_000_000,
            [9u8; 32],
            vec![
                entry(1, false, false),
                entry(2, true, false),
                entry(3, true, true),
            ],
        );
        let bytes = bundle.to_bytes();
        let restored = BlocklistBundle::from_bytes(&bytes).unwrap();
        assert_eq!(bundle, restored);
        assert_eq!(bytes.len(), bundle.serialized_len());
    }

    #[test]
    fn test_sign_and_validate_trusted() {
        let kp = generate_keypair();
        let pk = *kp.public_key.as_bytes();
        let mut bundle = BlocklistBundle::new(1, 1_700_000_000, pk, vec![entry(1, true, true)]);
        bundle.sign(|msg| sign(&kp.private_key, msg).0);

        let mut trusted = HashSet::new();
        trusted.insert(pk);

        let res = bundle.validate(&trusted, |pubkey, msg, sig| {
            verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        });
        assert!(res.is_ok());
    }

    #[test]
    fn test_validate_untrusted_maintainer_rejected() {
        let kp = generate_keypair();
        let pk = *kp.public_key.as_bytes();
        let mut bundle = BlocklistBundle::new(1, 1_700_000_000, pk, vec![entry(1, false, false)]);
        bundle.sign(|msg| sign(&kp.private_key, msg).0);

        // Empty trusted set → maintainer not trusted.
        let trusted = HashSet::new();
        let res = bundle.validate(&trusted, |pubkey, msg, sig| {
            verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        });
        assert!(matches!(
            res,
            Err(BundleValidationError::UntrustedMaintainer(_))
        ));
    }

    #[test]
    fn test_validate_bad_signature_rejected() {
        let kp = generate_keypair();
        let pk = *kp.public_key.as_bytes();
        let mut bundle = BlocklistBundle::new(1, 1_700_000_000, pk, vec![entry(1, false, false)]);
        bundle.sign(|msg| sign(&kp.private_key, msg).0);
        // Tamper: flip an entry after signing.
        bundle.entries[0].content_hash[0] ^= 0xff;

        let mut trusted = HashSet::new();
        trusted.insert(pk);
        let res = bundle.validate(&trusted, |pubkey, msg, sig| {
            verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        });
        assert!(matches!(res, Err(BundleValidationError::InvalidSignature)));
    }

    #[test]
    fn test_wrong_signer_rejected() {
        // Signed by attacker, but claims a trusted maintainer's pubkey.
        let maintainer = generate_keypair();
        let attacker = generate_keypair();
        let maint_pk = *maintainer.public_key.as_bytes();

        let mut bundle =
            BlocklistBundle::new(1, 1_700_000_000, maint_pk, vec![entry(1, false, false)]);
        // Sign with the attacker's key even though maintainer field is the real one.
        bundle.sign(|msg| sign(&attacker.private_key, msg).0);

        let mut trusted = HashSet::new();
        trusted.insert(maint_pk);
        let res = bundle.validate(&trusted, |pubkey, msg, sig| {
            verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        });
        assert!(matches!(res, Err(BundleValidationError::InvalidSignature)));
    }

    #[test]
    fn test_truncated_bytes_rejected() {
        let bundle = BlocklistBundle::new(1, 1, [1u8; 32], vec![entry(1, true, true)]);
        let bytes = bundle.to_bytes();
        assert!(BlocklistBundle::from_bytes(&bytes[..bytes.len() - 10]).is_none());
    }
}
