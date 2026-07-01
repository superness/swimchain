//! Output formatting for CLI
//!
//! Provides consistent output formatting for text and JSON modes.

use serde::Serialize;

/// Output format for CLI responses
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum OutputFormat {
    /// Human-readable text output
    #[default]
    Text,
    /// Machine-readable JSON output
    Json,
}

impl std::str::FromStr for OutputFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "text" => Ok(OutputFormat::Text),
            "json" => Ok(OutputFormat::Json),
            _ => Err(format!("Invalid output format: {s}. Use 'text' or 'json'")),
        }
    }
}

impl std::fmt::Display for OutputFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputFormat::Text => write!(f, "text"),
            OutputFormat::Json => write!(f, "json"),
        }
    }
}

impl serde::Serialize for OutputFormat {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> serde::Deserialize<'de> for OutputFormat {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        s.parse().map_err(serde::de::Error::custom)
    }
}

/// Format a short address for display (cs1xxxx...yyyy)
#[must_use]
pub fn short_address(addr: &str) -> String {
    if addr.len() <= 15 {
        return addr.to_string();
    }
    format!("{}...{}", &addr[..7], &addr[addr.len() - 4..])
}

/// Print output in the specified format
pub fn print_output<T: Serialize>(
    format: OutputFormat,
    value: &T,
) -> crate::cli::error::Result<()> {
    match format {
        OutputFormat::Text => {
            // For text format, we expect the caller to handle display
            // This is a fallback that uses JSON pretty-print
            let json = serde_json::to_string_pretty(value)
                .map_err(|e| crate::cli::error::CliError::Other(e.to_string()))?;
            println!("{json}");
        }
        OutputFormat::Json => {
            let json = serde_json::to_string(value)
                .map_err(|e| crate::cli::error::CliError::Other(e.to_string()))?;
            println!("{json}");
        }
    }
    Ok(())
}

/// Print JSON output
pub fn print_json<T: Serialize>(value: &T) -> crate::cli::error::Result<()> {
    let json = serde_json::to_string(value)
        .map_err(|e| crate::cli::error::CliError::Other(e.to_string()))?;
    println!("{json}");
    Ok(())
}

/// Print JSON output with pretty formatting
pub fn print_json_pretty<T: Serialize>(value: &T) -> crate::cli::error::Result<()> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|e| crate::cli::error::CliError::Other(e.to_string()))?;
    println!("{json}");
    Ok(())
}

/// Format a timestamp as a human-readable time ago string
#[must_use]
pub fn format_time_ago(timestamp: u64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if timestamp > now {
        return "just now".to_string();
    }

    let diff = now - timestamp;

    if diff < 60 {
        return format!("{diff}s ago");
    }
    if diff < 3600 {
        return format!("{}m ago", diff / 60);
    }
    if diff < 86400 {
        return format!("{}h ago", diff / 3600);
    }
    format!("{}d ago", diff / 86400)
}

/// Format bytes as human-readable size
#[must_use]
pub fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_short_address() {
        let addr = "cs1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
        let short = short_address(addr);
        assert!(short.starts_with("cs1qqqq"));
        assert!(short.ends_with("qqqq"));
        assert!(short.contains("..."));
    }

    #[test]
    fn test_short_address_already_short() {
        let addr = "cs1short";
        assert_eq!(short_address(addr), addr);
    }

    #[test]
    fn test_output_format_parse() {
        assert_eq!("text".parse::<OutputFormat>().unwrap(), OutputFormat::Text);
        assert_eq!("json".parse::<OutputFormat>().unwrap(), OutputFormat::Json);
        assert_eq!("JSON".parse::<OutputFormat>().unwrap(), OutputFormat::Json);
        assert!("invalid".parse::<OutputFormat>().is_err());
    }

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500 B");
        assert_eq!(format_bytes(1024), "1.0 KB");
        assert_eq!(format_bytes(1024 * 1024), "1.0 MB");
        assert_eq!(format_bytes(1024 * 1024 * 1024), "1.0 GB");
    }
}
