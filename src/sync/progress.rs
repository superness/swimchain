//! Sync progress events (SPEC_06 - Chain Sync)
//!
//! Implements sync progress tracking and event broadcasting.

use tokio::sync::broadcast;

/// Current phase of the sync operation
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncPhase {
    /// Querying peers for chain status
    QueryingPeers,
    /// Downloading block headers
    DownloadingHeaders,
    /// Verifying downloaded headers
    VerifyingHeaders,
    /// Downloading block content
    DownloadingBlocks,
    /// Sync complete
    Complete,
}

impl std::fmt::Display for SyncPhase {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncPhase::QueryingPeers => write!(f, "Querying peers"),
            SyncPhase::DownloadingHeaders => write!(f, "Downloading headers"),
            SyncPhase::VerifyingHeaders => write!(f, "Verifying headers"),
            SyncPhase::DownloadingBlocks => write!(f, "Downloading blocks"),
            SyncPhase::Complete => write!(f, "Complete"),
        }
    }
}

/// Current sync progress snapshot
#[derive(Debug, Clone)]
pub struct SyncProgress {
    /// Current sync phase
    pub phase: SyncPhase,
    /// Current progress (e.g., current height)
    pub current: u64,
    /// Total target (e.g., target height)
    pub total: u64,
    /// Bytes downloaded so far
    pub bytes_downloaded: u64,
    /// Elapsed time in seconds
    pub elapsed_secs: f64,
}

impl SyncProgress {
    /// Create a new progress snapshot
    #[must_use]
    pub fn new(phase: SyncPhase, current: u64, total: u64) -> Self {
        Self {
            phase,
            current,
            total,
            bytes_downloaded: 0,
            elapsed_secs: 0.0,
        }
    }

    /// Calculate progress percentage (0-100)
    #[must_use]
    pub fn percentage(&self) -> f64 {
        if self.total == 0 {
            return 0.0;
        }
        (self.current as f64 / self.total as f64) * 100.0
    }

    /// Calculate download rate in bytes per second
    #[must_use]
    pub fn download_rate(&self) -> f64 {
        if self.elapsed_secs <= 0.0 {
            return 0.0;
        }
        self.bytes_downloaded as f64 / self.elapsed_secs
    }

    /// Estimate remaining time in seconds
    #[must_use]
    pub fn eta_secs(&self) -> Option<f64> {
        if self.current == 0 || self.elapsed_secs <= 0.0 {
            return None;
        }

        let rate = self.current as f64 / self.elapsed_secs;
        if rate <= 0.0 {
            return None;
        }

        let remaining = self.total.saturating_sub(self.current);
        Some(remaining as f64 / rate)
    }
}

/// Sync progress event
#[derive(Debug, Clone)]
pub enum SyncProgressEvent {
    /// Sync operation started
    Started,
    /// Sync phase changed
    PhaseChanged(SyncPhase),
    /// Progress update
    Progress(SyncProgress),
    /// Peer discovered
    PeerFound {
        /// Number of peers found
        peer_count: usize,
    },
    /// Headers received
    HeadersReceived {
        /// Number of headers in this batch
        count: u64,
        /// Total headers expected
        total: u64,
    },
    /// Block received
    BlockReceived {
        /// Height of received block
        height: u64,
    },
    /// Error occurred (sync may continue)
    Error(String),
    /// Sync completed successfully
    Complete {
        /// Number of blocks synced
        blocks_synced: u64,
        /// Total sync duration in seconds
        duration_secs: f64,
    },
}

/// Tracks and broadcasts sync progress
pub struct ProgressTracker {
    /// Broadcast sender for progress events
    sender: broadcast::Sender<SyncProgressEvent>,
    /// When tracking started
    start_time: std::time::Instant,
    /// Total bytes downloaded
    pub bytes_downloaded: u64,
    /// Current phase
    current_phase: SyncPhase,
}

impl ProgressTracker {
    /// Create a new progress tracker
    #[must_use]
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(100);
        Self {
            sender,
            start_time: std::time::Instant::now(),
            bytes_downloaded: 0,
            current_phase: SyncPhase::QueryingPeers,
        }
    }

    /// Subscribe to progress events
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<SyncProgressEvent> {
        self.sender.subscribe()
    }

    /// Emit a progress event
    pub fn emit(&self, event: SyncProgressEvent) {
        let _ = self.sender.send(event);
    }

    /// Emit a progress update
    pub fn emit_progress(&self, phase: SyncPhase, current: u64, total: u64) {
        let progress = SyncProgress {
            phase,
            current,
            total,
            bytes_downloaded: self.bytes_downloaded,
            elapsed_secs: self.start_time.elapsed().as_secs_f64(),
        };
        let _ = self.sender.send(SyncProgressEvent::Progress(progress));
    }

    /// Set current phase and emit event
    pub fn set_phase(&mut self, phase: SyncPhase) {
        self.current_phase = phase;
        let _ = self.sender.send(SyncProgressEvent::PhaseChanged(phase));
    }

    /// Add downloaded bytes
    pub fn add_bytes(&mut self, bytes: u64) {
        self.bytes_downloaded += bytes;
    }

    /// Get elapsed time in seconds
    #[must_use]
    pub fn elapsed_secs(&self) -> f64 {
        self.start_time.elapsed().as_secs_f64()
    }

    /// Reset tracker for new sync operation
    pub fn reset(&mut self) {
        self.start_time = std::time::Instant::now();
        self.bytes_downloaded = 0;
        self.current_phase = SyncPhase::QueryingPeers;
    }

    /// Get number of subscribers
    #[must_use]
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

impl Default for ProgressTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_progress_percentage() {
        let progress = SyncProgress {
            phase: SyncPhase::DownloadingHeaders,
            current: 50,
            total: 100,
            bytes_downloaded: 0,
            elapsed_secs: 0.0,
        };

        assert!((progress.percentage() - 50.0).abs() < 0.001);
    }

    #[test]
    fn test_sync_progress_percentage_zero_total() {
        let progress = SyncProgress {
            phase: SyncPhase::DownloadingHeaders,
            current: 50,
            total: 0,
            bytes_downloaded: 0,
            elapsed_secs: 0.0,
        };

        assert!((progress.percentage() - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_sync_progress_download_rate() {
        let progress = SyncProgress {
            phase: SyncPhase::DownloadingBlocks,
            current: 100,
            total: 200,
            bytes_downloaded: 1_000_000,
            elapsed_secs: 10.0,
        };

        assert!((progress.download_rate() - 100_000.0).abs() < 0.001);
    }

    #[test]
    fn test_sync_progress_eta() {
        let progress = SyncProgress {
            phase: SyncPhase::DownloadingBlocks,
            current: 50,
            total: 100,
            bytes_downloaded: 0,
            elapsed_secs: 10.0,
        };

        let eta = progress.eta_secs();
        assert!(eta.is_some());
        // At rate of 5 per second, 50 remaining = 10 seconds ETA
        assert!((eta.unwrap() - 10.0).abs() < 0.001);
    }

    #[test]
    fn test_phase_display() {
        assert_eq!(SyncPhase::QueryingPeers.to_string(), "Querying peers");
        assert_eq!(
            SyncPhase::DownloadingHeaders.to_string(),
            "Downloading headers"
        );
        assert_eq!(SyncPhase::Complete.to_string(), "Complete");
    }

    #[tokio::test]
    async fn test_progress_tracker_events() {
        let tracker = ProgressTracker::new();
        let mut rx = tracker.subscribe();

        tracker.emit(SyncProgressEvent::Started);

        match rx.try_recv() {
            Ok(SyncProgressEvent::Started) => {}
            other => panic!("Expected Started event, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_progress_tracker_multiple_subscribers() {
        let tracker = ProgressTracker::new();
        let mut rx1 = tracker.subscribe();
        let mut rx2 = tracker.subscribe();

        tracker.emit(SyncProgressEvent::Started);

        assert!(matches!(rx1.try_recv(), Ok(SyncProgressEvent::Started)));
        assert!(matches!(rx2.try_recv(), Ok(SyncProgressEvent::Started)));
    }

    #[test]
    fn test_progress_tracker_add_bytes() {
        let mut tracker = ProgressTracker::new();

        tracker.add_bytes(1000);
        tracker.add_bytes(500);

        assert_eq!(tracker.bytes_downloaded, 1500);
    }

    #[test]
    fn test_progress_tracker_reset() {
        let mut tracker = ProgressTracker::new();
        tracker.add_bytes(1000);
        tracker.reset();

        assert_eq!(tracker.bytes_downloaded, 0);
    }
}
