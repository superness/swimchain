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
            defer_logged: AtomicBool::new(false),
        }
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
    fn open_is_sticky() {
        let gate = FormationGate::new(LONG_GRACE);
        gate.note_peer_height(5);
        assert!(gate.allow_formation(5));
        // Later heights/peers cannot re-close the gate.
        gate.note_peer_height(500);
        assert!(gate.allow_formation(0));
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
