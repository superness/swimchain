//! Integration tests for Swimchain

use swimchain::{is_initialized, VERSION};

#[test]
fn test_library_loads() {
    // Verify the library can be loaded and basic functions work
    assert!(is_initialized());
}

#[test]
fn test_version_format() {
    // Version should follow semver
    let parts: Vec<&str> = VERSION.split('.').collect();
    assert!(parts.len() >= 2, "Version should have at least major.minor");
}
