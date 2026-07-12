//! Frequency isolation (network/discovery-layer) tests.
//!
//! Covers the pure, deterministic building blocks the feature is built on:
//! derivation, set-intersection eligibility (singleton vs additive), wire
//! packing, and drift resolution with a pin and with hysteresis. See
//! `docs/handoffs/FREQUENCY_ISOLATION_DESIGN.md`.

use swimchain::network::frequency::{
    derive_frequency, pack_node_services, pack_services, resolve_state, scalars_compatible,
    services_capabilities, services_frequency, unpack_node_services, BASE_FREQUENCY, CAP_SEED,
};

#[test]
fn frequency_is_deterministic_and_reserved_base() {
    let space = [7u8; 16];
    assert_eq!(derive_frequency(&space), derive_frequency(&space));
    assert_ne!(derive_frequency(&space), derive_frequency(&[8u8; 16]));
    // Never collides with base.
    for i in 0..64u8 {
        assert_ne!(derive_frequency(&[i; 16]), BASE_FREQUENCY);
    }
}

#[test]
fn hard_partition_but_reachable_by_intent() {
    let f = derive_frequency(&[1u8; 16]);

    // base <-> base: eligible.
    assert!(scalars_compatible(BASE_FREQUENCY, BASE_FREQUENCY, BASE_FREQUENCY, BASE_FREQUENCY));

    // exclusive operator {f} <-> random main {base}: NOT eligible (hard wall).
    assert!(!scalars_compatible(f, BASE_FREQUENCY, BASE_FREQUENCY, BASE_FREQUENCY));

    // deliberate subscriber {base, requested=f} <-> operator {f}: eligible.
    assert!(scalars_compatible(BASE_FREQUENCY, f, f, BASE_FREQUENCY));

    // subscriber still reaches base peers.
    assert!(scalars_compatible(BASE_FREQUENCY, f, BASE_FREQUENCY, BASE_FREQUENCY));

    // two operators on different frequencies never mix.
    let g = derive_frequency(&[2u8; 16]);
    assert!(!scalars_compatible(f, BASE_FREQUENCY, g, BASE_FREQUENCY));
}

#[test]
fn requested_base_never_bridges() {
    // A node that requested nothing (requested == BASE) must not accidentally
    // bridge to base peers through the requested slot.
    let f = derive_frequency(&[9u8; 16]);
    assert!(!scalars_compatible(f, BASE_FREQUENCY, BASE_FREQUENCY, BASE_FREQUENCY));
}

#[test]
fn wire_packing_roundtrips_and_preserves_caps() {
    let f = derive_frequency(&[3u8; 16]);
    let s = pack_services(f, CAP_SEED);
    assert_eq!(services_frequency(s), f);
    assert_eq!(services_capabilities(s) & CAP_SEED, CAP_SEED);

    let r = derive_frequency(&[4u8; 16]);
    let ns = pack_node_services(f, r, 0x0001);
    assert_eq!(unpack_node_services(ns), (f, r));
    // capability flags survive in the low 16 bits.
    assert_eq!((ns & 0xFFFF) as u16, 0x0001);
}

#[test]
fn pin_forces_frequency_deterministically() {
    let ns = [42u8; 16];
    let (primary, requested) = resolve_state(&[], Some(ns), None, BASE_FREQUENCY);
    assert_eq!(primary, derive_frequency(&ns));
    assert_eq!(requested, BASE_FREQUENCY);

    // requested pin sets the subscriber-bridge niche without isolating primary.
    let niche = [43u8; 16];
    let (primary2, requested2) = resolve_state(&[], None, Some(niche), BASE_FREQUENCY);
    assert_eq!(primary2, BASE_FREQUENCY); // no concentration, no pin -> base
    assert_eq!(requested2, derive_frequency(&niche));
}

#[test]
fn auto_drift_from_concentration_with_hysteresis() {
    let a = [1u8; 16];
    let b = [2u8; 16];
    let fa = derive_frequency(&a);

    // Broadly spread -> stays base.
    let spread = [(a, 5000u64), (b, 5000u64)];
    assert_eq!(resolve_state(&spread, None, None, BASE_FREQUENCY).0, BASE_FREQUENCY);

    // Concentrated -> drifts onto a's frequency.
    let concentrated = [(a, 9700u64), (b, 300u64)];
    assert_eq!(resolve_state(&concentrated, None, None, BASE_FREQUENCY).0, fa);

    // Already on fa, still 80% a -> holds (hysteresis above rejoin bound).
    let holding = [(a, 8000u64), (b, 2000u64)];
    assert_eq!(resolve_state(&holding, None, None, fa).0, fa);

    // Drops to 60% -> rejoins base.
    let dropping = [(a, 6000u64), (b, 4000u64)];
    assert_eq!(resolve_state(&dropping, None, None, fa).0, BASE_FREQUENCY);
}
