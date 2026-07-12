//! Frequency isolation — network/discovery-layer isolation (pure core).
//!
//! See `docs/handoffs/FREQUENCY_ISOLATION_DESIGN.md`. A node whose realized
//! traffic concentrates in one namespace self-drifts onto that namespace's
//! discovery frequency and is optimized out of main-chain peering, without any
//! change to chain validity.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

/// The base (main network) frequency.
pub const BASE_FREQUENCY: u32 = 0;

/// Fraction of realized traffic that must be concentrated in a single namespace
/// for a node to drift onto that namespace's frequency.
pub const EXCLUSIVITY_THRESHOLD: f64 = 0.90;

/// Hysteresis: an already-drifted node only rejoins `BASE` once its
/// concentration falls back below this (lower) bound.
pub const REJOIN_THRESHOLD: f64 = 0.75;

/// Minimum total realized activity before drift is even considered.
pub const MIN_ACTIVITY_UNITS: u64 = 4096;

/// Frequencies are truncated to this many bits to fit `WireAddr.services`.
pub const FREQUENCY_BITS: u32 = 24;

/// Mask for a truncated frequency value.
pub const FREQUENCY_MASK: u32 = (1u32 << FREQUENCY_BITS) - 1;

/// Capability flag (low 8 bits of `services`) marking a configured seed.
pub const CAP_SEED: u8 = 0x01;

const FREQUENCY_DOMAIN: &[u8] = b"swimchain:freq:v1:";

/// Deterministic frequency for a namespace key. Folds `0` to `1` so
/// `BASE_FREQUENCY` stays reserved for "not isolated".
#[must_use]
pub fn derive_frequency(namespace_key: &[u8]) -> u32 {
    let mut buf = Vec::with_capacity(FREQUENCY_DOMAIN.len() + namespace_key.len());
    buf.extend_from_slice(FREQUENCY_DOMAIN);
    buf.extend_from_slice(namespace_key);
    let h = crate::sha256(&buf);
    let raw = u32::from_be_bytes([h[0], h[1], h[2], h[3]]) & FREQUENCY_MASK;
    if raw == BASE_FREQUENCY {
        1
    } else {
        raw
    }
}

/// Pack a 24-bit frequency into the high bits of a `services` u32.
#[must_use]
pub fn pack_services(frequency: u32, capability_flags: u8) -> u32 {
    ((frequency & FREQUENCY_MASK) << 8) | u32::from(capability_flags)
}

/// Extract the advertised frequency from a `services` u32.
#[must_use]
pub fn services_frequency(services: u32) -> u32 {
    (services >> 8) & FREQUENCY_MASK
}

/// Extract capability flags from a `services` u32.
#[must_use]
pub fn services_capabilities(services: u32) -> u8 {
    (services & 0xFF) as u8
}

/// Pack `primary` + `requested` into a `node_services` u64 (low 16 bits: flags).
#[must_use]
pub fn pack_node_services(primary: u32, requested: u32, service_flags: u16) -> u64 {
    ((u64::from(primary & FREQUENCY_MASK)) << 40)
        | ((u64::from(requested & FREQUENCY_MASK)) << 16)
        | u64::from(service_flags)
}

/// Extract `(primary, requested)` from a `node_services` u64.
#[must_use]
pub fn unpack_node_services(node_services: u64) -> (u32, u32) {
    let primary = ((node_services >> 40) & u64::from(FREQUENCY_MASK)) as u32;
    let requested = ((node_services >> 16) & u64::from(FREQUENCY_MASK)) as u32;
    (primary, requested)
}

/// A node's self-computed frequency membership.
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
    #[must_use]
    pub fn base() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn is_isolated(&self) -> bool {
        self.primary != BASE_FREQUENCY
    }

    #[must_use]
    pub fn membership(&self) -> BTreeSet<u32> {
        let mut set = self.requested.clone();
        set.insert(self.primary);
        set
    }
}

/// Whether two nodes' frequency sets intersect.
#[must_use]
pub fn frequencies_compatible(a: &FrequencyState, b: &FrequencyState) -> bool {
    let am = a.membership();
    b.membership().iter().any(|f| am.contains(f))
}

/// Eligibility from packed scalars. `BASE_FREQUENCY` never matches through the
/// `requested` slots.
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

/// The dominant namespace by realized-traffic weight, and its share.
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

/// Compute the next primary frequency from realized-traffic `weights` with
/// hysteresis against the current state.
#[must_use]
pub fn next_primary(current: &FrequencyState, weights: &BTreeMap<Vec<u8>, u64>) -> u32 {
    let Some((ns_key, share)) = dominant_namespace(weights) else {
        return current.primary;
    };
    let dominant_freq = derive_frequency(&ns_key);

    if current.is_isolated() {
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

/// Resolve the `(primary, requested)` frequency a node should advertise.
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

/// A structured, deterministic outcome for one node's drift evaluation — the
/// exact result the simulation renders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftOutcome {
    /// Dominant namespace's share of realized traffic (0..1).
    pub dominant_share: f64,
    /// Frequency of the dominant namespace.
    pub dominant_frequency: u32,
    /// The resolved primary frequency after hysteresis.
    pub primary: u32,
    /// Whether the node is isolated off base.
    pub isolated: bool,
    /// Which threshold governed the decision (for annotation).
    pub reason: &'static str,
}

/// Evaluate a drift decision and return the full annotated outcome (what the
/// simulation visualizes). `counts` is per-namespace realized weight.
#[must_use]
pub fn evaluate_drift(counts: &[([u8; 16], u64)], current_primary: u32) -> DriftOutcome {
    let mut weights: BTreeMap<Vec<u8>, u64> = BTreeMap::new();
    for (id, w) in counts {
        *weights.entry(id.to_vec()).or_default() += *w;
    }
    let current = FrequencyState {
        primary: current_primary,
        requested: BTreeSet::new(),
    };
    let (share, dfreq) = dominant_namespace(&weights)
        .map(|(k, s)| (s, derive_frequency(&k)))
        .unwrap_or((0.0, BASE_FREQUENCY));
    let primary = next_primary(&current, &weights);
    let was_isolated = current.is_isolated();
    let reason = if dominant_namespace(&weights).is_none() {
        "below minimum activity"
    } else if was_isolated {
        if primary == BASE_FREQUENCY {
            "dropped below rejoin threshold (0.75) — back to base"
        } else {
            "holding above rejoin threshold (0.75)"
        }
    } else if primary != BASE_FREQUENCY {
        "crossed exclusivity threshold (0.90) — drifted"
    } else {
        "below exclusivity threshold (0.90) — stays base"
    };
    DriftOutcome {
        dominant_share: share,
        dominant_frequency: dfreq,
        primary,
        isolated: primary != BASE_FREQUENCY,
        reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_is_deterministic_and_never_base() {
        let a = derive_frequency(b"space-alpha");
        assert_eq!(a, derive_frequency(b"space-alpha"));
        assert_ne!(a, derive_frequency(b"space-beta"));
        assert_ne!(a, BASE_FREQUENCY);
    }

    #[test]
    fn hysteresis_holds_then_rejoins() {
        let f = derive_frequency(b"a");
        let isolated = FrequencyState {
            primary: f,
            requested: BTreeSet::new(),
        };
        let mut w = BTreeMap::new();
        w.insert(b"a".to_vec(), 8000u64);
        w.insert(b"b".to_vec(), 2000u64);
        assert_eq!(next_primary(&isolated, &w), f);
        w.clear();
        w.insert(b"a".to_vec(), 6000);
        w.insert(b"b".to_vec(), 4000);
        assert_eq!(next_primary(&isolated, &w), BASE_FREQUENCY);
    }
}
