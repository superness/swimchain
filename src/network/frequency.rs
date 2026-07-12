//! Frequency isolation — network/discovery-layer isolation.
//!
//! See `docs/handoffs/FREQUENCY_ISOLATION_DESIGN.md`. This complements SPEC_13
//! behavioral branching (which isolates *content* into its own branch) by
//! isolating *peers*: a node whose realized traffic is overwhelmingly
//! concentrated in one namespace self-drifts onto that namespace's frequency and
//! is thereby optimized out of main-chain peering — without any change to chain
//! validity.
//!
//! Key properties (mirroring SPEC_13):
//! - **Deterministic value:** `derive_frequency(ns)` is a pure hash, so every
//!   node computes the same frequency for the same namespace with zero messages.
//! - **Self-computed:** a node only ever computes its *own* frequency from its
//!   *own* stats. No peer can push a node onto a frequency — so there is no
//!   eclipse-attack surface.
//! - **Set-membership isolation:** eligibility is set intersection. An exclusive
//!   node collapses to a singleton (`{freq(ns)}`) — the hard partition — while a
//!   deliberate subscriber is additive (`{BASE, freq(ns)}`) and stays reachable.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::crypto::sha256;

/// The base (main network) frequency. A node not isolated to any namespace
/// advertises this. Reserved: `derive_frequency` never returns it for a real
/// namespace.
pub const BASE_FREQUENCY: u32 = 0;

/// Fraction of realized traffic that must be concentrated in a single namespace
/// for a node to drift onto that namespace's frequency.
pub const EXCLUSIVITY_THRESHOLD: f64 = 0.90;

/// Hysteresis: an already-drifted node only rejoins `BASE` once its
/// concentration falls back below this (lower) bound. The gap between this and
/// `EXCLUSIVITY_THRESHOLD` prevents flapping around the boundary.
pub const REJOIN_THRESHOLD: f64 = 0.75;

/// Minimum total realized activity (in whatever unit the caller supplies, e.g.
/// served bytes + stored content units) before drift is even considered. Keeps a
/// barely-used node from drifting on noise.
pub const MIN_ACTIVITY_UNITS: u64 = 4096;

/// Frequencies are truncated to this many bits so a value fits in the high bits
/// of the existing 32-bit `WireAddr.services` field (no wire-format change).
pub const FREQUENCY_BITS: u32 = 24;

/// Mask for a truncated frequency value (`FREQUENCY_BITS` low bits set).
pub const FREQUENCY_MASK: u32 = (1u32 << FREQUENCY_BITS) - 1;

/// Domain separator for frequency derivation.
const FREQUENCY_DOMAIN: &[u8] = b"swimchain:freq:v1:";

/// Capability flag (low 8 bits of `services`) marking a locally-configured seed.
/// Seed-tagged peers are always eligible so frequency isolation can never
/// partition a node away from its bootstrap anchors.
pub const CAP_SEED: u8 = 0x01;

/// Deterministic frequency for a namespace key (a 16- or 32-byte space id, or an
/// app-namespace segment). Folds a `0` result to `1` so `BASE_FREQUENCY` stays
/// reserved for "not isolated".
#[must_use]
pub fn derive_frequency(namespace_key: &[u8]) -> u32 {
    let mut buf = Vec::with_capacity(FREQUENCY_DOMAIN.len() + namespace_key.len());
    buf.extend_from_slice(FREQUENCY_DOMAIN);
    buf.extend_from_slice(namespace_key);
    let h = sha256(&buf);
    let raw = u32::from_be_bytes([h[0], h[1], h[2], h[3]]) & FREQUENCY_MASK;
    if raw == BASE_FREQUENCY {
        1
    } else {
        raw
    }
}

// ---------------------------------------------------------------------------
// Wire packing — no wire-format change; we reuse existing capability fields.
// ---------------------------------------------------------------------------

/// Pack a 24-bit frequency into the high bits of a `WireAddr.services` u32,
/// leaving the low 8 bits for capability flags.
#[must_use]
pub fn pack_services(frequency: u32, capability_flags: u8) -> u32 {
    ((frequency & FREQUENCY_MASK) << 8) | u32::from(capability_flags)
}

/// Extract the advertised frequency from a `WireAddr.services` u32.
#[must_use]
pub fn services_frequency(services: u32) -> u32 {
    (services >> 8) & FREQUENCY_MASK
}

/// Extract capability flags from a `WireAddr.services` u32.
#[must_use]
pub fn services_capabilities(services: u32) -> u8 {
    (services & 0xFF) as u8
}

/// Pack a node's `primary` frequency and the single `requested` frequency for a
/// connection into a `VersionPayload.node_services` u64, leaving the low 16 bits
/// for service flags. `primary` occupies bits [40,64), `requested` bits [16,40).
#[must_use]
pub fn pack_node_services(primary: u32, requested: u32, service_flags: u16) -> u64 {
    ((u64::from(primary & FREQUENCY_MASK)) << 40)
        | ((u64::from(requested & FREQUENCY_MASK)) << 16)
        | u64::from(service_flags)
}

/// Extract `(primary, requested)` frequencies from a `node_services` u64.
#[must_use]
pub fn unpack_node_services(node_services: u64) -> (u32, u32) {
    let primary = ((node_services >> 40) & u64::from(FREQUENCY_MASK)) as u32;
    let requested = ((node_services >> 16) & u64::from(FREQUENCY_MASK)) as u32;
    (primary, requested)
}

// ---------------------------------------------------------------------------
// Node-local frequency state and drift computation.
// ---------------------------------------------------------------------------

/// A node's self-computed frequency membership.
///
/// `primary` is what the node advertises to the world (`BASE_FREQUENCY` when not
/// isolated). `requested` is the set of frequencies the node deliberately
/// subscribes to but is *not* exclusive to — how a subscriber stays reachable to
/// an isolated operator while remaining on base.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FrequencyState {
    pub primary: u32,
    #[serde(default)]
    pub requested: BTreeSet<u32>,
}

impl Default for FrequencyState {
    fn default() -> Self {
        FrequencyState {
            primary: BASE_FREQUENCY,
            requested: BTreeSet::new(),
        }
    }
}

impl FrequencyState {
    /// A node not isolated to any namespace.
    #[must_use]
    pub fn base() -> Self {
        Self::default()
    }

    /// Whether this node is drifted off the base network.
    #[must_use]
    pub fn is_isolated(&self) -> bool {
        self.primary != BASE_FREQUENCY
    }

    /// The full set of frequencies this node participates in: its primary plus
    /// everything it deliberately requested.
    #[must_use]
    pub fn membership(&self) -> BTreeSet<u32> {
        let mut set = self.requested.clone();
        set.insert(self.primary);
        set
    }
}

/// Whether two nodes are discovery/connection eligible: their frequency sets
/// intersect. Seeds are handled by the caller (always eligible as bootstrap
/// anchors) — this is the pure membership test.
#[must_use]
pub fn frequencies_compatible(a: &FrequencyState, b: &FrequencyState) -> bool {
    let am = a.membership();
    b.membership().iter().any(|f| am.contains(f))
}

/// Convenience for the wire path where we only have the packed scalars: are a
/// peer's advertised `(primary, requested)` compatible with ours?
///
/// `BASE_FREQUENCY` (0) never matches through the `requested` slots — a node
/// that requested nothing has `requested == 0`, and that must not accidentally
/// bridge it to base peers (which would defeat isolation).
#[must_use]
pub fn scalars_compatible(
    my_primary: u32,
    my_requested: u32,
    peer_primary: u32,
    peer_requested: u32,
) -> bool {
    my_primary == peer_primary
        || (my_requested != BASE_FREQUENCY && my_requested == peer_primary)
        || (peer_requested != BASE_FREQUENCY && peer_requested == my_primary)
        || (my_requested != BASE_FREQUENCY && my_requested == peer_requested)
}

/// The dominant namespace by realized-traffic weight, and its share of the
/// total. Returns `None` if total activity is below `MIN_ACTIVITY_UNITS`.
#[must_use]
pub fn dominant_namespace(weights: &BTreeMap<Vec<u8>, u64>) -> Option<(Vec<u8>, f64)> {
    let total: u64 = weights.values().sum();
    if total < MIN_ACTIVITY_UNITS {
        return None;
    }
    weights
        .iter()
        .max_by_key(|(_, w)| **w)
        .map(|(k, w)| (k.clone(), *w as f64 / total as f64))
}

/// Compute the next primary frequency from realized-traffic `weights`, applying
/// hysteresis against the current state. `requested` is preserved by the caller;
/// this only decides isolation of the primary.
///
/// - Not currently isolated: drift only if the dominant share reaches
///   `EXCLUSIVITY_THRESHOLD`.
/// - Currently isolated: stay isolated while the dominant share (of the *same*
///   namespace) holds above `REJOIN_THRESHOLD`; otherwise reset to `BASE`.
#[must_use]
pub fn next_primary(current: &FrequencyState, weights: &BTreeMap<Vec<u8>, u64>) -> u32 {
    let Some((ns_key, share)) = dominant_namespace(weights) else {
        // Not enough activity to judge — never force isolation; let an already
        // isolated node linger until it accrues activity again.
        return current.primary;
    };
    let dominant_freq = derive_frequency(&ns_key);

    if current.is_isolated() {
        // Rejoin base unless the *same* dominant namespace still holds above the
        // lower hysteresis bound.
        if dominant_freq == current.primary && share >= REJOIN_THRESHOLD {
            current.primary
        } else {
            BASE_FREQUENCY
        }
    } else if share >= EXCLUSIVITY_THRESHOLD {
        dominant_freq
    } else {
        BASE_FREQUENCY
    }
}

// ---------------------------------------------------------------------------
// Process-global frequency context.
//
// A node is one process with one frequency, so — like `NetworkContext` for the
// network mode — the current frequency and isolation mode live in process
// globals that the wire/discovery/handshake paths read without threading state
// through every constructor. The node's frequency timer is the sole writer.
// ---------------------------------------------------------------------------

use std::sync::atomic::{AtomicU32, AtomicU8, Ordering};

static FREQ_PRIMARY: AtomicU32 = AtomicU32::new(BASE_FREQUENCY);
static FREQ_REQUESTED: AtomicU32 = AtomicU32::new(BASE_FREQUENCY);
/// 0 = Off, 1 = Observe, 2 = Full.
static FREQ_MODE: AtomicU8 = AtomicU8::new(0);

/// Isolation mode as stored in the process-global context.
pub const FREQ_MODE_OFF: u8 = 0;
pub const FREQ_MODE_OBSERVE: u8 = 1;
pub const FREQ_MODE_FULL: u8 = 2;

/// Process-global frequency state, mirroring [`crate::network::NetworkContext`].
pub struct FrequencyContext;

impl FrequencyContext {
    /// Set the mode (`FREQ_MODE_*`).
    pub fn set_mode(mode: u8) {
        FREQ_MODE.store(mode, Ordering::Relaxed);
    }

    /// The raw mode byte.
    #[must_use]
    pub fn mode() -> u8 {
        FREQ_MODE.load(Ordering::Relaxed)
    }

    /// Isolation is computed + advertised (Observe or Full).
    #[must_use]
    pub fn is_active() -> bool {
        FREQ_MODE.load(Ordering::Relaxed) != FREQ_MODE_OFF
    }

    /// Isolation filters peer selection (Full only).
    #[must_use]
    pub fn is_enforcing() -> bool {
        FREQ_MODE.load(Ordering::Relaxed) == FREQ_MODE_FULL
    }

    /// Update the advertised `(primary, requested)` frequencies.
    pub fn set_state(primary: u32, requested: u32) {
        FREQ_PRIMARY.store(primary & FREQUENCY_MASK, Ordering::Relaxed);
        FREQ_REQUESTED.store(requested & FREQUENCY_MASK, Ordering::Relaxed);
    }

    /// This node's advertised primary frequency.
    #[must_use]
    pub fn primary() -> u32 {
        FREQ_PRIMARY.load(Ordering::Relaxed)
    }

    /// This node's advertised requested (niche) frequency, or `BASE_FREQUENCY`.
    #[must_use]
    pub fn requested() -> u32 {
        FREQ_REQUESTED.load(Ordering::Relaxed)
    }

    /// Pack the current state for a `WireAddr.services` field.
    #[must_use]
    pub fn services(capability_flags: u8) -> u32 {
        pack_services(Self::primary(), capability_flags)
    }

    /// Pack the current state for a `VersionPayload.node_services` field.
    #[must_use]
    pub fn node_services(service_flags: u16) -> u64 {
        pack_node_services(Self::primary(), Self::requested(), service_flags)
    }

    /// Whether we should dial/keep a peer given only its advertised primary
    /// (what gossip carries). Base-vs-base and same-frequency match; an isolated
    /// node will not dial base peers, and vice-versa; a subscriber's `requested`
    /// niche lets it reach that niche's operators.
    #[must_use]
    pub fn dial_eligible(peer_primary: u32) -> bool {
        let (p, r) = (Self::primary(), Self::requested());
        p == peer_primary || (r != BASE_FREQUENCY && r == peer_primary)
    }

    /// Authoritative handshake eligibility given a peer's full `(primary,
    /// requested)` from its VERSION `node_services`.
    #[must_use]
    pub fn handshake_eligible(peer_primary: u32, peer_requested: u32) -> bool {
        scalars_compatible(Self::primary(), Self::requested(), peer_primary, peer_requested)
    }
}

/// Resolve the `(primary, requested)` frequency a node should advertise.
///
/// A config `pin` forces the primary deterministically (dedicated-operator
/// deployment). Otherwise the primary drifts from realized per-space content
/// `counts` (16-byte space id → weight) via [`next_primary`] with hysteresis
/// against `current_primary`. `requested_pin` sets the subscriber-bridge niche.
#[must_use]
pub fn resolve_state(
    counts: &[([u8; 16], u64)],
    pin: Option<[u8; 16]>,
    requested_pin: Option<[u8; 16]>,
    current_primary: u32,
) -> (u32, u32) {
    let requested = requested_pin
        .map(|r| derive_frequency(&r))
        .unwrap_or(BASE_FREQUENCY);
    if let Some(ns) = pin {
        return (derive_frequency(&ns), requested);
    }
    let mut weights: BTreeMap<Vec<u8>, u64> = BTreeMap::new();
    for (id, w) in counts {
        *weights.entry(id.to_vec()).or_default() += *w;
    }
    let current = FrequencyState {
        primary: current_primary,
        requested: BTreeSet::new(),
    };
    (next_primary(&current, &weights), requested)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_is_deterministic_and_never_base() {
        let a = derive_frequency(b"space-alpha");
        let b = derive_frequency(b"space-alpha");
        let c = derive_frequency(b"space-beta");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_ne!(a, BASE_FREQUENCY);
        assert!(a <= FREQUENCY_MASK);
    }

    #[test]
    fn services_roundtrip() {
        let f = derive_frequency(b"ns");
        let s = pack_services(f, 0x05);
        assert_eq!(services_frequency(s), f);
        assert_eq!(services_capabilities(s), 0x05);
    }

    #[test]
    fn node_services_roundtrip() {
        let p = derive_frequency(b"primary");
        let r = derive_frequency(b"requested");
        let ns = pack_node_services(p, r, 0xBEEF);
        assert_eq!(unpack_node_services(ns), (p, r));
    }

    #[test]
    fn singleton_vs_additive_reachability() {
        let f = derive_frequency(b"daily-drift");
        // Random main node.
        let base = FrequencyState::base();
        // Exclusive operator: singleton.
        let operator = FrequencyState {
            primary: f,
            requested: BTreeSet::new(),
        };
        // Deliberate subscriber: additive.
        let subscriber = FrequencyState {
            primary: BASE_FREQUENCY,
            requested: BTreeSet::from([f]),
        };

        assert!(!frequencies_compatible(&base, &operator)); // hard partition
        assert!(frequencies_compatible(&subscriber, &operator)); // reachable by intent
        assert!(frequencies_compatible(&base, &subscriber)); // subscriber still on base
    }

    #[test]
    fn drift_requires_exclusivity_and_activity() {
        let base = FrequencyState::base();
        let mut weights = BTreeMap::new();
        // Below MIN_ACTIVITY_UNITS -> no drift.
        weights.insert(b"a".to_vec(), 10u64);
        assert_eq!(next_primary(&base, &weights), BASE_FREQUENCY);

        // Plenty of activity, but split -> no drift.
        weights.clear();
        weights.insert(b"a".to_vec(), 5000);
        weights.insert(b"b".to_vec(), 5000);
        assert_eq!(next_primary(&base, &weights), BASE_FREQUENCY);

        // Concentrated -> drift.
        weights.clear();
        weights.insert(b"a".to_vec(), 9600);
        weights.insert(b"b".to_vec(), 400);
        assert_eq!(next_primary(&base, &weights), derive_frequency(b"a"));
    }

    #[test]
    fn hysteresis_holds_then_rejoins() {
        let f = derive_frequency(b"a");
        let isolated = FrequencyState {
            primary: f,
            requested: BTreeSet::new(),
        };
        let mut weights = BTreeMap::new();
        // 80% of same namespace: above REJOIN, below EXCLUSIVITY -> stays.
        weights.insert(b"a".to_vec(), 8000);
        weights.insert(b"b".to_vec(), 2000);
        assert_eq!(next_primary(&isolated, &weights), f);

        // Drops to 60% -> rejoin base.
        weights.clear();
        weights.insert(b"a".to_vec(), 6000);
        weights.insert(b"b".to_vec(), 4000);
        assert_eq!(next_primary(&isolated, &weights), BASE_FREQUENCY);
    }
}
