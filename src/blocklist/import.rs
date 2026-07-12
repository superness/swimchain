//! Operator import format for seeding the blocklist from external hash lists.
//!
//! This module parses a plain-text list file into [`ImportRecord`]s that the
//! [`crate::blocklist::BlocklistStore`] can bulk-load with `ExternalList`
//! provenance (SPEC_12, workstream A of the CSAM hash-seeding handoff).
//!
//! # Format
//!
//! One record per line. Blank lines and lines beginning with `#` are ignored.
//! Each record is:
//!
//! ```text
//! <digest-spec> [reason]
//! ```
//!
//! `digest-spec` is one or more comma-separated digest tokens for the *same*
//! underlying file. A token is either `type:hex` (`sha256:`, `sha1:`, `md5:`)
//! or a bare hex string whose length selects the type (64 = SHA-256, 40 =
//! SHA-1, 32 = MD5). `reason` is optional and one of `csam`, `terrorism`,
//! `external` / `external_list` (default: `external_list`).
//!
//! ```text
//! # a SHA-256-addressed entry, explicit reason
//! sha256:aaaa... csam
//! # the same file identified by multiple industry digests
//! sha256:bbbb...,sha1:cccc...,md5:dddd... csam
//! # bare hex, type inferred from length; default reason
//! eeee...(64 hex)
//! # an industry entry that only ships an MD5 (local-match only, see docs)
//! md5:ffff...
//! ```
//!
//! ## Multi-hash rationale
//!
//! Swimchain content is natively addressed by SHA-256, but reputable CSAM hash
//! lists (NCMEC, IWF, Project Arachnid) overwhelmingly distribute SHA-1 and MD5
//! file digests. Supporting only SHA-256 would make an imported industry list
//! match nothing. We therefore accept all three digest types; SHA-1/MD5 are
//! matched by recomputing them over ingested content (see `BlocklistStore`).

use crate::blocklist::types::BlocklistReason;

/// A single parsed import record. At least one digest is guaranteed present.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportRecord {
    /// SHA-256 digest of the content, if provided. Required for network
    /// propagation (bundles/gossip) since it is the protocol content id.
    pub sha256: Option<[u8; 32]>,
    /// SHA-1 digest of the file, if provided (industry lists). Local match aid.
    pub sha1: Option<[u8; 20]>,
    /// MD5 digest of the file, if provided (industry lists). Local match aid.
    pub md5: Option<[u8; 16]>,
    /// Reason classification for this record.
    pub reason: BlocklistReason,
}

/// Error produced while parsing an import file, with 1-based line context.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportParseError {
    /// 1-based line number where the error occurred.
    pub line: usize,
    /// Human-readable description.
    pub message: String,
}

impl std::fmt::Display for ImportParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "line {}: {}", self.line, self.message)
    }
}

impl std::error::Error for ImportParseError {}

fn parse_reason(token: &str) -> Option<BlocklistReason> {
    match token.to_ascii_lowercase().as_str() {
        "csam" => Some(BlocklistReason::CSAM),
        "terrorism" => Some(BlocklistReason::Terrorism),
        "external" | "external_list" | "externallist" => Some(BlocklistReason::ExternalList),
        _ => None,
    }
}

/// Decode a fixed-length hex digest into `N` bytes.
fn decode_hex_fixed<const N: usize>(hex_str: &str) -> Option<[u8; N]> {
    let bytes = hex::decode(hex_str).ok()?;
    if bytes.len() != N {
        return None;
    }
    let mut out = [0u8; N];
    out.copy_from_slice(&bytes);
    Some(out)
}

/// Apply a single `type:hex` or bare-hex token to a record being built.
fn apply_token(rec: &mut ImportRecord, token: &str, line: usize) -> Result<(), ImportParseError> {
    let err = |msg: String| ImportParseError { line, message: msg };

    let (kind, hex_str) = match token.split_once(':') {
        Some((k, v)) => (k.to_ascii_lowercase(), v),
        None => {
            // Bare hex: infer type from length.
            let kind = match token.len() {
                64 => "sha256",
                40 => "sha1",
                32 => "md5",
                _ => {
                    return Err(err(format!(
                        "cannot infer digest type from bare hex of length {} \
                         (expected 64=sha256, 40=sha1, 32=md5); use an explicit type: prefix",
                        token.len()
                    )))
                }
            };
            (kind.to_string(), token)
        }
    };

    match kind.as_str() {
        "sha256" => {
            let h = decode_hex_fixed::<32>(hex_str)
                .ok_or_else(|| err("invalid sha256 digest (need 64 hex chars)".into()))?;
            rec.sha256 = Some(h);
        }
        "sha1" => {
            let h = decode_hex_fixed::<20>(hex_str)
                .ok_or_else(|| err("invalid sha1 digest (need 40 hex chars)".into()))?;
            rec.sha1 = Some(h);
        }
        "md5" => {
            let h = decode_hex_fixed::<16>(hex_str)
                .ok_or_else(|| err("invalid md5 digest (need 32 hex chars)".into()))?;
            rec.md5 = Some(h);
        }
        other => {
            return Err(err(format!(
                "unknown digest type '{}' (expected sha256, sha1, or md5)",
                other
            )))
        }
    }
    Ok(())
}

/// Parse a single non-empty, non-comment content line into an [`ImportRecord`].
fn parse_line(line_content: &str, line: usize) -> Result<ImportRecord, ImportParseError> {
    let mut fields = line_content.split_whitespace();
    let digest_spec = fields.next().ok_or_else(|| ImportParseError {
        line,
        message: "empty record".into(),
    })?;

    let reason = match fields.next() {
        Some(tok) => parse_reason(tok).ok_or_else(|| ImportParseError {
            line,
            message: format!(
                "unknown reason '{}' (expected csam, terrorism, or external_list)",
                tok
            ),
        })?,
        None => BlocklistReason::ExternalList,
    };

    if fields.next().is_some() {
        return Err(ImportParseError {
            line,
            message: "unexpected trailing tokens after reason".into(),
        });
    }

    let mut rec = ImportRecord {
        sha256: None,
        sha1: None,
        md5: None,
        reason,
    };

    for token in digest_spec.split(',') {
        if token.is_empty() {
            continue;
        }
        apply_token(&mut rec, token, line)?;
    }

    if rec.sha256.is_none() && rec.sha1.is_none() && rec.md5.is_none() {
        return Err(ImportParseError {
            line,
            message: "record contains no digests".into(),
        });
    }

    Ok(rec)
}

/// Parse an entire import file body into records.
///
/// Comments (`#`) and blank lines are skipped. Returns the first parse error
/// encountered (fail-closed: a malformed line aborts the whole import so an
/// operator never silently seeds a partial list).
pub fn parse_import(contents: &str) -> Result<Vec<ImportRecord>, ImportParseError> {
    let mut records = Vec::new();
    for (idx, raw) in contents.lines().enumerate() {
        let line = idx + 1;
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        // Allow inline trailing comments (`digest reason  # note`).
        let effective = match trimmed.split_once('#') {
            Some((before, _)) => before.trim(),
            None => trimmed,
        };
        if effective.is_empty() {
            continue;
        }
        records.push(parse_line(effective, line)?);
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bare_sha256() {
        let recs = parse_import(&format!("{}\n", "a".repeat(64))).unwrap();
        assert_eq!(recs.len(), 1);
        assert!(recs[0].sha256.is_some());
        assert!(recs[0].sha1.is_none());
        assert_eq!(recs[0].reason, BlocklistReason::ExternalList);
    }

    #[test]
    fn test_typed_with_reason() {
        let line = format!("sha256:{} csam\n", "b".repeat(64));
        let recs = parse_import(&line).unwrap();
        assert_eq!(recs[0].reason, BlocklistReason::CSAM);
        assert_eq!(recs[0].sha256, Some([0xbb; 32]));
    }

    #[test]
    fn test_multi_hash_line() {
        let line = format!(
            "sha256:{},sha1:{},md5:{} terrorism\n",
            "c".repeat(64),
            "d".repeat(40),
            "e".repeat(32)
        );
        let recs = parse_import(&line).unwrap();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].sha256, Some([0xcc; 32]));
        assert_eq!(recs[0].sha1, Some([0xdd; 20]));
        assert_eq!(recs[0].md5, Some([0xee; 16]));
        assert_eq!(recs[0].reason, BlocklistReason::Terrorism);
    }

    #[test]
    fn test_md5_only() {
        let recs = parse_import(&format!("md5:{}\n", "f".repeat(32))).unwrap();
        assert_eq!(recs[0].md5, Some([0xff; 16]));
        assert!(recs[0].sha256.is_none());
    }

    #[test]
    fn test_bare_length_inference() {
        let recs = parse_import(&format!(
            "{}\n{}\n{}\n",
            "1".repeat(64),
            "2".repeat(40),
            "3".repeat(32)
        ))
        .unwrap();
        assert!(recs[0].sha256.is_some());
        assert!(recs[1].sha1.is_some());
        assert!(recs[2].md5.is_some());
    }

    #[test]
    fn test_comments_and_blanks_skipped() {
        let body = format!(
            "# header\n\n   \nsha256:{} csam  # inline note\n",
            "a".repeat(64)
        );
        let recs = parse_import(&body).unwrap();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].reason, BlocklistReason::CSAM);
    }

    #[test]
    fn test_invalid_hex_length_errors_with_line() {
        let body = format!("sha256:{} csam\nsha256:abcd csam\n", "a".repeat(64));
        let err = parse_import(&body).unwrap_err();
        assert_eq!(err.line, 2);
    }

    #[test]
    fn test_unknown_reason_errors() {
        let err = parse_import(&format!("sha256:{} bogus\n", "a".repeat(64))).unwrap_err();
        assert!(err.message.contains("unknown reason"));
    }

    #[test]
    fn test_bare_bad_length_errors() {
        let err = parse_import("abcdef\n").unwrap_err();
        assert!(err.message.contains("cannot infer"));
    }
}
