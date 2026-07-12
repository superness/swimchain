//! Content Attribution System (SPEC_09 §6.3)
//!
//! Tracks and displays who keeps content alive through their engagement. Every
//! engagement is an individual proof-of-work action that resets the content's
//! decay timer; the contributors credited here are the identities that engaged.
//!
//! # Display Format
//!
//! Per SPEC_09 §6.3:
//! ```text
//! KEPT ALIVE BY: @alice, @bob, @carol, and 7 others
//! └── Decays in 12 days without engagement
//! ```
//!
//! # Example Usage
//!
//! ```rust,ignore
//! use swimchain::attribution::{
//!     ContentAttribution, format_attribution_display,
//!     decay_countdown_days, DecayStatus,
//! };
//!
//! let (days, status) = decay_countdown_days(
//!     &content,
//!     current_time_ms,
//!     HALF_LIFE_SECS,
//! );
//!
//! let display = format_attribution_display(
//!     &attribution,
//!     days,
//!     status,
//!     Some(&identity_service),
//! );
//!
//! println!("{}", display.attribution_line);
//! println!("└── {}", display.decay_line);
//! ```
//!
//! # Wire Protocol
//!
//! - `MSG_ATTRIBUTION_QUERY` (0x50): Query attribution for content
//! - `MSG_ATTRIBUTION_RESPONSE` (0x51): Response with attribution data
//!
//! See `docs/content-attribution.md` for full documentation.

mod compute;
mod error;
mod handler;
mod types;

pub use compute::{
    decay_countdown_days, format_attribution_display, get_display_contributors, IdentityResolver,
    MAX_DISPLAY_CONTRIBUTORS,
};
pub use error::AttributionError;
pub use handler::{AttributionQueryPayload, AttributionResponsePayload};
pub use types::{
    AttributionEntry, ContentAttribution, ContentAttributionDisplay, DecayStatus, DecayStatusError,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        // Verify all public types are accessible
        let _entry = AttributionEntry::default();
        let _attr = ContentAttribution::default();
        let _display = ContentAttributionDisplay::default();
        let _status = DecayStatus::Active;
        let _err = AttributionError::ContentNotFound;
        let _query = AttributionQueryPayload::new([0u8; 32]);
        let _response = AttributionResponsePayload::new([0u8; 32]);

        // Verify constants
        assert_eq!(MAX_DISPLAY_CONTRIBUTORS, 10);
    }
}
