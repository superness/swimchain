//! Test reporting module
//!
//! Collects test results and outputs reports in JSON/HTML formats.
//!
//! # Overview
//!
//! This module provides:
//! - **Types**: Data structures for test results, summaries, and reports
//! - **Collector**: Collects test results from various sources
//! - **Formatter**: Outputs reports in JSON, HTML, or text format
//! - **Verifier**: Runs verification checks on test results
//!
//! # Example
//!
//! ```rust,ignore
//! use swimchain::cli::reporting::{
//!     TestCollector, ReportFormatter, ReportFormat, TestVerifier,
//! };
//!
//! // Create a collector
//! let mut collector = TestCollector::new("My Test Suite");
//!
//! // Record test results
//! collector.record_passed("test_one", Duration::from_millis(10));
//! collector.record_failed("test_two", Duration::from_millis(20), "assertion failed");
//!
//! // Finalize and verify
//! let mut report = collector.finalize();
//! let verifier = TestVerifier::new();
//! verifier.verify(&mut report);
//!
//! // Output as JSON or HTML
//! let json = ReportFormatter::format(&report, ReportFormat::Json)?;
//! let html = ReportFormatter::format(&report, ReportFormat::Html)?;
//! ```
//!
//! # Parsing Cargo Test Output
//!
//! ```rust,ignore
//! use swimchain::cli::reporting::CargoTestParser;
//!
//! let mut parser = CargoTestParser::new("Integration Tests");
//! let report = parser.run_tests(&["--lib"])?;
//!
//! println!("Passed: {}, Failed: {}", report.summary.passed, report.summary.failed);
//! ```

pub mod collector;
pub mod formatter;
pub mod types;
pub mod verifier;

// Re-export commonly used types
pub use collector::{
    get_git_branch, get_git_commit, CargoTestParser, CollectorBuilder, JsonLinesCollector,
    TestCollector,
};
pub use formatter::{ReportFormat, ReportFormatter};
pub use types::{
    ReportMetadata, TestReport, TestResult, TestStatus, TestSummary, VerificationCheck,
    VerificationSeverity,
};
pub use verifier::{TestVerifier, Thresholds, VerifierBuilder};
