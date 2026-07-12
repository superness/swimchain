//! Test reporting types
//!
//! Data structures for representing test results, verification outcomes, and reports.

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Overall status of a test run
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    /// All tests passed
    Passed,
    /// Some tests failed
    Failed,
    /// Tests were skipped
    Skipped,
    /// Test run encountered an error
    Error,
}

impl std::fmt::Display for TestStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TestStatus::Passed => write!(f, "passed"),
            TestStatus::Failed => write!(f, "failed"),
            TestStatus::Skipped => write!(f, "skipped"),
            TestStatus::Error => write!(f, "error"),
        }
    }
}

/// Result of a single test case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    /// Name of the test
    pub name: String,
    /// Module or file containing the test
    pub module: String,
    /// Status of the test
    pub status: TestStatus,
    /// Duration of the test execution
    #[serde(with = "duration_serde")]
    pub duration: Duration,
    /// Error message if the test failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    /// Stack trace if available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_trace: Option<String>,
    /// Standard output captured during the test
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    /// Standard error captured during the test
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
    /// Optional tags or categories for the test
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

impl TestResult {
    /// Create a new passing test result
    #[must_use]
    pub fn passed(name: impl Into<String>, module: impl Into<String>, duration: Duration) -> Self {
        Self {
            name: name.into(),
            module: module.into(),
            status: TestStatus::Passed,
            duration,
            error_message: None,
            stack_trace: None,
            stdout: None,
            stderr: None,
            tags: Vec::new(),
        }
    }

    /// Create a new failing test result
    #[must_use]
    pub fn failed(
        name: impl Into<String>,
        module: impl Into<String>,
        duration: Duration,
        error_message: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            module: module.into(),
            status: TestStatus::Failed,
            duration,
            error_message: Some(error_message.into()),
            stack_trace: None,
            stdout: None,
            stderr: None,
            tags: Vec::new(),
        }
    }

    /// Create a skipped test result
    #[must_use]
    pub fn skipped(name: impl Into<String>, module: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            module: module.into(),
            status: TestStatus::Skipped,
            duration: Duration::ZERO,
            error_message: None,
            stack_trace: None,
            stdout: None,
            stderr: None,
            tags: Vec::new(),
        }
    }

    /// Add a stack trace to the result
    #[must_use]
    pub fn with_stack_trace(mut self, trace: impl Into<String>) -> Self {
        self.stack_trace = Some(trace.into());
        self
    }

    /// Add captured stdout
    #[must_use]
    pub fn with_stdout(mut self, output: impl Into<String>) -> Self {
        self.stdout = Some(output.into());
        self
    }

    /// Add captured stderr
    #[must_use]
    pub fn with_stderr(mut self, output: impl Into<String>) -> Self {
        self.stderr = Some(output.into());
        self
    }

    /// Add tags to the result
    #[must_use]
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }

    /// Check if the test passed
    #[must_use]
    pub fn is_passed(&self) -> bool {
        self.status == TestStatus::Passed
    }

    /// Check if the test failed
    #[must_use]
    pub fn is_failed(&self) -> bool {
        self.status == TestStatus::Failed
    }
}

/// Summary statistics for a test suite
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TestSummary {
    /// Total number of tests
    pub total: usize,
    /// Number of passed tests
    pub passed: usize,
    /// Number of failed tests
    pub failed: usize,
    /// Number of skipped tests
    pub skipped: usize,
    /// Number of tests with errors
    pub errors: usize,
    /// Total duration of all tests
    #[serde(with = "duration_serde")]
    pub total_duration: Duration,
    /// Pass rate as a percentage (0.0 to 100.0)
    pub pass_rate: f64,
}

impl TestSummary {
    /// Create a new empty summary
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Update the summary with a test result
    pub fn add_result(&mut self, result: &TestResult) {
        self.total += 1;
        self.total_duration += result.duration;

        match result.status {
            TestStatus::Passed => self.passed += 1,
            TestStatus::Failed => self.failed += 1,
            TestStatus::Skipped => self.skipped += 1,
            TestStatus::Error => self.errors += 1,
        }

        self.update_pass_rate();
    }

    /// Update the pass rate calculation
    fn update_pass_rate(&mut self) {
        let executed = self.total - self.skipped;
        if executed > 0 {
            self.pass_rate = (self.passed as f64 / executed as f64) * 100.0;
        } else {
            self.pass_rate = 0.0;
        }
    }

    /// Get the overall status based on test results
    #[must_use]
    pub fn overall_status(&self) -> TestStatus {
        if self.errors > 0 {
            TestStatus::Error
        } else if self.failed > 0 {
            TestStatus::Failed
        } else if self.passed == 0 && self.skipped > 0 {
            TestStatus::Skipped
        } else {
            TestStatus::Passed
        }
    }
}

/// A verification check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationCheck {
    /// Name of the check
    pub name: String,
    /// Description of what the check verifies
    pub description: String,
    /// Whether the check passed
    pub passed: bool,
    /// Details or explanation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    /// Severity level (info, warning, error)
    pub severity: VerificationSeverity,
}

impl VerificationCheck {
    /// Create a new passing verification check
    #[must_use]
    pub fn pass(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            passed: true,
            details: None,
            severity: VerificationSeverity::Info,
        }
    }

    /// Create a new failing verification check
    #[must_use]
    pub fn fail(
        name: impl Into<String>,
        description: impl Into<String>,
        severity: VerificationSeverity,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            passed: false,
            details: None,
            severity,
        }
    }

    /// Add details to the check
    #[must_use]
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}

/// Severity level for verification checks
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerificationSeverity {
    /// Informational, no action required
    Info,
    /// Warning, should be addressed
    Warning,
    /// Error, must be fixed
    Error,
}

impl std::fmt::Display for VerificationSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VerificationSeverity::Info => write!(f, "info"),
            VerificationSeverity::Warning => write!(f, "warning"),
            VerificationSeverity::Error => write!(f, "error"),
        }
    }
}

/// Complete test report containing all results and metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestReport {
    /// Report metadata
    pub metadata: ReportMetadata,
    /// Summary statistics
    pub summary: TestSummary,
    /// Individual test results
    pub results: Vec<TestResult>,
    /// Verification checks (if performed)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub verifications: Vec<VerificationCheck>,
}

impl TestReport {
    /// Create a new test report with the given metadata
    #[must_use]
    pub fn new(metadata: ReportMetadata) -> Self {
        Self {
            metadata,
            summary: TestSummary::new(),
            results: Vec::new(),
            verifications: Vec::new(),
        }
    }

    /// Add a test result to the report
    pub fn add_result(&mut self, result: TestResult) {
        self.summary.add_result(&result);
        self.results.push(result);
    }

    /// Add a verification check to the report
    pub fn add_verification(&mut self, check: VerificationCheck) {
        self.verifications.push(check);
    }

    /// Get all failed tests
    #[must_use]
    pub fn failed_tests(&self) -> Vec<&TestResult> {
        self.results.iter().filter(|r| r.is_failed()).collect()
    }

    /// Get all passed tests
    #[must_use]
    pub fn passed_tests(&self) -> Vec<&TestResult> {
        self.results.iter().filter(|r| r.is_passed()).collect()
    }

    /// Check if all tests passed
    #[must_use]
    pub fn all_passed(&self) -> bool {
        self.summary.failed == 0 && self.summary.errors == 0
    }

    /// Get failed verification checks
    #[must_use]
    pub fn failed_verifications(&self) -> Vec<&VerificationCheck> {
        self.verifications.iter().filter(|v| !v.passed).collect()
    }
}

/// Metadata about the test report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportMetadata {
    /// Name of the test suite
    pub suite_name: String,
    /// Version of the software being tested
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Git commit hash if available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_hash: Option<String>,
    /// Git branch name if available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// When the test run started (Unix timestamp)
    pub started_at: u64,
    /// When the test run finished (Unix timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
    /// Environment information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment: Option<String>,
    /// CI/CD pipeline identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pipeline_id: Option<String>,
}

impl ReportMetadata {
    /// Create new metadata with just the suite name
    #[must_use]
    pub fn new(suite_name: impl Into<String>) -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let started_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            suite_name: suite_name.into(),
            version: None,
            commit_hash: None,
            branch: None,
            started_at,
            finished_at: None,
            environment: None,
            pipeline_id: None,
        }
    }

    /// Set the version
    #[must_use]
    pub fn with_version(mut self, version: impl Into<String>) -> Self {
        self.version = Some(version.into());
        self
    }

    /// Set the git commit hash
    #[must_use]
    pub fn with_commit(mut self, hash: impl Into<String>) -> Self {
        self.commit_hash = Some(hash.into());
        self
    }

    /// Set the git branch
    #[must_use]
    pub fn with_branch(mut self, branch: impl Into<String>) -> Self {
        self.branch = Some(branch.into());
        self
    }

    /// Set the environment
    #[must_use]
    pub fn with_environment(mut self, env: impl Into<String>) -> Self {
        self.environment = Some(env.into());
        self
    }

    /// Set the pipeline ID
    #[must_use]
    pub fn with_pipeline_id(mut self, id: impl Into<String>) -> Self {
        self.pipeline_id = Some(id.into());
        self
    }

    /// Mark the test run as finished
    pub fn finish(&mut self) {
        use std::time::{SystemTime, UNIX_EPOCH};
        self.finished_at = Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        );
    }
}

/// Module for serializing/deserializing Duration as milliseconds
mod duration_serde {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        duration.as_millis().serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let millis = u64::deserialize(deserializer)?;
        Ok(Duration::from_millis(millis))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_test_result_creation() {
        let result = TestResult::passed("test_foo", "my_module", Duration::from_millis(100));
        assert!(result.is_passed());
        assert!(!result.is_failed());
        assert_eq!(result.name, "test_foo");
        assert_eq!(result.module, "my_module");
    }

    #[test]
    fn test_failed_result() {
        let result = TestResult::failed(
            "test_bar",
            "my_module",
            Duration::from_millis(50),
            "assertion failed",
        );
        assert!(result.is_failed());
        assert_eq!(result.error_message, Some("assertion failed".to_string()));
    }

    #[test]
    fn test_summary_calculation() {
        let mut summary = TestSummary::new();

        summary.add_result(&TestResult::passed("t1", "m", Duration::from_millis(10)));
        summary.add_result(&TestResult::passed("t2", "m", Duration::from_millis(20)));
        summary.add_result(&TestResult::failed(
            "t3",
            "m",
            Duration::from_millis(30),
            "err",
        ));

        assert_eq!(summary.total, 3);
        assert_eq!(summary.passed, 2);
        assert_eq!(summary.failed, 1);
        assert!((summary.pass_rate - 66.666).abs() < 1.0); // Approximately 66.67%
        assert_eq!(summary.overall_status(), TestStatus::Failed);
    }

    #[test]
    fn test_report_building() {
        let metadata = ReportMetadata::new("Unit Tests").with_version("1.0.0");
        let mut report = TestReport::new(metadata);

        report.add_result(TestResult::passed(
            "test_a",
            "mod_a",
            Duration::from_millis(10),
        ));
        report.add_result(TestResult::failed(
            "test_b",
            "mod_b",
            Duration::from_millis(20),
            "err",
        ));

        assert_eq!(report.summary.total, 2);
        assert_eq!(report.failed_tests().len(), 1);
        assert!(!report.all_passed());
    }

    #[test]
    fn test_verification_checks() {
        let check = VerificationCheck::pass("build_check", "Verifies build completes");
        assert!(check.passed);

        let failed = VerificationCheck::fail(
            "lint_check",
            "Verifies no lint errors",
            VerificationSeverity::Warning,
        )
        .with_details("Found 3 warnings");
        assert!(!failed.passed);
        assert_eq!(failed.details, Some("Found 3 warnings".to_string()));
    }

    #[test]
    fn test_json_serialization() {
        let result = TestResult::passed("test_serialize", "json_module", Duration::from_millis(42));
        let json = serde_json::to_string(&result).expect("serialization should work");
        assert!(json.contains("test_serialize"));
        assert!(json.contains("\"duration\":42"));
    }
}
