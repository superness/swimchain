// Copied from desktop-app/src-tauri/build.rs verbatim. `trench-client/src-tauri` sits
// at the same depth as `desktop-app/src-tauri` (two levels below the repo root), so
// the relative path to the fresh binary (`<repo-root>/target/release/`) is unchanged.
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

fn hash_file(path: &PathBuf) -> Option<[u8; 32]> {
    let data = fs::read(path).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    Some(hasher.finalize().into())
}

fn check_bundled_sw() {
    let bin_name = if cfg!(target_os = "windows") {
        "sw.exe"
    } else {
        "sw"
    };
    let bundled = PathBuf::from("binaries").join(bin_name);
    let fresh = PathBuf::from("../../target/release").join(bin_name);

    println!("cargo:rerun-if-changed={}", bundled.display());
    println!("cargo:rerun-if-changed={}", fresh.display());

    let bundled_hash = match hash_file(&bundled) {
        Some(h) => h,
        None => {
            println!(
                "cargo:warning=Bundled sw binary not found at {} — Tauri bundle will be incomplete",
                bundled.display()
            );
            return;
        }
    };

    let fresh_hash = match hash_file(&fresh) {
        Some(h) => h,
        None => {
            println!(
                "cargo:warning=No fresh sw binary at {} — skipping freshness check (downstream packager build?)",
                fresh.display()
            );
            println!(
                "cargo:warning=Bundled sw SHA256: {}",
                hex::encode(bundled_hash)
            );
            return;
        }
    };

    if bundled_hash != fresh_hash {
        println!(
            "cargo:warning=Bundled sw binary at {} is STALE.",
            bundled.display()
        );
        println!(
            "cargo:warning=  bundled SHA256: {}",
            hex::encode(bundled_hash)
        );
        println!(
            "cargo:warning=  fresh   SHA256: {}",
            hex::encode(fresh_hash)
        );
        println!(
            "cargo:warning=Run: cp {} {}",
            fresh.display(),
            bundled.display()
        );
        panic!("Bundled sw binary is stale — see warnings above.");
    }

    println!(
        "cargo:warning=Bundled sw SHA256: {} (matches fresh build)",
        hex::encode(bundled_hash)
    );
}

fn main() {
    check_bundled_sw();
    tauri_build::build()
}
