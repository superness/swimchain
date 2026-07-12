//! Progress display for long-running operations
//!
//! Provides progress bars and spinners for PoW mining and other operations.
//! Supports NO_COLOR environment variable for accessibility.

use indicatif::{ProgressBar, ProgressStyle};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Check if color output should be disabled
///
/// Returns true if NO_COLOR environment variable is set (any value).
/// This follows the no-color.org standard.
fn should_disable_color() -> bool {
    std::env::var("NO_COLOR").is_ok()
}

/// Get the success symbol based on NO_COLOR setting
fn success_symbol() -> &'static str {
    if should_disable_color() {
        "[OK]"
    } else {
        "✓"
    }
}

/// Get the error/cancel symbol based on NO_COLOR setting
fn error_symbol() -> &'static str {
    if should_disable_color() {
        "[FAIL]"
    } else {
        "✗"
    }
}

/// Progress display for PoW mining
pub struct PowProgress {
    bar: ProgressBar,
    cancelled: Arc<AtomicBool>,
}

impl PowProgress {
    /// Create a new PoW progress display
    ///
    /// # Arguments
    /// * `action` - Description of the action (e.g., "Creating space")
    /// * `estimated_secs` - Estimated time in seconds (shown in message)
    #[must_use]
    pub fn new(action: &str, estimated_secs: u64) -> Self {
        // Use hidden progress bar if not in a TTY to avoid device errors
        let bar = if atty::is(atty::Stream::Stderr) {
            let b = ProgressBar::new_spinner();
            // Use color-aware template based on NO_COLOR env var
            let template = if should_disable_color() {
                "{spinner} {msg}"
            } else {
                "{spinner:.green} {msg}"
            };
            b.set_style(
                ProgressStyle::default_spinner()
                    .template(template)
                    .expect("valid template"),
            );
            b.set_message(format!(
                "{action} - mining proof-of-work (~{estimated_secs}s)..."
            ));
            b.enable_steady_tick(Duration::from_millis(100));
            b
        } else {
            // Non-TTY: use hidden bar and just print status
            eprintln!("{action} - mining proof-of-work (~{estimated_secs}s)...");
            ProgressBar::hidden()
        };

        let cancelled = Arc::new(AtomicBool::new(false));
        let cancelled_clone = cancelled.clone();

        // Set up Ctrl+C handler (ignore errors in non-TTY environments)
        let _ = ctrlc::set_handler(move || {
            cancelled_clone.store(true, Ordering::SeqCst);
        });

        Self { bar, cancelled }
    }

    /// Check if the operation was cancelled
    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Update progress with current nonce count
    pub fn update(&self, nonce: u64) {
        self.bar.set_message(format!(
            "Mining proof-of-work... ({} attempts)",
            format_nonce(nonce)
        ));
    }

    /// Mark the operation as complete
    pub fn finish_success(&self, message: &str) {
        self.bar
            .finish_with_message(format!("{} {message}", success_symbol()));
    }

    /// Mark the operation as cancelled
    pub fn finish_cancelled(&self) {
        self.bar
            .finish_with_message(format!("{} Cancelled by user", error_symbol()));
    }

    /// Mark the operation as failed
    pub fn finish_error(&self, error: &str) {
        self.bar
            .finish_with_message(format!("{} Error: {error}", error_symbol()));
    }
}

/// Simple spinner for indeterminate progress
pub struct Spinner {
    bar: ProgressBar,
}

impl Spinner {
    /// Create a new spinner
    #[must_use]
    pub fn new(message: &str) -> Self {
        let bar = ProgressBar::new_spinner();
        // Use color-aware template based on NO_COLOR env var
        let template = if should_disable_color() {
            "{spinner} {msg}"
        } else {
            "{spinner:.blue} {msg}"
        };
        bar.set_style(
            ProgressStyle::default_spinner()
                .template(template)
                .expect("valid template"),
        );
        bar.set_message(message.to_string());
        bar.enable_steady_tick(Duration::from_millis(100));

        Self { bar }
    }

    /// Update the spinner message
    pub fn set_message(&self, message: &str) {
        self.bar.set_message(message.to_string());
    }

    /// Finish with success
    pub fn finish_success(&self, message: &str) {
        self.bar
            .finish_with_message(format!("{} {message}", success_symbol()));
    }

    /// Finish with error
    pub fn finish_error(&self, message: &str) {
        self.bar
            .finish_with_message(format!("{} {message}", error_symbol()));
    }

    /// Just finish (clear the spinner)
    pub fn finish(&self) {
        self.bar.finish_and_clear();
    }
}

/// Format a nonce count for display (with K/M suffixes)
fn format_nonce(nonce: u64) -> String {
    if nonce >= 1_000_000 {
        format!("{:.1}M", nonce as f64 / 1_000_000.0)
    } else if nonce >= 1_000 {
        format!("{:.1}K", nonce as f64 / 1_000.0)
    } else {
        nonce.to_string()
    }
}

/// Progress bar for determinate progress
pub struct Progress {
    bar: ProgressBar,
}

impl Progress {
    /// Create a new progress bar
    #[must_use]
    pub fn new(total: u64, message: &str) -> Self {
        let bar = ProgressBar::new(total);
        // Use color-aware template based on NO_COLOR env var
        let template = if should_disable_color() {
            "{msg} [{bar:40}] {pos}/{len} ({eta})"
        } else {
            "{msg} [{bar:40.cyan/blue}] {pos}/{len} ({eta})"
        };
        let progress_chars = if should_disable_color() { "=#-" } else { "=>-" };
        bar.set_style(
            ProgressStyle::default_bar()
                .template(template)
                .expect("valid template")
                .progress_chars(progress_chars),
        );
        bar.set_message(message.to_string());

        Self { bar }
    }

    /// Update progress
    pub fn set_position(&self, pos: u64) {
        self.bar.set_position(pos);
    }

    /// Increment progress
    pub fn inc(&self, delta: u64) {
        self.bar.inc(delta);
    }

    /// Finish with success
    pub fn finish_success(&self, message: &str) {
        self.bar
            .finish_with_message(format!("{} {message}", success_symbol()));
    }

    /// Finish with error
    pub fn finish_error(&self, message: &str) {
        self.bar
            .finish_with_message(format!("{} {message}", error_symbol()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_nonce() {
        assert_eq!(format_nonce(500), "500");
        assert_eq!(format_nonce(1500), "1.5K");
        assert_eq!(format_nonce(1_500_000), "1.5M");
    }
}
