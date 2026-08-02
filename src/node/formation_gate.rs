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

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
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

/// How many DISTINCT peers must independently say we are materially behind
/// before grace expiry is allowed to mint anyway.
///
/// One is not enough: a single peer advertising an unreachable height is the
/// exact denial of service `open_is_sticky_against_advertised_heights` exists
/// to defeat. Two independent peers agreeing is corroboration, and a node the
/// network agrees is far behind must not manufacture a competing history.
pub const CORROBORATING_PEERS: usize = 2;

/// Cap on remembered peer claims, so connection churn cannot grow this without
/// bound.
const MAX_TRACKED_PEERS: usize = 64;

/// How long peer CLAIMS alone may hold formation shut past grace.
///
/// The asymmetry this encodes is the whole security argument:
///
///   * A block we have VALIDATED above our tip is unforgeable — raising it
///     costs real proof-of-work — so it brakes formation for as long as it
///     stands, with no time limit.
///   * A handshake height is FREE to assert. Letting it brake indefinitely
///     hands any two peers a way to silence a block producer, which is a
///     liveness attack on a network with few producers.
///
/// So claims may DELAY, not veto. The bound is safe because an honest node
/// that is really behind starts validating real blocks within seconds of
/// asking (measured 2026-08-01: 0 -> 344 blocks in 90s once the
/// read-before-write deadlock was fixed), at which point the unforgeable brake
/// takes over and this timer stops mattering. Ten minutes is far longer than
/// that hand-off needs and far shorter than an attacker would want.
const CORROBORATION_MAX_HOLD: Duration = Duration::from_secs(600);

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
    /// Latest height advertised BY EACH peer, so "am I behind?" can require
    /// corroboration from independent peers rather than trusting one claim.
    peer_heights: Mutex<HashMap<[u8; 32], u64>>,
    /// When the corroboration hold began, as millis from `started` +1 (0 = not
    /// holding). Bounds how long free-to-assert peer claims may delay us.
    corroboration_since_ms: AtomicU64,
    /// How long claims may hold. A field, not the constant directly, so tests
    /// can exercise the expiry deterministically instead of trying to fake a
    /// ten-minute-old clock against a process that started milliseconds ago.
    corroboration_max_hold: Duration,
    /// Whether the corroboration hold has been announced. Its OWN flag, not
    /// `behind_logged`: that one is cleared on every call that clears the
    /// validated-block brake, so sharing it logged this line at INFO every
    /// few seconds for the whole of a catch-up.
    corroboration_logged: AtomicBool,
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
            peer_heights: Mutex::new(HashMap::new()),
            corroboration_since_ms: AtomicU64::new(0),
            corroboration_max_hold: CORROBORATION_MAX_HOLD,
            corroboration_logged: AtomicBool::new(false),
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
    pub fn note_peer_height(&self, peer_id: [u8; 32], height: u64) {
        self.seen_peer.store(true, Ordering::Relaxed);
        self.best_peer_height.fetch_max(height, Ordering::Relaxed);
        // Per-peer, so corroboration can be counted. A peer's newest claim
        // replaces its previous one; the global max above is unchanged.
        if let Ok(mut map) = self.peer_heights.lock() {
            if map.len() < MAX_TRACKED_PEERS || map.contains_key(&peer_id) {
                map.insert(peer_id, height);
            }
        }
        let offset = self.started.elapsed().as_millis() as u64;
        let _ = self.first_peer_offset_ms.compare_exchange(
            0,
            offset.saturating_add(1),
            Ordering::Relaxed,
            Ordering::Relaxed,
        );
    }

    /// Same as `new`, with a shortened claim-hold bound so tests can reach the
    /// expiry without sleeping for ten minutes.
    #[cfg(test)]
    #[must_use]
    pub fn new_with_hold(grace: Duration, hold: Duration) -> Self {
        let mut g = Self::new(grace);
        g.corroboration_max_hold = hold;
        g
    }

    /// The highest chain height any peer has advertised since process start.
    #[must_use]
    pub fn best_peer_height(&self) -> u64 {
        self.best_peer_height.load(Ordering::Relaxed)
    }

    /// How many DISTINCT peers advertise a height strictly above `threshold`.
    #[must_use]
    pub fn peers_claiming_above(&self, threshold: u64) -> usize {
        self.peer_heights
            .lock()
            .map(|m| m.values().filter(|h| **h > threshold).count())
            .unwrap_or(0)
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
        // NOTE: only `behind_logged` is cleared here. The corroboration clock
        // must NOT be, because this line is reached on EVERY call that clears
        // the validated-block brake — including every call made WHILE the
        // corroboration hold is running. Clearing it here restarted the timer
        // on each tick, so the bound never elapsed and free-to-assert peer
        // claims became a permanent veto. It is cleared where it is actually
        // no longer held, below.
        self.behind_logged.store(false, Ordering::Relaxed);

        if self.open.load(Ordering::Relaxed) {
            return true;
        }

        let best_peer = self.best_peer_height.load(Ordering::Relaxed);
        if self.seen_peer.load(Ordering::Relaxed) && our_height >= best_peer {
            // Reached parity: whatever hold was running is over, and a LATER
            // lag must get a full window rather than inherit a spent clock.
            self.corroboration_since_ms.store(0, Ordering::Relaxed);
            self.corroboration_logged.store(false, Ordering::Relaxed);
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
            // GRACE MUST NOT MINT INTO A CHAIN THE NETWORK AGREES EXISTS.
            //
            // The brake above reads validated blocks, which is unforgeable —
            // but a node that cannot FETCH never validates anything above its
            // own tip, so the brake stays silent and grace mints anyway.
            // That is exactly how the chips util node forked itself on
            // 2026-08-01: an outbound-connection deadlock meant zero
            // successful GETBLOCKS (54,258 failed sends), so `best_block`
            // never rose, grace expired 90s in, and it minted 946 actions at
            // height 1551 with total_pow=13241 — instantly heavier
            // (cum_pow 76,710) than the network's block at that height
            // (63,477). Fork choice then CORRECTLY pinned it to its own
            // private chain, permanently.
            //
            // One peer's advertised height is a free claim and must never
            // gate us (see `open_is_sticky_against_advertised_heights`).
            // CORROBORATING_PEERS independent peers saying the same thing is
            // evidence, and waiting is strictly better than manufacturing a
            // competing history.
            let behind_by = our_height.saturating_add(FORM_BEHIND_TOLERANCE);
            let corroborating = self.peers_claiming_above(behind_by);
            if corroborating >= CORROBORATING_PEERS {
                // Start (or read) the hold clock. Claims may delay, not veto —
                // see CORROBORATION_MAX_HOLD.
                let now_ms = self.started.elapsed().as_millis() as u64;
                let since = match self.corroboration_since_ms.compare_exchange(
                    0,
                    now_ms.saturating_add(1),
                    Ordering::Relaxed,
                    Ordering::Relaxed,
                ) {
                    Ok(_) => now_ms,
                    Err(prev) => prev - 1,
                };
                if Duration::from_millis(now_ms.saturating_sub(since))
                    >= self.corroboration_max_hold
                {
                    // Held this long on peer claims alone and STILL no validated
                    // block above our tip (that brake is checked first and would
                    // have returned already). The claims are unbacked: either the
                    // peers are lying, or that chain is unreachable to us. Waiting
                    // for ever is how a free assertion becomes a veto.
                    if !self.open.swap(true, Ordering::Relaxed) {
                        info!(
                            "[BLOCKS] Formation gate OPEN: {} peers claimed a chain above us for {}s but delivered no block above our tip (our height {}, best peer height {}) — treating the claim as unbacked",
                            corroborating,
                            self.corroboration_max_hold.as_secs(),
                            our_height,
                            best_peer
                        );
                    }
                    return true;
                }
                if !self.corroboration_logged.swap(true, Ordering::Relaxed) {
                    info!(
                        "[BLOCKS] Deferring block formation past grace: {} peers report a chain above us (our height {}, best peer height {}) — refusing to mint a competing chain",
                        corroborating, our_height, best_peer
                    );
                } else {
                    debug!(
                        "[BLOCKS] Still deferring past grace: {} peers above us (our height {}, best peer height {})",
                        corroborating, our_height, best_peer
                    );
                }
                return false;
            }
            // Not held: fewer than CORROBORATING_PEERS report a chain above us.
            // Clear the clock so a LATER lag gets a full window of its own.
            self.corroboration_since_ms.store(0, Ordering::Relaxed);
            self.corroboration_logged.store(false, Ordering::Relaxed);
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
        gate.note_peer_height([1u8; 32], 5);
        assert!(!gate.allow_formation(3), "behind the peer tip: must defer");
        assert!(gate.allow_formation(5), "at the peer tip: must allow");
    }

    #[test]
    fn open_is_sticky_against_advertised_heights() {
        // Stickiness w.r.t. HANDSHAKE CLAIMS is deliberate: a peer
        // advertising an unreachable height must never freeze formation.
        // (The validated-block brake below is the forgery-resistant signal.)
        let gate = FormationGate::new(LONG_GRACE);
        gate.note_peer_height([2u8; 32], 5);
        assert!(gate.allow_formation(5));
        gate.note_peer_height([3u8; 32], 500);
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
        gate.note_peer_height([4u8; 32], u64::MAX);
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
        gate.note_peer_height([5u8; 32], 0);
        assert!(gate.allow_formation(0));
    }

    #[test]
    fn peer_height_is_max_over_all_handshakes() {
        // A junk-low peer must not lower the bar set by a real peer.
        let gate = FormationGate::new(LONG_GRACE);
        gate.note_peer_height([6u8; 32], 76);
        gate.note_peer_height([7u8; 32], 0);
        assert!(!gate.allow_formation(10));
        assert!(gate.allow_formation(76));
    }

    #[test]
    fn grace_expiry_opens_gate() {
        let gate = FormationGate::new(Duration::from_millis(50));
        gate.note_peer_height([8u8; 32], 1_000_000); // unreachable parity
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
        gate.note_peer_height([9u8; 32], 1_000_000);
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

    // The 2026-08-01 self-fork: an outbound-connection deadlock meant the node
    // never validated a block above its own tip, so the validated-block brake
    // stayed silent, grace expired, and it minted a competing chain that fork
    // choice then correctly pinned it to for ever. Corroborating peers are the
    // signal that survives being unable to fetch.
    #[test]
    fn grace_does_not_mint_when_two_peers_report_a_chain_above_us() {
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_peer_height([0xA1; 32], 1915);
        gate.note_peer_height([0xB2; 32], 1915);
        assert!(
            !gate.allow_formation(1551),
            "two independent peers reporting a chain 364 blocks above us must stop a solo mint"
        );
    }

    // ...but ONE peer must not be able to freeze formation, which is the whole
    // reason advertised heights are otherwise ignored.
    #[test]
    fn a_single_peer_claim_still_cannot_freeze_formation() {
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_peer_height([0xA1; 32], u64::MAX);
        assert!(
            gate.allow_formation(1551),
            "one advertised height is a free claim and must never gate formation"
        );
    }

    #[test]
    fn peers_within_tolerance_do_not_hold_the_gate() {
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_peer_height([0xA1; 32], 1552);
        gate.note_peer_height([0xB2; 32], 1553);
        assert!(
            gate.allow_formation(1551),
            "a same-height race is normal; only a materially higher chain holds the gate"
        );
    }

    #[test]
    fn the_same_peer_reconnecting_is_not_two_peers() {
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_peer_height([0xA1; 32], 1915);
        gate.note_peer_height([0xA1; 32], 1915);
        assert_eq!(
            gate.peers_claiming_above(1553),
            1,
            "one peer, twice, is one peer"
        );
        assert!(
            gate.allow_formation(1551),
            "corroboration must mean DISTINCT peers, or reconnect churn forges it"
        );
    }

    #[test]
    fn catching_up_releases_the_corroboration_hold() {
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_peer_height([0xA1; 32], 1915);
        gate.note_peer_height([0xB2; 32], 1915);
        assert!(!gate.allow_formation(1551));
        assert!(
            gate.allow_formation(1915),
            "once we reach the height they reported, the hold must lift"
        );
    }

    // SECURITY PROPERTY: a handshake height is free to assert, so two peers
    // must be able to DELAY formation but never to veto it. Without a bound,
    // any two colluding peers could silence a block producer indefinitely —
    // a liveness attack on a network with few producers.
    #[test]
    fn peer_claims_delay_formation_but_cannot_veto_it_for_ever() {
        // 60ms hold instead of 10 minutes; the logic under test is identical.
        let gate = FormationGate::new_with_hold(Duration::ZERO, Duration::from_millis(60));
        gate.note_peer_height([0xA1; 32], 1915);
        gate.note_peer_height([0xB2; 32], 1915);

        assert!(
            !gate.allow_formation(1551),
            "two peers reporting a chain above us must hold formation at first"
        );

        std::thread::sleep(Duration::from_millis(90));

        assert!(
            gate.allow_formation(1551),
            "claims unbacked by a single delivered block must not veto formation for ever"
        );
    }

    // The mirror of the above: UNFORGEABLE evidence has no time limit. Raising
    // the validated-block height costs real proof-of-work, so it may brake for
    // as long as it stands.
    #[test]
    fn a_validated_block_brakes_without_any_time_limit() {
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_peer_height([0xA1; 32], 1915);
        gate.note_peer_height([0xB2; 32], 1915);
        gate.note_validated_block(1651);

        // Even with the corroboration clock long expired, the validated-block
        // brake is checked first and must still refuse.
        gate.corroboration_since_ms.store(1, Ordering::Relaxed);
        assert!(
            !gate.allow_formation(1551),
            "a validated chain above us must brake formation with no time limit"
        );
    }

    #[test]
    fn the_hold_clock_resets_once_we_are_no_longer_held() {
        let gate = FormationGate::new(Duration::ZERO);
        gate.note_peer_height([0xA1; 32], 1915);
        gate.note_peer_height([0xB2; 32], 1915);
        assert!(!gate.allow_formation(1551));
        assert_ne!(
            gate.corroboration_since_ms.load(Ordering::Relaxed),
            0,
            "clock should be running"
        );

        // Catch up: the hold lifts and the clock must clear, so a LATER lag
        // gets its own full window rather than inheriting a spent one.
        assert!(gate.allow_formation(1915));
        assert_eq!(
            gate.corroboration_since_ms.load(Ordering::Relaxed),
            0,
            "clock should reset"
        );
    }
}
