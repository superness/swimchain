# Attestation Security Model

This document describes the security properties and anti-gaming measures of the peer attestation protocol.

## Threat Model

### Adversary Capabilities

We assume an adversary who can:
1. Create multiple identities (Sybil attack)
2. Control a minority of network nodes
3. Collude with other malicious actors
4. Lie about observed contributions

### Goals to Protect

1. **Integrity**: Validated contributions should accurately reflect actual network contributions
2. **Fairness**: Honest nodes should not be disadvantaged compared to attackers
3. **Sybil Resistance**: Creating fake identities should not provide attestation advantage

## Anti-Gaming Measures

### 1. Established Identity Requirement

Attesters must be "established" identities with:
- **Age Requirement**: Identity must exist for at least 7 days (`MIN_IDENTITY_AGE_SECS`)
- **Contribution History**: At least 1 period of prior contributions (`MIN_ATTESTER_CONTRIBUTION_PERIODS`)

**Why this works**: Sybil identities cannot attest immediately. An attacker must:
1. Create identities 7+ days in advance
2. Actually contribute during at least one period
3. Only then can they attest

This creates a cost for each Sybil: they must wait and contribute before gaining attestation power.

### 2. Multiple Attesters Required

A claim requires at least 3 attestations (`MIN_ATTESTERS`) from different peers.

**Why this works**: An attacker must control at least 3 established identities to validate a fraudulent claim. Each identity requires time and contribution investment.

### 3. Median Value Aggregation

The confirmed value is the median of attestation values, not the mean.

**Why this works**: Outliers cannot skew the result.

```
Honest attestations:  [100, 100, 100]
With 2 Sybils lying:  [100, 100, 100, 10000, 10000]
Median: 100 (Sybils have no effect)
```

Even with a minority of Sybil attesters reporting extreme values, the median remains honest.

### 4. Variance Threshold

Attestations with variance > 20% of median are rejected (`MAX_ATTESTATION_VARIANCE_PERCENT`).

**Why this works**: Prevents the "mixed" attack where some honest peers and some Sybils submit divergent values:

```
Mixed values: [50, 100, 200]
Variance: 150, Variance%: 150%
Result: REJECTED (inconsistent)
```

If attestation values are too divergent, the claim fails validation entirely.

### 5. No Self-Attestation

A node cannot attest to its own contribution claims.

**Why this works**: Prevents the trivial attack of creating 3 identities that all belong to the same operator.

### 6. No Duplicate Attesters

Each attester can only submit one attestation per claim.

**Why this works**: Prevents an attacker from submitting multiple attestations from the same identity.

### 7. Attestation Freshness

Attestations must be recent (within 7 days, `ATTESTATION_PERIOD_WINDOW_SECS`).

**Why this works**: Prevents replay attacks where old attestations are reused.

## Attack Analysis

### Attack 1: Fake Bandwidth Claim

**Scenario**: Attacker claims 10 GB bandwidth but served only 1 GB.

**Attempt**: Get 3 colluding Sybils to attest to 10 GB.

**Defense**:
1. Each Sybil must be 7+ days old
2. Each Sybil must have 1+ period of contribution history
3. All three Sybils must agree (variance check)
4. Target cannot self-attest

**Outcome**: Attack requires significant investment in Sybil infrastructure with limited benefit.

### Attack 2: Sybil Attestation Amplification

**Scenario**: Create 100 Sybil identities to provide many attestations.

**Attempt**: Use Sybils to validate fraudulent claims.

**Defense**:
1. Each Sybil requires 7 days of aging
2. Each Sybil must contribute for at least 1 period
3. Only 3 attestations are needed (extras provide no benefit)
4. Median calculation resists outlier values

**Outcome**: Creating 100 Sybils costs 100x more than creating 3, but provides no additional advantage.

### Attack 3: Minority Attestation Manipulation

**Scenario**: Attacker controls 2 out of 5 attesters.

**Attempt**: Submit inflated values from the 2 controlled attesters.

**Defense**:
1. Median calculation: 2 outliers cannot affect median of 5
2. Variance threshold may reject if values diverge too much

**Outcome**: Minority control has minimal effect on validated values.

### Attack 4: Long-term Sybil Maintenance

**Scenario**: Maintain Sybil identities long-term for future attacks.

**Attempt**: Age Sybils and accumulate contribution history.

**Defense**:
1. Contribution history requires actual network participation
2. Maintaining many Sybils is expensive (bandwidth, storage, uptime)
3. The cost of maintaining N Sybils grows linearly with N

**Outcome**: Long-term Sybil maintenance has ongoing costs that deter large-scale attacks.

## Security Properties

### Sybil Cost Analysis

For an attacker to successfully validate a fraudulent claim:

| Requirement | Cost |
|-------------|------|
| Create 3 identities | PoW cost × 3 |
| Age identities 7 days | Time cost |
| Contribute for 1 period | Bandwidth/uptime cost × 3 |
| Coordinate attestations | Operational cost |

**Total cost per fraudulent claim**: Significant and scales linearly with attack frequency.

### Honest Majority Assumption

The system provides strong guarantees when:
- At least 2 of 3 attesters are honest, OR
- At least (n/2)+1 of n attesters are honest

Under honest majority, the median reflects the honest value.

### Degraded Security

If an attacker controls > 50% of attesters for a specific claim:
- They can influence the median
- Variance checks may still reject inconsistent values
- Other claims from honest nodes remain unaffected

## Comparison with Alternatives

### Why Not Proof of Work?

PoW for attestation would:
- Waste computational resources
- Not actually verify contribution claims
- Allow wealthy attackers to dominate

Peer attestation uses actual observation, not computational power.

### Why Not Stake-Based?

Stake-based attestation would:
- Favor wealthy participants
- Create centralization around large stakeholders
- Not align incentives with actual contribution

Contribution history as a prerequisite aligns attestation power with network participation.

### Why Not Trusted Servers?

Centralized verification would:
- Create single points of failure
- Require trust in operators
- Undermine decentralization

Peer attestation maintains fully decentralized verification.

## Future Improvements

### Potential Enhancements

1. **Graduated Trust**: Longer-established identities could carry more weight
2. **Reputation Scores**: Track attestation accuracy over time
3. **Stake Bonds**: Optional staking to increase attestation weight
4. **Geographic Diversity**: Require attesters from different network regions

### Research Areas

1. **Optimal MIN_ATTESTERS**: Trade-off between security and availability
2. **Dynamic Variance Thresholds**: Adapt based on network conditions
3. **Cross-Period Correlation**: Detect long-term Sybil patterns
4. **Economic Modeling**: Formal analysis of attack costs vs. rewards

## See Also

- [Peer Attestation Protocol](peer-attestation.md) - Protocol specification
- [Contribution Tracking](contribution-tracking.md) - Self-reported metrics
- RESEARCH_01: Sybil Resistance research
- SPEC_09: Social Layer specification
