# Content Type System

This document describes the content type system implemented per SPEC_12 Section 3.1.

## Overview

Swimchain uses a content format system to control what types of media can be posted. This serves two purposes:

1. **Network efficiency**: Limiting media types reduces bandwidth and storage requirements
2. **Abuse prevention**: Gating certain content types by swimmer level reduces spam vectors

## Supported Content Formats

### Text (0x01)
- Plain text content
- Maximum length: 10,000 bytes
- Available to all swimmer levels (Regular+)

### Link (0x02)
- External URL references
- Rendered as plain text with link detection
- Available to all swimmer levels

### Image (0x03)
- Static images only
- **Requires Resident level (Level 2+)**
- Constraints:
  - Maximum size: 500KB
  - Maximum dimension: 2048 pixels (width or height)
  - Allowed formats: JPEG, PNG, WebP

### Mention (0x04)
- Reference to another identity
- Available to all swimmer levels

## Prohibited Content

### Video
Video content is **explicitly prohibited** at the protocol level. This is not a temporary restriction but a permanent design decision per SPEC_12 Section 2.1.8.

Rejected video types include:
- All `video/*` MIME types
- Video file extensions: mp4, mpeg, mpg, ogg, ogv, webm, mov, avi, wmv, flv, 3gp, 3g2, mkv, m4v

## Level-Based Restrictions

| Content Format | NewSwimmer | Regular | Resident | Lifeguard | Anchor | PoolKeeper |
|---------------|------------|---------|----------|-----------|--------|------------|
| Text          | Yes        | Yes     | Yes      | Yes       | Yes    | Yes        |
| Link          | Yes        | Yes     | Yes      | Yes       | Yes    | Yes        |
| Image         | No         | No      | Yes      | Yes       | Yes    | Yes        |
| Mention       | Yes        | Yes     | Yes      | Yes       | Yes    | Yes        |

Images require Resident+ level because:
1. Images consume more bandwidth and storage
2. Image spam is harder to moderate than text
3. Reaching Resident level demonstrates commitment to the network

## API Usage

### Validating Content Format

```rust
use swimchain::api::CommandHandler;
use swimchain::content::ContentFormat;

let handler = CommandHandler::new();
handler.set_swimmer_level(SwimmerLevel::Resident);

// Validate text content
handler.validate_content_format(
    ContentFormat::Text,
    Some(text.as_bytes()),
    None, None, None, None
)?;

// Validate image content
handler.validate_content_format(
    ContentFormat::Image,
    Some(&image_bytes),
    Some(width),
    Some(height),
    Some("image/jpeg"),
    Some("jpg")
)?;
```

### Creating Posts

```rust
// Text post (available to all levels)
let result = handler.create_text_post(space_id, "Hello world!", None)?;

// Image post (requires Resident+)
let result = handler.create_image_post(
    space_id,
    &image_bytes,
    width,
    height,
    "jpeg",
    Some("My photo"),
    None
)?;
```

### Checking for Video Content

```rust
// This helper detects video by MIME type or extension
if CommandHandler::is_video_content(Some(mime_type), Some(extension)) {
    return Err(ContentFormatError::VideoNotSupported);
}
```

## Error Handling

The `ContentFormatError` enum provides specific error types:

- `VideoNotSupported` - Video content was detected
- `InsufficientLevelForImage` - User level too low for image posting
- `TextTooLong` - Text exceeds 10KB limit
- `ImageTooLarge` - Image exceeds 500KB limit
- `ImageDimensionTooLarge` - Image dimension exceeds 2048px
- `ImageFormatNotAllowed` - Image format is not JPEG/PNG/WebP
- `UnknownFormat` - Invalid format byte value

## Implementation Notes

### Wire Protocol

The `ContentFormat` enum uses a `#[repr(u8)]` representation for efficient serialization:
- Text = 0x01
- Link = 0x02
- Image = 0x03
- Mention = 0x04

Video intentionally has no value assigned - it cannot be represented in the protocol.

### Distinction from ContentType

Note that `ContentFormat` (media format) is distinct from `ContentType` in `types::content`:
- `ContentType` describes the action: Post, Reply, Quote
- `ContentFormat` describes the media: Text, Image, Link, Mention

A Reply can contain Text content, or an Image, etc.

## Future Considerations

The format system is designed to be extensible. If new formats are added:
1. They should receive a new `0x0N` value
2. They should have appropriate level gating
3. They should have size/dimension constraints appropriate to the medium

Audio content (podcasts, voice messages) may be considered in future phases, but would require similar level gating and size constraints.
