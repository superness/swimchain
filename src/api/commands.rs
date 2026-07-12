//! Command handler for write operations
//!
//! Provides methods for creating posts, replies, and other write operations.
//! All write operations require proof-of-work to be computed.

use crate::api::error::ApiError;
use crate::content::{ContentFormat, ContentFormatValidator, MAX_IMAGE_SIZE, MAX_TEXT_LENGTH};
use crate::crypto::action_pow::{
    compute_pow, compute_pow_cancellable, difficulty, ActionType, ForkPoWConfig, PoWChallenge,
};
use crate::crypto::{current_timestamp, sha256};
use crate::identity::PortableIdentity;
use crate::types::content::{ContentId, SpaceId};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Callback for PoW progress reporting
///
/// Arguments: (nonces_tried: u64, elapsed_ms: u64)
/// Returns: true to continue, false to cancel
pub type PowProgressCallback = Box<dyn Fn(u64, u64) -> bool + Send>;

/// Result of a PoW operation
#[derive(Debug, Clone)]
pub struct PowResult<T> {
    /// The result of the operation (e.g., ContentId)
    pub result: T,
    /// The nonce that solved the PoW
    pub nonce: u64,
    /// The difficulty level that was met
    pub difficulty: u8,
    /// Time taken in milliseconds
    pub elapsed_ms: u64,
}

/// Handler for command (write) operations
pub struct CommandHandler {
    identity: Option<PortableIdentity>,
    pow_config: ForkPoWConfig,
}

impl Default for CommandHandler {
    fn default() -> Self {
        Self::new()
    }
}

impl CommandHandler {
    /// Create a new command handler with default PoW configuration
    #[must_use]
    pub fn new() -> Self {
        Self {
            identity: None,
            pow_config: ForkPoWConfig::default(),
        }
    }

    /// Create a command handler with test configuration for faster PoW
    #[must_use]
    pub fn with_test_config() -> Self {
        Self {
            identity: None,
            pow_config: ForkPoWConfig::test(),
        }
    }

    /// Set the identity for signing operations
    pub fn set_identity(&mut self, identity: PortableIdentity) {
        self.identity = Some(identity);
    }

    /// Clear the current identity
    pub fn clear_identity(&mut self) {
        self.identity = None;
    }

    /// Check if an identity is set
    #[must_use]
    pub fn has_identity(&self) -> bool {
        self.identity.is_some()
    }

    /// Get the public key bytes of the current identity
    #[must_use]
    pub fn public_key(&self) -> Option<[u8; 32]> {
        self.identity.as_ref().map(|id| id.public_key)
    }

    /// Create a new post with PoW
    ///
    /// Computes the proof-of-work for post creation and returns the resulting
    /// ContentId along with PoW statistics.
    ///
    /// # Arguments
    ///
    /// * `space_id` - The space to post in
    /// * `body` - The post body text
    /// * `progress` - Optional callback for progress updates
    ///
    /// # Errors
    ///
    /// Returns `ApiError::NoIdentity` if no identity is set.
    /// Returns `ApiError::PowCancelled` if the callback returns false.
    /// Returns `ApiError::PowFailed` if PoW computation fails.
    pub fn create_post(
        &self,
        space_id: SpaceId,
        body: &str,
        progress: Option<PowProgressCallback>,
    ) -> Result<PowResult<ContentId>, ApiError> {
        let identity = self.identity.as_ref().ok_or(ApiError::NoIdentity)?;

        let content_hash = sha256(body.as_bytes());
        let timestamp = current_timestamp();
        let author_bytes = identity.public_key;

        let challenge = PoWChallenge {
            action_type: ActionType::Post,
            content_hash,
            author_id: author_bytes,
            timestamp,
            difficulty: difficulty::POST,
            nonce_space: rand::random(),
        };

        let start = std::time::Instant::now();

        let solution = self.compute_pow_with_optional_callback(&challenge, progress)?;
        let elapsed_ms = start.elapsed().as_millis() as u64;

        // ContentId = sha256(space_id || author_id || content_hash || nonce)
        let content_id = self.derive_content_id(
            space_id.as_bytes(),
            &author_bytes,
            &content_hash,
            solution.nonce,
        );

        Ok(PowResult {
            result: content_id,
            nonce: solution.nonce,
            difficulty: difficulty::POST,
            elapsed_ms,
        })
    }

    /// Create a reply with PoW
    ///
    /// Computes the proof-of-work for reply creation and returns the resulting
    /// ContentId along with PoW statistics.
    ///
    /// # Arguments
    ///
    /// * `parent_id` - The content being replied to
    /// * `body` - The reply body text
    /// * `progress` - Optional callback for progress updates
    ///
    /// # Errors
    ///
    /// Returns `ApiError::NoIdentity` if no identity is set.
    /// Returns `ApiError::PowCancelled` if the callback returns false.
    /// Returns `ApiError::PowFailed` if PoW computation fails.
    pub fn create_reply(
        &self,
        parent_id: ContentId,
        body: &str,
        progress: Option<PowProgressCallback>,
    ) -> Result<PowResult<ContentId>, ApiError> {
        let identity = self.identity.as_ref().ok_or(ApiError::NoIdentity)?;

        // Include parent_id in content hash for uniqueness
        let mut content_bytes = parent_id.as_bytes().to_vec();
        content_bytes.extend_from_slice(body.as_bytes());
        let content_hash = sha256(&content_bytes);
        let timestamp = current_timestamp();
        let author_bytes = identity.public_key;

        let challenge = PoWChallenge {
            action_type: ActionType::Reply,
            content_hash,
            author_id: author_bytes,
            timestamp,
            difficulty: difficulty::REPLY,
            nonce_space: rand::random(),
        };

        let start = std::time::Instant::now();

        let solution = self.compute_pow_with_optional_callback(&challenge, progress)?;
        let elapsed_ms = start.elapsed().as_millis() as u64;

        // ContentId for reply includes parent
        let content_id = self.derive_content_id(
            parent_id.as_bytes(),
            &author_bytes,
            &content_hash,
            solution.nonce,
        );

        Ok(PowResult {
            result: content_id,
            nonce: solution.nonce,
            difficulty: difficulty::REPLY,
            elapsed_ms,
        })
    }

    /// Compute PoW with optional progress callback
    ///
    /// The callback can return `false` to request cancellation. When false is
    /// returned, the PoW computation will stop at the next check interval and
    /// return `ApiError::PowCancelled`.
    fn compute_pow_with_optional_callback(
        &self,
        challenge: &PoWChallenge,
        progress: Option<PowProgressCallback>,
    ) -> Result<crate::crypto::PoWSolution, ApiError> {
        match progress {
            Some(callback) => {
                let start = std::time::Instant::now();
                // Use atomic flag to track cancellation request from callback
                let cancelled = Arc::new(AtomicBool::new(false));
                let cancelled_check = Arc::clone(&cancelled);

                compute_pow_cancellable(
                    challenge,
                    &self.pow_config,
                    |nonces| {
                        let elapsed_ms = start.elapsed().as_millis() as u64;
                        if !callback(nonces, elapsed_ms) {
                            // Callback returned false - user wants to cancel
                            cancelled.store(true, Ordering::SeqCst);
                        }
                    },
                    move || cancelled_check.load(Ordering::SeqCst),
                )
                .map_err(|e| {
                    if matches!(e, crate::types::error::ActionPowError::Cancelled) {
                        ApiError::PowCancelled
                    } else {
                        ApiError::PowFailed(e.to_string())
                    }
                })
            }
            None => compute_pow(challenge, &self.pow_config)
                .map_err(|e| ApiError::PowFailed(e.to_string())),
        }
    }

    /// Derive ContentId from components
    fn derive_content_id(
        &self,
        prefix: &[u8; 32],
        author_id: &[u8; 32],
        content_hash: &[u8; 32],
        nonce: u64,
    ) -> ContentId {
        let mut preimage = Vec::with_capacity(32 + 32 + 32 + 8);
        preimage.extend_from_slice(prefix);
        preimage.extend_from_slice(author_id);
        preimage.extend_from_slice(content_hash);
        preimage.extend_from_slice(&nonce.to_le_bytes());
        ContentId::from_bytes(sha256(&preimage))
    }

    // === Content Format Validation (SPEC_12 §3.1) ===

    /// Validate content format before posting.
    ///
    /// This enforces SPEC_12 content type restrictions:
    /// - Video is always rejected
    /// - Text/Link/Mention/Image allowed for all (PoW-gated)
    ///
    /// # Arguments
    ///
    /// * `format` - The content format type
    /// * `content_bytes` - Optional raw content bytes for size validation
    /// * `width` - Optional image width in pixels
    /// * `height` - Optional image height in pixels
    /// * `mime_type` - Optional MIME type string
    /// * `extension` - Optional file extension
    ///
    /// # Errors
    ///
    /// Returns `ApiError::ContentFormatError` with specific error details.
    pub fn validate_content_format(
        &self,
        format: ContentFormat,
        content_bytes: Option<&[u8]>,
        width: Option<u32>,
        height: Option<u32>,
        mime_type: Option<&str>,
        extension: Option<&str>,
    ) -> Result<(), ApiError> {
        ContentFormatValidator::validate_for_posting(
            format,
            content_bytes,
            width,
            height,
            mime_type,
            extension,
        )
        .map_err(ApiError::ContentFormat)
    }

    /// Check if video content is being attempted.
    ///
    /// Video is explicitly prohibited at the protocol level per SPEC_12 §2.1.8.
    /// This is a convenience method for quick video detection.
    #[must_use]
    pub fn is_video_content(mime_type: Option<&str>, extension: Option<&str>) -> bool {
        ContentFormatValidator::is_video_content(mime_type, extension)
    }

    /// Create a text post with content format validation.
    ///
    /// This is a convenience wrapper that validates the text format before
    /// computing PoW.
    ///
    /// # Arguments
    ///
    /// * `space_id` - The space to post in
    /// * `body` - The post body text
    /// * `progress` - Optional callback for progress updates
    ///
    /// # Errors
    ///
    /// Returns `ApiError::ContentFormat` if text validation fails.
    /// Returns other errors as documented in `create_post`.
    pub fn create_text_post(
        &self,
        space_id: SpaceId,
        body: &str,
        progress: Option<PowProgressCallback>,
    ) -> Result<PowResult<ContentId>, ApiError> {
        // Validate text format
        self.validate_content_format(
            ContentFormat::Text,
            Some(body.as_bytes()),
            None,
            None,
            Some("text/plain"),
            None,
        )?;

        // Proceed with normal post creation
        self.create_post(space_id, body, progress)
    }

    /// Create an image post with content format validation.
    ///
    /// This validates:
    /// - Image size <= 500KB (SPEC_12 §3.1)
    /// - Image dimensions <= 2048px (SPEC_12 §3.1)
    /// - Image format is jpeg/png/webp (SPEC_12 §3.1)
    ///
    /// # Arguments
    ///
    /// * `space_id` - The space to post in
    /// * `image_data` - Raw image bytes
    /// * `width` - Image width in pixels
    /// * `height` - Image height in pixels
    /// * `format` - Image format (jpeg/png/webp)
    /// * `caption` - Optional text caption
    /// * `progress` - Optional callback for progress updates
    ///
    /// # Errors
    ///
    /// Returns `ApiError::ContentFormat(ImageTooLarge)` if > 500KB.
    /// Returns `ApiError::ContentFormat(ImageDimensionTooLarge)` if dimension > 2048.
    /// Returns `ApiError::ContentFormat(ImageFormatNotAllowed)` for unsupported formats.
    pub fn create_image_post(
        &self,
        space_id: SpaceId,
        image_data: &[u8],
        width: u32,
        height: u32,
        format: &str,
        caption: Option<&str>,
        progress: Option<PowProgressCallback>,
    ) -> Result<PowResult<ContentId>, ApiError> {
        // Validate image format (includes level check)
        self.validate_content_format(
            ContentFormat::Image,
            Some(image_data),
            Some(width),
            Some(height),
            None,
            Some(format),
        )?;

        // For PoW, we use the image hash + caption as the body
        let mut content_for_pow = sha256(image_data).to_vec();
        if let Some(cap) = caption {
            content_for_pow.extend_from_slice(cap.as_bytes());
        }

        // Hash the combined content for PoW
        let body = hex::encode(&content_for_pow);
        self.create_post(space_id, &body, progress)
    }

    /// Get the maximum allowed text length.
    #[must_use]
    pub const fn max_text_length() -> usize {
        MAX_TEXT_LENGTH
    }

    /// Get the maximum allowed image size in bytes.
    #[must_use]
    pub const fn max_image_size() -> usize {
        MAX_IMAGE_SIZE
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::{create_identity_with_difficulty, export_identity};

    fn create_test_identity() -> PortableIdentity {
        let (keypair, proof) = create_identity_with_difficulty(4);
        export_identity(&keypair, Some(&proof), "test-password").unwrap()
    }

    #[test]
    fn test_create_post_no_identity() {
        let handler = CommandHandler::with_test_config();
        let space = SpaceId::from_bytes([1u8; 32]);

        let result = handler.create_post(space, "test post", None);
        assert!(matches!(result, Err(ApiError::NoIdentity)));
    }

    #[test]
    fn test_create_reply_no_identity() {
        let handler = CommandHandler::with_test_config();
        let parent = ContentId::from_bytes([1u8; 32]);

        let result = handler.create_reply(parent, "test reply", None);
        assert!(matches!(result, Err(ApiError::NoIdentity)));
    }

    #[test]
    fn test_has_identity() {
        let mut handler = CommandHandler::new();
        assert!(!handler.has_identity());

        handler.set_identity(create_test_identity());
        assert!(handler.has_identity());

        handler.clear_identity();
        assert!(!handler.has_identity());
    }

    #[test]
    fn test_create_post_with_test_config() {
        // This test uses the test PoW config which should be fast
        let mut handler = CommandHandler::with_test_config();
        handler.set_identity(create_test_identity());

        let space = SpaceId::from_bytes([1u8; 32]);
        let result = handler.create_post(space, "Hello, world!", None);

        // With test config, this should complete quickly
        assert!(result.is_ok());
        let pow_result = result.unwrap();
        assert_eq!(pow_result.difficulty, difficulty::POST);
        assert!(pow_result.elapsed_ms < 60_000); // Should complete in under 1 minute
    }

    #[test]
    fn test_create_reply_with_test_config() {
        let mut handler = CommandHandler::with_test_config();
        handler.set_identity(create_test_identity());

        let parent = ContentId::from_bytes([1u8; 32]);
        let result = handler.create_reply(parent, "This is a reply", None);

        assert!(result.is_ok());
        let pow_result = result.unwrap();
        assert_eq!(pow_result.difficulty, difficulty::REPLY);
    }

    #[test]
    fn test_different_content_produces_different_ids() {
        let mut handler = CommandHandler::with_test_config();
        handler.set_identity(create_test_identity());

        let space = SpaceId::from_bytes([1u8; 32]);

        let result1 = handler.create_post(space, "First post", None).unwrap();
        let result2 = handler.create_post(space, "Second post", None).unwrap();

        // Different content should produce different content IDs
        assert_ne!(result1.result, result2.result);
    }

    #[test]
    fn test_public_key_retrieval() {
        let mut handler = CommandHandler::new();
        assert!(handler.public_key().is_none());

        let identity = create_test_identity();
        let expected_pubkey = identity.public_key;
        handler.set_identity(identity);

        let pubkey = handler.public_key();
        assert!(pubkey.is_some());
        assert_eq!(pubkey.unwrap(), expected_pubkey);
    }
}
