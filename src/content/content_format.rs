//! Content format types per SPEC_12 §3.1
//!
//! Defines content format types (Text, Image, Link) and validation logic
//! for the anti-abuse content type system. Video is explicitly prohibited
//! at the protocol level.
//!
//! Note: This is distinct from `types::content::ContentType` which describes
//! the action type (Post, Reply, Quote).

use serde::{Deserialize, Serialize};
use std::fmt;

// === SPEC_12 Section 3.1: Content Format Constants ===

/// Maximum text content length in bytes (10KB)
pub const MAX_TEXT_LENGTH: usize = 10_000;

/// Maximum image size in bytes (500KB)
pub const MAX_IMAGE_SIZE: usize = 500_000;

/// Maximum image dimension in pixels (width or height)
pub const MAX_IMAGE_DIMENSION: u32 = 2048;

/// Allowed image formats
pub const ALLOWED_IMAGE_FORMATS: &[&str] = &["jpeg", "jpg", "png", "webp"];

/// Content format type per SPEC_12 §3.1
///
/// Defines the format of the content body, distinct from the action type
/// (Post/Reply/Quote). Video is intentionally NOT included as it is
/// prohibited at the protocol level.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ContentFormat {
    /// Plain text content - allowed for all (PoW-gated)
    Text = 0x01,

    /// External link reference - rendered as plain text, allowed for all (PoW-gated)
    Link = 0x02,

    /// Image content - allowed for all (PoW-gated)
    Image = 0x03,

    /// Mention/reference to another identity - allowed for all (PoW-gated)
    Mention = 0x04,
}

impl ContentFormat {
    /// Convert from u8 representation.
    ///
    /// Returns None if the value is out of range or represents video (prohibited).
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0x01 => Some(Self::Text),
            0x02 => Some(Self::Link),
            0x03 => Some(Self::Image),
            0x04 => Some(Self::Mention),
            _ => None, // Video and unknown types are not allowed
        }
    }

    /// Convert to u8 representation.
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Get the human-readable name of this content format.
    pub fn name(&self) -> &'static str {
        match self {
            Self::Text => "Text",
            Self::Link => "Link",
            Self::Image => "Image",
            Self::Mention => "Mention",
        }
    }
}

impl Default for ContentFormat {
    fn default() -> Self {
        Self::Text
    }
}

impl fmt::Display for ContentFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name())
    }
}

/// Image format type for validation
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ImageFormat {
    /// JPEG image
    Jpeg = 0x01,
    /// PNG image
    Png = 0x02,
    /// WebP image
    WebP = 0x03,
}

impl ImageFormat {
    /// Parse image format from file extension or MIME type.
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "jpeg" | "jpg" => Some(Self::Jpeg),
            "png" => Some(Self::Png),
            "webp" => Some(Self::WebP),
            _ => None,
        }
    }

    /// Parse image format from MIME type.
    pub fn from_mime(mime: &str) -> Option<Self> {
        match mime.to_lowercase().as_str() {
            "image/jpeg" => Some(Self::Jpeg),
            "image/png" => Some(Self::Png),
            "image/webp" => Some(Self::WebP),
            _ => None,
        }
    }

    /// Get the MIME type for this image format.
    pub fn mime_type(&self) -> &'static str {
        match self {
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
            Self::WebP => "image/webp",
        }
    }

    /// Get the common file extension for this image format.
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Jpeg => "jpg",
            Self::Png => "png",
            Self::WebP => "webp",
        }
    }
}

/// Error type for content format validation
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentFormatError {
    /// Video content is not supported
    VideoNotSupported,

    /// Text content exceeds maximum length
    TextTooLong { size: usize, max: usize },

    /// Image size exceeds maximum
    ImageTooLarge { size: usize, max: usize },

    /// Image dimension exceeds maximum
    ImageDimensionTooLarge { width: u32, height: u32, max: u32 },

    /// Image format not allowed
    ImageFormatNotAllowed { format: String },

    /// Unknown content format
    UnknownFormat(u8),
}

impl fmt::Display for ContentFormatError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::VideoNotSupported => {
                write!(f, "Video content is not supported by the protocol")
            }
            Self::TextTooLong { size, max } => {
                write!(f, "Text content size {} exceeds maximum {}", size, max)
            }
            Self::ImageTooLarge { size, max } => {
                write!(f, "Image size {} bytes exceeds maximum {} bytes", size, max)
            }
            Self::ImageDimensionTooLarge { width, height, max } => {
                write!(
                    f,
                    "Image dimensions {}x{} exceed maximum {} pixels",
                    width, height, max
                )
            }
            Self::ImageFormatNotAllowed { format } => {
                write!(
                    f,
                    "Image format '{}' not allowed. Allowed formats: {:?}",
                    format, ALLOWED_IMAGE_FORMATS
                )
            }
            Self::UnknownFormat(val) => {
                write!(f, "Unknown content format: 0x{:02x}", val)
            }
        }
    }
}

impl std::error::Error for ContentFormatError {}

/// Validation result for content format
pub type ContentFormatResult<T> = Result<T, ContentFormatError>;

/// Content format validator
pub struct ContentFormatValidator;

impl ContentFormatValidator {
    /// Check if video content is being attempted (always rejected).
    ///
    /// This checks common video MIME types and extensions.
    pub fn is_video_content(mime_type: Option<&str>, extension: Option<&str>) -> bool {
        const VIDEO_MIMES: &[&str] = &[
            "video/mp4",
            "video/mpeg",
            "video/ogg",
            "video/webm",
            "video/quicktime",
            "video/x-msvideo",
            "video/x-ms-wmv",
            "video/x-flv",
            "video/3gpp",
            "video/3gpp2",
        ];

        const VIDEO_EXTENSIONS: &[&str] = &[
            "mp4", "mpeg", "mpg", "ogg", "ogv", "webm", "mov", "avi", "wmv", "flv", "3gp", "3g2",
            "mkv", "m4v",
        ];

        if let Some(mime) = mime_type {
            let mime_lower = mime.to_lowercase();
            if VIDEO_MIMES.iter().any(|v| mime_lower.contains(v))
                || mime_lower.starts_with("video/")
            {
                return true;
            }
        }

        if let Some(ext) = extension {
            let ext_lower = ext.to_lowercase();
            if VIDEO_EXTENSIONS.contains(&ext_lower.as_str()) {
                return true;
            }
        }

        false
    }

    /// Validate text content.
    pub fn validate_text(content: &str) -> ContentFormatResult<()> {
        let size = content.len();
        if size > MAX_TEXT_LENGTH {
            return Err(ContentFormatError::TextTooLong {
                size,
                max: MAX_TEXT_LENGTH,
            });
        }
        Ok(())
    }

    /// Validate text content from bytes.
    pub fn validate_text_bytes(content: &[u8]) -> ContentFormatResult<()> {
        let size = content.len();
        if size > MAX_TEXT_LENGTH {
            return Err(ContentFormatError::TextTooLong {
                size,
                max: MAX_TEXT_LENGTH,
            });
        }
        Ok(())
    }

    /// Validate image content.
    ///
    /// Checks size, dimensions, and format.
    pub fn validate_image(
        data: &[u8],
        width: Option<u32>,
        height: Option<u32>,
        format: Option<&str>,
    ) -> ContentFormatResult<()> {
        // Check size
        let size = data.len();
        if size > MAX_IMAGE_SIZE {
            return Err(ContentFormatError::ImageTooLarge {
                size,
                max: MAX_IMAGE_SIZE,
            });
        }

        // Check dimensions if provided
        if let (Some(w), Some(h)) = (width, height) {
            if w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION {
                return Err(ContentFormatError::ImageDimensionTooLarge {
                    width: w,
                    height: h,
                    max: MAX_IMAGE_DIMENSION,
                });
            }
        }

        // Check format if provided
        if let Some(fmt) = format {
            let fmt_lower = fmt.to_lowercase();
            if !ALLOWED_IMAGE_FORMATS.contains(&fmt_lower.as_str()) {
                return Err(ContentFormatError::ImageFormatNotAllowed {
                    format: fmt.to_string(),
                });
            }
        }

        Ok(())
    }

    /// Validate content for posting.
    ///
    /// This is the main validation entry point that checks:
    /// 1. Video is not being attempted
    /// 2. Content meets size/dimension requirements
    pub fn validate_for_posting(
        format: ContentFormat,
        content_bytes: Option<&[u8]>,
        width: Option<u32>,
        height: Option<u32>,
        mime_type: Option<&str>,
        extension: Option<&str>,
    ) -> ContentFormatResult<()> {
        // Check for video content (always rejected)
        if Self::is_video_content(mime_type, extension) {
            return Err(ContentFormatError::VideoNotSupported);
        }

        // Validate content based on format
        if let Some(data) = content_bytes {
            match format {
                ContentFormat::Text => Self::validate_text_bytes(data)?,
                ContentFormat::Image => {
                    let fmt = extension.or_else(|| mime_type.and_then(|m| m.split('/').last()));
                    Self::validate_image(data, width, height, fmt)?;
                }
                ContentFormat::Link | ContentFormat::Mention => {
                    // Links and mentions are treated as text for validation
                    Self::validate_text_bytes(data)?;
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_content_format_values() {
        assert_eq!(ContentFormat::Text.as_u8(), 0x01);
        assert_eq!(ContentFormat::Link.as_u8(), 0x02);
        assert_eq!(ContentFormat::Image.as_u8(), 0x03);
        assert_eq!(ContentFormat::Mention.as_u8(), 0x04);
    }

    #[test]
    fn test_content_format_from_u8() {
        assert_eq!(ContentFormat::from_u8(0x01), Some(ContentFormat::Text));
        assert_eq!(ContentFormat::from_u8(0x02), Some(ContentFormat::Link));
        assert_eq!(ContentFormat::from_u8(0x03), Some(ContentFormat::Image));
        assert_eq!(ContentFormat::from_u8(0x04), Some(ContentFormat::Mention));
        assert_eq!(ContentFormat::from_u8(0x00), None);
        assert_eq!(ContentFormat::from_u8(0x05), None); // Video would be 0x05 but is not allowed
        assert_eq!(ContentFormat::from_u8(0xFF), None);
    }

    #[test]
    fn test_content_format_roundtrip() {
        for val in [0x01u8, 0x02, 0x03, 0x04] {
            let format = ContentFormat::from_u8(val).unwrap();
            assert_eq!(format.as_u8(), val);
        }
    }

    #[test]
    fn test_is_video_content() {
        // Video MIME types
        assert!(ContentFormatValidator::is_video_content(
            Some("video/mp4"),
            None
        ));
        assert!(ContentFormatValidator::is_video_content(
            Some("video/webm"),
            None
        ));
        assert!(ContentFormatValidator::is_video_content(
            Some("VIDEO/MP4"), // Case insensitive
            None
        ));
        assert!(ContentFormatValidator::is_video_content(
            Some("video/x-custom"), // Starts with video/
            None
        ));

        // Video extensions
        assert!(ContentFormatValidator::is_video_content(None, Some("mp4")));
        assert!(ContentFormatValidator::is_video_content(None, Some("webm")));
        assert!(ContentFormatValidator::is_video_content(None, Some("MOV"))); // Case insensitive
        assert!(ContentFormatValidator::is_video_content(None, Some("mkv")));

        // Not video
        assert!(!ContentFormatValidator::is_video_content(
            Some("image/jpeg"),
            None
        ));
        assert!(!ContentFormatValidator::is_video_content(
            Some("text/plain"),
            None
        ));
        assert!(!ContentFormatValidator::is_video_content(None, Some("jpg")));
        assert!(!ContentFormatValidator::is_video_content(None, Some("png")));
        assert!(!ContentFormatValidator::is_video_content(None, None));
    }

    #[test]
    fn test_validate_text() {
        // Valid text
        assert!(ContentFormatValidator::validate_text("Hello world").is_ok());
        assert!(ContentFormatValidator::validate_text("").is_ok());

        // Max length text
        let max_text = "a".repeat(MAX_TEXT_LENGTH);
        assert!(ContentFormatValidator::validate_text(&max_text).is_ok());

        // Too long text
        let too_long = "a".repeat(MAX_TEXT_LENGTH + 1);
        let result = ContentFormatValidator::validate_text(&too_long);
        assert!(matches!(
            result,
            Err(ContentFormatError::TextTooLong { .. })
        ));
    }

    #[test]
    fn test_validate_image() {
        // Valid image
        let small_image = vec![0u8; 100_000]; // 100KB
        assert!(ContentFormatValidator::validate_image(
            &small_image,
            Some(1024),
            Some(768),
            Some("jpeg")
        )
        .is_ok());

        // Too large
        let large_image = vec![0u8; MAX_IMAGE_SIZE + 1];
        let result = ContentFormatValidator::validate_image(&large_image, None, None, None);
        assert!(matches!(
            result,
            Err(ContentFormatError::ImageTooLarge { .. })
        ));

        // Invalid dimensions
        let image = vec![0u8; 100];
        let result = ContentFormatValidator::validate_image(
            &image,
            Some(MAX_IMAGE_DIMENSION + 1),
            Some(100),
            None,
        );
        assert!(matches!(
            result,
            Err(ContentFormatError::ImageDimensionTooLarge { .. })
        ));

        // Invalid format
        let result = ContentFormatValidator::validate_image(&image, None, None, Some("gif"));
        assert!(matches!(
            result,
            Err(ContentFormatError::ImageFormatNotAllowed { .. })
        ));

        // Valid formats
        assert!(ContentFormatValidator::validate_image(&image, None, None, Some("jpeg")).is_ok());
        assert!(ContentFormatValidator::validate_image(&image, None, None, Some("jpg")).is_ok());
        assert!(ContentFormatValidator::validate_image(&image, None, None, Some("png")).is_ok());
        assert!(ContentFormatValidator::validate_image(&image, None, None, Some("webp")).is_ok());
    }

    #[test]
    fn test_validate_for_posting_video_rejected() {
        let result = ContentFormatValidator::validate_for_posting(
            ContentFormat::Text,
            None,
            None,
            None,
            Some("video/mp4"),
            None,
        );
        assert!(matches!(result, Err(ContentFormatError::VideoNotSupported)));

        let result = ContentFormatValidator::validate_for_posting(
            ContentFormat::Text,
            None,
            None,
            None,
            None,
            Some("mp4"),
        );
        assert!(matches!(result, Err(ContentFormatError::VideoNotSupported)));
    }

    #[test]
    fn test_validate_for_posting_image() {
        // Image posting is allowed (PoW-gated, no level check)
        let result = ContentFormatValidator::validate_for_posting(
            ContentFormat::Image,
            Some(&vec![0u8; 100]),
            Some(100),
            Some(100),
            Some("image/jpeg"),
            Some("jpg"),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_image_format_parsing() {
        // From extension
        assert_eq!(ImageFormat::from_extension("jpeg"), Some(ImageFormat::Jpeg));
        assert_eq!(ImageFormat::from_extension("jpg"), Some(ImageFormat::Jpeg));
        assert_eq!(ImageFormat::from_extension("png"), Some(ImageFormat::Png));
        assert_eq!(ImageFormat::from_extension("webp"), Some(ImageFormat::WebP));
        assert_eq!(ImageFormat::from_extension("gif"), None);
        assert_eq!(ImageFormat::from_extension("bmp"), None);

        // Case insensitive
        assert_eq!(ImageFormat::from_extension("JPEG"), Some(ImageFormat::Jpeg));
        assert_eq!(ImageFormat::from_extension("PNG"), Some(ImageFormat::Png));

        // From MIME
        assert_eq!(
            ImageFormat::from_mime("image/jpeg"),
            Some(ImageFormat::Jpeg)
        );
        assert_eq!(ImageFormat::from_mime("image/png"), Some(ImageFormat::Png));
        assert_eq!(
            ImageFormat::from_mime("image/webp"),
            Some(ImageFormat::WebP)
        );
        assert_eq!(ImageFormat::from_mime("image/gif"), None);
    }

    #[test]
    fn test_image_format_mime_types() {
        assert_eq!(ImageFormat::Jpeg.mime_type(), "image/jpeg");
        assert_eq!(ImageFormat::Png.mime_type(), "image/png");
        assert_eq!(ImageFormat::WebP.mime_type(), "image/webp");
    }

    #[test]
    fn test_content_format_display() {
        assert_eq!(format!("{}", ContentFormat::Text), "Text");
        assert_eq!(format!("{}", ContentFormat::Image), "Image");
        assert_eq!(format!("{}", ContentFormat::Link), "Link");
        assert_eq!(format!("{}", ContentFormat::Mention), "Mention");
    }

    #[test]
    fn test_content_format_default() {
        assert_eq!(ContentFormat::default(), ContentFormat::Text);
    }

    #[test]
    fn test_content_format_names() {
        assert_eq!(ContentFormat::Text.name(), "Text");
        assert_eq!(ContentFormat::Link.name(), "Link");
        assert_eq!(ContentFormat::Image.name(), "Image");
        assert_eq!(ContentFormat::Mention.name(), "Mention");
    }

    #[test]
    fn test_error_display() {
        let err = ContentFormatError::VideoNotSupported;
        assert!(err.to_string().contains("Video"));

        let err = ContentFormatError::TextTooLong {
            size: 15000,
            max: 10000,
        };
        assert!(err.to_string().contains("15000"));
        assert!(err.to_string().contains("10000"));

        let err = ContentFormatError::ImageTooLarge {
            size: 600000,
            max: 500000,
        };
        assert!(err.to_string().contains("600000"));
        assert!(err.to_string().contains("500000"));

        let err = ContentFormatError::ImageDimensionTooLarge {
            width: 3000,
            height: 2000,
            max: 2048,
        };
        assert!(err.to_string().contains("3000"));
        assert!(err.to_string().contains("2000"));
        assert!(err.to_string().contains("2048"));

        let err = ContentFormatError::ImageFormatNotAllowed {
            format: "gif".to_string(),
        };
        assert!(err.to_string().contains("gif"));
    }

    #[test]
    fn test_serialization() {
        let format = ContentFormat::Image;
        let serialized = bincode::serialize(&format).unwrap();
        let deserialized: ContentFormat = bincode::deserialize(&serialized).unwrap();
        assert_eq!(format, deserialized);
    }
}
