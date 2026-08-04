//! Deciding whether the search index needs rebuilding — cheaply.
//!
//! The node used to walk every content block on EVERY startup, resolving each
//! post's body through content-store → blob-store to build a `Vec` of indexable
//! documents, and only then compare that Vec's length against the index's doc
//! count to decide whether a reindex was warranted. When the index was already
//! current — the overwhelmingly common case — the entire Vec was discarded.
//!
//! Measured on mainnet 2026-08-03 (desktop, chain height 1332, 14,913 docs):
//! 189 seconds, 12.7 ms per item, producing nothing. That ran BEFORE the
//! transport bound and long before `start_rpc_server`, so the desktop shell's
//! 120 s cookie wait expired and every first unlock reported "node may not be
//! running" while the node was healthy and grinding.
//!
//! Counting how many actions COULD be indexed needs no body resolution at all.
//! `prepare_reindex` does that count first and only pays for body resolution
//! when the count already exceeds what the index holds.

use crate::blocks::{ActionType, ContentBlock};
use crate::cli::search_index::IndexableContent;
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};

/// What `prepare_reindex` decided, and what it spent to decide it.
///
/// The variants are distinguishable on purpose: a caller (and a test) can tell
/// whether body resolution was skipped entirely or merely came up short.
#[derive(Debug, Clone)]
pub enum ReindexPlan {
    /// The cheap count showed the index already covers every candidate action.
    /// **No bodies were resolved.**
    UpToDate { candidates: u64, docs: u64 },
    /// Bodies were resolved, but the resolved count still did not exceed the
    /// index — so there is nothing to rebuild. Happens when some bodies are
    /// unresolvable (e.g. back-filled content with no inline body).
    NoRebuild { gathered: usize, docs: u64 },
    /// Rebuild the index from these documents.
    Rebuild(Vec<IndexableContent>),
}

/// Count actions that could be indexed, touching only the blocks themselves.
///
/// Deliberately mirrors the filter used when gathering, so the count is an
/// upper bound on what a gather could produce: every action a gather would
/// keep is counted here, and no action it would drop is counted. That makes
/// `candidates <= docs` a sound reason to skip gathering entirely.
pub fn count_indexable_actions<I>(blocks: I) -> u64
where
    I: Iterator<Item = ContentBlock>,
{
    blocks
        .map(|block| block.actions.iter().filter(|a| is_indexable(a)).count() as u64)
        .sum()
}

/// An action carries searchable text iff it is a public post/reply with a body
/// to fetch. Engagements carry none; private bodies are encrypted and useless
/// to index. Gathering applies exactly this filter — keep the two in step.
fn is_indexable(action: &crate::blocks::Action) -> bool {
    matches!(action.action_type, ActionType::Post | ActionType::Reply)
        && !action.private
        && action.content_hash.is_some()
}

/// Encode a raw space id the way `list_space_content` does, so documents are
/// filterable by the same space string the clients send.
fn encode_space_id(space_id: &[u8; 32]) -> String {
    use bech32::{Bech32m, Hrp};
    let mut d = Vec::with_capacity(17);
    d.push(0);
    d.extend_from_slice(&space_id[..16]);
    bech32::encode::<Bech32m>(Hrp::parse("sp").expect("valid HRP"), &d)
        .unwrap_or_else(|_| hex::encode(&space_id[..16]))
}

/// Resolve every indexable action into a document. **Expensive** — calls
/// `resolve_body` once per candidate action.
pub fn gather_indexables<I, F>(blocks: I, resolve_body: F) -> Vec<IndexableContent>
where
    I: Iterator<Item = ContentBlock>,
    F: Fn(&[u8; 32]) -> Option<String>,
{
    let mut out = Vec::new();
    for block in blocks {
        let space_id = encode_space_id(&block.space_id);
        for action in &block.actions {
            if !is_indexable(action) {
                continue;
            }
            let Some(content_hash) = action.content_hash else {
                continue;
            };
            let Some(text) = resolve_body(&content_hash).filter(|b| !b.is_empty()) else {
                continue;
            };
            // A body's first paragraph break separates title from content.
            let (title, body) = match text.find("\n\n") {
                Some(i) => (text[..i].to_string(), text[i + 2..].to_string()),
                None => (String::new(), text),
            };
            out.push(IndexableContent {
                content_id: format!("sha256:{}", hex::encode(content_hash)),
                space_id: space_id.clone(),
                author: crate::crypto::address::encode_address(
                    &crate::types::identity::IdentityId(action.actor),
                ),
                title,
                body,
                heat: 100.0,
                timestamp: action.timestamp,
            });
        }
    }
    out
}

/// Decide whether the index needs rebuilding, resolving bodies only if it might.
///
/// `blocks` is called to produce a fresh iterator: once for the cheap count,
/// and a second time only when a rebuild is actually in play.
pub fn prepare_reindex<I, B, F>(blocks: B, docs: u64, resolve_body: F) -> ReindexPlan
where
    I: Iterator<Item = ContentBlock>,
    B: Fn() -> I,
    F: Fn(&[u8; 32]) -> Option<String>,
{
    // The cheap pass. Counting needs no storage lookups, so it costs a chain
    // walk instead of a chain walk PLUS a body resolution per action.
    let candidates = count_indexable_actions(blocks());
    if candidates <= docs {
        // Every action a gather could keep is already counted here, so a gather
        // could not produce more than `candidates` documents — and could
        // therefore never exceed `docs`. Resolving bodies would be wasted work.
        return ReindexPlan::UpToDate { candidates, docs };
    }

    let gathered = gather_indexables(blocks(), resolve_body);
    if gathered.len() as u64 > docs {
        ReindexPlan::Rebuild(gathered)
    } else {
        ReindexPlan::NoRebuild {
            gathered: gathered.len(),
            docs,
        }
    }
}

/// Live state of the background reindex, readable over RPC.
///
/// Without this a node mid-rebuild is indistinguishable from a finished one:
/// search simply returns fewer results and nothing tells the user why. That is
/// the same failure that made a healthy node report "node may not be running" —
/// real state the UI could not see. Cheap atomics so `get_info` can read it on
/// any thread without contending with the rebuild.
#[derive(Debug, Default)]
pub struct IndexProgress {
    phase: AtomicU8,
    docs: AtomicU64,
    target: AtomicU64,
}

/// Which part of the catch-up the node is in.
///
/// Two-state (`rebuilding: bool`) was not honest enough: the scan that decides
/// whether a rebuild is needed walks the whole chain and can run for minutes,
/// and during it the index may genuinely be behind. Reporting `false` there let
/// the UI stay silent while results were still incomplete — the same
/// invisible-state trap this module exists to close.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IndexPhase {
    /// Nothing running; the index matched the chain at the last check.
    #[default]
    Idle,
    /// Counting candidates to decide whether a rebuild is warranted.
    Scanning,
    /// Rebuilding. Results are incomplete until this finishes.
    Rebuilding,
}

impl IndexPhase {
    fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Scanning,
            2 => Self::Rebuilding,
            _ => Self::Idle,
        }
    }

    /// True while the index may not yet reflect the chain — the single question
    /// a client actually needs answered before it renders a result count.
    #[must_use]
    pub fn is_catching_up(self) -> bool {
        !matches!(self, Self::Idle)
    }
}

/// A point-in-time read of [`IndexProgress`], safe to serialise into RPC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct IndexProgressSnapshot {
    /// What the background task is doing right now.
    pub phase: IndexPhase,
    /// Documents currently in the index.
    pub docs: u64,
    /// Documents the running rebuild is working toward (0 unless rebuilding).
    pub target: u64,
}

impl IndexProgress {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Record the index size observed at open time.
    pub fn set_docs(&self, docs: u64) {
        self.docs.store(docs, Ordering::Relaxed);
    }

    /// Mark the deciding scan as started.
    pub fn begin_scan(&self) {
        self.phase
            .store(IndexPhase::Scanning as u8, Ordering::Relaxed);
    }

    /// Mark a rebuild as started, working toward `target` documents.
    pub fn begin_rebuild(&self, target: u64) {
        self.target.store(target, Ordering::Relaxed);
        self.phase
            .store(IndexPhase::Rebuilding as u8, Ordering::Relaxed);
    }

    /// Return to idle, leaving `docs` documents indexed. Ends either a scan
    /// that found nothing to do or a finished rebuild.
    pub fn settle(&self, docs: u64) {
        self.docs.store(docs, Ordering::Relaxed);
        self.target.store(0, Ordering::Relaxed);
        self.phase.store(IndexPhase::Idle as u8, Ordering::Relaxed);
    }

    #[must_use]
    pub fn snapshot(&self) -> IndexProgressSnapshot {
        IndexProgressSnapshot {
            phase: IndexPhase::from_u8(self.phase.load(Ordering::Relaxed)),
            docs: self.docs.load(Ordering::Relaxed),
            target: self.target.load(Ordering::Relaxed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::branch_path::BranchPath;
    use crate::blocks::Action;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn action(action_type: ActionType, content_hash: Option<[u8; 32]>, private: bool) -> Action {
        Action {
            action_type,
            actor: [1u8; 32],
            timestamp: 1000,
            content_hash,
            parent_id: None,
            pow_nonce: 0,
            pow_work: 1,
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private,
        }
    }

    fn block(actions: Vec<Action>) -> ContentBlock {
        ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            None,
            1000,
            BranchPath::root(),
        )
        .expect("test block")
    }

    fn post(n: u8) -> Action {
        action(ActionType::Post, Some([n; 32]), false)
    }

    /// A node mid-rebuild must be distinguishable from a finished one, or the
    /// UI has no way to explain short search results.
    #[test]
    fn walks_idle_then_scanning_then_rebuilding_then_idle() {
        let progress = IndexProgress::new();
        progress.set_docs(12);

        assert_eq!(
            progress.snapshot(),
            IndexProgressSnapshot {
                phase: IndexPhase::Idle,
                docs: 12,
                target: 0
            }
        );

        progress.begin_scan();
        assert_eq!(progress.snapshot().phase, IndexPhase::Scanning);

        progress.begin_rebuild(400);
        let mid = progress.snapshot();
        assert_eq!(mid.phase, IndexPhase::Rebuilding);
        assert_eq!(mid.target, 400);

        progress.settle(400);
        assert_eq!(
            progress.snapshot(),
            IndexProgressSnapshot {
                phase: IndexPhase::Idle,
                docs: 400,
                target: 0
            }
        );
    }

    /// The scan alone can run for minutes on a large chain. While it does, the
    /// index may be behind — so the client must be told, even though no
    /// rebuild has begun. This is the gap the two-state version left open.
    #[test]
    fn a_scan_with_no_rebuild_still_reports_catching_up() {
        let progress = IndexProgress::new();
        progress.set_docs(9);
        progress.begin_scan();

        let during = progress.snapshot();
        assert!(
            during.phase.is_catching_up(),
            "a running scan must report that the index may be behind"
        );
        assert_eq!(during.target, 0, "no rebuild target while merely scanning");

        progress.settle(9);
        assert!(!progress.snapshot().phase.is_catching_up());
    }

    /// THE regression test for the 189-second startup stall.
    ///
    /// When the index already covers every candidate, `prepare_reindex` must
    /// not resolve a single body. Asserting on the resolver call count (not
    /// merely on the absence of a rebuild) is what makes this fail if the
    /// cheap pre-count is removed — without it the old code would still
    /// "correctly" decline to rebuild, just three minutes later.
    #[test]
    fn skips_body_resolution_entirely_when_index_is_current() {
        let blocks = vec![block(vec![post(1), post(2), post(3)])];
        let calls = AtomicUsize::new(0);

        let plan = prepare_reindex(
            || blocks.clone().into_iter(),
            3, // index already holds all three
            |_| {
                calls.fetch_add(1, Ordering::SeqCst);
                Some("body".to_string())
            },
        );

        assert_eq!(
            calls.load(Ordering::SeqCst),
            0,
            "resolved bodies while the index was already current"
        );
        match plan {
            ReindexPlan::UpToDate { candidates, docs } => {
                assert_eq!((candidates, docs), (3, 3));
            }
            other => panic!("expected UpToDate, got {other:?}"),
        }
    }

    #[test]
    fn rebuilds_when_the_index_is_behind_the_chain() {
        let blocks = vec![block(vec![post(1), post(2), post(3)])];
        let calls = AtomicUsize::new(0);

        let plan = prepare_reindex(
            || blocks.clone().into_iter(),
            0, // empty index
            |_| {
                calls.fetch_add(1, Ordering::SeqCst);
                Some("body".to_string())
            },
        );

        assert_eq!(calls.load(Ordering::SeqCst), 3, "should resolve every body");
        match plan {
            ReindexPlan::Rebuild(docs) => assert_eq!(docs.len(), 3),
            other => panic!("expected a rebuild, got {other:?}"),
        }
    }

    #[test]
    fn reports_no_rebuild_when_bodies_will_not_resolve() {
        let blocks = vec![block(vec![post(1), post(2), post(3)])];

        let plan = prepare_reindex(|| blocks.clone().into_iter(), 2, |_| None);

        match plan {
            ReindexPlan::NoRebuild { gathered, docs } => {
                assert_eq!((gathered, docs), (0, 2));
            }
            other => panic!("expected NoRebuild, got {other:?}"),
        }
    }

    #[test]
    fn counts_only_public_posts_and_replies_that_carry_content() {
        let blocks = vec![block(vec![
            post(1),
            action(ActionType::Reply, Some([2u8; 32]), false),
            action(ActionType::Engage, Some([3u8; 32]), false), // not searchable text
            action(ActionType::Post, Some([4u8; 32]), true),    // private body is encrypted
            action(ActionType::Post, None, false),              // nothing to fetch
        ])];

        assert_eq!(count_indexable_actions(blocks.into_iter()), 2);
    }

    #[test]
    fn counting_matches_what_a_gather_produces_when_every_body_resolves() {
        let blocks = vec![
            block(vec![
                post(1),
                action(ActionType::Engage, Some([9u8; 32]), false),
            ]),
            block(vec![
                post(2),
                action(ActionType::Reply, Some([3u8; 32]), false),
            ]),
        ];

        let counted = count_indexable_actions(blocks.clone().into_iter());
        let gathered = gather_indexables(blocks.into_iter(), |_| Some("body".to_string()));

        assert_eq!(counted, gathered.len() as u64);
    }
}
