//! Frequency isolation — network/discovery-layer isolation.
//!
//! The pure decision logic (derivation, packing, eligibility, drift resolution
//! with hysteresis) lives in the dependency-light [`swimchain_core::frequency`]
//! crate so the exact same code runs in the node and in the browser
//! simulations. This module re-exports it and adds the node-only, process-global
//! [`FrequencyContext`]. See `docs/handoffs/FREQUENCY_ISOLATION_DESIGN.md`.

pub use swimchain_core::frequency::*;

use std::sync::atomic::{AtomicU32, AtomicU8, Ordering};

// ---------------------------------------------------------------------------
// Process-global frequency context.
//
// A node is one process with one frequency, so — like `NetworkContext` for the
// network mode — the current frequency and isolation mode live in process
// globals that the wire/discovery/handshake paths read without threading state
// through every constructor. The node's frequency timer is the sole writer.
// ---------------------------------------------------------------------------

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

    /// Whether we should dial/keep a peer given only its advertised primary.
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
