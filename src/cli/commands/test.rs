//! Test runner CLI command
//!
//! Orchestrates test execution with customizable test selection and report formatting.
//!
//! # Overview
//!
//! The test command provides a unified interface for:
//! - Running cargo tests with various filters
//! - Collecting and aggregating test results
//! - Outputting reports in multiple formats (JSON, HTML, text)
//! - Running verification checks on test results
//!
//! # Examples
//!
//! ```bash
//! # Run all tests with default text output
//! sw test run
//!
//! # Run specific tests by name pattern
//! sw test run --filter "block_building"
//!
//! # Run only unit tests with JSON output
//! sw test run --lib --format json
//!
//! # Run integration tests and save HTML report
//! sw test run --test blocks_integration --format html --output report.html
//!
//! # Run tests with verification thresholds
//! sw test run --min-pass-rate 90 --fail-on-skip
//! ```

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

use clap::{Args, Subcommand, ValueEnum};

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::cli::reporting::{
    get_git_branch, get_git_commit, CargoTestParser, CollectorBuilder, ReportFormat,
    ReportFormatter, Thresholds, VerifierBuilder,
};

/// Test runner commands
#[derive(Subcommand, Debug)]
pub enum TestCmd {
    /// Run tests and generate reports
    #[command(
        about = "Run tests and generate reports",
        long_about = "Execute cargo tests with optional filtering, collect results, \
                      run verification checks, and output reports in various formats."
    )]
    Run(TestRunArgs),

    /// List available tests without running them
    #[command(about = "List available tests without running them")]
    List(TestListArgs),
}

/// Arguments for the test run command
#[derive(Args, Debug)]
pub struct TestRunArgs {
    /// Filter tests by name pattern (supports regex)
    #[arg(short, long)]
    pub filter: Option<String>,

    /// Run only library unit tests (--lib)
    #[arg(long, conflicts_with_all = ["test", "all_targets"])]
    pub lib: bool,

    /// Run a specific integration test file
    #[arg(long, conflicts_with_all = ["lib", "all_targets"])]
    pub test: Option<String>,

    /// Run all targets including benchmarks (--all-targets)
    #[arg(long, conflicts_with_all = ["lib", "test"])]
    pub all_targets: bool,

    /// Run tests in release mode
    #[arg(long)]
    pub release: bool,

    /// Number of test threads (default: number of CPUs)
    #[arg(long, short = 'j')]
    pub jobs: Option<usize>,

    /// Run tests sequentially (equivalent to --jobs 1)
    #[arg(long, conflicts_with = "jobs")]
    pub sequential: bool,

    /// Show test output even for passing tests
    #[arg(long)]
    pub nocapture: bool,

    /// Output format for the report
    #[arg(long, short = 'F', value_enum, default_value = "text")]
    pub format: OutputFormat,

    /// Write report to file instead of stdout
    #[arg(long, short = 'o')]
    pub output: Option<PathBuf>,

    /// Suite name for the report metadata
    #[arg(long, default_value = "Swimchain Tests")]
    pub suite_name: String,

    /// Minimum pass rate percentage (0-100) for verification
    #[arg(long)]
    pub min_pass_rate: Option<f64>,

    /// Maximum allowed failures for verification
    #[arg(long)]
    pub max_failures: Option<usize>,

    /// Fail if any tests are skipped
    #[arg(long)]
    pub fail_on_skip: bool,

    /// Run verification checks on results
    #[arg(long)]
    pub verify: bool,

    /// Include git commit and branch in report metadata
    #[arg(long, default_value = "true")]
    pub git_info: bool,

    /// Additional arguments to pass to cargo test
    #[arg(last = true)]
    pub cargo_args: Vec<String>,
}

/// Arguments for the test list command
#[derive(Args, Debug)]
pub struct TestListArgs {
    /// Filter tests by name pattern
    #[arg(short, long)]
    pub filter: Option<String>,

    /// List only library unit tests
    #[arg(long, conflicts_with_all = ["test", "all_targets"])]
    pub lib: bool,

    /// List tests from a specific integration test file
    #[arg(long, conflicts_with_all = ["lib", "all_targets"])]
    pub test: Option<String>,

    /// List all targets
    #[arg(long, conflicts_with_all = ["lib", "test"])]
    pub all_targets: bool,

    /// Output in JSON format
    #[arg(long)]
    pub json: bool,
}

/// Output format enum that maps to ReportFormat
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, ValueEnum)]
pub enum OutputFormat {
    /// Plain text format
    #[default]
    Text,
    /// Compact JSON format
    Json,
    /// Pretty-printed JSON format
    JsonPretty,
    /// HTML format with styling
    Html,
}

impl From<OutputFormat> for ReportFormat {
    fn from(format: OutputFormat) -> Self {
        match format {
            OutputFormat::Text => ReportFormat::Text,
            OutputFormat::Json => ReportFormat::Json,
            OutputFormat::JsonPretty => ReportFormat::JsonPretty,
            OutputFormat::Html => ReportFormat::Html,
        }
    }
}

/// Execute a test command
pub fn execute(cmd: TestCmd, _config: &CliConfig) -> Result<()> {
    match cmd {
        TestCmd::Run(args) => execute_run(args),
        TestCmd::List(args) => execute_list(args),
    }
}

/// Execute the test run command
fn execute_run(args: TestRunArgs) -> Result<()> {
    // Build cargo test arguments
    let cargo_args = build_cargo_args(&args);

    // Create the collector with metadata
    let mut builder = CollectorBuilder::new(&args.suite_name);

    if args.git_info {
        if let Some(commit) = get_git_commit() {
            builder = builder.commit(commit);
        }
        if let Some(branch) = get_git_branch() {
            builder = builder.branch(branch);
        }
    }

    builder = builder.environment(std::env::var("CI").map_or("local", |_| "ci").to_string());

    // Run the tests
    let mut parser = CargoTestParser::new(&args.suite_name);

    // Convert args to string slices for run_tests
    let arg_refs: Vec<&str> = cargo_args.iter().map(String::as_str).collect();

    let mut report = parser
        .run_tests(&arg_refs)
        .map_err(|e| CliError::Other(format!("Failed to run cargo test: {e}")))?;

    // Update metadata from builder
    let collector = builder.build();
    let collector_report = collector.finalize();
    report.metadata.version = collector_report.metadata.version;
    report.metadata.commit_hash = collector_report.metadata.commit_hash;
    report.metadata.branch = collector_report.metadata.branch;
    report.metadata.environment = collector_report.metadata.environment;

    // Run verification if requested
    if args.verify
        || args.min_pass_rate.is_some()
        || args.max_failures.is_some()
        || args.fail_on_skip
    {
        let thresholds = build_thresholds(&args);

        // Add threshold checks to the report
        let checks = thresholds.check(&report);
        for check in checks {
            report.add_verification(check);
        }

        // Also run default verification if explicitly requested
        if args.verify {
            let verifier = VerifierBuilder::new().with_default_checks().build();
            verifier.verify(&mut report);
        }
    }

    // Format the report
    let format: ReportFormat = args.format.into();
    let output = ReportFormatter::format(&report, format)
        .map_err(|e| CliError::Other(format!("Failed to format report: {e}")))?;

    // Write output
    if let Some(path) = args.output {
        let mut file = File::create(&path)
            .map_err(|e| CliError::Other(format!("Failed to create output file: {e}")))?;
        file.write_all(output.as_bytes())
            .map_err(|e| CliError::Other(format!("Failed to write report: {e}")))?;
        eprintln!("Report written to: {}", path.display());
    } else {
        print!("{output}");
    }

    // Exit with appropriate code
    if report.all_passed() {
        Ok(())
    } else {
        // Return error to signal test failures (non-zero exit code)
        Err(CliError::Other(format!(
            "{} test(s) failed",
            report.summary.failed
        )))
    }
}

/// Execute the test list command
fn execute_list(args: TestListArgs) -> Result<()> {
    use std::process::Command;

    let mut cmd = Command::new("cargo");
    cmd.arg("test");

    if args.lib {
        cmd.arg("--lib");
    } else if let Some(ref test_name) = args.test {
        cmd.args(["--test", test_name]);
    } else if args.all_targets {
        cmd.arg("--all-targets");
    }

    if let Some(ref filter) = args.filter {
        cmd.arg(filter);
    }

    // Add -- --list to list tests
    cmd.args(["--", "--list"]);

    let output = cmd
        .output()
        .map_err(|e| CliError::Other(format!("Failed to run cargo test --list: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Parse test names from output
    let tests: Vec<&str> = stdout
        .lines()
        .filter(|line| line.ends_with(": test") || line.ends_with(": bench"))
        .map(|line| {
            // Remove ": test" or ": bench" suffix
            line.trim_end_matches(": test").trim_end_matches(": bench")
        })
        .collect();

    if args.json {
        let json_output = serde_json::json!({
            "tests": tests,
            "count": tests.len(),
        });
        println!(
            "{}",
            serde_json::to_string_pretty(&json_output)
                .map_err(|e| CliError::Other(format!("JSON serialization failed: {e}")))?
        );
    } else {
        if tests.is_empty() {
            println!("No tests found.");
            if !stderr.is_empty() {
                eprintln!("\nCargo output:\n{stderr}");
            }
        } else {
            println!("Available tests ({}):\n", tests.len());
            for test in &tests {
                println!("  {test}");
            }
        }
    }

    Ok(())
}

/// Build cargo test arguments from command options
fn build_cargo_args(args: &TestRunArgs) -> Vec<String> {
    let mut cargo_args = Vec::new();

    // Target selection
    if args.lib {
        cargo_args.push("--lib".to_string());
    } else if let Some(ref test_name) = args.test {
        cargo_args.push("--test".to_string());
        cargo_args.push(test_name.clone());
    } else if args.all_targets {
        cargo_args.push("--all-targets".to_string());
    }

    // Build profile
    if args.release {
        cargo_args.push("--release".to_string());
    }

    // Parallelism
    if args.sequential {
        cargo_args.push("--".to_string());
        cargo_args.push("--test-threads=1".to_string());
    } else if let Some(jobs) = args.jobs {
        cargo_args.push("--".to_string());
        cargo_args.push(format!("--test-threads={jobs}"));
    }

    // Test filter
    if let Some(ref filter) = args.filter {
        // If we haven't added -- yet, add it
        if !cargo_args.contains(&"--".to_string()) {
            cargo_args.push("--".to_string());
        }
        cargo_args.push(filter.clone());
    }

    // Nocapture
    if args.nocapture {
        if !cargo_args.contains(&"--".to_string()) {
            cargo_args.push("--".to_string());
        }
        cargo_args.push("--nocapture".to_string());
    }

    // Additional cargo args
    for arg in &args.cargo_args {
        cargo_args.push(arg.clone());
    }

    cargo_args
}

/// Build verification thresholds from command options
fn build_thresholds(args: &TestRunArgs) -> Thresholds {
    let mut thresholds = Thresholds::default();

    if let Some(rate) = args.min_pass_rate {
        thresholds.min_pass_rate = rate;
    }

    if let Some(max) = args.max_failures {
        thresholds.max_failures = max;
    }

    if args.fail_on_skip {
        thresholds.max_skipped = 0;
    }

    thresholds
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_format_conversion() {
        assert_eq!(ReportFormat::from(OutputFormat::Text), ReportFormat::Text);
        assert_eq!(ReportFormat::from(OutputFormat::Json), ReportFormat::Json);
        assert_eq!(
            ReportFormat::from(OutputFormat::JsonPretty),
            ReportFormat::JsonPretty
        );
        assert_eq!(ReportFormat::from(OutputFormat::Html), ReportFormat::Html);
    }

    #[test]
    fn test_build_cargo_args_lib() {
        let args = TestRunArgs {
            filter: None,
            lib: true,
            test: None,
            all_targets: false,
            release: false,
            jobs: None,
            sequential: false,
            nocapture: false,
            format: OutputFormat::Text,
            output: None,
            suite_name: "Test".to_string(),
            min_pass_rate: None,
            max_failures: None,
            fail_on_skip: false,
            verify: false,
            git_info: false,
            cargo_args: vec![],
        };

        let cargo_args = build_cargo_args(&args);
        assert!(cargo_args.contains(&"--lib".to_string()));
    }

    #[test]
    fn test_build_cargo_args_with_filter() {
        let args = TestRunArgs {
            filter: Some("my_test".to_string()),
            lib: false,
            test: None,
            all_targets: false,
            release: false,
            jobs: None,
            sequential: false,
            nocapture: false,
            format: OutputFormat::Text,
            output: None,
            suite_name: "Test".to_string(),
            min_pass_rate: None,
            max_failures: None,
            fail_on_skip: false,
            verify: false,
            git_info: false,
            cargo_args: vec![],
        };

        let cargo_args = build_cargo_args(&args);
        assert!(cargo_args.contains(&"--".to_string()));
        assert!(cargo_args.contains(&"my_test".to_string()));
    }

    #[test]
    fn test_build_cargo_args_sequential() {
        let args = TestRunArgs {
            filter: None,
            lib: false,
            test: None,
            all_targets: false,
            release: false,
            jobs: None,
            sequential: true,
            nocapture: false,
            format: OutputFormat::Text,
            output: None,
            suite_name: "Test".to_string(),
            min_pass_rate: None,
            max_failures: None,
            fail_on_skip: false,
            verify: false,
            git_info: false,
            cargo_args: vec![],
        };

        let cargo_args = build_cargo_args(&args);
        assert!(cargo_args.contains(&"--test-threads=1".to_string()));
    }

    #[test]
    fn test_build_thresholds() {
        let args = TestRunArgs {
            filter: None,
            lib: false,
            test: None,
            all_targets: false,
            release: false,
            jobs: None,
            sequential: false,
            nocapture: false,
            format: OutputFormat::Text,
            output: None,
            suite_name: "Test".to_string(),
            min_pass_rate: Some(90.0),
            max_failures: Some(5),
            fail_on_skip: true,
            verify: true,
            git_info: false,
            cargo_args: vec![],
        };

        let thresholds = build_thresholds(&args);
        assert!((thresholds.min_pass_rate - 90.0).abs() < f64::EPSILON);
        assert_eq!(thresholds.max_failures, 5);
        assert_eq!(thresholds.max_skipped, 0); // fail_on_skip = true means max_skipped = 0
    }
}
