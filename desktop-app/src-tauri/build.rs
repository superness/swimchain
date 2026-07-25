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
            // This build is about to fail anyway: tauri.windows.conf.json globs
            // `binaries/*.exe` as a bundle resource, and Tauri validates that in
            // EVERY profile (`cargo build`, `cargo test` and `tauri dev` all
            // die, not just `tauri build`) with "glob pattern binaries/*.exe
            // path not found" — which reads like a config bug rather than
            // "nobody staged the sidecar". Fail here instead, naming the fix.
            // The Linux/macOS configs use a tolerant `binaries/[s]w` pattern
            // that a missing file doesn't break, so those only get the warning.
            let msg = format!(
                "Bundled sw binary not found at {}.\n         \
                 Stage it with:  cargo build --release && cp {} {}\n         \
                 Or run desktop-app/build.sh, which does the whole sequence.",
                bundled.display(),
                fresh.display(),
                bundled.display()
            );
            if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
                panic!("{msg}");
            }
            println!("cargo:warning={msg}");
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

/// `tauri build` builds the frontend itself (npm run tauri:build -> build:all),
/// but a bare `cargo build`/`cargo check`/`cargo test` in this crate does not —
/// and `generate_context!` then fails deep in a proc macro with "frontendDist ...
/// doesn't exist", which doesn't say how to fix it. Warn with the command; left
/// a warning rather than a hard error so `tauri dev` (which serves the frontend
/// from devUrl and never reads this directory) is unaffected.
fn check_frontend_dist() {
    let dist = PathBuf::from("../dist");
    println!("cargo:rerun-if-changed=../dist/index.html");
    if !dist.join("index.html").exists() {
        println!(
            "cargo:warning=Frontend not built at {} — run: npm run build:all (from desktop-app/)",
            dist.display()
        );
    }
}

fn main() {
    check_bundled_sw();
    check_frontend_dist();
    tauri_build::build()
}
