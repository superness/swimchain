use serde::Deserialize;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppManifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub exec: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub deeplink: Option<String>,
    #[serde(default = "default_true", rename = "singleInstance")]
    pub single_instance: bool,
}

/// Parse an `app.json` manifest. `id`, `name`, `exec` are required (serde errors if absent).
pub fn parse_manifest(json: &str) -> Result<AppManifest, String> {
    serde_json::from_str::<AppManifest>(json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_full_manifest_and_defaults_single_instance() {
        let json = r#"{"id":"feed","name":"Swimchain Feed","icon":"icon.png",
            "exec":"feed-app.exe","version":"0.1.0","deeplink":"swim+feed"}"#;
        let m = parse_manifest(json).unwrap();
        assert_eq!(m.id, "feed");
        assert_eq!(m.name, "Swimchain Feed");
        assert_eq!(m.exec, "feed-app.exe");
        assert_eq!(m.deeplink.as_deref(), Some("swim+feed"));
        assert!(m.single_instance, "single_instance defaults to true when omitted");
    }

    #[test]
    fn rejects_missing_required_fields() {
        assert!(parse_manifest(r#"{"name":"x","exec":"y"}"#).is_err(), "missing id");
        assert!(parse_manifest(r#"{"id":"x","exec":"y"}"#).is_err(), "missing name");
        assert!(parse_manifest(r#"{"id":"x","name":"y"}"#).is_err(), "missing exec");
        assert!(parse_manifest("not json").is_err());
    }
}
