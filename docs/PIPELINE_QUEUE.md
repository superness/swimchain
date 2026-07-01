# Pipeline Work Queue

This document tracks work items for pipeline execution - specifications, thesis work, and research spikes.

**Last Updated:** 2025-12-27

---

## Priority 1: NEW Thesis Topics (Topics 8-11)

**Created:** 2025-12-27 from design session on abuse prevention

These are NEW thesis documents that need pipeline validation:

| # | Thesis | File | Core Tension | Preliminary Score |
|---|--------|------|--------------|-------------------|
| 8 | **Sponsorship Trees** | `THESIS_08_SPONSORSHIP_TREES.md` | Accountability vs. Openness | 7.5/10 |
| 9 | **Hosting as Work** | `THESIS_09_HOSTING_AS_WORK.md` | Useful work vs. Participation barriers | 7.8/10 |
| 10 | **Attestation Decay** | `THESIS_10_ATTESTATION_DECAY.md` | Community response vs. Content neutrality | 6.8/10 |
| 11 | **Text-Only Launch** | `THESIS_11_TEXT_ONLY_LAUNCH.md` | Safety vs. Expressiveness | 7.2/10 |

**Pipeline:** `thesis-generator-v1` or equivalent
**Expected output:** Refined arguments, evidence gaps, final scores

**Note:** These derive from the new systems in SPEC_11 and SPEC_12. They need validation alongside the existing 7 thesis topics.

---

## Priority 2: Specification Validation

### SPEC_11: Sponsorship & Access (DRAFT v0.2.0)

**Status:** REVISED 2025-12-27 - Removed credit/coin language
**File:** `specs/SPEC_11_SPONSORSHIP_ACCESS.md`
**Pipeline:** Spec validation + implementation planning

**Key features:**
- Sponsorship trees (every identity needs a sponsor)
- Hosting-based access (posting capacity from hosting contribution)
- **No credits/coins** - contribution-based levels only
- Level gates replace credit spending

**Needs validation:**
- Integration with SPEC_01 (Identity)
- Integration with SPEC_09 (Social Layer)
- Attack scenario completeness
- Bootstrap mechanics

### SPEC_12: Anti-Abuse Mechanisms (DRAFT v0.1.0)

**Status:** Created 2025-12-27
**File:** `specs/SPEC_12_ANTI_ABUSE.md`
**Pipeline:** Spec validation + implementation planning

**Key features:**
- Text-only at launch
- Spam attestation system (3 Residents = accelerated decay)
- Accelerated decay for attested content
- Quarantine period for new identities

**Needs validation:**
- Attestation gaming resistance
- False positive handling
- Recovery paths

---

## Priority 3: Research Spike Validation

These research documents were created 2025-12-27 and need validation:

### RESEARCH_06: Hosting PoW Economics
**File:** `research/RESEARCH_06_HOSTING_POW_ECONOMICS.md`
**Status:** REVISED 2025-12-27 to remove credit language
**Key claims to validate:**
- Hosting contribution is 50-500× more expensive to game than CPU PoW
- 1 GB served = viable contribution threshold
- Unique viewer requirements prevent gaming

### RESEARCH_07: Sponsorship Economics
**File:** `research/RESEARCH_07_SPONSORSHIP_ECONOMICS.md`
**Status:** REVISED 2025-12-27 to remove credit language
**Key claims to validate:**
- Sybil attacks require months of contribution + 3 independent sponsors
- 2-hop accountability is fair and effective
- Genesis distribution is the critical trust seed

### RESEARCH_08: Attestation Mechanisms
**File:** `research/RESEARCH_08_ATTESTATION_MECHANISMS.md`
**Status:** Created 2025-12-27
**Key claims to validate:**
- 3-attester threshold balances accessibility with gaming resistance
- Tree deduplication critical for Sybil resistance
- Counter-attestation handles false positives

---

## Priority 4: Original Thesis Topics (Topics 1-7)

These exist in THESIS_TOPICS.md and VISION.md but haven't had pipeline runs:

| # | Thesis | Core Tension | VISION.md Score |
|---|--------|--------------|-----------------|
| 1 | Exclusion by Design | Decentralization vs. Accessibility | 8.0/10 |
| 2 | Friction Is Good | Quality vs. Usability | 8.4/10 ★ |
| 3 | Forks Over Consensus | Autonomy vs. Unity | 8.0/10 |
| 4 | No Safety Net | Freedom vs. Protection | 7.2/10 |
| 5 | No Growth Imperative | Principles vs. Critical mass | 7.4/10 |
| 6 | Let Content Die | Organic moderation vs. Preservation | 7.6/10 |
| 7 | Anonymity Over Accountability | Privacy vs. Accountability | 7.2/10 |

**Pipeline:** `thesis-generator-v1`
**Note:** These have preliminary scoring but lack formal evidence validation.

---

## Priority 5: Continuing Implementation

### Phase 7 Milestones (In Progress)

| Milestone | Status | Description |
|-----------|--------|-------------|
| 7.1-7.6 | ✅ Complete | Contribution tracking through Space Health |
| 7.7 | 🔜 Next | Content Attribution |
| 7.8 | Pending | Collective Achievements |
| 7.9 | Pending | Social Layer Integration |

### Phase 8 (Node Operations)

| Milestone | Status | Description |
|-----------|--------|-------------|
| 8.1-8.5 | ✅ Complete | Node Manager through CLI Integration |
| 8.6 | 🔜 Next | Multi-Node Testing |
| 8.7 | Pending | Seed Node Deployment |
| 8.8 | Pending | Testnet Launch |

---

## Summary: What Needs Pipeline Runs

### NEW from 2025-12-27 (TODAY'S SESSION):

| Type | Count | Items |
|------|-------|-------|
| **Thesis validation** | 4 | Topics 8, 9, 10, 11 |
| **Spec validation** | 2 | SPEC_11, SPEC_12 |
| **Research validation** | 3 | RESEARCH_06, 07, 08 |
| **Total new** | **9** | |

### EXISTING (from earlier work):

| Type | Count | Items |
|------|-------|-------|
| **Thesis validation** | 7 | Topics 1-7 |
| **Total existing** | **7** | |

### GRAND TOTAL: 16 pipeline runs needed

---

## Execution Order Recommendation

**Batch 1 - New Thesis Topics (most critical):**
1. THESIS_08 (Sponsorship Trees) - validates SPEC_11 design
2. THESIS_09 (Hosting as Work) - validates SPEC_11 design
3. THESIS_10 (Attestation Decay) - validates SPEC_12 design
4. THESIS_11 (Text-Only Launch) - validates SPEC_12 design

**Batch 2 - Spec Validation:**
5. SPEC_11 validation (after thesis feedback)
6. SPEC_12 validation (after thesis feedback)

**Batch 3 - Research Validation:**
7. RESEARCH_06 (Hosting Economics)
8. RESEARCH_07 (Sponsorship Economics)
9. RESEARCH_08 (Attestation Mechanisms)

**Batch 4 - Original Thesis Topics:**
10-16. Topics 1-7 (can run in parallel)

---

## Ready-to-Run Configurations

Run configuration files have been created in `pipeline-runs/`:

| Config File | Pipeline | Target |
|-------------|----------|--------|
| `validate-spec-11.json` | `spec-validation-v1` | SPEC_11 Sponsorship & Access |
| `validate-spec-12.json` | `spec-validation-v1` | SPEC_12 Anti-Abuse |
| `validate-research-06.json` | `research-validation-v1` | Hosting Economics |
| `validate-research-07.json` | `research-validation-v1` | Sponsorship Economics |
| `validate-research-08.json` | `research-validation-v1` | Attestation Mechanisms |

### To Execute:

```bash
# From Claude Code or pipeline system:
# Spec validations
run-pipeline spec-validation-v1 --config pipeline-runs/validate-spec-11.json
run-pipeline spec-validation-v1 --config pipeline-runs/validate-spec-12.json

# Research validations
run-pipeline research-validation-v1 --config pipeline-runs/validate-research-06.json
run-pipeline research-validation-v1 --config pipeline-runs/validate-research-07.json
run-pipeline research-validation-v1 --config pipeline-runs/validate-research-08.json
```

---

*Last Updated: 2025-12-27*
*Status: Queue ready for pipeline execution - 5 run configs created*
