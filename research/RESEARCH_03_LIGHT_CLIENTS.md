# Research Spike: Light Client Architecture

## Status: DRAFT

## Executive Summary

This research investigates the minimum trust requirements for Swimchain clients that cannot store the full chain, and whether meaningful decentralization is achievable without requiring all participants to run full nodes.

**Key Finding**: Swimchain's content decay mechanism fundamentally changes the light client equation. Unlike Bitcoin or Ethereum where chains grow unboundedly (requiring increasingly burdensome full nodes), Swimchain's bounded chain size means even "light" clients can realistically become full verifiers over time. This is a major architectural advantage that prior art in other blockchain systems does not enjoy.

**Primary Recommendation**: A hybrid approach combining FlyClient-style logarithmic header verification with space-based progressive sync and fraud proofs for validity. Light clients verify the full header chain in O(log n) via Merkle Mountain Range (MMR) commitments, then progressively sync content only for subscribed spaces. Content validity (signatures, PoW, decay rules) can be verified optimistically with fraud proofs, since the 48-hour decay floor provides sufficient challenge time.

**Key Insight**: For social media content, the consequences of accepting temporarily invalid content are far less severe than for financial transactions. This allows more aggressive light client optimizations than cryptocurrency chains permit. Swimchain can achieve "meaningful decentralization without full nodes" by making light clients first-class citizens that naturally evolve toward full verification through normal usage patterns.

## Research Question

If we must support clients that can't store the full chain, what's the minimum trust required? Can we have meaningful decentralization without full nodes?

## Context

Swimchain's thesis documents establish "every client is a full node" as the architectural vision (THESIS_01). However, practical reality presents constraints:

- Mobile devices have storage and bandwidth limitations
- New users may not want to wait for full chain synchronization
- Some users may only want to read content, not post
- Even with decay bounding chain size, the chain may still be substantial

THESIS_01 argues that some exclusion is acceptable for genuine decentralization—the question is what exclusion is necessary and what can be avoided through better light client design. SPEC_06 already describes header-first sync followed by content download for non-decayed blocks, establishing the foundation for the patterns explored here.

## Prior Art Analysis

### SPV (Simple Payment Verification)

#### Bitcoin SPV (2008)

- **How it works**: SPV clients download only block headers (~80 bytes each, ~4MB/year) instead of full blocks. They use Merkle proofs to verify that a specific transaction is included in a block without downloading all transactions. When verifying a transaction, the client requests a Merkle path from a full node, then verifies that the transaction's hash leads to the Merkle root in the block header. The client trusts the longest chain (most cumulative PoW) is valid.

- **Decentralization**: Medium. Clients can verify transaction inclusion cryptographically but cannot independently verify transaction validity.

- **Trust assumptions**:
  - Majority of miners/hashpower are honest
  - At least one connected full node provides accurate headers
  - Longest chain contains only valid transactions (no content validation)
  - Full nodes won't collude to feed false Merkle proofs

- **Pros**:
  - Linear storage growth (only headers)
  - Well-understood security model since 2008
  - Can verify transaction inclusion cryptographically
  - Works on constrained devices
  - Recent research (2025) shows security comparable to full nodes under bounded adversarial assumptions

- **Cons**:
  - Cannot detect invalid transactions in blocks (trusts miners)
  - Privacy leaks—nodes learn which addresses client cares about
  - Still linear growth—4MB/year becomes burdensome over decades
  - Dependent on full node infrastructure existing
  - Eclipse attacks possible if all connected nodes are malicious

- **Real-world outcomes**: SPV has been the dominant mobile Bitcoin experience for over a decade via wallets like Electrum and BRD. Security has been adequate for typical transactions but not recommended for high-value transfers. Recent 2024-2025 research from the formal verification community suggests SPV can achieve fraud resistance bounded by probabilistic guarantees comparable to full nodes when correctly implemented.

- **Swimchain applicability**: Directly applicable as baseline approach. Swimchain's decay mechanism significantly improves SPV viability since the chain is bounded. Header-first sync is already specified in SPEC_06. However, SPV alone cannot verify decay rules or content signatures without additional mechanisms. For social media, the trust model (can't detect invalid content) may be acceptable since content validity is less critical than financial validity.

### Light Client Protocols

#### Ethereum Sync Committees

- **How it works**: Introduced in the Altair hard fork, sync committees consist of 512 validators randomly selected from the ~500k active validator set, rotating every ~27 hours (256 epochs). These validators continuously sign the block header at each slot. Light clients only need to verify BLS signatures from this 512-validator subset rather than tracking all validators. The sync committee's honesty mirrors the overall validator set's honesty due to random selection. Light clients use Merkle proofs to verify beacon state roots and chain finality.

- **Decentralization**: Medium-High. Statistical sampling ensures representative honesty.

- **Trust assumptions**:
  - Statistical honesty assumption—if 2/3 of total validators are honest, sync committee will be honest with high probability
  - No slashing for sync committee misbehavior (weaker than attestation security)
  - Need at least one honest data source to get updates
  - Trust in the random selection process for committee membership

- **Pros**:
  - Only need 512 validator keys instead of ~500k (16MB → small set)
  - BLS signature aggregation enables efficient verification
  - Merkle proofs provide cryptographic chain data verification
  - Designed for extremely constrained environments (mobile, IoT, cross-chain bridges)
  - Infrequent committee rotation reduces sync overhead

- **Cons**:
  - No slashing—security relies on statistical honesty, not cryptoeconomic guarantees
  - Committee rotation adds complexity
  - Light client must track committee transitions
  - Still relies on honest data providers for updates
  - Cannot independently verify execution layer state without additional proofs

- **Real-world outcomes**: Sync committees have enabled production light clients like Helios (Rust) and Nimbus (Nim). Helios is used by a16z and provides multichain light client capability. The Portal Network is building decentralized infrastructure to serve light client data peer-to-peer. Cross-chain bridges like Snowbridge and Hyperbridge use sync committees for trustless Ethereum state verification.

- **Swimchain applicability**: The committee-based approach could work for Swimchain if validators existed. In PoW chains, there's no natural validator set to sample from. However, the principle of "a representative subset signs for efficiency" could inspire a design where recently-active block producers form a rotating committee. The Merkle proof pattern for state verification is directly applicable to verifying decay state and content existence.

#### Mina Protocol Succinct Blockchain

- **How it works**: Mina uses recursive zk-SNARKs to compress the entire blockchain history into a constant-size cryptographic proof (~22KB, now ~11KB). Each new block generates a SNARK that verifies both the new transactions AND the previous proof. The result is that verifying the latest proof is equivalent to verifying all transactions from genesis. No historical data needs to be stored—only the current proof and state.

- **Decentralization**: High. Anyone with minimal resources can fully verify the chain.

- **Trust assumptions**:
  - Cryptographic assumptions underlying the SNARK scheme (Pickles/Pasta curves)
  - The proving system is correctly implemented
  - No trusted setup required (Mina uses a transparent setup)
  - At least one honest node produces valid proofs

- **Pros**:
  - Constant-size verification (~22KB) regardless of chain length
  - True full verification—not just headers, entire state transition history
  - Anyone can run a full-verifying node on a smartphone
  - Maximum decentralization potential—minimal barrier to verification
  - No trusted setup required

- **Cons**:
  - Computationally expensive to generate proofs (specialized hardware helps)
  - Complex cryptography—harder to audit and implement correctly
  - Current throughput limitations due to proving overhead
  - Newer technology with less real-world battle-testing
  - Proof generation is a potential centralization vector if few can afford it

- **Real-world outcomes**: Mina launched mainnet in 2021 and has been running successfully. As of December 2024, the network has over 1.1 billion MINA tokens in circulation. In 2024, bridges to Ethereum were developed (Aligned Layer, Nori) enabling Mina state proofs to be verified on Ethereum. The Mesa testnet in 2024-2025 is testing performance improvements. However, throughput remains limited compared to traditional chains.

- **Swimchain applicability**: Mina's approach is the gold standard for light client design—every client verifies everything. For Swimchain, adopting full recursive SNARKs would be transformative but requires significant cryptographic infrastructure. A hybrid approach might work: use SNARKs for epoch transitions while using simpler proofs for within-epoch verification. The key insight is that constant-size proofs enable true "every client is a full verifier" even on mobile.

#### Celo Plumo Ultralight Sync

- **How it works**: Plumo combines three innovations: (1) Epoch-based syncing—validators can only change at epoch boundaries (~1 day), so clients only need one header per epoch instead of every block. (2) BLS signature aggregation—all validator signatures combine into one ~50 byte signature, reducing data per epoch. (3) SNARK proofs for epoch transitions—a SNARK proves that the validator set transition was valid, covering 4 months of history in one proof. This achieves claimed 1.7 million times lighter than Ethereum's original light client protocol.

- **Decentralization**: High. Proof-based verification with minimal data requirements.

- **Trust assumptions**:
  - BLS cryptographic assumptions
  - SNARK soundness (uses trusted setup)
  - Majority of validators in each epoch are honest
  - Proof generation is done correctly (can be verified by anyone)

- **Pros**:
  - Syncs in seconds even on low-end mobile phones
  - 4-month history per proof—extremely efficient
  - Proof generation costs only ~$25 USD
  - BLS aggregation scales well with validator count
  - Combines best of epoch-based sync with SNARK efficiency

- **Cons**:
  - Requires SNARK trusted setup
  - Assumes epoch-based consensus (not applicable to all chains)
  - Proof generation still requires significant compute
  - Specific to Celo's validator set structure
  - Less battle-tested than SPV

- **Real-world outcomes**: Plumo was published at Financial Cryptography 2022 and is deployed on Celo. cLabs runs public proof generation infrastructure, though anyone can generate proofs. The system enables true mobile-first blockchain access in regions with limited connectivity—a key Celo use case for financial inclusion in developing markets.

- **Swimchain applicability**: Plumo's epoch-based approach is interesting for Swimchain. If block producers were tracked per-epoch (or per-day), clients could sync just epoch boundaries. However, Swimchain uses PoW not PoS, so there's no fixed validator set. The BLS aggregation pattern could work if block headers included aggregatable signatures. The key insight is that "sync one thing per time period" dramatically reduces light client burden.

#### Helios & Portal Network (Ethereum)

- **How it works**: Helios is a production Ethereum light client (by a16z) that uses sync committees for consensus layer verification and can query execution state. The Portal Network is an Ethereum Foundation initiative creating peer-to-peer networks specifically for serving light client data—separating data availability from full node operation. Portal includes: History Network (historical blocks), Beacon Network (consensus data), and State Network (account/contract data). This enables light clients to get data from a P2P network rather than centralized RPC providers.

- **Decentralization**: Medium-High. Decentralized data serving infrastructure.

- **Trust assumptions**:
  - Sync committee honesty (statistical)
  - At least some Portal Network peers are honest
  - Merkle proofs verify retrieved data
  - RPC provider honest (if not using Portal)

- **Pros**:
  - Production-ready light client (Helios)
  - Decentralized data serving (Portal Network)
  - Enables EIP-4444 (expiring old data from full nodes)
  - Multichain support in Helios
  - Low resource requirements

- **Cons**:
  - Portal Network still maturing
  - Currently most users still use Infura/Alchemy
  - Limited tooling compared to full nodes
  - Sync committee security weaker than full consensus

- **Real-world outcomes**: Helios is in production and actively maintained. Portal Network has multiple client implementations (Nimbus, Trin) with data being served. EIP-4444 implementation plan targets pre-merge data expiry from May 2025. The combination represents Ethereum's path to truly decentralized light clients, moving away from RPC provider dependency.

- **Swimchain applicability**: The Portal Network model is highly relevant. Swimchain could have specialized overlay networks for different data types: headers, recent content, specific spaces. This separates "storing data" from "running a node." Light clients could participate in P2P data serving without storing everything. The key insight: create networks optimized for light client data needs, separate from the main gossip network.

### Header Chains

#### FlyClient (Logarithmic Header Verification)

- **How it works**: FlyClient is a super-light client requiring only O(log n) block headers instead of O(n). It uses probabilistic sampling with a Merkle Mountain Range (MMR) commitment structure. The prover maintains an MMR over all blocks. The verifier randomly samples blocks according to a probability distribution weighted toward recent blocks (where difficulty attacks are harder). Each sampled block's inclusion is proven via MMR Merkle proof. The verifier checks PoW on sampled blocks to verify chain validity.

- **Decentralization**: Medium. Same honest majority assumption as SPV but with vastly reduced data.

- **Trust assumptions**:
  - Honest majority of hashpower (same as SPV)
  - MMR commitments are included in block headers
  - Random sampling is unpredictable to adversary
  - At least one honest prover provides accurate data

- **Pros**:
  - Logarithmic storage/bandwidth: ~500KB for Ethereum vs 4GB SPV
  - Works with variable difficulty (unlike NIPoPoWs)
  - Stateless between executions—only stores one header
  - 6,600x smaller than SPV proofs in Ethereum
  - Mathematically proven security bounds

- **Cons**:
  - Requires protocol change to include MMR commitments
  - More complex than basic SPV
  - Still relies on honest majority PoW assumption
  - Cannot verify state or transactions, only chain
  - Probabilistic security (can be made arbitrarily strong)

- **Real-world outcomes**: FlyClient was published at IEEE S&P 2020 and has seen real adoption. Zcash implemented FlyClient support in the Heartwood upgrade (ZIP 221). Nervos CKB is implementing FlyClient for its NC-Max consensus. The logarithmic improvement is significant for chains with long histories.

- **Swimchain applicability**: FlyClient is directly applicable to Swimchain. If MMR commitments are added to block headers, light clients could sync the entire chain history in O(log n) headers. Combined with decay (which bounds the "interesting" history), this could be very efficient. A Swimchain client might: (1) FlyClient sync to verify chain validity, (2) download recent blocks fully for active content, (3) ignore historical decayed content. The MMR structure could also commit to content existence for Merkle proofs.

### Trust-Minimized Approaches

#### Fraud Proofs (Optimistic Approach)

- **How it works**: Fraud proofs assume all state transitions are valid unless challenged. When a state update is proposed, there's a challenge period (typically 7 days) during which anyone can submit a fraud proof demonstrating invalidity. The fraud proof contains just enough data to replay the disputed computation and prove it was wrong. If fraud is proven, the state is rolled back and the proposer is penalized. If no challenge occurs, the state is finalized.

- **Decentralization**: Medium. Relies on economic incentives and honest watchers.

- **Trust assumptions**:
  - At least one honest verifier is watching and will submit fraud proofs
  - Verifiers can get their fraud proofs included on-chain during challenge period
  - Economic incentives (staking/penalties) deter fraud
  - Challenge period is long enough for detection and proof submission

- **Pros**:
  - Lower computational overhead—no proof generation for every state transition
  - Simpler to implement than validity proofs
  - Lower gas costs for normal operation
  - Scales well—only compute proofs when disputes occur
  - Compatible with general-purpose computation (EVM)

- **Cons**:
  - Long finality delay (7+ days typical)
  - Security depends on watchtower/verifier liveness
  - Cannot detect fraud if all verifiers are offline or censored
  - Withdrawal delays are poor UX
  - Relies on economic rather than cryptographic security

- **Real-world outcomes**: Fraud proofs power Optimism and Arbitrum, the two largest Ethereum L2s with billions in TVL. Optimism uses single-round interactive proofs (faster but less efficient for complex disputes). Arbitrum uses multi-round interactive proving (more efficient but longer). Despite theoretical concerns, no major fraud proof failures have occurred in production, though some argue this is because fraud hasn't been attempted rather than robust detection.

- **Swimchain applicability**: Fraud proofs could enable light clients to trust content validity without full verification. A light client could accept blocks optimistically and rely on fraud proofs if invalid content (bad signatures, violated decay rules) was included. The 7-day delay is unacceptable for social media, but could work for eventual consistency on historical data. Key insight: "assume valid, prove if wrong" is fundamentally different from SPV's "trust miners"—it's more like "trust unless someone objects."

#### Validity Proofs (ZK Approach)

- **How it works**: Every batch of state transitions generates a cryptographic validity proof (SNARK or STARK) that mathematically proves the transitions were computed correctly. The proof is small and quick to verify even though the underlying computation may be complex. Verification is immediate—no challenge period needed. The proof guarantees computational integrity: if the proof verifies, the state transition was valid.

- **Decentralization**: High. Cryptographic rather than economic security.

- **Trust assumptions**:
  - Cryptographic soundness of the proof system
  - Correct implementation of proving/verification
  - For SNARKs: trusted setup was performed honestly (or use STARKs which don't need this)
  - Proof generation infrastructure is available

- **Pros**:
  - Instant finality—no challenge period
  - Cryptographic rather than economic security
  - Virtually impossible to include fraudulent transactions
  - More capital efficient (fast withdrawals)
  - Security doesn't depend on honest verifiers watching

- **Cons**:
  - High computational cost for proof generation
  - Complex cryptography, harder to implement and audit
  - STARKs have larger proofs than SNARKs
  - SNARKs require trusted setup (security risk if compromised)
  - Proof generation can be a centralization vector

- **Real-world outcomes**: ZK rollups like zkSync, StarkNet, and Polygon zkEVM are in production with significant adoption. StarkNet uses STARKs (no trusted setup). ZK proof technology has matured significantly 2022-2025, with proving times and costs dropping dramatically. However, full EVM-equivalence with ZK remains challenging. The ecosystem is converging on STARKs for new systems due to transparency and post-quantum security.

- **Swimchain applicability**: Validity proofs are the strongest possible light client guarantee—cryptographic proof that state transitions are correct. For Swimchain, this would mean a light client could verify an entire epoch of content with a single proof. The main challenge is that proof generation requires significant resources. Could work as: full nodes generate epoch proofs, light clients verify. Decay rules, signature validity, and PoW could all be proven in-circuit.

#### Data Availability Sampling (DAS)

- **How it works**: DAS allows light nodes to verify that block data is available without downloading full blocks. Blocks are encoded using Reed-Solomon erasure codes into a 2D matrix. Light nodes randomly sample small portions of this matrix and request them from the network. If a light node can successfully sample enough random pieces, it gains high confidence (e.g., 99%) that the full data is available for reconstruction. The key insight: if >50% of data is available, the entire block can be reconstructed via erasure coding.

- **Decentralization**: High. Light nodes contribute to network security.

- **Trust assumptions**:
  - Random sampling is truly random (not predictable by adversary)
  - Network delivers requested samples honestly (at least sometimes)
  - Erasure coding is correctly applied
  - Sufficient light nodes exist to collectively sample all data

- **Pros**:
  - Light clients achieve full-node-like security for data availability
  - O(log n) or O(sqrt n) sampling instead of O(n) download
  - Enables massive block sizes without centralizing verification
  - Light nodes contribute to network security by sampling
  - More light nodes = more sampling = higher collective security

- **Cons**:
  - Only proves data availability, not validity
  - Requires erasure coding overhead
  - Needs many light nodes for security (single node = probabilistic)
  - Complex implementation
  - Doesn't help with historical data verification

- **Real-world outcomes**: Celestia launched mainnet October 2023 with DAS as its core innovation, raising $100M+ in funding. By April 2025, Celestia testnet achieved ~21 MB/s throughput with 128MB blocks. Avail and EigenDA also implement DAS. Ethereum's roadmap includes full Danksharding with PeerDAS. This technology is proven but still relatively new at scale.

- **Swimchain applicability**: DAS is highly relevant for Swimchain. Light clients could verify that block content is available without downloading it all. For social media, this means: "I know the posts exist and could retrieve them, even if I don't download all of them." Combined with decay, this is powerful—light clients verify recent blocks via DAS, then only download content they care about. Spaces could act as "namespaces" similar to Celestia's design.

### Federated/Trusted Models

#### Trusted Servers / Multi-Server Verification

- **How it works**: The simplest light client just asks a trusted server for the current state. Multi-server verification improves on this by querying multiple independent servers and comparing responses. If M of N servers agree, the client accepts the response. This can range from simple voting to more sophisticated threshold cryptography where M of N key shares are needed to produce a valid signature. Some systems add reputation scoring, slashing, or other economic incentives.

- **Decentralization**: Low to Medium. Fundamentally relies on operator honesty.

- **Trust assumptions**:
  - For single server: complete trust in that server
  - For M-of-N: at least M servers are honest
  - Servers are truly independent (not colluding)
  - Client can identify and connect to multiple servers

- **Pros**:
  - Simple to implement and understand
  - Fast—just query and accept
  - No cryptographic complexity
  - Works for any data, not just blockchain-specific
  - Can be pragmatic starting point

- **Cons**:
  - Not trustless—fundamentally relies on operator honesty
  - Collusion resistance depends on server independence
  - Who decides the trusted set? Bootstrap problem
  - Economic attacks possible (bribe servers)
  - Violates "every client is a full node" philosophy

- **Real-world outcomes**: This model is extremely common in practice. Most Ethereum "light" usage is via Infura/Alchemy (trusted single server). Mastodon's federation model is effectively multi-server trust. Chainlink oracles use M-of-N for price feeds. Threshold signature schemes are used in MPC bridges. The model works but has known centralization risks—Infura outages affect huge swaths of "decentralized" apps.

- **Swimchain applicability**: Swimchain's thesis explicitly REJECTS this model. THESIS_01 states "every client is a full node" and rejects mega-instances like mastodon.social. However, as a TEMPORARY bootstrap mechanism or for truly constrained devices (e.g., feature phones in developing regions), M-of-N querying with verification could be a compromise. The key is making it optional and ensuring the system works without it. Never make trusted servers the default.

### Hybrid Approaches

#### Progressive/Hybrid Sync

- **How it works**: Progressive sync models start light and become full nodes over time. A new client might begin with header-only sync (SPV-style), immediately usable for basic verification. Background processes then download and verify full blocks, eventually achieving full node status. Interest-based variants only download content relevant to the user (subscribed spaces, followed users). Lazy full nodes fetch historical data on-demand rather than upfront.

- **Decentralization**: Medium to High. Improves over time toward full node security.

- **Trust assumptions**:
  - Initially: same as the light protocol used (SPV, sync committee, etc.)
  - Eventually: converges to full node trust (trust nothing)
  - During transition: graduated trust based on what's been verified

- **Pros**:
  - Immediate usability—don't wait for full sync
  - Eventually achieves full node security
  - Interest-based variants save bandwidth for most users
  - Natural fit for mobile (start light, sync on WiFi)
  - Graceful degradation if resources limited

- **Cons**:
  - Complexity of managing partial state
  - Security varies over time—confusing UX
  - Interest-based sync may miss important context
  - Lazy fetching introduces latency
  - May never complete full sync if resources stay limited

- **Real-world outcomes**: Ethereum clients like Geth offer multiple sync modes (snap, fast, full). Bitcoin Core has "assume valid" which trusts signatures before a checkpoint. Helios starts with sync committee and can verify deeper history as needed. The Portal Network is building decentralized infrastructure to support this pattern. Most production mobile wallets use some form of progressive sync.

- **Swimchain applicability**: Progressive sync aligns well with Swimchain. SPEC_06 already describes header-first sync followed by content download for non-decayed blocks. The natural extension: (1) Header sync for chain validity, (2) Full download for spaces user subscribes to, (3) On-demand fetch for other content when accessed. With decay, there's a natural boundary—only recent content needs attention. Mobile background sync in SPEC_06 already describes this pattern.

## Comparative Analysis

| Approach | Decentralization | Privacy | Scalability | Complexity | Maturity |
|----------|------------------|---------|-------------|------------|----------|
| Bitcoin SPV | Medium | Low | Medium | Low | High |
| Ethereum Sync Committees | Medium-High | Medium | High | Medium | High |
| Mina Recursive SNARKs | High | Medium | High | Very High | Medium |
| Celo Plumo | High | Medium | High | High | Medium |
| FlyClient | Medium | Low | High | Medium | Medium |
| Helios + Portal | Medium-High | Medium | High | Medium | Medium |
| Fraud Proofs | Medium | Medium | High | Medium | High |
| Validity Proofs (ZK) | High | High | High | Very High | Medium |
| Data Availability Sampling | High | Medium | Very High | Medium | Medium |
| Progressive Sync | Medium→High | Medium | High | Medium | High |
| Trusted Servers | Low | Low | High | Low | High |

**Dimension Definitions**:
- **Decentralization**: How well it preserves the "no central authority" principle
- **Privacy**: Whether the light client's interests/queries are protected from observers
- **Scalability**: How well it handles large chains and many concurrent users
- **Complexity**: Implementation and maintenance burden
- **Maturity**: Real-world deployment and battle-testing

## Patterns Identified

### Pattern 1: Header-First, Content-On-Demand

All successful light client protocols separate chain verification (headers, proofs of work/stake) from content retrieval. Headers establish the canonical chain and enable subsequent content verification via Merkle proofs. Content is fetched only when needed, reducing upfront bandwidth.

**Examples**: Bitcoin SPV, Ethereum sync committees, FlyClient, Swimchain SPEC_06

**Swimchain Applicability**: Directly matches current design. The decay mechanism makes this even more powerful—historical content doesn't need to be retrieved since it's decayed. Focus sync on recent headers + content, verify historical headers without content.

### Pattern 2: Committee/Representative Subset Signing

Instead of requiring verification against all validators/miners, use a smaller representative subset that signs on behalf of the network. Security comes from random selection making corruption statistically improbable.

**Examples**: Ethereum sync committee (512 of 500k), Celo epoch validators, threshold signatures

**Swimchain Applicability**: Challenging for pure PoW chains without a validator set. However, could adapt: recent block producers (last N blocks) form an implicit committee. Their continued production of valid blocks attests to chain state. A "checkpoint committee" of long-standing nodes could sign epoch boundaries.

### Pattern 3: Logarithmic/Sublinear Sampling

Rather than downloading linear amounts of data, sample O(log n) or O(sqrt n) elements with cryptographic commitments (MMR, Merkle trees) to verify the sample represents the whole. Probability theory ensures attackers cannot selectively hide data.

**Examples**: FlyClient O(log n) headers, DAS O(sqrt n) samples, Merkle proofs

**Swimchain Applicability**: Highly applicable. FlyClient for header verification, DAS for block content availability. MMR commitments in headers would enable any client to verify any historical block with logarithmic proof. Combined with decay, only need to sample non-decayed portion.

### Pattern 4: Validity Proofs for Epoch Transitions

Use expensive validity proofs (SNARKs/STARKs) at epoch boundaries rather than for every block. The proof aggregates all within-epoch activity. Light clients verify one proof per epoch, achieving full security with minimal verification.

**Examples**: Mina recursive proofs, Plumo 4-month proofs, ZK rollup batch proofs

**Swimchain Applicability**: The most powerful but most complex approach. Swimchain could define "epochs" (e.g., 1 day of blocks) and generate proofs covering: all PoW valid, all signatures valid, all decay rules applied correctly. Light clients verify epoch proofs instead of individual blocks. Requires significant cryptographic infrastructure.

### Pattern 5: Progressive Security Improvement

Start with weaker security for immediate usability, then improve security over time as more data is verified. Light → Full progression. Accept that different users have different security needs based on their resource constraints.

**Examples**: Ethereum snap sync, Helios + Portal, mobile background sync

**Swimchain Applicability**: Aligns with Swimchain's user typology. "Casual reader" starts with header sync, "regular user" syncs subscribed spaces fully, "power user" runs full node. Security guarantees scale with participation level. Key: make the security tradeoffs explicit to users.

### Pattern 6: Data Availability ≠ Data Validity

Separate the concerns of "data exists and can be retrieved" from "data is valid." DAS proves availability efficiently. Validity proofs or fraud proofs address validity. Different mechanisms for different properties.

**Examples**: Celestia (DAS only), Optimistic rollups (fraud proofs for validity), ZK rollups (validity proofs)

**Swimchain Applicability**: For Swimchain: DAS could prove block content is available. Separately, fraud proofs or validity proofs address content correctness (valid signatures, valid PoW, valid decay). Light clients could use DAS for availability + fraud proof watching for validity.

## Approaches Incompatible with Swimchain

| Approach | Why Incompatible |
|----------|------------------|
| Federated Trust as Default | THESIS_01 explicitly states "every client is a full node" and rejects mega-instances like mastodon.social. Making trusted servers the default would recreate the centralization problem Swimchain exists to solve. |
| Sync Committees (Direct Application) | Sync committees require a defined validator set that can be randomly sampled. Swimchain uses PoW, not PoS—there's no natural validator set. Pattern requires fundamental redesign to adopt. |
| Long-Finality Fraud Proofs for Real-Time Content | 7-day challenge periods (as in Optimistic rollups) are unacceptable for social media where content relevance is measured in hours. However, fraud proofs for historical/decay verification remain viable. |
| Centralized Proof Generation | If SNARK/STARK proof generation can only be done by a few resource-rich nodes, this recreates centralization. Any validity proof approach must have distributed or incentivized proof generation. |
| M-of-N Federation for Normal Operation | "Who selects the N?" is an unsolvable centralization problem. Works for temporary bootstrapping but cannot be the operational model. |
| Checkpoints from Authority | Hardcoded checkpoints from "the developers" violates decentralization. Users can choose to trust specific block hashes, but the protocol cannot mandate checkpoint trust. |

## Recommendations

### Primary Recommendation

**Approach**: Header-First Progressive Sync with FlyClient + Fraud Proofs

**Rationale**: This approach combines three proven mechanisms:

1. **FlyClient for chain verification**: O(log n) header verification via MMR commitments provides efficient chain validation without downloading all headers. Proven in Zcash since 2020.

2. **Space-based progressive sync**: Full content download only for subscribed spaces matches how users actually consume social media. They don't need ALL content—just their spaces.

3. **Fraud proofs for validity**: Optimistic acceptance of content validity with fraud proof challenges provides validity guarantees with low overhead. Only prove things when challenged.

Decay's 48-hour floor provides sufficient challenge window without unacceptable delays. Combined with decay bounding chain size, light clients naturally become fuller over time.

**Implementation Level**: Protocol (MMR commitments in headers, fraud proof format) + Client (sync strategies, space filtering)

**Tradeoffs Accepted**:
- Protocol change required to add MMR commitments to block headers
- Probabilistic security for historical chain verification (acceptable given content decays anyway)
- Relies on at least one honest full node for fraud proof generation
- Cross-space content references may be unverifiable for light clients syncing only some spaces
- Privacy leaks in content requests (partial mitigation possible through batching/mixing)

**Open Questions**:
- Optimal MMR commitment structure for Swimchain's block format
- Fraud proof format and challenge/response protocol specification
- How to handle cross-space content references gracefully
- Economic model for fraud proof submission (incentives for watchers?)
- Exact space-sync granularity (per-space? per-user-in-space?)

### Alternative Approaches

#### Alternative 1: Pure FlyClient + Header-Only (Minimal Resources)

**When to Use**: For read-only clients that only verify content exists, not that it's valid. Suitable for browsers, public archives, aggregators, devices with minimal storage, and users who trust the social layer to filter invalid content.

**Tradeoffs**: Cannot verify content signatures or PoW locally. Trusts that invalid content will be socially filtered. Simpler implementation. Appropriate for casual readers who don't post.

#### Alternative 2: Full Progressive Sync (Maximum Security)

**When to Use**: For users who want full-node security but can't wait for initial sync. Power users on good connections. Devices with adequate storage that can sync over time.

**Tradeoffs**: Eventually achieves full node status but takes longer. Background sync consumes resources. Security varies during transition period. Best for regular posters who need to verify their own content.

#### Alternative 3: DAS + Fraud Proofs (Future Enhancement)

**When to Use**: If the network grows larger than decay can contain. For enabling massive block sizes with many concurrent posts. If light client participation needs to contribute to network security.

**Tradeoffs**: Adds erasure coding complexity. Requires sufficient light nodes for collective security. May be overkill if decay keeps chains manageable. Consider for Phase 2+.

#### Alternative 4: Optional SNARK Epoch Proofs (Future Enhancement)

**When to Use**: When cryptographic rather than economic security is required. If fraud proof watching infrastructure proves unreliable. For bridging to other chains that need validity guarantees.

**Tradeoffs**: Significant engineering investment. Proof generation infrastructure needed. Consider for Phase 3+ after core protocol is stable and proven.

### Explicitly Rejected Approaches

#### Rejected: Trusted Server Default

**Reason**: Directly contradicts THESIS_01's "every client is a full node" vision. Creates the mega-instance problem that Swimchain exists to solve. Acceptable ONLY as optional bootstrap for extremely constrained devices, never as default.

#### Rejected: M-of-N Federation for Normal Operation

**Reason**: "Who selects the N?" is an unsolvable centralization problem. M-of-N works for temporary bootstrapping but cannot be the operational model. Swimchain rejects "exit over voice" for "voice with trusted parties."

#### Rejected: Checkpoints from Authority

**Reason**: Hardcoded checkpoints from "the developers" violates decentralization principles. Users can choose to trust specific block hashes they've independently verified, but the protocol cannot mandate checkpoint trust.

#### Rejected: Sync Committees Without PoW Adaptation

**Reason**: No validator set exists in PoW. Would require fundamental protocol change to PoS which contradicts the intentional choice of PoW for friction.

## Implementation Considerations

### Dependencies

- **MMR commitment format**: Must be added to block header structure (protocol change)
- **Fraud proof specification**: Needs defined proof format and challenge protocol
- **Space-based sync filters**: Extends existing SyncFilter from SPEC_06
- **Content Merkle tree**: Required for proving specific content inclusion/exclusion

### Complexity

**Estimate: MEDIUM**

The core approach (FlyClient + progressive sync) uses well-understood primitives. The novel combination for Swimchain's specific needs adds moderate complexity:

- MMR commitment is a small protocol addition (~1 field in header)
- Space-based sync extends existing sync mechanisms in SPEC_06
- Fraud proofs are the most complex new component requiring specification

### Prototype Questions

1. **MMR overhead**: What's the actual storage/bandwidth cost of MMR commitments per block?
2. **FlyClient parameters**: What sampling count provides acceptable security for Swimchain's block frequency?
3. **Fraud proof latency**: How long does fraud proof generation and propagation take in practice?
4. **Space sync efficiency**: What percentage of chain content does a typical user actually need?
5. **Light-to-full progression**: How long until a light client achieves full verification given typical usage?
6. **Cross-space references**: How common are cross-space references and how should light clients handle them?

## Trust Spectrum Analysis

```
Full Node ←────────────────────────────────────────→ Pure Client
(Zero trust)                                          (Full trust)
     |           |           |           |           |
     |           |           |           |           |
  Full Sync   Progressive   FlyClient   Header-Only  Trusted
              + Fraud       + Space     SPV          Server
              Proofs        Sync

Swimchain targets this range: ←──────────→
                               Progressive to FlyClient+Space
```

**Minimum Viable Trust for Swimchain Light Client**:
1. Trust that the longest PoW chain is canonical (inherent to PoW)
2. Trust that at least one honest full node exists to generate fraud proofs if needed
3. Trust the cryptographic primitives (hashes, signatures, MMR proofs)

**What's NOT required**:
- Trust in any specific server or operator
- Trust that content is valid (verified or proven)
- Trust in a fixed validator set
- Access to full chain history

## User Type Matrix

| User Type | Approach | Trust Level | Sync Strategy | Can Post? |
|-----------|----------|-------------|---------------|-----------|
| Power User | Full Node | Zero trust | Full chain | Yes |
| Regular Poster | Progressive + Fraud Proofs | Low trust | Subscribed spaces + headers | Yes |
| Casual Reader | FlyClient + Space Sync | Medium trust | Headers + on-demand content | Read-only safe |
| Mobile User | Progressive (background) | Low→Zero over time | WiFi sync, cellular headers | Yes (after sync) |
| Archive/Browser | Header-Only | Medium trust | Headers only, fetch on view | Read-only |
| Embedded/IoT | Optional bootstrap + headers | Higher trust initially | Minimal, header stream | No (too constrained) |

## Remaining Gaps

1. **Privacy for light clients**: Most designs leak what content is being requested. Need PIR (Private Information Retrieval) or similar for true privacy. Research needed on practical privacy-preserving content requests.

2. **Economic model for fraud proofs**: Who is incentivized to generate and submit fraud proofs? What's the cost/reward structure? Without explicit incentives, fraud proof generation relies on altruism.

3. **Cross-space reference handling**: If a light client only syncs Space A but content references Space B, how should this be handled? Missing context could confuse users.

4. **PoW light client posting**: Can a light client do PoW for posting without knowing full chain state? Probably yes (difficulty is in headers), but needs validation.

5. **Mobile battery/bandwidth optimization**: OS-specific implementations for background sync aren't standardized. iOS and Android have different background task limitations.

6. **Decay verification without full history**: How can a light client verify that decay rules were correctly applied to content it never saw? Fraud proofs help, but specification needed.

7. **Light client contribution to network**: Can light clients meaningfully contribute (DAS sampling, gossip relay) or are they pure consumers? Network health depends on answer.

## Key Insights for Swimchain

1. **Decay is the killer feature**: Unlike unbounded chains, decay means light clients can realistically verify everything eventually. This changes the entire calculus of light client design.

2. **Social media tolerates temporary invalidity**: Unlike payments where a double-spend is catastrophic, invalid social content is merely annoying. This allows more aggressive optimistic verification.

3. **Interest-based sync matches usage**: Users don't read all of Twitter—they read their feed. Space-based sync matches this natural behavior perfectly.

4. **FlyClient is underutilized**: O(log n) header verification is a proven technique (Zcash) that provides huge efficiency gains with small protocol changes.

5. **Fraud proofs fit decay timing**: The 48-hour decay floor provides natural challenge windows. Fraud proofs aren't for real-time, but they work for historical verification.

6. **Portal Network model applies**: Specialized overlay networks for light client data could separate "storing data" from "running a node."

## References

### Academic Papers
- FlyClient: Super-Light Clients for Cryptocurrencies (IEEE S&P 2020)
- Plumo: An Ultralight Blockchain Client (Financial Cryptography 2022)
- Data Availability Sampling (Celestia whitepaper)
- Bitcoin SPV security analysis (arXiv 2507.00740)

### Protocol Specifications
- Ethereum Consensus Specs: Light Client Sync Protocol
- Zcash ZIP 221: FlyClient Implementation
- Mina Protocol Technical Whitepaper

### Production Systems
- Helios Light Client (a16z): https://github.com/a16z/helios
- Portal Network: https://www.ethportal.net/
- Celestia Mainnet: https://celestia.org/
- Nimbus Light Client: https://nimbus.team/

### Swimchain Documents
- THESIS_01: Every Client is a Full Node
- SPEC_06: Network Protocol (Header-first sync, SyncFilter)

---

*Research completed: December 2024*
*Status: DRAFT - Ready for team review*
