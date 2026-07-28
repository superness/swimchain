// Copied from `trench-client/src-tauri/build.rs` (itself copied from
// `desktop-app/src-tauri/build.rs`). `shoal-client/src-tauri` sits at the same depth as
// both — two levels below the repo root — so the relative path to the fresh binary
// (`<repo-root>/target/release/`) is unchanged.
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

fn hash_file(path: &PathBuf) -> Option<[u8; 32]> {
    let data = fs::read(path).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    Some(hasher.finalize().into())
}

/// The one way to opt out of a hard failure in this file. Set it and the two checks
/// below degrade to warnings; leave it unset and a missing or unverifiable sidecar
/// stops the build.
///
/// It exists for exactly one real case — a downstream packager that stages an
/// already-built `binaries/sw` and never checks out `target/release/` at all — and it
/// has to be a DELIBERATE act, because the alternative it replaces was a silent one:
/// this file used to `cargo:warning` and return whenever the fresh binary was absent,
/// and cargo warnings from a build script are not even printed by default for a
/// non-path dependency. A release could therefore ship whatever `binaries/` happened
/// to hold, arbitrarily old, and say so only in output nobody reads.
const OPT_OUT_ENV: &str = "SHOAL_ALLOW_UNVERIFIED_SIDECAR";

fn opted_out() -> bool {
    println!("cargo:rerun-if-env-changed={OPT_OUT_ENV}");
    matches!(std::env::var(OPT_OUT_ENV), Ok(v) if !v.is_empty() && v != "0")
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
            // This build is about to fail anyway: tauri.conf.json globs `binaries/sw*` as
            // a bundle resource, and Tauri validates that in EVERY profile (`cargo
            // build`, `cargo test` and `tauri dev` all die, not just `tauri build`)
            // with "glob pattern binaries/sw* path not found" — which reads like a config
            // bug rather than "nobody staged the sidecar". Fail here instead, naming
            // the fix.
            //
            // This is now a hard failure on EVERY target, not only Windows. The glob
            // moved from tauri.windows.conf.json to the base config precisely because
            // `bundle.targets` is "all": with the glob in the Windows-only overlay, a
            // macOS or Linux `tauri build` produced a perfectly valid-looking bundle
            // WITH NO NODE INSIDE IT, and nothing anywhere said so.
            let msg = format!(
                "Bundled sw binary not found at {}.\n         \
                 Stage it with:  cargo build --release && cp {} {}\n         \
                 Or run shoal-client/build.sh, which does the whole sequence.\n         \
                 (Deliberate downstream packager build? Set {}=1.)",
                bundled.display(),
                fresh.display(),
                bundled.display(),
                OPT_OUT_ENV
            );
            if opted_out() {
                println!("cargo:warning={msg}");
                return;
            }
            panic!("{msg}");
        }
    };

    let fresh_hash = match hash_file(&fresh) {
        Some(h) => h,
        None => {
            // NOT a warning any more. A missing fresh binary means the freshness check
            // — the only thing standing between a release and a silently stale node —
            // cannot run at all, and "cannot verify" is not "verified".
            let msg = format!(
                "No fresh sw binary at {}, so the bundled one at {} (SHA256 {}) CANNOT BE VERIFIED as current.\n         \
                 Build it with:  cargo build --release   (from the repo root)\n         \
                 Or run shoal-client/build.sh, which does the whole sequence.\n         \
                 (Deliberate downstream packager build? Set {}=1.)",
                fresh.display(),
                bundled.display(),
                hex::encode(bundled_hash),
                OPT_OUT_ENV
            );
            if opted_out() {
                println!("cargo:warning={msg}");
                return;
            }
            panic!("{msg}");
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

/// `tauri build` builds the web view itself (tauri.conf.json's `beforeBuildCommand`),
/// but a bare `cargo build`/`cargo check`/`cargo test` in this crate does not — and
/// `generate_context!` then fails deep in a proc macro with "frontendDist ... doesn't
/// exist", which doesn't say how to fix it. Warn with the command; a warning rather
/// than a hard error so `tauri dev` (which serves from devUrl and never reads this
/// directory) is unaffected.
fn check_frontend_dist() {
    let dist = PathBuf::from("../dist");
    println!("cargo:rerun-if-changed=../dist/index.html");
    if !dist.join("index.html").exists() {
        println!(
            "cargo:warning=Shell view not built at {} — run: npm run build (from shoal-client/)",
            dist.display()
        );
    }
}

fn main() {
    check_bundled_sw();
    check_frontend_dist();
    tauri_build::build()
}
