//! CLI Integration Tests
//!
//! These tests verify the CLI commands work correctly end-to-end.
//! Run with: cargo test --test cli_integration

use assert_cmd::Command;
use predicates::prelude::*;
use std::path::PathBuf;
use tempfile::tempdir;

#[cfg(feature = "cli-testing")]
use std::fs;

/// Get a command builder for the cs binary
fn cs() -> Command {
    Command::cargo_bin("cs").expect("cs binary not found")
}

/// Create a temporary data directory and return the path
fn temp_data_dir() -> (tempfile::TempDir, PathBuf) {
    let dir = tempdir().expect("failed to create temp dir");
    let path = dir.path().to_path_buf();
    (dir, path)
}

/// Helper to run cs command with a custom data dir
fn cs_with_dir(dir: &PathBuf) -> Command {
    let mut cmd = cs();
    cmd.env("SWIMCHAIN_DATA_DIR", dir);
    cmd
}

// ============================================================================
// Test 1: identity_create_success
// ============================================================================

#[test]
#[cfg(feature = "cli-testing")]
fn test_identity_create_success() {
    let (_dir, path) = temp_data_dir();

    let mut cmd = cs_with_dir(&path);
    cmd.args(&["identity", "create", "--no-pow"])
        .write_stdin("testpass123\ntestpass123\n")
        .assert()
        .success()
        .stdout(predicate::str::contains("Identity created successfully"))
        .stdout(predicate::str::contains("sw1"));

    // Verify identity file was created
    assert!(path.join("identity.enc").exists());
}

// ============================================================================
// Test 2: identity_roundtrip
// ============================================================================

#[test]
#[cfg(feature = "cli-testing")]
fn test_identity_roundtrip() {
    let (_dir, path) = temp_data_dir();
    let backup_path = path.join("backup.bin");

    // Create identity
    cs_with_dir(&path)
        .args(&["identity", "create", "--no-pow"])
        .write_stdin("testpass\ntestpass\n")
        .assert()
        .success();

    // Get the address
    let output = cs_with_dir(&path)
        .args(&["identity", "show", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");
    let original_address = json["address"].as_str().expect("address field");

    // Export identity
    cs_with_dir(&path)
        .args(&["identity", "export", backup_path.to_str().unwrap()])
        .write_stdin("testpass\nexportpass\nexportpass\n")
        .assert()
        .success();

    // Delete identity
    fs::remove_file(path.join("identity.enc")).expect("delete identity");

    // Import identity
    cs_with_dir(&path)
        .args(&["identity", "import", backup_path.to_str().unwrap()])
        .write_stdin("exportpass\nnewpass\nnewpass\n")
        .assert()
        .success()
        .stdout(predicate::str::contains("Identity imported successfully"));

    // Verify same address
    let output = cs_with_dir(&path)
        .args(&["identity", "show", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");
    let imported_address = json["address"].as_str().expect("address field");

    assert_eq!(original_address, imported_address);
}

// ============================================================================
// Test 3: wrong_password_decrypt
// ============================================================================

#[test]
#[cfg(feature = "cli-testing")]
fn test_wrong_password_decrypt() {
    let (_dir, path) = temp_data_dir();
    let backup_path = path.join("backup.bin");

    // Create and export identity
    cs_with_dir(&path)
        .args(&["identity", "create", "--no-pow"])
        .write_stdin("correctpass\ncorrectpass\n")
        .assert()
        .success();

    cs_with_dir(&path)
        .args(&["identity", "export", backup_path.to_str().unwrap()])
        .write_stdin("correctpass\nexportpass\nexportpass\n")
        .assert()
        .success();

    // Delete and try to import with wrong password
    fs::remove_file(path.join("identity.enc")).expect("delete identity");

    cs_with_dir(&path)
        .args(&["identity", "import", backup_path.to_str().unwrap()])
        .write_stdin("wrongpass\n")
        .assert()
        .failure()
        .code(3)
        .stderr(predicate::str::contains("Decryption failed"));
}

// ============================================================================
// Test 4: missing_identity_error
// ============================================================================

#[test]
fn test_missing_identity_error() {
    let (_dir, path) = temp_data_dir();

    cs_with_dir(&path)
        .args(&["identity", "show"])
        .assert()
        .failure()
        .code(3)
        .stderr(predicate::str::contains("No identity found"));
}

// ============================================================================
// Test 5: json_output_valid
// ============================================================================

#[test]
#[cfg(feature = "cli-testing")]
fn test_json_output_valid() {
    let (_dir, path) = temp_data_dir();

    // Create identity first
    cs_with_dir(&path)
        .args(&["identity", "create", "--no-pow"])
        .write_stdin("testpass\ntestpass\n")
        .assert()
        .success();

    // Get JSON output
    let output = cs_with_dir(&path)
        .args(&["identity", "show", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");

    assert!(json["address"].is_string());
    assert!(json["address"].as_str().unwrap().starts_with("sw1"));
}

// ============================================================================
// Test 6: help_examples_present
// ============================================================================

#[test]
fn test_help_examples_present() {
    cs().args(&["identity", "-h"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Manage cryptographic identities"));

    cs().args(&["space", "-h"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Create, join, and manage"));

    cs().args(&["post", "-h"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Create and view"));
}

// ============================================================================
// Test 7: space_join_leave
// ============================================================================

#[test]
#[cfg(feature = "cli-testing")]
fn test_space_join_leave() {
    let (_dir, path) = temp_data_dir();

    // Create a valid space ID
    let space_id = "sp1qqqqqqqqqqqqqqqqqqqqqqqqqqqq";

    // Join space
    cs_with_dir(&path)
        .args(&["space", "join", space_id])
        .assert()
        .success()
        .stdout(predicate::str::contains("Joined space"));

    // Verify in list
    cs_with_dir(&path)
        .args(&["space", "list"])
        .assert()
        .success()
        .stdout(predicate::str::contains(space_id));

    // Leave space
    cs_with_dir(&path)
        .args(&["space", "leave", space_id])
        .assert()
        .success()
        .stdout(predicate::str::contains("Left space"));

    // Verify not in list
    cs_with_dir(&path)
        .args(&["space", "list"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Not following any spaces"));
}

// ============================================================================
// Test 8: config_persist
// ============================================================================

#[test]
fn test_config_persist() {
    let (_dir, path) = temp_data_dir();

    // Set a config value
    cs_with_dir(&path)
        .args(&["config", "set", "storage_target_mb", "1234"])
        .assert()
        .success();

    // Verify it persists (new command instance)
    cs_with_dir(&path)
        .args(&["config", "get", "storage_target_mb"])
        .assert()
        .success()
        .stdout(predicate::str::contains("1234"));
}

// ============================================================================
// Test 9: exit_code_identity
// ============================================================================

#[test]
fn test_exit_code_identity() {
    let (_dir, path) = temp_data_dir();

    // No identity should give exit code 3
    cs_with_dir(&path)
        .args(&["identity", "show"])
        .assert()
        .failure()
        .code(3);
}

// ============================================================================
// Test 10: exit_code_space
// ============================================================================

#[test]
fn test_exit_code_space() {
    let (_dir, path) = temp_data_dir();

    // Invalid space ID should give exit code 2
    cs_with_dir(&path)
        .args(&["space", "join", "invalidxxx"])
        .assert()
        .failure()
        .code(2)
        .stderr(predicate::str::contains("Invalid space ID"));
}

// ============================================================================
// Test 11: content_id_validation
// ============================================================================

#[test]
fn test_content_id_validation() {
    let (_dir, path) = temp_data_dir();

    // Invalid content ID should give exit code 2
    cs_with_dir(&path)
        .args(&["post", "view", "invalid"])
        .assert()
        .failure()
        .code(2)
        .stderr(predicate::str::contains("Invalid content ID"));
}

// ============================================================================
// Test 12: version_display
// ============================================================================

#[test]
fn test_version_display() {
    cs().arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains("cs"));
}

// ============================================================================
// Test 13: global_help
// ============================================================================

#[test]
fn test_global_help() {
    cs().arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("identity"))
        .stdout(predicate::str::contains("space"))
        .stdout(predicate::str::contains("post"))
        .stdout(predicate::str::contains("sync"))
        .stdout(predicate::str::contains("config"))
        .stdout(predicate::str::contains("completions"));
}

// ============================================================================
// Test 14: completions_bash
// ============================================================================

#[test]
fn test_completions_bash() {
    cs().args(&["completions", "generate", "bash"])
        .assert()
        .success()
        .stdout(predicate::str::contains("complete"))
        .stdout(predicate::str::contains("_cs"));
}

// ============================================================================
// Test 15: completions_zsh
// ============================================================================

#[test]
fn test_completions_zsh() {
    cs().args(&["completions", "generate", "zsh"])
        .assert()
        .success()
        .stdout(predicate::str::starts_with("#compdef cs"));
}

// ============================================================================
// Test 16: completions_fish
// ============================================================================

#[test]
fn test_completions_fish() {
    cs().args(&["completions", "generate", "fish"])
        .assert()
        .success()
        .stdout(predicate::str::contains("complete -c cs"));
}

// ============================================================================
// Test 17: completions_powershell
// ============================================================================

#[test]
fn test_completions_powershell() {
    cs().args(&["completions", "generate", "powershell"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Register-ArgumentCompleter"));
}

// ============================================================================
// Test 18: search_empty_index
// ============================================================================

#[test]
fn test_search_empty_index() {
    let (_dir, path) = temp_data_dir();

    cs_with_dir(&path)
        .args(&["search", "test"])
        .assert()
        .success()
        .stdout(predicate::str::contains("No content indexed"));
}

// ============================================================================
// Test 19: search_json_output
// ============================================================================

#[test]
fn test_search_json_output() {
    let (_dir, path) = temp_data_dir();

    let output = cs_with_dir(&path)
        .args(&["search", "--json", "test"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");

    assert!(json["query"].is_string());
    assert_eq!(json["query"].as_str().unwrap(), "test");
    assert!(json["results"].is_array());
    assert!(json["count"].is_number());
}

// ============================================================================
// Test 20: sync_status_json
// ============================================================================

#[test]
fn test_sync_status_json() {
    let (_dir, path) = temp_data_dir();

    let output = cs_with_dir(&path)
        .args(&["sync", "status", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");

    assert!(json["connected_peers"].is_number());
    assert!(json["storage_used_bytes"].is_number());
    assert!(json["syncing"].is_boolean());
}

// ============================================================================
// Test 21: sync_peers_json
// ============================================================================

#[test]
fn test_sync_peers_json() {
    let (_dir, path) = temp_data_dir();

    let output = cs_with_dir(&path)
        .args(&["sync", "peers", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");

    assert!(json["peers"].is_array());
    assert!(json["count"].is_number());
}

// ============================================================================
// Test 22: config_get_json
// ============================================================================

#[test]
fn test_config_get_json() {
    let (_dir, path) = temp_data_dir();

    let output = cs_with_dir(&path)
        .args(&["config", "get", "--json", "network_port"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");

    assert_eq!(json["key"].as_str().unwrap(), "network_port");
    assert!(json["value"].is_number());
}

// ============================================================================
// Test 23: config_show_json
// ============================================================================

#[test]
fn test_config_show_json() {
    let (_dir, path) = temp_data_dir();

    let output = cs_with_dir(&path)
        .args(&["config", "show", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");

    assert!(json["network_port"].is_number());
    assert!(json["storage_target_mb"].is_number());
    assert!(json["pow_parallelism"].is_number());
    assert!(json["sync_on_startup"].is_boolean());
}

// ============================================================================
// Test 24: global_json_flag
// ============================================================================

#[test]
#[cfg(feature = "cli-testing")]
fn test_global_json_flag() {
    let (_dir, path) = temp_data_dir();

    // Create identity first
    cs_with_dir(&path)
        .args(&["identity", "create", "--no-pow"])
        .write_stdin("testpass\ntestpass\n")
        .assert()
        .success();

    // Test global --json flag (before subcommand)
    let output = cs_with_dir(&path)
        .args(&["--json", "identity", "show"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let output_str = String::from_utf8_lossy(&output);
    let json: serde_json::Value = serde_json::from_str(&output_str).expect("valid JSON");
    assert!(json["address"].is_string());
}

// ============================================================================
// Test 25: post_engage_help
// ============================================================================

#[test]
fn test_post_engage_help() {
    cs().args(&["post", "engage", "-h"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Contribute PoW"))
        .stdout(predicate::str::contains("--seconds"))
        .stdout(predicate::str::contains("--json"));
}

// ============================================================================
// Test 26: post_engage_invalid_content_id
// ============================================================================

#[test]
#[cfg(feature = "cli-testing")]
fn test_post_engage_invalid_content_id() {
    let (_dir, path) = temp_data_dir();

    // Create identity first (required for engage)
    cs_with_dir(&path)
        .args(&["identity", "create", "--no-pow"])
        .write_stdin("testpass\ntestpass\n")
        .assert()
        .success();

    // Try to engage with invalid content ID
    cs_with_dir(&path)
        .args(&["post", "engage", "invalid"])
        .assert()
        .failure()
        .code(2)
        .stderr(predicate::str::contains("Invalid content ID"));
}

// ============================================================================
// Test 27: all_commands_help
// ============================================================================

#[test]
fn test_all_commands_help() {
    // Test help for each command
    let commands = [
        "identity",
        "space",
        "post",
        "search",
        "sync",
        "config",
        "completions",
    ];

    for cmd in commands {
        cs().args(&[cmd, "--help"]).assert().success();
    }
}
