//! Scans an apps directory (`launcher-apps/` in dev, bundled `apps/` in
//! release) into a list of `AppEntry` for the launcher UI, reusing
//! `app_manifest::parse_manifest` (Phase 1).

use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub icon: Option<String>, // absolute path when the icon file exists, else None
    pub version: Option<String>,
}

/// Scan `apps_root` for `*/app.json` manifests → sorted `Vec<AppEntry>`.
/// Invalid/missing manifests are skipped (logged), never fatal.
pub fn scan_apps(apps_root: &Path) -> Vec<AppEntry> {
    let mut out = Vec::new();
    let Ok(read) = std::fs::read_dir(apps_root) else {
        return out;
    };
    for entry in read.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let manifest_path = dir.join("app.json");
        let Ok(json) = std::fs::read_to_string(&manifest_path) else {
            continue;
        };
        let m = match crate::app_manifest::parse_manifest(&json) {
            Ok(m) => m,
            Err(e) => {
                log::warn!("[registry] skip {}: {e}", dir.display());
                continue;
            }
        };
        let icon = m.icon.as_ref().and_then(|name| {
            let p = dir.join(name);
            p.exists().then(|| p.to_string_lossy().to_string())
        });
        out.push(AppEntry {
            id: m.id,
            name: m.name,
            icon,
            version: m.version,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_app(root: &std::path::Path, id: &str, json: &str, with_icon: bool) {
        let d = root.join(id);
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("app.json"), json).unwrap();
        if with_icon {
            fs::write(d.join("icon.png"), b"x").unwrap();
        }
    }

    #[test]
    fn scans_valid_apps_sorted_by_name_and_resolves_icon() {
        let dir = tempfile::tempdir().unwrap();
        write_app(
            dir.path(),
            "feed",
            r#"{"id":"feed","name":"Swimchain Feed","icon":"icon.png","exec":"feed-app.exe","version":"0.1.0"}"#,
            true,
        );
        write_app(
            dir.path(),
            "aaa",
            r#"{"id":"aaa","name":"Alpha","exec":"a.exe"}"#,
            false,
        );
        let entries = scan_apps(dir.path());
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "Alpha"); // sorted by name
        assert_eq!(entries[1].name, "Swimchain Feed");
        assert!(entries[0].icon.is_none()); // no icon file
        assert!(entries[1].icon.as_ref().unwrap().ends_with("icon.png")); // resolved abs path
    }

    #[test]
    fn skips_invalid_and_missing_manifests() {
        let dir = tempfile::tempdir().unwrap();
        write_app(
            dir.path(),
            "good",
            r#"{"id":"g","name":"G","exec":"g.exe"}"#,
            false,
        );
        fs::create_dir_all(dir.path().join("nomanifest")).unwrap(); // no app.json
        write_app(dir.path(), "bad", "not json{", false); // invalid
        let entries = scan_apps(dir.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "g");
    }
}
