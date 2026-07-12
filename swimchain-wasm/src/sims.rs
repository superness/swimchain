//! WASM bindings for the live protocol simulations on swimchain.io.
//!
//! Every function here calls the real decision code in `swimchain-core` — the
//! same crate the node uses — so the visualizations run the genuine algorithm,
//! not a JavaScript re-implementation.

use serde::Serialize;
use swimchain_core::{behavioral, forkchoice, fracture, frequency};
use wasm_bindgen::prelude::*;

/// Serialize a core result for JS as plain numbers/objects (no BigInt).
fn to_js<T: Serialize>(v: &T) -> JsValue {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap_or(JsValue::NULL)
}

// ── Frequency isolation ──────────────────────────────────────────────────────

/// Deterministic 24-bit frequency for a namespace id (real `derive_frequency`).
#[wasm_bindgen]
pub fn frequency_derive(namespace_id: u32) -> u32 {
    let mut key = [0u8; 16];
    key[..4].copy_from_slice(&namespace_id.to_be_bytes());
    frequency::derive_frequency(&key)
}

/// Evaluate a node's drift from per-namespace realized weights.
/// `weights` is `[[namespace_id, weight], ...]`; returns the real `DriftOutcome`
/// (dominant share, resolved primary, isolated?, and which threshold governed).
#[wasm_bindgen]
pub fn frequency_evaluate(weights: JsValue, current_primary: u32) -> JsValue {
    let pairs: Vec<(u32, f64)> = serde_wasm_bindgen::from_value(weights).unwrap_or_default();
    let counts: Vec<([u8; 16], u64)> = pairs
        .into_iter()
        .map(|(id, w)| {
            let mut k = [0u8; 16];
            k[..4].copy_from_slice(&id.to_be_bytes());
            (k, w.max(0.0) as u64)
        })
        .collect();
    to_js(&frequency::evaluate_drift(&counts, current_primary))
}

/// Real set-intersection peer eligibility (`scalars_compatible`).
#[wasm_bindgen]
pub fn frequency_eligible(
    a_primary: u32,
    a_requested: u32,
    b_primary: u32,
    b_requested: u32,
) -> bool {
    frequency::scalars_compatible(a_primary, a_requested, b_primary, b_requested)
}

// ── Behavioral branching (SPEC_13) ───────────────────────────────────────────

/// Evaluate behavioral branching for the cluster containing `start`.
/// `members` is an array of `MemberActivity`
/// (`{id, engagements_received, unique_engagers:[], first_activity_height, interactions:[[other,count]]}`).
/// Returns the real `ClusterEvaluation`: discovered cluster, the four §2.1
/// metrics, each gate's pass/fail, and the classified outcome.
#[wasm_bindgen]
pub fn behavioral_evaluate(
    members: JsValue,
    start: u32,
    participants: u32,
    current_height: u32,
) -> JsValue {
    let members: Vec<behavioral::MemberActivity> =
        serde_wasm_bindgen::from_value(members).unwrap_or_default();
    to_js(&behavioral::evaluate_cluster(
        &members,
        start,
        participants as usize,
        u64::from(current_height),
    ))
}

/// The real SPEC_13 §2.2 thresholds, for the sim to label its axes.
#[wasm_bindgen]
pub fn behavioral_thresholds() -> JsValue {
    #[derive(Serialize)]
    struct Thresholds {
        min_engagement_diversity: f64,
        max_external_interaction: f64,
        min_internal_cohesion: f64,
        min_community_size: usize,
        min_pattern_age_blocks: u64,
        max_cluster_space_fraction: f64,
        min_interaction_count_for_edge: u64,
    }
    to_js(&Thresholds {
        min_engagement_diversity: behavioral::MIN_ENGAGEMENT_DIVERSITY,
        max_external_interaction: behavioral::MAX_EXTERNAL_INTERACTION,
        min_internal_cohesion: behavioral::MIN_INTERNAL_COHESION,
        min_community_size: behavioral::MIN_COMMUNITY_SIZE,
        min_pattern_age_blocks: behavioral::MIN_PATTERN_AGE_BLOCKS,
        max_cluster_space_fraction: behavioral::MAX_CLUSTER_SPACE_FRACTION,
        min_interaction_count_for_edge: behavioral::MIN_INTERACTION_COUNT_FOR_EDGE,
    })
}

// ── Size-based fracture (SPEC_08) ────────────────────────────────────────────

/// Fracture a space's content. `items` is `[{id, size}, ...]` (size in bytes).
/// Returns the real `FractureResult`: depth reached and the resulting leaves.
#[wasm_bindgen]
pub fn fracture_evaluate(items: JsValue) -> JsValue {
    let items: Vec<fracture::FractureItem> =
        serde_wasm_bindgen::from_value(items).unwrap_or_default();
    to_js(&fracture::fracture(&items))
}

/// The real 50 MiB fracture threshold (bytes).
#[wasm_bindgen]
pub fn fracture_threshold() -> f64 {
    fracture::BRANCH_FRACTURE_THRESHOLD as f64
}

// ── Fork choice: partition reconverge (baseline global fork choice) ───────────

/// Bridge two partitions (each described since divergence) and run the real
/// heaviest-work fork choice + reorg re-anchor. Returns the real
/// `ReconvergeOutcome` — validated against the node in
/// `tests/frequency_partition_reconverge.rs`.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn forkchoice_reconverge(
    prefix_work: f64,
    a_blocks: u32,
    a_work: f64,
    a_actions: u32,
    a_tiebreak: u32,
    b_blocks: u32,
    b_work: f64,
    b_actions: u32,
    b_tiebreak: u32,
) -> JsValue {
    let a = forkchoice::Tip {
        blocks: a_blocks,
        work: a_work.max(0.0) as u64,
        actions: a_actions,
        tiebreak: a_tiebreak,
    };
    let b = forkchoice::Tip {
        blocks: b_blocks,
        work: b_work.max(0.0) as u64,
        actions: b_actions,
        tiebreak: b_tiebreak,
    };
    to_js(&forkchoice::evaluate_reconverge(
        prefix_work.max(0.0) as u64,
        &a,
        &b,
    ))
}
