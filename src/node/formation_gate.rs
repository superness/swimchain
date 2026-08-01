//! Solo-block formation gate (SPEC_08 hardening; 2026-07-14 incident).
//!
//! A node that (re)starts isolated — fresh, wiped, or simply faster than its
//! peers — used to form blocks *alone* the moment its bot/faucet/user acted.
//! That solo block then competed with the real chain, creating junk forks,
//! stuck states, and reorg churn (see `docs/qa/LAUNCH_BLOCKERS_HANDOFF.md` §1).
//!
//! The gate holds block formation closed until one of:
//! - **Peer-tip parity**: at least one peer handshake has been observed and
//!   our chain height has reached the highest `start_height` any peer
//!   advertised since process start — i.e. we are demonstrably not behind
//!   the network we can see.
//! - **Grace expiry**: a grace window (measured from process start, extended
//!   to run from the first peer handshake so an in-flight sync gets its full
//!   window) has elapsed. This keeps a genuinely-first node bootstrapping a
//!   brand-new network from deadlocking, and caps the delay a pathological
//!   peer advertising an unreachable height can impose.
//!
//! The gate is sticky: once open it stays open for the process lifetime.
//! It guards *formation only* — actions still queue in the mempool and seal
//! as soon as the gate opens. Regtest uses a zero grace window (gate is
//! effectively always open) so single-node dev flows are unchanged.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use log::{debug, info};

/// Grace window before an unsynced node may form blocks anyway
/// (mainnet/testnet). Regtest uses zero.
pub const FORMATION_GRACE_SECS: u64 = 90;

/// How far below the highest VALIDATED block we may sit and still form.
///
/// Two, not zero: a same-height race is normal and healthy (fork choice
/// settles it), and one block behind is mid-gossip, not stranded. Three or
/// more behind means a chain we have verified exists and we have not caught
/// up to it — minting there manufactures a competing history.
pub const FORM_BEHIND_TOLERANCE: u64 = 2;

/// Gate that defers block formation until the node has confirmed it is not
/// the lone height-authority (or a grace window expires). Shared by every
/// block-formation site via `MessageRouter::formation_gate()`.
pub struct FormationGate {
    /// Process-start reference point for all elapsed-time math.
    started: Instant,
    /// Grace window; zero means the gate is open from the start.
    grace: Duration,
    /// Sticky open flag — set once, never cleared.
    open: AtomicBool,
    /// True once any peer handshake has been observed.
    seen_peer: AtomicBool,
    /// Highest `start_height` advertised in any peer handshake since start.
    best_peer_height: AtomicU64,
    /// Millis from `started` to the first peer handshake, stored +1 so that
    /// 0 means "no peer yet". Used to extend the grace deadline.
    first_peer_offset_ms: AtomicU64,
    /// Highest height of a block we have VALIDATED AND STORED — ours or a
    /// peer's, canonical or fork. Distinct from `best_peer_height` (a
    /// handshake claim, free to make) because raising this costs real
    /// proof-of-work, so it cannot be used to freeze us. See
    /// `note_validated_block`.
    best_block_height: AtomicU64,
    /// Whether the "behind a validated chain" line has been emitted.
    behind_logged: AtomicBool,
    /// Whether the "deferring" info line has been emitted (first defer logs
    /// at info, the rest at debug).
    defer_logged: AtomicBool,
}

impl FormationGate {
    #[must_use]
    pub fn new(grace: Duration) -> Self {
        Self {
            started: Instant::now(),
            grace,
            open: AtomicBool::new(false),
            seen_peer: AtomicBool::new(false),
            best_peer_height: AtomicU64::new(0),
            first_peer_offset_ms: AtomicU64::new(0),
            best_block_height: AtomicU64::new(0),
            behind_logged: AtomicBool::new(false),
            defer_logged: AtomicBool::new(false),
        }
    }

    /// Record the height of a block we have validated and stored.
    ///
    /// Call this ONLY where the block's parent is known and the block has
    /// been accepted into storage — never from the orphan path. An orphan's
    /// height is an unverified claim, and honouring it would hand any peer a
    /// way to stop this node forming blocks for free.
    pub fn note_validated_block(&self, height: u64) {
        self.best_block_height.fetch_max(height, Ordering::Relaxed);
    }

    /// Record a peer handshake carrying the peer's advertised chain height.
    /// Call this from every connection path that completes a VERSION
    /// handshake (outbound bootstrap, outbound integrate, inbound accept).
    pub fn note_peer_height(&self, height: u64) {
        self.seen_peer.store(true, Ordering::Relaxed);
        self.best_peer_height.fetch_max(height, Ordering::Relaxed);
        let offset = self.started.elapsed().as_millis() as u64;
        let _ = self.first_peer_offset_ms.compare_exchange(
            0,
            offset.saturating_add(1),
            Ordering::Relaxed,
            Ordering::Relaxed,
        );
    }

    /// Whether the gate has already opened (sticky).
    #[must_use]
    pub fn is_open(&self) -> bool {
        self.open.load(Ordering::Relaxed)
    }

    /// May the node form a block right now, given its current chain height?
    /// Opens (stickily) on peer-tip parity or grace expiry; logs one line on
    /// the transition and a rate-limited line while deferring.
    pub fn allow_formation(&self, our_height: u64) -> bool {
        // THE BRAKE, checked before the sticky flag and independent of it.
        //
        // 2026-08-01: a wiped seed re-synced from genesis, opened on grace
        // expiry 90s later (sticky, so permanently), and then minted 517
        // blocks of its own over eleven hours while its canonical height
        // crawled behind the network's — a third chain, self-inflicted. The
        // gate was open because a fresh node cannot reach parity in 90s, and
        // nothing could ever close it again.
        //
        // Stickiness itself is deliberate and stays: it is what stops a peer
        // ADVERTISING an unreachable height from freezing formation forever
        // (see `open_is_sticky`). So the brake reads a different signal —
        // blocks we have actually validated and stored. Raising that costs
        // real proof-of-work, so it cannot be forged into a denial of
        // service, and it is true evidence that a chain exists which we have
        // not caught up to.
        let best_block = self.best_block_height.load(Ordering::Relaxed);
        if best_block > our_height.saturating_add(FORM_BEHIND_TOLERANCE) {
            if !self.behind_logged.swap(true, Ordering::Relaxed) {
                info!(
                    "[BLOCKS] Deferring block formation: behind a validated chain (our height {}, highest validated block {})",
                    our_height, best_block
                );
            } else {
                debug!(
                    "[BLOCKS] Deferring block formation: behind a validated chain (our height {}, highest validated block {})",
                    our_height, best_block
                );
            }
            return false;
        }
        // Caught up again — let the next lag log once more rather than going
        // silent for the process lifetime.
        self.behind_logged.store(false, Ordering::Relaxed);

        if self.open.load(Ordering::Relaxed) {
            return true;
        }

        let best_peer = self.best_peer_height.load(Ordering::Relaxed);
        if self.seen_peer.load(Ordering::Relaxed) && our_height >= best_peer {
            if !self.open.swap(true, Ordering::Relaxed) {
                info!(
                    "[BLOCKS] Formation gate OPEN: synced with peer tip (our height {} >= best peer height {})",
                    our_height, best_peer
                );
            }
            return true;
        }

        // Grace deadline runs from process start, restarted by the first
        // peer handshake (so a peer connecting late in the window still
        // gets a full window for sync to complete before we form alone).
        let deadline = match self.first_peer_offset_ms.load(Ordering::Relaxed) {
            0 => self.grace,
            offset_plus_one => Duration::from_millis(offset_plus_one - 1) + self.grace,
        };
        if self.started.elapsed() >= deadline {
            if !self.open.swap(true, Ordering::Relaxed) {
                info!(
                    "[BLOCKS] Formation gate OPEN: grace window ({}s) expired without confirming network tip (our height {}, best peer height {})",
                    self.grace.as_secs(),
                    our_height,
                    best_peer
                );
            }
            return true;
        }

        let remaining = deadline.saturating_sub(self.started.elapsed());
        if !self.defer_logged.swap(true, Ordering::Relaxed) {
            info!(
                "[BLOCKS] Deferring block formation: no synced peer yet (our height {}, best peer height {}, grace expires in {}s)",
                our_height,
                best_peer,
                remaining.as_secs()
            );
        } else {
            debug!(
                "[BLOCKS] Deferring block formation: no synced peer yet (our height {}, best peer height {}, grace expires in {}s)",
                our_height,
                best_peer,
                remaining.as_secs()
            );
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LONG_GRACE: Duration = Duration::from_secs(3600);

    #[test]
    fn zero_grace_opens_immediately() {
        let gate = FormationGate::new(Duration::ZERO);
        assert!(
            gate.allow_formation(0),
            "regtest-style zero grace must not defer"
        );
        assert!(gate.is_open());
    }

    #[test]
    fn no_peers_pre_grace_defers() {
        let gate = FormationGate::new(LONG_GRACE);
        assert!(!gate.allow_formation(0));
        assert!(!gate.allow_formation(100));
        assert!(!gate.is_open());
    }

    #[test]
    fn behind_peer_defers_until_parity() {
        let gate = FormationGate::new(LONG_GRACE);
        gate.note_peer_height(5);
        assert!(!gate.allow_formation(3), "behind the peer tip: must defer");
        assert!(gate.allow_formation(5), "at the peer tip: must allow");
    }

    #[test]
    fn open_is_sticky_against_advertised_heights() {
        // Stickiness w.r.t. HANDSHAKE CLAIMS is deliberate: a peer
        // advertising an unreachable height must never freeze formation.
        // (The validated-block brake below is the forgery-resistant signal.)
        let gate = FormationGate::new(LONG_GRACE);
        gate.note_peer_height(5);
        assert!(gate.allow_formation(5));
        gate.note_peer_height(500);
        assert!(gate.allow_formation(0));
    }

    // -- the validated-block brake (2026-08-01 third-chain incident) --------

    #[test]
    fn an_open_gate_still_defers_when_behind_a_validated_chain() {
        // THE INCIDENT, in miniature: gate opened on grace expiry while the
        // node was far behind, and stayed open for the process lifetime. It
        // minted 517 blocks of its own chain over eleven hours.
        let gate = FormationGate::new(Duration::ZERO); // opens immediately
        assert!(gate.allow_formation(500), "sanity: open at our own tip");

        gate.note_validated_block(1887);
        assert!(
            !gate.allow_formation(500),
            "an OPEN gate must still refuse to mint while a validated chain \
             sits far above us — this is the third-chain bug"
        );
    }

    #[test]
    fn the_brake_releases_on_catching_up() {
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_validated_block(1887);
        assert!(!gate.allow_formation(500));
        assert!(!gate.allow_formation(1884), "still 3 behind");
        assert!(
            gate.allow_formation(1885),
            "within tolerance ({}) of the validated tip: forming again",
            FORM_BEHIND_TOLERANCE
        );
        assert!(gate.allow_formation(1887), "at the validated tip");
    }

    #[test]
    fn a_same_height_race_still_forms() {
        // Two nodes minting the same height is normal and fork choice settles
        // it. If this deferred, a healthy network would stop making blocks.
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_validated_block(100);
        assert!(gate.allow_formation(100), "same height must still form");
        assert!(
            gate.allow_formation(99),
            "one behind is mid-gossip, not stranded"
        );
    }

    #[test]
    fn a_lone_node_is_never_braked_by_its_own_blocks() {
        // A node bootstrapping alone stores its own blocks; noting them must
        // not brake it, or a new network could never start.
        let gate = FormationGate::new(Duration::ZERO);
        for h in 0..50 {
            gate.note_validated_block(h);
            assert!(
                gate.allow_formation(h),
                "a lone node at its own tip must keep forming (height {h})"
            );
        }
    }

    #[test]
    fn advertised_height_alone_cannot_brake_formation() {
        // The DoS guard: handshake claims are free to make, so they must not
        // reach the brake. Only validated blocks (which cost PoW) do.
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_peer_height(u64::MAX);
        assert!(
            gate.allow_formation(10),
            "a peer claiming an absurd height must not stop us forming"
        );
    }

    #[test]
    fn fresh_peer_at_height_zero_counts_as_parity() {
        // Two fresh nodes bootstrapping a new network: connected at parity,
        // forming is correct.
        let gate = FormationGate::new(LONG_GRACE);
        gate.note_peer_height(0);
        assert!(gate.allow_formation(0));
    }

    #[test]
    fn peer_height_is_max_over_all_handshakes() {
        // A junk-low peer must not lower the bar set by a real peer.
        let gate = FormationGate::new(LONG_GRACE);
        gate.note_peer_height(76);
        gate.note_peer_height(0);
        assert!(!gate.allow_formation(10));
        assert!(gate.allow_formation(76));
    }

    #[test]
    fn grace_expiry_opens_gate() {
        let gate = FormationGate::new(Duration::from_millis(50));
        gate.note_peer_height(1_000_000); // unreachable parity
        std::thread::sleep(Duration::from_millis(120));
        assert!(
            gate.allow_formation(0),
            "grace expiry must open the gate even when parity is unreachable"
        );
    }

    #[test]
    fn first_peer_handshake_extends_grace_deadline() {
        let gate = FormationGate::new(Duration::from_millis(150));
        std::thread::sleep(Duration::from_millis(100));
        // Peer connects late in the window: deadline restarts from now.
        gate.note_peer_height(1_000_000);
        std::thread::sleep(Duration::from_millis(100));
        // ~200ms elapsed since start but only ~100ms since first handshake:
        // still inside the extended window.
        assert!(
            !gate.allow_formation(0),
            "grace must extend from first handshake"
        );
        std::thread::sleep(Duration::from_millis(120));
        assert!(gate.allow_formation(0));
    }
}
