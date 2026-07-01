//! Report formatters
//!
//! Outputs test reports in various formats: JSON, HTML, and text.

use std::io::{self, Write};

use super::types::{TestReport, TestResult, TestStatus, TestSummary, VerificationSeverity};

/// Output format for test reports
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ReportFormat {
    /// JSON format (machine-readable)
    #[default]
    Json,
    /// Pretty-printed JSON
    JsonPretty,
    /// HTML format (human-readable, styled)
    Html,
    /// Plain text format
    Text,
}

impl std::str::FromStr for ReportFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "json" => Ok(ReportFormat::Json),
            "json-pretty" | "json_pretty" => Ok(ReportFormat::JsonPretty),
            "html" => Ok(ReportFormat::Html),
            "text" => Ok(ReportFormat::Text),
            _ => Err(format!(
                "Invalid format: {s}. Use 'json', 'json-pretty', 'html', or 'text'"
            )),
        }
    }
}

/// Formats test reports for output
pub struct ReportFormatter;

impl ReportFormatter {
    /// Format a report in the specified format
    ///
    /// # Errors
    /// Returns an error if serialization fails
    pub fn format(report: &TestReport, format: ReportFormat) -> io::Result<String> {
        match format {
            ReportFormat::Json => Self::format_json(report),
            ReportFormat::JsonPretty => Self::format_json_pretty(report),
            ReportFormat::Html => Ok(Self::format_html(report)),
            ReportFormat::Text => Ok(Self::format_text(report)),
        }
    }

    /// Write a report to a writer in the specified format
    ///
    /// # Errors
    /// Returns an error if writing fails
    pub fn write<W: Write>(
        report: &TestReport,
        format: ReportFormat,
        writer: &mut W,
    ) -> io::Result<()> {
        let output = Self::format(report, format)?;
        writer.write_all(output.as_bytes())?;
        Ok(())
    }

    /// Format as compact JSON
    fn format_json(report: &TestReport) -> io::Result<String> {
        serde_json::to_string(report).map_err(|e| io::Error::new(io::ErrorKind::Other, e))
    }

    /// Format as pretty-printed JSON
    fn format_json_pretty(report: &TestReport) -> io::Result<String> {
        serde_json::to_string_pretty(report).map_err(|e| io::Error::new(io::ErrorKind::Other, e))
    }

    /// Format as HTML
    fn format_html(report: &TestReport) -> String {
        HtmlFormatter::format(report)
    }

    /// Format as plain text
    fn format_text(report: &TestReport) -> String {
        TextFormatter::format(report)
    }
}

/// HTML report formatter
struct HtmlFormatter;

impl HtmlFormatter {
    fn format(report: &TestReport) -> String {
        let mut html = String::new();

        // Document start
        html.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
        html.push_str("<meta charset=\"UTF-8\">\n");
        html.push_str("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
        html.push_str(&format!(
            "<title>Test Report - {}</title>\n",
            Self::escape_html(&report.metadata.suite_name)
        ));
        html.push_str("<style>\n");
        html.push_str(Self::css_styles());
        html.push_str("</style>\n</head>\n<body>\n");

        // Header
        html.push_str("<div class=\"container\">\n");
        html.push_str(&format!(
            "<h1>Test Report: {}</h1>\n",
            Self::escape_html(&report.metadata.suite_name)
        ));

        // Metadata section
        html.push_str("<div class=\"metadata\">\n");
        if let Some(ref version) = report.metadata.version {
            html.push_str(&format!("<span class=\"meta-item\">Version: {version}</span>\n"));
        }
        if let Some(ref branch) = report.metadata.branch {
            html.push_str(&format!("<span class=\"meta-item\">Branch: {branch}</span>\n"));
        }
        if let Some(ref commit) = report.metadata.commit_hash {
            html.push_str(&format!(
                "<span class=\"meta-item\">Commit: {}</span>\n",
                &commit[..commit.len().min(8)]
            ));
        }
        html.push_str(&format!(
            "<span class=\"meta-item\">Started: {}</span>\n",
            Self::format_timestamp(report.metadata.started_at)
        ));
        html.push_str("</div>\n");

        // Summary section
        html.push_str(&Self::format_summary(&report.summary));

        // Verification checks
        if !report.verifications.is_empty() {
            html.push_str("<div class=\"section\">\n");
            html.push_str("<h2>Verification Checks</h2>\n");
            html.push_str("<table class=\"results-table\">\n");
            html.push_str("<thead><tr><th>Check</th><th>Status</th><th>Severity</th><th>Details</th></tr></thead>\n");
            html.push_str("<tbody>\n");
            for check in &report.verifications {
                let status_class = if check.passed { "passed" } else { "failed" };
                let status_text = if check.passed { "PASS" } else { "FAIL" };
                let severity_class = match check.severity {
                    VerificationSeverity::Info => "info",
                    VerificationSeverity::Warning => "warning",
                    VerificationSeverity::Error => "error",
                };
                html.push_str(&format!(
                    "<tr class=\"{status_class}\"><td>{}</td><td><span class=\"status-badge {status_class}\">{status_text}</span></td><td><span class=\"severity-badge {severity_class}\">{}</span></td><td>{}</td></tr>\n",
                    Self::escape_html(&check.name),
                    check.severity,
                    check.details.as_deref().unwrap_or("")
                ));
            }
            html.push_str("</tbody>\n</table>\n</div>\n");
        }

        // Failed tests section
        let failed_tests: Vec<_> = report.results.iter().filter(|r| r.is_failed()).collect();
        if !failed_tests.is_empty() {
            html.push_str("<div class=\"section failed-section\">\n");
            html.push_str(&format!("<h2>Failed Tests ({})</h2>\n", failed_tests.len()));
            for result in failed_tests {
                html.push_str(&Self::format_test_result(result));
            }
            html.push_str("</div>\n");
        }

        // All tests section
        html.push_str("<div class=\"section\">\n");
        html.push_str("<h2>All Tests</h2>\n");
        html.push_str("<table class=\"results-table\">\n");
        html.push_str("<thead><tr><th>Test</th><th>Module</th><th>Status</th><th>Duration</th></tr></thead>\n");
        html.push_str("<tbody>\n");
        for result in &report.results {
            let status_class = match result.status {
                TestStatus::Passed => "passed",
                TestStatus::Failed => "failed",
                TestStatus::Skipped => "skipped",
                TestStatus::Error => "error",
            };
            html.push_str(&format!(
                "<tr class=\"{status_class}\"><td>{}</td><td>{}</td><td><span class=\"status-badge {status_class}\">{}</span></td><td>{}ms</td></tr>\n",
                Self::escape_html(&result.name),
                Self::escape_html(&result.module),
                result.status.to_string().to_uppercase(),
                result.duration.as_millis()
            ));
        }
        html.push_str("</tbody>\n</table>\n</div>\n");

        // Footer
        html.push_str("<div class=\"footer\">\n");
        html.push_str("<p>Generated by Swimchain Test Reporter</p>\n");
        html.push_str("</div>\n");

        html.push_str("</div>\n</body>\n</html>\n");

        html
    }

    fn format_summary(summary: &TestSummary) -> String {
        let overall_class = match summary.overall_status() {
            TestStatus::Passed => "passed",
            TestStatus::Failed => "failed",
            TestStatus::Skipped => "skipped",
            TestStatus::Error => "error",
        };

        format!(
            r#"<div class="summary {}">
<h2>Summary</h2>
<div class="summary-grid">
<div class="summary-item"><span class="count">{}</span><span class="label">Total</span></div>
<div class="summary-item passed"><span class="count">{}</span><span class="label">Passed</span></div>
<div class="summary-item failed"><span class="count">{}</span><span class="label">Failed</span></div>
<div class="summary-item skipped"><span class="count">{}</span><span class="label">Skipped</span></div>
</div>
<div class="pass-rate">Pass Rate: {:.1}%</div>
<div class="duration">Total Duration: {}ms</div>
</div>
"#,
            overall_class,
            summary.total,
            summary.passed,
            summary.failed,
            summary.skipped,
            summary.pass_rate,
            summary.total_duration.as_millis()
        )
    }

    fn format_test_result(result: &TestResult) -> String {
        let mut html = String::new();
        html.push_str("<div class=\"test-detail failed\">\n");
        html.push_str(&format!(
            "<h3>{}</h3>\n",
            Self::escape_html(&result.name)
        ));
        html.push_str(&format!(
            "<p class=\"module\">Module: {}</p>\n",
            Self::escape_html(&result.module)
        ));
        if let Some(ref error) = result.error_message {
            html.push_str(&format!(
                "<div class=\"error-message\"><pre>{}</pre></div>\n",
                Self::escape_html(error)
            ));
        }
        if let Some(ref trace) = result.stack_trace {
            html.push_str("<details>\n<summary>Stack Trace</summary>\n");
            html.push_str(&format!(
                "<pre class=\"stack-trace\">{}</pre>\n",
                Self::escape_html(trace)
            ));
            html.push_str("</details>\n");
        }
        html.push_str("</div>\n");
        html
    }

    fn escape_html(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&#39;")
    }

    fn format_timestamp(ts: u64) -> String {
        use std::time::{Duration, UNIX_EPOCH};
        let datetime = UNIX_EPOCH + Duration::from_secs(ts);
        format!("{datetime:?}")
    }

    fn css_styles() -> &'static str {
        r#"
:root {
  --pass-color: #22c55e;
  --fail-color: #ef4444;
  --skip-color: #f59e0b;
  --error-color: #dc2626;
  --info-color: #3b82f6;
  --warning-color: #f59e0b;
  --bg-color: #f8fafc;
  --card-bg: #ffffff;
  --text-color: #1e293b;
  --border-color: #e2e8f0;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-color);
  line-height: 1.6;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: var(--text-color);
}

h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 0.5rem;
}

.metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 2rem;
  padding: 1rem;
  background-color: var(--card-bg);
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
}

.meta-item {
  padding: 0.25rem 0.75rem;
  background-color: var(--bg-color);
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.summary {
  background-color: var(--card-bg);
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
  border: 2px solid var(--border-color);
}

.summary.passed { border-color: var(--pass-color); }
.summary.failed { border-color: var(--fail-color); }
.summary.skipped { border-color: var(--skip-color); }
.summary.error { border-color: var(--error-color); }

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin: 1rem 0;
}

.summary-item {
  text-align: center;
  padding: 1rem;
  background-color: var(--bg-color);
  border-radius: 0.5rem;
}

.summary-item .count {
  display: block;
  font-size: 2rem;
  font-weight: bold;
}

.summary-item .label {
  display: block;
  font-size: 0.875rem;
  color: #64748b;
}

.summary-item.passed .count { color: var(--pass-color); }
.summary-item.failed .count { color: var(--fail-color); }
.summary-item.skipped .count { color: var(--skip-color); }

.pass-rate, .duration {
  font-size: 1.125rem;
  margin-top: 0.5rem;
}

.section {
  background-color: var(--card-bg);
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
  border: 1px solid var(--border-color);
}

.failed-section {
  border-color: var(--fail-color);
}

.results-table {
  width: 100%;
  border-collapse: collapse;
}

.results-table th,
.results-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.results-table th {
  background-color: var(--bg-color);
  font-weight: 600;
}

.results-table tr:hover {
  background-color: var(--bg-color);
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.passed { background-color: #dcfce7; color: #166534; }
.status-badge.failed { background-color: #fee2e2; color: #991b1b; }
.status-badge.skipped { background-color: #fef3c7; color: #92400e; }
.status-badge.error { background-color: #fee2e2; color: #991b1b; }

.severity-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.severity-badge.info { background-color: #dbeafe; color: #1e40af; }
.severity-badge.warning { background-color: #fef3c7; color: #92400e; }
.severity-badge.error { background-color: #fee2e2; color: #991b1b; }

.test-detail {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 0.5rem;
  background-color: #fef2f2;
  border: 1px solid var(--fail-color);
}

.test-detail h3 {
  color: var(--fail-color);
  margin-bottom: 0.5rem;
}

.test-detail .module {
  color: #64748b;
  font-size: 0.875rem;
}

.error-message {
  margin-top: 1rem;
  padding: 1rem;
  background-color: #ffffff;
  border-radius: 0.25rem;
  border: 1px solid var(--border-color);
}

.error-message pre,
.stack-trace {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
}

details {
  margin-top: 1rem;
}

details summary {
  cursor: pointer;
  color: var(--info-color);
  font-weight: 500;
}

.footer {
  text-align: center;
  padding: 2rem;
  color: #64748b;
  font-size: 0.875rem;
}
"#
    }
}

/// Plain text report formatter
struct TextFormatter;

impl TextFormatter {
    fn format(report: &TestReport) -> String {
        let mut text = String::new();

        // Header
        text.push_str(&format!(
            "═══════════════════════════════════════════════════════════════\n"
        ));
        text.push_str(&format!(
            "  TEST REPORT: {}\n",
            report.metadata.suite_name
        ));
        text.push_str(&format!(
            "═══════════════════════════════════════════════════════════════\n\n"
        ));

        // Metadata
        if let Some(ref version) = report.metadata.version {
            text.push_str(&format!("  Version: {version}\n"));
        }
        if let Some(ref branch) = report.metadata.branch {
            text.push_str(&format!("  Branch:  {branch}\n"));
        }
        if let Some(ref commit) = report.metadata.commit_hash {
            text.push_str(&format!("  Commit:  {}\n", &commit[..commit.len().min(8)]));
        }
        text.push('\n');

        // Summary
        text.push_str("───────────────────────────────────────────────────────────────\n");
        text.push_str("  SUMMARY\n");
        text.push_str("───────────────────────────────────────────────────────────────\n");
        text.push_str(&format!(
            "  Total:   {}   |   Passed: {}   |   Failed: {}   |   Skipped: {}\n",
            report.summary.total,
            report.summary.passed,
            report.summary.failed,
            report.summary.skipped
        ));
        text.push_str(&format!(
            "  Pass Rate: {:.1}%   |   Duration: {}ms\n",
            report.summary.pass_rate,
            report.summary.total_duration.as_millis()
        ));
        text.push('\n');

        // Verification checks
        if !report.verifications.is_empty() {
            text.push_str("───────────────────────────────────────────────────────────────\n");
            text.push_str("  VERIFICATION CHECKS\n");
            text.push_str("───────────────────────────────────────────────────────────────\n");
            for check in &report.verifications {
                let status = if check.passed { "✓ PASS" } else { "✗ FAIL" };
                text.push_str(&format!(
                    "  [{:^10}] {} ({})\n",
                    status, check.name, check.severity
                ));
                if let Some(ref details) = check.details {
                    text.push_str(&format!("             └── {details}\n"));
                }
            }
            text.push('\n');
        }

        // Failed tests
        let failed: Vec<_> = report.results.iter().filter(|r| r.is_failed()).collect();
        if !failed.is_empty() {
            text.push_str("───────────────────────────────────────────────────────────────\n");
            text.push_str(&format!("  FAILED TESTS ({})\n", failed.len()));
            text.push_str("───────────────────────────────────────────────────────────────\n");
            for result in failed {
                text.push_str(&format!("\n  ✗ {}::{}\n", result.module, result.name));
                if let Some(ref error) = result.error_message {
                    text.push_str(&format!("    Error: {error}\n"));
                }
                if let Some(ref trace) = result.stack_trace {
                    text.push_str("    Stack trace:\n");
                    for line in trace.lines() {
                        text.push_str(&format!("      {line}\n"));
                    }
                }
            }
            text.push('\n');
        }

        // All tests
        text.push_str("───────────────────────────────────────────────────────────────\n");
        text.push_str("  ALL TESTS\n");
        text.push_str("───────────────────────────────────────────────────────────────\n");
        for result in &report.results {
            let status = match result.status {
                TestStatus::Passed => "✓",
                TestStatus::Failed => "✗",
                TestStatus::Skipped => "○",
                TestStatus::Error => "!",
            };
            text.push_str(&format!(
                "  {} {}::{} ({}ms)\n",
                status,
                result.module,
                result.name,
                result.duration.as_millis()
            ));
        }

        // Footer
        text.push_str("\n═══════════════════════════════════════════════════════════════\n");
        text.push_str(&format!(
            "  Overall: {:?}\n",
            report.summary.overall_status()
        ));
        text.push_str("═══════════════════════════════════════════════════════════════\n");

        text
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::reporting::types::{ReportMetadata, TestReport, TestResult, VerificationCheck};
    use std::time::Duration;

    fn sample_report() -> TestReport {
        let metadata = ReportMetadata::new("Sample Tests")
            .with_version("1.0.0")
            .with_branch("main")
            .with_commit("abc123def456");

        let mut report = TestReport::new(metadata);
        report.add_result(TestResult::passed(
            "test_addition",
            "math",
            Duration::from_millis(10),
        ));
        report.add_result(TestResult::failed(
            "test_division",
            "math",
            Duration::from_millis(5),
            "division by zero",
        ));
        report.add_result(TestResult::skipped("test_complex", "math"));
        report.add_verification(VerificationCheck::pass("build", "Verifies build succeeds"));

        report
    }

    #[test]
    fn test_json_format() {
        let report = sample_report();
        let json = ReportFormatter::format(&report, ReportFormat::Json).unwrap();

        assert!(json.contains("\"suite_name\":\"Sample Tests\""));
        assert!(json.contains("\"total\":3"));
        assert!(json.contains("\"passed\":1"));
        assert!(json.contains("\"failed\":1"));
    }

    #[test]
    fn test_json_pretty_format() {
        let report = sample_report();
        let json = ReportFormatter::format(&report, ReportFormat::JsonPretty).unwrap();

        assert!(json.contains("\"suite_name\": \"Sample Tests\""));
        assert!(json.contains('\n'));
    }

    #[test]
    fn test_html_format() {
        let report = sample_report();
        let html = ReportFormatter::format(&report, ReportFormat::Html).unwrap();

        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("Sample Tests"));
        assert!(html.contains("test_addition"));
        assert!(html.contains("test_division"));
        assert!(html.contains("division by zero"));
    }

    #[test]
    fn test_text_format() {
        let report = sample_report();
        let text = ReportFormatter::format(&report, ReportFormat::Text).unwrap();

        assert!(text.contains("Sample Tests"));
        assert!(text.contains("Total:   3"));
        assert!(text.contains("Passed: 1"));
        assert!(text.contains("Failed: 1"));
        assert!(text.contains("test_addition"));
    }

    #[test]
    fn test_html_escaping() {
        let metadata = ReportMetadata::new("<script>alert('xss')</script>");
        let mut report = TestReport::new(metadata);
        report.add_result(TestResult::failed(
            "test_xss",
            "security",
            Duration::ZERO,
            "<img onerror=alert(1)>",
        ));

        let html = ReportFormatter::format(&report, ReportFormat::Html).unwrap();
        assert!(!html.contains("<script>alert"));
        assert!(html.contains("&lt;script&gt;"));
    }

    #[test]
    fn test_format_parsing() {
        assert_eq!("json".parse::<ReportFormat>().unwrap(), ReportFormat::Json);
        assert_eq!(
            "json-pretty".parse::<ReportFormat>().unwrap(),
            ReportFormat::JsonPretty
        );
        assert_eq!("html".parse::<ReportFormat>().unwrap(), ReportFormat::Html);
        assert_eq!("text".parse::<ReportFormat>().unwrap(), ReportFormat::Text);
        assert!("invalid".parse::<ReportFormat>().is_err());
    }

    #[test]
    fn test_write_to_buffer() {
        let report = sample_report();
        let mut buffer = Vec::new();

        ReportFormatter::write(&report, ReportFormat::Json, &mut buffer).unwrap();
        let output = String::from_utf8(buffer).unwrap();

        assert!(output.contains("Sample Tests"));
    }
}
