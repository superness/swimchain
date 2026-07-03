//! Gossip origin obfuscation (SWIM-PRIV-1).
//!
//! # Problem
//!
//! Swimchain propagates actions (posts, replies, engagements) by push gossip:
//! when a node creates an action it immediately announces it to every peer, and
//! peers relay it onward. Because the author announces *first*, a passive network
//! observer watching announcement timing can identify which node originated a
//! piece of content — a timing/origin leak that de-anonymizes authors.
//!
//! # Technique: Dandelion-lite diffusion
//!
//! We make the author indistinguishable from a relayer by treating
//! *self-originated* actions differently from *relayed* ones:
//!
//! - **Relayed actions** (received from a peer via `ActionAnnounce`) keep
//!   propagating promptly — this preserves sync/relay latency and correctness.
//! - **Self-originated actions** (created via this node's own `submit_*` RPC) get
//!   a randomized broadcast delay before their first outward announce, so origin
//!   timing no longer pinpoints the author (the "diffusion"/fluff jitter).
//! - Optionally (**stem+fluff**), the first hop of a self-originated action goes
//!   to a single randomly chosen peer (the "stem"). That peer then diffuses it
//!   normally, so the true origin is one hop removed from the observable fan-out.
//!
//! This is a pragmatic subset of full Dandelion++ routing. See the module tests
//! and the PR description for what it does and does NOT protect against.
//!
//! # Determinism / testability
//!
//! [`route_self_originated`] is a pure function of `(config, rng, peer_count)`.
//! Tests inject a seeded RNG rather than sleeping, so the decision logic is
//! verified deterministically.

use std::time::Duration;

use rand::Rng;

/// Resolved origin-privacy settings for a running node.
///
/// Produced from [`crate::node::NodeConfig`] (`origin_privacy*` fields) so the
/// network-mode default and configurable delay bounds are applied once at
/// startup and then consulted cheaply on every self-originated broadcast.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OriginPrivacyConfig {
    /// Whether origin obfuscation is active. When `false`, self-originated
    /// actions broadcast immediately (legacy behavior) — used for regtest/e2e
    /// so local tests are not slowed by diffusion delays.
    pub enabled: bool,

    /// Lower bound of the randomized first-announce delay.
    pub min_delay: Duration,

    /// Upper bound of the randomized first-announce delay (inclusive).
    pub max_delay: Duration,

    /// When `true` and at least one peer is connected, relay the first hop of a
    /// self-originated action to a single random peer (stem) instead of the full
    /// fan-out. When `false`, use delay-only diffusion (delay, then broadcast to
    /// all peers).
    pub stem_enabled: bool,
}

impl OriginPrivacyConfig {
    /// A disabled configuration: broadcasts happen immediately with no delay.
    ///
    /// Convenient for tests and for the regtest default.
    pub const fn disabled() -> Self {
        Self {
            enabled: false,
            min_delay: Duration::ZERO,
            max_delay: Duration::ZERO,
            stem_enabled: false,
        }
    }
}

impl Default for OriginPrivacyConfig {
    fn default() -> Self {
        Self::disabled()
    }
}

/// How a self-originated action's first outward announce should be delivered.
///
/// The relay path for *received* actions is always immediate and is not
/// represented here (see [`route_relayed`]); this enum only describes the
/// origin node's first hop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OriginRoute {
    /// Broadcast to all peers now. Used when privacy is disabled or there is
    /// effectively nothing to obfuscate.
    Immediate,

    /// Wait `delay`, then broadcast to all peers (delay-only diffusion).
    Delayed { delay: Duration },

    /// Wait `delay`, then send only to the single peer at `stem_index`
    /// (stem+fluff). `stem_index` is taken modulo the live peer count at send
    /// time, so it stays valid even if the peer set changes during the delay.
    StemDelayed { delay: Duration, stem_index: usize },
}

impl OriginRoute {
    /// Delay before the first announce, if any (zero for [`OriginRoute::Immediate`]).
    pub fn delay(&self) -> Duration {
        match self {
            OriginRoute::Immediate => Duration::ZERO,
            OriginRoute::Delayed { delay } | OriginRoute::StemDelayed { delay, .. } => *delay,
        }
    }

    /// Whether this route defers the first announce (i.e. adds an origin delay).
    pub fn is_delayed(&self) -> bool {
        !matches!(self, OriginRoute::Immediate)
    }
}

/// Sample a jittered delay in `[min_delay, max_delay]` using the provided RNG.
///
/// Robust to `min > max` (bounds are swapped) and to `min == max` (returns that
/// value). Resolution is milliseconds, which is far finer than the seconds-scale
/// bounds we use in practice.
fn sample_delay<R: Rng + ?Sized>(cfg: &OriginPrivacyConfig, rng: &mut R) -> Duration {
    let mut lo = cfg.min_delay.as_millis() as u64;
    let mut hi = cfg.max_delay.as_millis() as u64;
    if lo > hi {
        std::mem::swap(&mut lo, &mut hi);
    }
    let ms = if lo == hi { lo } else { rng.gen_range(lo..=hi) };
    Duration::from_millis(ms)
}

/// Decide how to deliver the first announce of a *self-originated* action.
///
/// Pure function of the config, an injected RNG, and the current peer count.
///
/// - Privacy disabled, or no peers: [`OriginRoute::Immediate`].
/// - Privacy enabled, stem enabled, ≥1 peer: [`OriginRoute::StemDelayed`] with a
///   jittered delay and a randomly chosen stem peer.
/// - Privacy enabled, stem disabled: [`OriginRoute::Delayed`] with a jittered delay.
pub fn route_self_originated<R: Rng + ?Sized>(
    cfg: &OriginPrivacyConfig,
    rng: &mut R,
    peer_count: usize,
) -> OriginRoute {
    if !cfg.enabled || peer_count == 0 {
        return OriginRoute::Immediate;
    }

    let delay = sample_delay(cfg, rng);

    if cfg.stem_enabled {
        let stem_index = rng.gen_range(0..peer_count);
        OriginRoute::StemDelayed { delay, stem_index }
    } else {
        OriginRoute::Delayed { delay }
    }
}

/// Decide how to relay an action *received from a peer*.
///
/// Relayed actions always propagate immediately — the delay/stem treatment is
/// reserved for the origin node so that relayers stay fast and, crucially, so
/// the author becomes indistinguishable from a relayer.
#[inline]
pub const fn route_relayed() -> OriginRoute {
    OriginRoute::Immediate
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    fn enabled_cfg() -> OriginPrivacyConfig {
        OriginPrivacyConfig {
            enabled: true,
            min_delay: Duration::from_millis(2000),
            max_delay: Duration::from_millis(12000),
            stem_enabled: true,
        }
    }

    #[test]
    fn relayed_actions_always_immediate() {
        assert_eq!(route_relayed(), OriginRoute::Immediate);
        assert!(!route_relayed().is_delayed());
    }

    #[test]
    fn self_originated_is_delayed_when_enabled() {
        let cfg = enabled_cfg();
        let mut rng = StdRng::seed_from_u64(42);
        let route = route_self_originated(&cfg, &mut rng, 5);

        // Author's first announce must be deferred, unlike a relayer's.
        assert!(route.is_delayed(), "self-originated action should be delayed");
        let d = route.delay();
        assert!(
            d >= cfg.min_delay && d <= cfg.max_delay,
            "delay {:?} outside [{:?}, {:?}]",
            d,
            cfg.min_delay,
            cfg.max_delay
        );
        // Stem enabled + peers present => stem route with a valid peer index.
        match route {
            OriginRoute::StemDelayed { stem_index, .. } => assert!(stem_index < 5),
            other => panic!("expected StemDelayed, got {:?}", other),
        }
    }

    #[test]
    fn disabled_config_broadcasts_immediately() {
        let cfg = OriginPrivacyConfig::disabled();
        let mut rng = StdRng::seed_from_u64(7);
        assert_eq!(
            route_self_originated(&cfg, &mut rng, 5),
            OriginRoute::Immediate
        );
    }

    #[test]
    fn no_peers_broadcasts_immediately_even_when_enabled() {
        let cfg = enabled_cfg();
        let mut rng = StdRng::seed_from_u64(1);
        assert_eq!(
            route_self_originated(&cfg, &mut rng, 0),
            OriginRoute::Immediate
        );
    }

    #[test]
    fn delay_only_mode_when_stem_disabled() {
        let cfg = OriginPrivacyConfig {
            stem_enabled: false,
            ..enabled_cfg()
        };
        let mut rng = StdRng::seed_from_u64(99);
        let route = route_self_originated(&cfg, &mut rng, 3);
        match route {
            OriginRoute::Delayed { delay } => {
                assert!(delay >= cfg.min_delay && delay <= cfg.max_delay);
            }
            other => panic!("expected Delayed, got {:?}", other),
        }
    }

    #[test]
    fn sampled_delay_respects_bounds_across_seeds() {
        let cfg = enabled_cfg();
        for seed in 0..256u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            let d = sample_delay(&cfg, &mut rng);
            assert!(d >= cfg.min_delay && d <= cfg.max_delay);
        }
    }

    #[test]
    fn equal_bounds_yield_fixed_delay() {
        let cfg = OriginPrivacyConfig {
            min_delay: Duration::from_millis(500),
            max_delay: Duration::from_millis(500),
            ..enabled_cfg()
        };
        let mut rng = StdRng::seed_from_u64(3);
        assert_eq!(sample_delay(&cfg, &mut rng), Duration::from_millis(500));
    }

    #[test]
    fn swapped_bounds_are_tolerated() {
        // min > max should not panic; bounds are normalized.
        let cfg = OriginPrivacyConfig {
            min_delay: Duration::from_millis(9000),
            max_delay: Duration::from_millis(1000),
            ..enabled_cfg()
        };
        let mut rng = StdRng::seed_from_u64(5);
        let d = sample_delay(&cfg, &mut rng);
        assert!(d >= Duration::from_millis(1000) && d <= Duration::from_millis(9000));
    }
}
