//! Test result collector
//!
//! Collects test results from various sources including cargo test output parsing.

use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::types::{ReportMetadata, TestReport, TestResult, TestStatus};

/// Collects test results from test execution
pub struct TestCollector {
    report: TestReport,
    current_module: Option<String>,
}

impl TestCollector {
    /// Create a new collector with the given suite name
    #[must_use]
    pub fn new(suite_name: impl Into<String>) -> Self {
        Self {
            report: TestReport::new(ReportMetadata::new(suite_name)),
            current_module: None,
        }
    }

    /// Create a collector with custom metadata
    #[must_use]
    pub fn with_metadata(metadata: ReportMetadata) -> Self {
        Self {
            report: TestReport::new(metadata),
            current_module: None,
        }
    }

    /// Set the current module context for subsequent results
    pub fn set_module(&mut self, module: impl Into<String>) {
        self.current_module = Some(module.into());
    }

    /// Add a test result
    pub fn add_result(&mut self, result: TestResult) {
        self.report.add_result(result);
    }

    /// Record a passed test
    pub fn record_passed(&mut self, name: impl Into<String>, duration: Duration) {
        let module = self.current_module.clone().unwrap_or_default();
        self.report
            .add_result(TestResult::passed(name, module, duration));
    }

    /// Record a failed test
    pub fn record_failed(
        &mut self,
        name: impl Into<String>,
        duration: Duration,
        error: impl Into<String>,
    ) {
        let module = self.current_module.clone().unwrap_or_default();
        self.report
            .add_result(TestResult::failed(name, module, duration, error));
    }

    /// Record a skipped test
    pub fn record_skipped(&mut self, name: impl Into<String>) {
        let module = self.current_module.clone().unwrap_or_default();
        self.report.add_result(TestResult::skipped(name, module));
    }

    /// Finalize and return the report
    #[must_use]
    pub fn finalize(mut self) -> TestReport {
        self.report.metadata.finish();
        self.report
    }

    /// Get the current report (without finalizing)
    #[must_use]
    pub fn report(&self) -> &TestReport {
        &self.report
    }
}

/// Parses cargo test output and collects results
pub struct CargoTestParser {
    collector: TestCollector,
}

impl CargoTestParser {
    /// Create a new parser with the given suite name
    #[must_use]
    pub fn new(suite_name: impl Into<String>) -> Self {
        Self {
            collector: TestCollector::new(suite_name),
        }
    }

    /// Run cargo test and collect results
    ///
    /// # Errors
    /// Returns an error if the cargo test command fails to start
    pub fn run_tests(&mut self, args: &[&str]) -> std::io::Result<TestReport> {
        let mut cmd = Command::new("cargo");
        cmd.arg("test");
        cmd.args(args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let start = Instant::now();
        let mut child = cmd.spawn()?;

        // Collect stdout
        let stdout = child.stdout.take();
        if let Some(stdout) = stdout {
            self.parse_output(stdout);
        }

        let status = child.wait()?;
        let _total_duration = start.elapsed();

        // If cargo test failed but we collected results, still return them
        if !status.success() && self.collector.report.results.is_empty() {
            // No results collected, probably a compile error
            self.collector.record_failed(
                "cargo_test",
                Duration::ZERO,
                format!("cargo test exited with status: {status}"),
            );
        }

        Ok(self.collector.report.clone())
    }

    /// Parse output from a reader (typically stdout from cargo test)
    pub fn parse_output<R: Read>(&mut self, reader: R) {
        let buf_reader = BufReader::new(reader);

        for line in buf_reader.lines().map_while(Result::ok) {
            self.parse_line(&line);
        }
    }

    /// Parse a single line of cargo test output
    fn parse_line(&mut self, line: &str) {
        let line = line.trim();

        // Check for running test messages
        if line.starts_with("running ") && line.contains(" test") {
            return; // Skip "running N tests" lines
        }

        // Check for test result lines
        // Format: "test module::name ... ok" or "test module::name ... FAILED"
        if line.starts_with("test ") {
            if let Some(result) = self.parse_test_line(line) {
                self.collector.add_result(result);
            }
        }
    }

    /// Parse a test result line
    /// Format: "test module::name ... ok" or "test module::name ... FAILED"
    fn parse_test_line(&self, line: &str) -> Option<TestResult> {
        // Remove "test " prefix
        let rest = line.strip_prefix("test ")?;

        // Find the status at the end
        let (name_part, status) = if rest.ends_with(" ... ok") {
            (rest.strip_suffix(" ... ok")?, TestStatus::Passed)
        } else if rest.ends_with(" ... FAILED") {
            (rest.strip_suffix(" ... FAILED")?, TestStatus::Failed)
        } else if rest.ends_with(" ... ignored") {
            (rest.strip_suffix(" ... ignored")?, TestStatus::Skipped)
        } else {
            return None;
        };

        // Split into module and test name
        let (module, name) = if let Some(pos) = name_part.rfind("::") {
            (name_part[..pos].to_string(), name_part[pos + 2..].to_string())
        } else {
            (String::new(), name_part.to_string())
        };

        let mut result = match status {
            TestStatus::Passed => TestResult::passed(name, module, Duration::ZERO),
            TestStatus::Failed => TestResult::failed(name, module, Duration::ZERO, "Test failed"),
            TestStatus::Skipped => TestResult::skipped(name, module),
            TestStatus::Error => TestResult::failed(name, module, Duration::ZERO, "Test error"),
        };

        result.status = status;
        Some(result)
    }
}

/// Collects test results from a JSON Lines (jsonl) format
pub struct JsonLinesCollector {
    collector: TestCollector,
}

impl JsonLinesCollector {
    /// Create a new JSON Lines collector
    #[must_use]
    pub fn new(suite_name: impl Into<String>) -> Self {
        Self {
            collector: TestCollector::new(suite_name),
        }
    }

    /// Parse JSON Lines input
    pub fn parse<R: Read>(&mut self, reader: R) -> std::io::Result<()> {
        let buf_reader = BufReader::new(reader);

        for line in buf_reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }

            if let Ok(result) = serde_json::from_str::<TestResult>(&line) {
                self.collector.add_result(result);
            }
        }

        Ok(())
    }

    /// Finalize and return the report
    #[must_use]
    pub fn finalize(self) -> TestReport {
        self.collector.finalize()
    }
}

/// Builder for creating test collectors with additional configuration
pub struct CollectorBuilder {
    suite_name: String,
    version: Option<String>,
    commit_hash: Option<String>,
    branch: Option<String>,
    environment: Option<String>,
}

impl CollectorBuilder {
    /// Create a new collector builder
    #[must_use]
    pub fn new(suite_name: impl Into<String>) -> Self {
        Self {
            suite_name: suite_name.into(),
            version: None,
            commit_hash: None,
            branch: None,
            environment: None,
        }
    }

    /// Set the software version
    #[must_use]
    pub fn version(mut self, version: impl Into<String>) -> Self {
        self.version = Some(version.into());
        self
    }

    /// Set the git commit hash
    #[must_use]
    pub fn commit(mut self, hash: impl Into<String>) -> Self {
        self.commit_hash = Some(hash.into());
        self
    }

    /// Set the git branch
    #[must_use]
    pub fn branch(mut self, branch: impl Into<String>) -> Self {
        self.branch = Some(branch.into());
        self
    }

    /// Set the environment
    #[must_use]
    pub fn environment(mut self, env: impl Into<String>) -> Self {
        self.environment = Some(env.into());
        self
    }

    /// Build the collector
    #[must_use]
    pub fn build(self) -> TestCollector {
        let mut metadata = ReportMetadata::new(self.suite_name);

        if let Some(version) = self.version {
            metadata = metadata.with_version(version);
        }
        if let Some(hash) = self.commit_hash {
            metadata = metadata.with_commit(hash);
        }
        if let Some(branch) = self.branch {
            metadata = metadata.with_branch(branch);
        }
        if let Some(env) = self.environment {
            metadata = metadata.with_environment(env);
        }

        TestCollector::with_metadata(metadata)
    }
}

/// Try to get the current git commit hash
#[must_use]
pub fn get_git_commit() -> Option<String> {
    Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .ok()
                    .map(|s| s.trim().to_string())
            } else {
                None
            }
        })
}

/// Try to get the current git branch
#[must_use]
pub fn get_git_branch() -> Option<String> {
    Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .ok()
                    .map(|s| s.trim().to_string())
            } else {
                None
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collector_basic() {
        let mut collector = TestCollector::new("Test Suite");
        collector.set_module("my_module");
        collector.record_passed("test_one", Duration::from_millis(10));
        collector.record_failed("test_two", Duration::from_millis(20), "assertion failed");

        let report = collector.finalize();
        assert_eq!(report.summary.total, 2);
        assert_eq!(report.summary.passed, 1);
        assert_eq!(report.summary.failed, 1);
    }

    #[test]
    fn test_parse_test_line() {
        let parser = CargoTestParser::new("Test");

        let passed = parser.parse_test_line("test my_module::test_foo ... ok");
        assert!(passed.is_some());
        let passed = passed.unwrap();
        assert_eq!(passed.name, "test_foo");
        assert_eq!(passed.module, "my_module");
        assert_eq!(passed.status, TestStatus::Passed);

        let failed = parser.parse_test_line("test other::test_bar ... FAILED");
        assert!(failed.is_some());
        let failed = failed.unwrap();
        assert_eq!(failed.status, TestStatus::Failed);

        let ignored = parser.parse_test_line("test skip::test_skip ... ignored");
        assert!(ignored.is_some());
        let ignored = ignored.unwrap();
        assert_eq!(ignored.status, TestStatus::Skipped);
    }

    #[test]
    fn test_parse_output() {
        let output = r#"
running 3 tests
test my_module::test_one ... ok
test my_module::test_two ... FAILED
test my_module::test_three ... ignored

failures:
    my_module::test_two

test result: FAILED. 1 passed; 1 failed; 1 ignored;
"#;

        let mut parser = CargoTestParser::new("Integration Tests");
        parser.parse_output(output.as_bytes());

        let report = parser.collector.finalize();
        assert_eq!(report.summary.total, 3);
        assert_eq!(report.summary.passed, 1);
        assert_eq!(report.summary.failed, 1);
        assert_eq!(report.summary.skipped, 1);
    }

    #[test]
    fn test_builder() {
        let collector = CollectorBuilder::new("My Suite")
            .version("1.0.0")
            .commit("abc123")
            .branch("main")
            .environment("CI")
            .build();

        let report = collector.finalize();
        assert_eq!(report.metadata.suite_name, "My Suite");
        assert_eq!(report.metadata.version, Some("1.0.0".to_string()));
        assert_eq!(report.metadata.commit_hash, Some("abc123".to_string()));
    }

    #[test]
    fn test_jsonl_collector() {
        let jsonl = r#"{"name":"test_a","module":"mod","status":"passed","duration":100,"tags":[]}
{"name":"test_b","module":"mod","status":"failed","duration":50,"error_message":"oops","tags":[]}"#;

        let mut collector = JsonLinesCollector::new("JSONL Tests");
        collector.parse(jsonl.as_bytes()).unwrap();

        let report = collector.finalize();
        assert_eq!(report.summary.total, 2);
        assert_eq!(report.summary.passed, 1);
        assert_eq!(report.summary.failed, 1);
    }
}
