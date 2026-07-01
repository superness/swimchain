# Swimchain Development Process

## Overview

This document captures the development methodology for Swimchain - a truly decentralized social media protocol. The process uses AI-assisted automation to iteratively develop vision, philosophy, specifications, and implementation.

## The Five Phases

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                           CHAINSOCIAL DEVELOPMENT PIPELINE                               │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  PHASE 1       PHASE 2        PHASE 3A         PHASE 3B         PHASE 4       PHASE 5   │
│  VISION   →    THESIS    →    SPECIFICATION →  RESEARCH    →    IMPLEMENT →   VALIDATE  │
│                               (Protocol)       (Spikes)                                  │
│                                                                                          │
│  Conversa-     AI-assisted    Feature          Prior art        Roadmap-      Ad-hoc    │
│  tional        philosophical  definition       analysis &       driven dev    testing   │
│  exploration   development    from theses      recommendations  automation    & fixes   │
│                                                                                          │
│  ✅ COMPLETE   ✅ COMPLETE     ✅ COMPLETE       ✅ COMPLETE       🔄 READY      ⏳ PENDING │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Vision Development (Complete)

**Method**: Conversational iteration between human and AI

**Process**:
1. Initial concept articulation ("truly decentralized social media")
2. Anti-vision definition (what we reject)
3. Core principles extraction
4. Architecture exploration (active navigation, PoW, decay, forks)
5. Tradeoff acknowledgment
6. Threat model analysis

**Outputs**:
- `VISION.md` - Comprehensive design document (~8000 words)
- `WORKSTREAMS.md` - Execution roadmap with open questions

**Key Decisions Made**:
- Zero infrastructure (users ARE the network)
- Active navigation over algorithmic feeds
- PoW as friction, not mining
- Decay as organic moderation
- Forks as features, not failures

---

## Phase 2: Thesis Development (Complete)

**Method**: AI-assisted batch processing pipeline

**Pipeline**: `thesis-batch-processor` → `thesis-generator-v1`

**Process**:
1. Define thesis topics from vision tradeoffs
2. Create stub documents with core tension defined
3. Run batch processor to iteratively expand each thesis:
   - Topic analysis
   - Position generation
   - Thesis evaluation
   - Thesis refinement
4. Loop until all theses are complete

**Outputs**:
| File | Topic | Status |
|------|-------|--------|
| `THESIS_01_EXCLUSION.md` | Exclusion by Design | ✅ Complete |
| `THESIS_02_FRICTION.md` | Friction Is Good | ✅ Complete |
| `THESIS_03_FORKS.md` | Forks Over Consensus | ✅ Complete |
| `THESIS_04_SAFETY.md` | No Safety Net | ✅ Complete |
| `THESIS_05_GROWTH.md` | No Growth Imperative | ✅ Complete |
| `THESIS_06_DECAY.md` | Let Content Die | ✅ Complete |
| `THESIS_07_PSEUDONYMITY.md` | Pseudonymity Over Accountability | ✅ Complete |

---

## Phase 3A: Specification Development (Complete)

**Method**: AI-assisted batch processing pipeline

**Pipeline**: `spec-batch-processor` → `spec-generator-v1`

**Process**:
1. Create spec stubs for 6 protocol subsystems
2. Run batch processor to iteratively expand each spec:
   - Requirements extraction from theses
   - Spec drafting
   - Peer review
   - Revision (if needed)
   - Finalization
3. Loop until all specs are complete

**Subsystems**:
| File | Subsystem | Informed By | Status |
|------|-----------|-------------|--------|
| `specs/SPEC_01_IDENTITY.md` | Identity System | Theses 01, 07 | ✅ Complete |
| `specs/SPEC_02_CONTENT_DECAY.md` | Content & Decay | Theses 02, 06 | ✅ Complete |
| `specs/SPEC_03_PROOF_OF_WORK.md` | Proof of Work | Theses 01, 02 | ✅ Complete |
| `specs/SPEC_04_SPACES.md` | Spaces | Theses 03, 04 | ✅ Complete |
| `specs/SPEC_05_FORKS_CONSENSUS.md` | Forks & Consensus | Theses 03, 05 | ✅ Complete |
| `specs/SPEC_06_NETWORK_SYNC.md` | Network & Sync | Theses 01, 05 | ✅ Complete |

**Spec Format**:
- Status: STUB → DRAFT → COMPLETE
- Requirements (MUST/SHOULD/MUST NOT)
- Data Structures
- Algorithms
- Wire Protocol
- Security Considerations
- Implementation Notes
- Test Vectors

---

## Phase 3B: Research Spikes (In Progress)

**Method**: AI-assisted batch processing pipeline with web research

**Pipeline**: `research-batch-processor` → `research-generator-v1`

**Process**:
1. Create research stub documents for open questions
2. Run batch processor to iteratively research each topic:
   - Prior art research (using WebSearch)
   - Analysis of existing solutions
   - Synthesis into recommendations
   - Document writing
3. Loop until all research is complete

**Research Topics**:
| File | Topic | Key Question | Status |
|------|-------|--------------|--------|
| `research/RESEARCH_01_SYBIL_RESISTANCE.md` | Sybil Resistance | How to prevent identity spam? | ✅ Complete |
| `research/RESEARCH_02_BOOTSTRAP.md` | Bootstrap & Peer Discovery | How do first nodes find each other? | ✅ Complete |
| `research/RESEARCH_03_LIGHT_CLIENTS.md` | Light Client Architecture | What's minimum trust for partial nodes? | ✅ Complete |
| `research/RESEARCH_04_MODERATION_PATTERNS.md` | Decentralized Moderation | What patterns exist for self-governance? | ✅ Complete |
| `research/RESEARCH_05_LEGAL.md` | Legal Considerations | What are the legal risks? | ✅ Complete |

**Research Document Format**:
- Status: STUB → DRAFT → COMPLETE
- Executive Summary
- Prior Art Analysis (per approach)
- Comparative Matrix
- Swimchain-Specific Recommendations
- Implementation Considerations
- Remaining Gaps

---

## Phase 4: Implementation (Ready)

**Method**: Roadmap-driven automated development

**Roadmap**: `ROADMAP.md` - Detailed 5-phase implementation plan with 20+ milestones

**Process**:
1. Read task from ROADMAP.md
2. Read relevant spec sections (linked in each milestone)
3. Implement the deliverables
4. Run tests and benchmarks
5. Document findings (especially measurements)
6. Move to next milestone

**Key Measurements to Capture**:
- PoW duration on various devices
- Chain/storage size after decay
- Sync time at various scales
- Content retrieval performance
- Mobile viability metrics

**Pipeline**: `implementation-processor` (can be created or run manually)

**Agents Needed**:
- `roadmap_task_selector` - Picks next milestone from ROADMAP.md
- `spec_context_loader` - Loads relevant spec sections
- `implementation_planner` - Plans the implementation
- `implementation_executor` - Writes the code
- `benchmark_runner` - Runs performance measurements
- `implementation_validator` - Validates against spec
- `documentation_writer` - Documents findings

---

## Phase 5: Validation (Pending)

**Method**: Ad-hoc testing and hole-plugging

**Process**:
1. Manual testing of implemented features
2. Identify gaps between spec and implementation
3. Document issues
4. Run targeted fix pipelines
5. Iterate until stable

---

## Pipeline Architecture

### Thesis Pipeline (Complete)
```
thesis-batch-processor
├── select_thesis (thesis_selector)
├── generate_thesis (sub-pipeline: thesis-generator-v1)
│   ├── topic_analysis (topic_analyzer)
│   ├── position_generation (position_generator)
│   ├── thesis_evaluation (thesis_evaluator)
│   └── thesis_refinement (thesis_refiner)
├── write_thesis (thesis_document_writer)
└── completion_check (thesis_selector) → loop back or exit
```

### Specification Pipeline (Complete)
```
spec-batch-processor
├── select_spec (spec_subsystem_selector)
├── generate_spec (sub-pipeline: spec-generator-v1)
│   ├── requirements_extraction (thesis_requirements_extractor)
│   ├── spec_drafting (protocol_spec_writer)
│   ├── spec_review (spec_peer_reviewer)
│   ├── spec_revision (spec_reviser) [if needed]
│   └── spec_finalization (protocol_spec_writer)
├── write_spec (spec_document_writer)
└── completion_check (spec_subsystem_selector) → loop back or exit
```

### Research Pipeline (Ready)
```
research-batch-processor
├── select_research (research_topic_selector)
├── generate_research (sub-pipeline: research-generator-v1)
│   ├── research_prior_art (prior_art_researcher) [uses WebSearch]
│   ├── synthesize_findings (research_synthesizer)
│   └── write_document (research_document_writer)
└── completion_check (research_topic_selector) → loop back or exit
```

---

## Document Dependencies

```
VISION.md
    │
    ├── THESIS_01_EXCLUSION.md ───┐
    ├── THESIS_02_FRICTION.md ────┤
    ├── THESIS_03_FORKS.md ───────┤
    ├── THESIS_04_SAFETY.md ──────┼──→ specs/SPEC_01_IDENTITY.md ─────┐
    ├── THESIS_05_GROWTH.md ──────┼──→ specs/SPEC_02_CONTENT_DECAY.md │
    ├── THESIS_06_DECAY.md ───────┼──→ specs/SPEC_03_PROOF_OF_WORK.md ├──→ ROADMAP.md
    └── THESIS_07_PSEUDONYMITY.md ┼──→ specs/SPEC_04_SPACES.md ───────┤       │
                                  ├──→ specs/SPEC_05_FORKS_CONSENSUS.md       │
                                  └──→ specs/SPEC_06_NETWORK_SYNC.md ─┘       │
                                                                              │
    WORKSTREAMS.md                                                            │
    │                                                                         │
    └── research/RESEARCH_01_SYBIL_RESISTANCE.md ───┐                         │
        research/RESEARCH_02_BOOTSTRAP.md ──────────┤                         │
        research/RESEARCH_03_LIGHT_CLIENTS.md ──────┼── (informs) ────────────┘
        research/RESEARCH_04_MODERATION_PATTERNS.md ┤
        research/RESEARCH_05_LEGAL.md ──────────────┘
                                           │
                                           ↓
                                    Implementation
```

---

## Principles

1. **Document everything** - No design decision without written rationale
2. **Trace to source** - Every spec traces to theses, every thesis traces to vision
3. **Iterate automatically** - Use pipelines to batch process similar work
4. **Review and refine** - Built-in peer review at each stage
5. **Honest about limits** - Document open questions, don't pretend to have answers

---

## Running the Pipelines

### Start the research-batch-processor:
1. Open Pipeline Designer (http://localhost:3003)
2. Load `research-batch-processor` template
3. Set working directory to `/mnt/c/github/swimchain`
4. Execute

### Monitor progress:
- Pipeline Monitor (http://localhost:3004)
- Execution logs: `proxy/pipelines/research-batch-processor_execution.json`

### Expected Output:
The pipeline will iterate through 5 research topics, performing web searches for prior art and synthesizing recommendations. Each topic takes ~5-15 minutes depending on complexity.

---

## Agent Inventory

### Phase 2 Agents (Thesis)
- `thesis_selector` - Picks next thesis stub
- `topic_analyzer` - Analyzes thesis topic
- `position_generator` - Generates initial position
- `thesis_evaluator` - Evaluates thesis strength
- `thesis_refiner` - Refines thesis
- `thesis_document_writer` - Writes final document

### Phase 3A Agents (Specification)
- `spec_subsystem_selector` - Picks next spec stub
- `thesis_requirements_extractor` - Extracts requirements from theses
- `protocol_spec_writer` - Writes protocol specifications
- `spec_peer_reviewer` - Reviews specs
- `spec_reviser` - Revises based on review
- `spec_document_writer` - Writes final document

### Phase 3B Agents (Research)
- `research_topic_selector` - Picks next research stub
- `prior_art_researcher` - Researches prior art (uses WebSearch)
- `research_synthesizer` - Synthesizes findings into recommendations
- `research_document_writer` - Writes final document

---

*Last updated: 2024-12-24*
