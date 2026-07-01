//! Test verification logic
//!
//! Performs verification checks on test results and reports.

use std::process::Command;

use super::types::{TestReport, VerificationCheck, VerificationSeverity};

/// Runs verification checks on test results
pub struct TestVerifier {
    checks: Vec<Box<dyn Fn(&TestReport) -> VerificationCheck + Send + Sync>>,
}

impl Default for TestVerifier {
    fn default() -> Self {
        Self::new()
    }
}

impl TestVerifier {
    /// Create a new verifier with default checks
    #[must_use]
    pub fn new() -> Self {
        let mut verifier = Self { checks: Vec::new() };

        // Add default checks
        verifier.add_check(check_no_failures);
        verifier.add_check(check_no_skipped);
        verifier.add_check(check_minimum_tests);
        verifier.add_check(check_pass_rate);

        verifier
    }

    /// Create an empty verifier (no default checks)
    #[must_use]
    pub fn empty() -> Self {
        Self { checks: Vec::new() }
    }

    /// Add a custom verification check
    pub fn add_check<F>(&mut self, check: F)
    where
        F: Fn(&TestReport) -> VerificationCheck + Send + Sync + 'static,
    {
        self.checks.push(Box::new(check));
    }

    /// Run all verification checks on a report
    pub fn verify(&self, report: &mut TestReport) {
        for check in &self.checks {
            let result = check(report);
            report.add_verification(result);
        }
    }

    /// Run verification and return whether all checks passed
    pub fn verify_and_check(&self, report: &mut TestReport) -> bool {
        self.verify(report);
        report.failed_verifications().is_empty()
    }
}

// Default verification checks

/// Check that no tests failed
fn check_no_failures(report: &TestReport) -> VerificationCheck {
    if report.summary.failed == 0 && report.summary.errors == 0 {
        VerificationCheck::pass("no_failures", "All tests pass without failures")
    } else {
        VerificationCheck::fail(
            "no_failures",
            "All tests pass without failures",
            VerificationSeverity::Error,
        )
        .with_details(format!(
            "{} failed, {} errors",
            report.summary.failed, report.summary.errors
        ))
    }
}

/// Check that no tests were skipped (informational)
fn check_no_skipped(report: &TestReport) -> VerificationCheck {
    if report.summary.skipped == 0 {
        VerificationCheck::pass("no_skipped", "No tests were skipped")
    } else {
        VerificationCheck::fail("no_skipped", "No tests were skipped", VerificationSeverity::Info)
            .with_details(format!("{} tests skipped", report.summary.skipped))
    }
}

/// Check that at least some tests ran
fn check_minimum_tests(report: &TestReport) -> VerificationCheck {
    if report.summary.total > 0 {
        VerificationCheck::pass("minimum_tests", "At least one test was executed")
    } else {
        VerificationCheck::fail(
            "minimum_tests",
            "At least one test was executed",
            VerificationSeverity::Warning,
        )
        .with_details("No tests were executed")
    }
}

/// Check pass rate meets threshold (95%)
fn check_pass_rate(report: &TestReport) -> VerificationCheck {
    const THRESHOLD: f64 = 95.0;

    if report.summary.pass_rate >= THRESHOLD || report.summary.total == 0 {
        VerificationCheck::pass("pass_rate", format!("Pass rate is at least {THRESHOLD}%"))
    } else {
        VerificationCheck::fail(
            "pass_rate",
            format!("Pass rate is at least {THRESHOLD}%"),
            VerificationSeverity::Error,
        )
        .with_details(format!("Actual pass rate: {:.1}%", report.summary.pass_rate))
    }
}

/// Verifier builder for custom configuration
pub struct VerifierBuilder {
    verifier: TestVerifier,
    include_build_check: bool,
    include_lint_check: bool,
    include_format_check: bool,
    pass_rate_threshold: Option<f64>,
    minimum_test_count: Option<usize>,
}

impl Default for VerifierBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl VerifierBuilder {
    /// Create a new builder with no checks
    #[must_use]
    pub fn new() -> Self {
        Self {
            verifier: TestVerifier::empty(),
            include_build_check: false,
            include_lint_check: false,
            include_format_check: false,
            pass_rate_threshold: None,
            minimum_test_count: None,
        }
    }

    /// Add the default test result checks
    #[must_use]
    pub fn with_default_checks(mut self) -> Self {
        self.verifier.add_check(check_no_failures);
        self.verifier.add_check(check_no_skipped);
        self.verifier.add_check(check_minimum_tests);
        self.verifier.add_check(check_pass_rate);
        self
    }

    /// Add a build verification check (runs cargo build)
    #[must_use]
    pub fn with_build_check(mut self) -> Self {
        self.include_build_check = true;
        self
    }

    /// Add a lint verification check (runs cargo clippy)
    #[must_use]
    pub fn with_lint_check(mut self) -> Self {
        self.include_lint_check = true;
        self
    }

    /// Add a format verification check (runs cargo fmt --check)
    #[must_use]
    pub fn with_format_check(mut self) -> Self {
        self.include_format_check = true;
        self
    }

    /// Set a custom pass rate threshold
    #[must_use]
    pub fn with_pass_rate_threshold(mut self, threshold: f64) -> Self {
        self.pass_rate_threshold = Some(threshold);
        self
    }

    /// Set a minimum test count requirement
    #[must_use]
    pub fn with_minimum_tests(mut self, count: usize) -> Self {
        self.minimum_test_count = Some(count);
        self
    }

    /// Build the verifier
    #[must_use]
    pub fn build(mut self) -> TestVerifier {
        // Add custom pass rate check if threshold specified
        if let Some(threshold) = self.pass_rate_threshold {
            self.verifier.add_check(move |report| {
                if report.summary.pass_rate >= threshold || report.summary.total == 0 {
                    VerificationCheck::pass(
                        "custom_pass_rate",
                        format!("Pass rate is at least {threshold}%"),
                    )
                } else {
                    VerificationCheck::fail(
                        "custom_pass_rate",
                        format!("Pass rate is at least {threshold}%"),
                        VerificationSeverity::Error,
                    )
                    .with_details(format!("Actual pass rate: {:.1}%", report.summary.pass_rate))
                }
            });
        }

        // Add minimum test count check if specified
        if let Some(min_count) = self.minimum_test_count {
            self.verifier.add_check(move |report| {
                if report.summary.total >= min_count {
                    VerificationCheck::pass(
                        "test_count",
                        format!("At least {min_count} tests executed"),
                    )
                } else {
                    VerificationCheck::fail(
                        "test_count",
                        format!("At least {min_count} tests executed"),
                        VerificationSeverity::Warning,
                    )
                    .with_details(format!("Only {} tests executed", report.summary.total))
                }
            });
        }

        // Add build check if requested
        if self.include_build_check {
            self.verifier.add_check(|_| run_cargo_build());
        }

        // Add lint check if requested
        if self.include_lint_check {
            self.verifier.add_check(|_| run_cargo_clippy());
        }

        // Add format check if requested
        if self.include_format_check {
            self.verifier.add_check(|_| run_cargo_fmt_check());
        }

        self.verifier
    }
}

// External tool verification checks

/// Run cargo build and verify it succeeds
fn run_cargo_build() -> VerificationCheck {
    match Command::new("cargo").args(["build"]).output() {
        Ok(output) => {
            if output.status.success() {
                VerificationCheck::pass("build", "Project builds successfully")
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                VerificationCheck::fail("build", "Project builds successfully", VerificationSeverity::Error)
                    .with_details(truncate_output(&stderr, 500))
            }
        }
        Err(e) => {
            VerificationCheck::fail("build", "Project builds successfully", VerificationSeverity::Error)
                .with_details(format!("Failed to run cargo build: {e}"))
        }
    }
}

/// Run cargo clippy and verify no warnings/errors
fn run_cargo_clippy() -> VerificationCheck {
    match Command::new("cargo")
        .args(["clippy", "--all-targets", "--", "-D", "warnings"])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                VerificationCheck::pass("lint", "No clippy warnings or errors")
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                VerificationCheck::fail(
                    "lint",
                    "No clippy warnings or errors",
                    VerificationSeverity::Warning,
                )
                .with_details(truncate_output(&stderr, 500))
            }
        }
        Err(e) => {
            VerificationCheck::fail(
                "lint",
                "No clippy warnings or errors",
                VerificationSeverity::Warning,
            )
            .with_details(format!("Failed to run cargo clippy: {e}"))
        }
    }
}

/// Run cargo fmt --check and verify formatting
fn run_cargo_fmt_check() -> VerificationCheck {
    match Command::new("cargo")
        .args(["fmt", "--all", "--", "--check"])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                VerificationCheck::pass("format", "Code is properly formatted")
            } else {
                let stdout = String::from_utf8_lossy(&output.stdout);
                VerificationCheck::fail(
                    "format",
                    "Code is properly formatted",
                    VerificationSeverity::Warning,
                )
                .with_details(truncate_output(&stdout, 500))
            }
        }
        Err(e) => {
            VerificationCheck::fail(
                "format",
                "Code is properly formatted",
                VerificationSeverity::Warning,
            )
            .with_details(format!("Failed to run cargo fmt: {e}"))
        }
    }
}

/// Truncate output to a maximum length
fn truncate_output(output: &str, max_len: usize) -> String {
    if output.len() <= max_len {
        output.to_string()
    } else {
        format!("{}... (truncated)", &output[..max_len])
    }
}

/// Result threshold configuration
#[derive(Debug, Clone)]
pub struct Thresholds {
    /// Minimum pass rate (0.0 to 100.0)
    pub min_pass_rate: f64,
    /// Maximum allowed failures
    pub max_failures: usize,
    /// Maximum allowed skipped tests
    pub max_skipped: usize,
    /// Minimum required test count
    pub min_test_count: usize,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            min_pass_rate: 100.0,
            max_failures: 0,
            max_skipped: usize::MAX,
            min_test_count: 1,
        }
    }
}

impl Thresholds {
    /// Create strict thresholds (100% pass rate, no failures)
    #[must_use]
    pub fn strict() -> Self {
        Self::default()
    }

    /// Create lenient thresholds (95% pass rate)
    #[must_use]
    pub fn lenient() -> Self {
        Self {
            min_pass_rate: 95.0,
            max_failures: 5,
            max_skipped: usize::MAX,
            min_test_count: 1,
        }
    }

    /// Check if a report meets these thresholds
    #[must_use]
    pub fn check(&self, report: &TestReport) -> Vec<VerificationCheck> {
        let mut checks = Vec::new();

        // Pass rate check
        if report.summary.pass_rate >= self.min_pass_rate {
            checks.push(VerificationCheck::pass(
                "threshold_pass_rate",
                format!("Pass rate >= {}%", self.min_pass_rate),
            ));
        } else {
            checks.push(
                VerificationCheck::fail(
                    "threshold_pass_rate",
                    format!("Pass rate >= {}%", self.min_pass_rate),
                    VerificationSeverity::Error,
                )
                .with_details(format!("Actual: {:.1}%", report.summary.pass_rate)),
            );
        }

        // Failure count check
        if report.summary.failed <= self.max_failures {
            checks.push(VerificationCheck::pass(
                "threshold_failures",
                format!("Failures <= {}", self.max_failures),
            ));
        } else {
            checks.push(
                VerificationCheck::fail(
                    "threshold_failures",
                    format!("Failures <= {}", self.max_failures),
                    VerificationSeverity::Error,
                )
                .with_details(format!("Actual: {}", report.summary.failed)),
            );
        }

        // Skipped count check
        if report.summary.skipped <= self.max_skipped {
            checks.push(VerificationCheck::pass(
                "threshold_skipped",
                format!("Skipped <= {}", self.max_skipped),
            ));
        } else {
            checks.push(
                VerificationCheck::fail(
                    "threshold_skipped",
                    format!("Skipped <= {}", self.max_skipped),
                    VerificationSeverity::Info,
                )
                .with_details(format!("Actual: {}", report.summary.skipped)),
            );
        }

        // Test count check
        if report.summary.total >= self.min_test_count {
            checks.push(VerificationCheck::pass(
                "threshold_test_count",
                format!("Test count >= {}", self.min_test_count),
            ));
        } else {
            checks.push(
                VerificationCheck::fail(
                    "threshold_test_count",
                    format!("Test count >= {}", self.min_test_count),
                    VerificationSeverity::Warning,
                )
                .with_details(format!("Actual: {}", report.summary.total)),
            );
        }

        checks
    }

    /// Check if all thresholds are met
    #[must_use]
    pub fn all_met(&self, report: &TestReport) -> bool {
        report.summary.pass_rate >= self.min_pass_rate
            && report.summary.failed <= self.max_failures
            && report.summary.skipped <= self.max_skipped
            && report.summary.total >= self.min_test_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::reporting::types::{ReportMetadata, TestReport, TestResult};
    use std::time::Duration;

    fn sample_passing_report() -> TestReport {
        let mut report = TestReport::new(ReportMetadata::new("Passing Suite"));
        report.add_result(TestResult::passed("t1", "m", Duration::from_millis(10)));
        report.add_result(TestResult::passed("t2", "m", Duration::from_millis(10)));
        report
    }

    fn sample_failing_report() -> TestReport {
        let mut report = TestReport::new(ReportMetadata::new("Failing Suite"));
        report.add_result(TestResult::passed("t1", "m", Duration::from_millis(10)));
        report.add_result(TestResult::failed("t2", "m", Duration::from_millis(10), "err"));
        report
    }

    #[test]
    fn test_verifier_passing() {
        let verifier = TestVerifier::new();
        let mut report = sample_passing_report();

        verifier.verify(&mut report);

        // Should have 4 default checks
        assert_eq!(report.verifications.len(), 4);

        // All should pass for a passing report
        let failed = report.failed_verifications();
        assert!(failed.is_empty(), "Expected no failures, got: {failed:?}");
    }

    #[test]
    fn test_verifier_failing() {
        let verifier = TestVerifier::new();
        let mut report = sample_failing_report();

        let all_passed = verifier.verify_and_check(&mut report);

        assert!(!all_passed);
        assert!(!report.failed_verifications().is_empty());
    }

    #[test]
    fn test_builder() {
        let verifier = VerifierBuilder::new()
            .with_pass_rate_threshold(90.0)
            .with_minimum_tests(5)
            .build();

        let mut report = sample_passing_report();
        verifier.verify(&mut report);

        // Should have 2 custom checks
        assert_eq!(report.verifications.len(), 2);
    }

    #[test]
    fn test_thresholds_strict() {
        let thresholds = Thresholds::strict();

        assert!(thresholds.all_met(&sample_passing_report()));
        assert!(!thresholds.all_met(&sample_failing_report()));
    }

    #[test]
    fn test_thresholds_lenient() {
        let thresholds = Thresholds::lenient();

        // 50% pass rate should fail even lenient thresholds
        let report = sample_failing_report();
        assert!(!thresholds.all_met(&report));

        // But with only 1 failure out of many, it should pass
        let mut big_report = TestReport::new(ReportMetadata::new("Big Suite"));
        for i in 0..100 {
            big_report.add_result(TestResult::passed(
                format!("t{i}"),
                "m",
                Duration::from_millis(1),
            ));
        }
        big_report.add_result(TestResult::failed("fail", "m", Duration::ZERO, "err"));
        assert!(thresholds.all_met(&big_report));
    }

    #[test]
    fn test_threshold_checks() {
        let thresholds = Thresholds::strict();
        let report = sample_failing_report();

        let checks = thresholds.check(&report);
        assert_eq!(checks.len(), 4);

        let failed: Vec<_> = checks.iter().filter(|c| !c.passed).collect();
        assert!(!failed.is_empty());
    }
}
