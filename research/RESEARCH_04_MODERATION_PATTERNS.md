# Research Spike: Decentralized Moderation Patterns

## Status: DRAFT

## Executive Summary

This research examines how systems have handled content moderation without central authority, analyzing patterns from Usenet (1980s) through modern federated platforms like Mastodon and Matrix. The central finding is that **successful decentralized moderation requires layered defenses**—no single mechanism suffices. Systems that relied on a single approach (Reddit's voting, Steemit's stake-weighting, 4chan's minimal moderation) all experienced significant failure modes.

Swimchain's existing design choices are strongly validated by prior art. The Hive fork from Steem (2020) proves that fork-as-exit works when identity is portable—Hive attracted 2x more daily active users than Steem post-fork. Email's decentralized reputation systems prove that node-level filtering scales to billions of daily messages. Decay-based content management, seen in 4chan's ephemeral posts and Snapchat Stories, demonstrates that organic expiration reduces moderation burden without requiring moderators.

The research identifies critical patterns Swimchain should adopt (consensus-based blocklists with transparency, reputation-weighted display without exposing numeric values) and patterns to explicitly reject (stake-weighted voting which creates plutocracy, hierarchical moderator roles vulnerable to capture, anonymous posting which enables the 11% hate speech rate seen on 4chan). Several gaps remain unsolved in any decentralized system: coordinated harassment campaigns, illegal content at protocol level, and AI-generated content at scale. These are acknowledged limitations rather than solvable problems.

## Research Question

How have other systems handled content moderation without central authority? What patterns exist for community self-governance at scale?

## Context

Swimchain is designed without central moderation authority. The protocol provides three core mechanisms that bear on moderation:

1. **Decay** (THESIS_06): Content fades without ongoing engagement, providing organic moderation where unpopular or irrelevant content disappears naturally
2. **Proof-of-Work** (THESIS_02): Computational cost creates friction for all actions, making spam economically irrational
3. **Forks** (THESIS_03): Communities can escape capture by forking with preserved identity

However, these mechanisms don't address all moderation challenges—particularly illegal content, targeted harassment, and coordinated manipulation. This research examines prior art to understand what patterns complement Swimchain's core approach and what limitations must be honestly acknowledged.

The research aligns with Swimchain's values:
- No special moderator roles (THESIS_04)
- Preserving decentralization (THESIS_01)
- User self-protection philosophy (THESIS_04)
- Client-side filtering as primary defense

## Prior Art Analysis

### Historical Forum Moderation

#### Usenet Cancelbot System
- **How it works**: Usenet was a decentralized global network (created 1980) where messages propagated across servers. Cancelbots were automated processes for sending third-party cancel messages to remove spam. Individual servers could refuse to propagate content from problematic sources. The "backbone cabal" provided informal authority for major decisions.
- **Decentralization**: High—no single entity could force network-wide content removal
- **Trust assumptions**: Server operators honor cancel messages (voluntary); cancelbots follow community-accepted technical criteria
- **Pros**: No central authority required; server autonomy preserved; technical criteria provided objective standards
- **Cons**: Cancel wars between competing bots; crude moderation (server-level only, not content-level); conspiracy theories about "Usenet cabal" emerged; system degraded over time
- **Real-world outcomes**: Usenet lost relevance partly due to inability to handle moderation at scale. After Google Groups dropped Usenet support (2024), spam dropped dramatically because there were finally "contactable admins who care." The Big-8 board was re-established in 2020.
- **Swimchain applicability**: Validates that federated moderation can work but requires some coordination mechanism. Swimchain's decay serves similar purpose to cancel messages—organic content removal without central authority.

#### BBS Sysop Moderation
- **How it works**: Each BBS was privately run by a system operator (sysop) with complete control. Sysops created social policies, verified users (sometimes via phone calls), and could ban unilaterally. Word spread informally between sysops about troublemakers.
- **Decentralization**: Medium—each BBS was independent but trust was centralized in the sysop
- **Trust assumptions**: Users trust their chosen sysop; sysop acts in community interest; informal reputation networks exist between sysops
- **Pros**: Direct, personal moderation; immediate dispute response; flexibility per community; real identity verification possible
- **Cons**: No standardization; sysop could act arbitrarily; limited scalability; labor-intensive
- **Real-world outcomes**: Over 100,000 BBSs existed by mid-1980s. Model worked for tight-knit communities (<100 active users) but couldn't scale. Created foundation for netiquette.
- **Swimchain applicability**: Swimchain spaces function somewhat like BBSs—community-level governance. The fork mechanism mirrors BBS ecosystem where users could join different BBSs. Key difference: Swimchain spaces have no owner with special powers.

#### phpBB/vBulletin Moderator Roles
- **How it works**: Hierarchical permission systems with user groups (Registered, Moderators, Administrators). Moderators can approve/delete posts, issue warnings, ban users. Permissions applied globally or per-forum. Roles bundle permissions for easy assignment.
- **Decentralization**: Low—centralized hierarchy with single point of failure (site owner)
- **Trust assumptions**: Forum owner appoints trustworthy administrators who appoint trustworthy moderators
- **Pros**: Clear hierarchy and accountability; flexible permissions; scales through delegation
- **Cons**: Centralized power vulnerable to capture; moderator burnout common; power struggles; no user exit option
- **Real-world outcomes**: Dominated web forums for 20+ years. Works for stable aligned communities but vulnerable to drama and capture. Many forums died when key moderators left.
- **Swimchain applicability**: Swimchain explicitly rejects this model—no moderators at protocol level. However, clients could implement similar filtering locally. The phpBB model shows what Swimchain avoids: capture vulnerability at moderator and admin levels.

#### Slashdot Karma and Metamoderation
- **How it works**: Random readers selected as temporary moderators with points to upvote/downvote. Karma tracks users whose posts are moderated up. Metamoderation provides peer review—users judge whether moderations were valid, affecting moderators' karma.
- **Decentralization**: Medium—distributed across community but on centralized platform
- **Trust assumptions**: Random selection produces fair distribution; metamoderation catches bad moderators; karma reflects quality
- **Pros**: Distributed moderation; peer review creates accountability; karma creates skin-in-the-game
- **Cons**: Easily gamed—karma could be boosted to "Excellent" in 48 hours; old-timers favored; metamoderation abuse led to proposals for "meta-meta-moderation"
- **Real-world outcomes**: Initially successful, influenced Reddit. Gaming became known problem. Slashdot eventually hid numeric karma, using labels instead. Founder regretted exposing karma numbers.
- **Swimchain applicability**: Key lessons: (1) Don't expose exact numeric reputation—use labels. (2) Peer review helps but creates infinite recursion. (3) Random moderator selection better than self-selection. Swimchain's PoW provides different friction—can't cheaply create posts regardless of karma.

### Wikipedia Governance

#### Consensus Decision-Making and Arbitration
- **How it works**: Escalating dispute resolution: talk page discussion → Third Opinion requests → Dispute Resolution Noticeboard → Arbitration Committee (ArbCom). Three-Revert Rule (3RR) limits editors to 3 reverts in 24 hours. ArbCom is elected and focuses on conduct, not content. Policies like NPOV provide standards.
- **Decentralization**: Medium—community-driven but ArbCom provides final authority
- **Trust assumptions**: Editors argue in good faith; consensus emerges from discussion; ArbCom acts neutrally; community accepts ArbCom's authority
- **Pros**: Structured escalation prevents many conflicts; written policies create predictable standards; community ownership of decisions
- **Cons**: Consensus dominated by experienced editor "aristocracy"; social capital affects outcomes; time-intensive; edit wars still occur despite 3RR
- **Real-world outcomes**: Remarkably successful at scale. 2024 research shows ArbCom mostly adheres to principles. However, "white Western men" dominate through powerful networks. Wikipedia maintains a "never-ending wars" category for irreconcilable disputes.
- **Swimchain applicability**: Swimchain has no ArbCom equivalent—disputes cannot be escalated beyond community action. Wikipedia's success suggests clear, citable policies help reduce conflict. Swimchain's fork mechanism provides escape from irreconcilable disputes rather than resolution. Key insight: some disputes cannot be resolved—forking may be more honest than endless conflict.

### Federated Moderation

#### Mastodon Instance-Level Moderation
- **How it works**: Instance administrators set local policies and can defederate (block) other instances. Blocklists shared via #FediBlock hashtag, curated lists (Gardenfence, Oliphant, Seirdy Tier-0), and tools like FediBlockHole. Consensus-based lists require multiple sources to agree. Users can also block individuals.
- **Decentralization**: High—no central authority; instance autonomy preserved
- **Trust assumptions**: Instance admins make good-faith decisions; blocklist curators are trustworthy; users join compatible instances
- **Pros**: Instance autonomy; consensus lists reduce single-source errors; migration possible
- **Cons**: #FediBlock hashtag targeted by harassment; blocklist transparency varies; no shared federated moderation tools; instance migration loses followers
- **Real-world outcomes**: Functional but imperfect. 2024 research shows active blocklist ecosystem with competing approaches. Some lists provide detailed "receipts" (rationales), others are opaque. Mastodon's roadmap includes optional blocklist subscription.
- **Swimchain applicability**: Most directly applicable model. Node-level filtering mirrors instance-level blocking. Key difference: Mastodon migration loses followers; Swimchain identity persists across forks. Learn from transparency issues—blocklist "receipts" build trust. Consensus-based approach (multiple sources) applies to shared filter lists.

#### Matrix Room-Level Moderation
- **How it works**: Decentralized access control at room level. Server ACLs block servers from rooms. Moderation Policy Rooms store ban lists as state events. Mjolnir bot enforces bans. Power levels (0-100) control room capabilities.
- **Decentralization**: Medium—room-level autonomy but ACLs require all servers to comply
- **Trust assumptions**: All servers in room uphold ACLs (critical); room moderators act appropriately
- **Pros**: Room autonomy; shared ban lists enable coordination; graduated power levels
- **Cons**: ACLs only work if ALL servers comply; old/buggy servers leak traffic; banned users can rejoin from different servers; ACL UI hidden in devtools
- **Real-world outcomes**: Demonstrates both promise and limitation of federated moderation. Weakest-link vulnerability in ACL compliance. Matrix exploring relative reputation systems where anyone can publish reputation feeds.
- **Swimchain applicability**: Power levels (0-100) could inform space implementations, though Swimchain avoids owner/moderator roles. The ACL "all servers must comply" problem doesn't apply since Swimchain nodes filter independently. Matrix's relative reputation experiment aligns with Swimchain's client-side filtering vision.

#### Email Sender Reputation (SpamAssassin)
- **How it works**: Distributed reputation without central authority. SpamAssassin's TxRep tracks sender reputation across multiple identifiers (email, IP, domain, DKIM). Each server makes independent decisions using shared signals. SPF/DKIM/DMARC provide cryptographic verification.
- **Decentralization**: High—each server decides independently using shared signals
- **Trust assumptions**: Blocklist providers are accurate; receiving servers make independent decisions; cryptographic authentication is verified
- **Pros**: Decentralized; multiple signals for robustness; cryptographic verification; proven at massive scale (billions daily); portable reputation
- **Cons**: IP reputation can punish legitimate senders on shared infrastructure; cold start for new senders; blocklists can be weaponized
- **Real-world outcomes**: Remarkably successful despite complete decentralization. Multi-factor reputation is key—no single signal determines fate. Reputation accumulates through consistent behavior.
- **Swimchain applicability**: Strong model for Swimchain reputation. Key insights: (1) Use multiple reputation signals. (2) Reputation accumulates over time from behavior. (3) Each node decides independently using shared signals. (4) Cryptographic identity enables persistent reputation. Swimchain's keypairs function like SPF/DKIM—proof of identity that accumulates reputation.

### Algorithmic Moderation

#### Reddit Voting System
- **How it works**: Users upvote/downvote affecting visibility. Subreddits have volunteer moderators with removal power. Karma accumulates from upvotes. Anonymous voting.
- **Decentralization**: Low—Reddit Inc. controls platform
- **Trust assumptions**: Votes reflect genuine opinion; subreddit moderators act in community interest; anti-manipulation systems work
- **Pros**: Simple, intuitive; crowd wisdom for ranking; subreddit autonomy; scales to millions
- **Cons**: Highly susceptible to manipulation; brigading common; astroturfing at massive scale; paid upvote services work; 2FA not required
- **Real-world outcomes**: Vote manipulation is endemic. 2024 investigation: political campaigns made 2,551 posts receiving 5.7 million upvotes in 15 days. Paid services add upvotes within 2 minutes. 2023 API crisis showed moderators have no leverage—users couldn't exit with communities.
- **Swimchain applicability**: Cautionary tale. Key lessons: (1) Anonymous voting is easily gamed. (2) Without exit rights, users have no leverage. (3) Volunteer moderator labor can be captured. Swimchain's PoW prevents cheap manipulation; fork mechanism provides exit right Reddit lacks; decay replaces downvoting.

#### Stack Overflow Reputation System
- **How it works**: Reputation from upvotes unlocks privileges at thresholds: 15 rep = flag posts, 500 rep = review new posts, 2000 rep = edit any post, 3000 rep = close votes, 10000 rep = moderation dashboard. Duplicate detection and heavy curation.
- **Decentralization**: Medium—community-driven on centralized platform
- **Trust assumptions**: Upvotes correlate with quality; reputation reflects contribution; graduated privileges create responsibility
- **Pros**: Reputation filters bad actors; graduated privileges distribute work; high-quality archive results; self-moderating
- **Cons**: Can feel hostile to newcomers; gaming possible; AI content crisis (2023); 70%+ moderators struck over AI policy
- **Real-world outcomes**: Highly effective for Q&A curation. Reputation system successfully distributes moderation. 2023 AI crisis revealed tensions—16% activity decline after ChatGPT. Shows even successful systems face disruption.
- **Swimchain applicability**: Graduated privileges require central authority. Clients could weight content by author reputation, hide low-reputation content. Key insight: reputation should unlock capabilities gradually. PoW already creates friction; reputation could modulate it.

#### Hacker News Moderation
- **How it works**: Single full-time moderator (dang) plus karma-based privileges. ~20% of front-page stories penalized undocumented. Users with 31+ karma can flag and vouch. Voting rings detected. Low-karma users (<50) cannot downvote.
- **Decentralization**: Low—benevolent dictator model
- **Trust assumptions**: Single moderator acts in community interest; invisible penalties are fair; community accepts lack of transparency
- **Pros**: High quality maintained; minimal visible moderation; voting ring detection; long-running success (since 2007)
- **Cons**: Single point of failure; invisible penalties lack accountability; opaque algorithm; no appeal process
- **Real-world outcomes**: Remarkably successful for 18 years. Works because of community alignment and dang's established trust. Entirely dependent on one person's judgment.
- **Swimchain applicability**: What Swimchain explicitly avoids—benevolent dictator. However, karma thresholds (31 to flag/vouch) could inform clients. Vouch mechanism is interesting: established users resurrect "dead" content. Decay + engagement provides similar management without central moderator. Key insight: HN works because of community self-selection, which Swimchain's forum model also assumes.

### Blockchain Moderation

#### Steemit Stake-Weighted Voting
- **How it works**: Voting power tied to token holdings (Steem Power). Posts receive rewards from pool based on stake-weighted upvotes. Downvotes redistribute rewards. "Whales" (large holders) dominate curation.
- **Decentralization**: Medium—permissionless but plutocratic
- **Trust assumptions**: Token distribution is fair; large holders act in ecosystem interest; downvotes correct abuse
- **Pros**: Economic incentives; permissionless; on-chain transparency
- **Cons**: Plutocracy—whales dominate; downvote wars; content quality irrelevant to rewards; Sybil attacks possible
- **Real-world outcomes**: Demonstrated stake-weighted voting creates plutocracy. Whale voting experiments showed removing whale influence improved distribution. Led to community fork (Hive) when Tron acquired Steemit.
- **Swimchain applicability**: Swimchain does not use stake-weighted anything. Validates THESIS_04's concern about power concentration. Swimchain's PoW provides alternative "stake"—time invested. Decay ensures old content can't accumulate permanent power.

#### Hive Fork (Community Migration)
- **How it works**: When Justin Sun acquired Steemit (2020) and used exchange tokens to capture governance, community executed a hard fork. Entire Steem ledger copied to Hive, Sun's tokens excluded. Users received 1:1 HIVE tokens. DApps migrated. Governance via 20 elected "witnesses."
- **Decentralization**: High—community successfully escaped capture
- **Trust assumptions**: Community can coordinate fork; users will migrate; DApps will rebuild
- **Pros**: Escaped corporate capture; identity and content preserved; DApps migrated; 2x more daily users than Steem post-fork
- **Cons**: Required coordination; some users remained on Steem; two chains fragmented community
- **Real-world outcomes**: Most successful example of fork-as-escape-from-capture. Harvard Business School created a case study. Demonstrates that when identity and content are portable, capture becomes much harder.
- **Swimchain applicability**: Direct validation of THESIS_03. Key insights: (1) Identity portability is essential. (2) Content history should transfer. (3) Community coordination achievable. (4) Excluding captured actors' tokens acceptable to community.

### No Moderation (What Happens)

#### 4chan /b/ (Minimal Moderation)
- **How it works**: Anonymity with ephemeral content. Minimal moderation—only clearly illegal content removed. Different boards have different moderation levels; /b/ is most permissive.
- **Decentralization**: Low—centralized platform with hands-off policy
- **Trust assumptions**: Ephemeral content limits harm; users can self-filter; anonymity has value
- **Pros**: True anonymity; ephemeral content limits permanent harm; no censorship of legal content
- **Cons**: 11% of /pol/ posts contain hate speech (2025 study); breeding ground for extremism; AI-generated extremist content proliferating; multiple mass shooters posted manifestos; under UK regulatory investigation
- **Real-world outcomes**: Demonstrates failure mode of minimal moderation. 35.9% of hateful posts racist, 23.3% religious hate. 69.7% of AI images contain recognizable figures in extremist content. Multiple real-world violence links.
- **Swimchain applicability**: Cautionary tale for what Swimchain must avoid. Key differences: (1) Swimchain has persistent pseudonymous identity—reputation has consequences. (2) PoW creates friction 4chan lacks. (3) Decay provides organic removal. Study 4chan's failure modes: coordinated harassment, extremist organizing, content enabling violence.

### Cryptographic Approaches

#### Blind Signatures (Anonymous but Accountable)
- **How it works**: Users obtain credentials that prove authorization without revealing identity. Signer validates user is authorized but cannot see what they're signing. Users present tokens anonymously but accountably—misbehavior can trigger de-anonymization or blacklisting.
- **Decentralization**: High (when using decentralized issuance)
- **Trust assumptions**: Cryptographic assumptions hold; issuing authority honest during issuance; de-anonymization conditions clear
- **Pros**: Anonymous but accountable; cryptographic vs. policy guarantees; Sybil-resistant through issuance
- **Cons**: Complex to implement; requires issuing authority; de-anonymization can be abused
- **Real-world outcomes**: Academic research active but limited deployment. 2024 Blind Multisignatures research enables decentralized issuance. Most implementations focus on payments, not social media.
- **Swimchain applicability**: Interesting for future development—could enable Sybil-resistant anonymous actions, reputation tokens without identity, accountability for serious violations. However, Swimchain's simpler approach may suffice for v1.

#### Commit-Reveal Voting
- **How it works**: Two-phase voting: (1) Commit: submit hashed vote. (2) Reveal: after all commits, reveal actual vote. Prevents basing judgment on already-cast votes.
- **Decentralization**: High—no central authority needed
- **Trust assumptions**: All voters reveal; timelock respected; hash function collision-resistant
- **Pros**: Prevents bandwagon voting; cryptographic guarantees; prevents vote buying (can't prove vote)
- **Cons**: Two-phase is slower; non-revealers forfeit votes; complex UX
- **Real-world outcomes**: Used in DAOs like PLCR voting. Effective for governance where bandwagon effects problematic.
- **Swimchain applicability**: Relevant if Swimchain implements voting. Could be used for community decisions about space parameters or fork decisions. However, Swimchain relies on engagement-based decay rather than voting—may be unnecessary for core mechanics.

## Comparative Analysis

| Approach | Decentralization | Privacy | Scalability | Complexity | Maturity |
|----------|------------------|---------|-------------|------------|----------|
| Usenet cancelbots | High | Low | Medium | Low | Legacy |
| BBS sysops | Medium | Low | Low | Low | Legacy |
| phpBB hierarchies | Low | Low | Medium | Medium | Mature |
| Slashdot karma | Medium | Low | Medium | Medium | Mature |
| Wikipedia ArbCom | Medium | Low | High | High | Mature |
| Mastodon blocklists | High | Medium | High | Medium | Active |
| Matrix ACLs | Medium | Medium | Medium | High | Active |
| Email reputation | High | Low | Very High | High | Mature |
| Reddit voting | Low | High | Very High | Low | Failing |
| Stack Overflow rep | Medium | Low | High | Medium | Mature |
| HN karma | Low | Low | Medium | Low | Mature |
| Steemit stake | Medium | Low | Medium | Medium | Failed |
| Hive fork | High | Low | Medium | High | Active |
| 4chan minimal | Low | High | Medium | Low | Failing |
| Blind signatures | High | High | Unknown | Very High | Research |
| Commit-reveal | High | Medium | Medium | Medium | Niche |

## Patterns Identified

### Pattern 1: Federated Filtering (Node/Instance-Level)

Each server/node makes independent moderation decisions. Shared blocklists propagate but adoption is voluntary. No single entity forces network-wide decisions. Nodes can defederate from problematic sources.

**Examples**: Mastodon blocklists, Matrix server ACLs, Usenet propagation, Email spam filtering

**Swimchain applicability**: Core pattern. Node-level filtering with optional shared lists preserves decentralization while enabling coordination. Swimchain's spec already describes this. Key insight: transparency ("receipts") builds trust in shared lists.

### Pattern 2: Reputation-Based Privilege Unlocking

Users earn reputation from community assessment, unlocking capabilities at thresholds. Low-reputation users have limited influence. Creates skin-in-the-game without central authority.

**Examples**: Stack Overflow privileges, Slashdot karma, HN karma thresholds, Wikipedia editing experience

**Swimchain applicability**: Clients could implement reputation-weighted display. Key lesson: don't expose numeric reputation (encourages gaming). Graduated privileges reduce friction while protecting against Sybils.

### Pattern 3: Fork as Exit Right

When governance fails or capture occurs, community forks to new chain/instance with preserved identity. Credible threat of exit disciplines governance. Capture becomes pointless when community can leave.

**Examples**: Hive from Steem, Bitcoin/Bitcoin Cash, BBS switching

**Swimchain applicability**: Central to THESIS_03. Hive demonstrates this works. Requirements: identity portability, content preservation, community coordination. Swimchain's keypairs enable this.

### Pattern 4: Decay-Based Moderation

Content disappears without ongoing engagement. Unpopular content fades organically without removal decisions. Shifts moderation from removal to preservation.

**Examples**: 4chan ephemerality, Snapchat Stories, Usenet expiry

**Swimchain applicability**: Core to THESIS_06. Key difference: Swimchain's decay is engagement-based, not purely temporal. Creates community ownership of what persists.

### Pattern 5: PoW as Spam Friction

Computational cost creates friction, making spam economically irrational. Each action has non-trivial cost that scales with abuse.

**Examples**: Email hashcash (proposed), Swimchain PoW

**Swimchain applicability**: Core to THESIS_02. Less proven in social media than other patterns. Email hashcash never achieved adoption. Swimchain's implementation is novel.

### Pattern 6: Consensus-Based Blocklists

Block lists require multiple independent sources to agree before action. Reduces single-source errors and weaponization.

**Examples**: Mastodon consensus lists (Oliphant, Seirdy), The Bad Space, Email multi-source reputation

**Swimchain applicability**: Directly applicable to shared filter lists. Multiple trusted sources reduce false positives. Transparency about sources builds trust.

### Pattern 7: Personal Curation with Shared Starting Points

Users maintain personal filter lists but import from trusted sources as starting point. Ultimate control remains with user.

**Examples**: Mastodon blocklist import, RSS aggregation, Email filters, Browser ad-block

**Swimchain applicability**: Exactly Swimchain's vision for client-side filtering. Key challenge: making accessible to non-technical users.

## Approaches Incompatible with Swimchain

| Approach | Why Incompatible |
|----------|------------------|
| Stake-weighted voting | Creates plutocracy; violates equality principle; Steemit proved this fails |
| Hierarchical moderators | Centralized power vulnerable to capture; violates THESIS_04 |
| Central arbiter | Requires trusted authority; incompatible with decentralization |
| Anonymous posting | Enables 11% hate speech rate (4chan); reputation must have consequences |
| Global content consensus | Impossible without central authority; fundamentally anti-decentralization |
| Platform-owned identity | Users cannot exit with identity; enables capture |
| Invisible algorithmic ranking | Opaque moderation creates distrust; HN model doesn't transfer |

## Recommendations

### Primary Recommendation

**Approach**: Layered Defense with Node-Level Filtering

**Rationale**: No single mechanism works—prior art consistently shows that successful moderation requires multiple complementary mechanisms. Swimchain should implement:

1. **Protocol layer**: PoW friction + engagement-based decay (already designed)
2. **Node layer**: Independent filtering using shared signals (like email)
3. **Client layer**: Reputation-weighted display with consensus blocklists
4. **Community layer**: Fork capability for ultimate escape

This mirrors email's success: decentralized decisions using shared signals, cryptographic identity for reputation persistence, multiple factors rather than single metric.

**Implementation Level**: Protocol + Client

**Tradeoffs Accepted**:
- Some problematic content will exist at protocol level (cannot be deleted)
- Coordination overhead for shared blocklists
- Cold-start problem for new identities
- Sophisticated attackers can still cause harm

**Open Questions**:
- What's the right PoW difficulty level?
- How to bootstrap initial filter lists?
- How to handle illegal content at protocol level legally?
- How to make client-side filtering accessible to non-technical users?

### Alternative Approaches

**For communities wanting stronger curation**: Clients can implement reputation thresholds for visibility, hiding content from low-reputation or new accounts. This is client-level, not protocol-level.

**For communities wanting less friction**: Clients can implement more permissive defaults, showing more content with reputation indicators rather than hiding.

**For high-stakes spaces**: Consider commit-reveal for any voting/governance within spaces.

### Explicitly Rejected Approaches

1. **Stake-weighted anything**: Steemit proved this creates plutocracy. Swimchain must not weight influence by token holdings.

2. **Protocol-level moderators**: Any special moderation role creates capture vulnerability. Moderation must remain at client/node level.

3. **Anonymous posting**: 4chan's 11% hate speech rate demonstrates the failure mode. Swimchain's persistent pseudonymous identity is essential.

4. **Central blocklists**: Any single-source blocklist creates capture vulnerability. Use consensus-based multi-source approach.

5. **Numeric reputation scores**: Slashdot learned that exposing exact numbers encourages gaming. Use qualitative labels.

## Implementation Considerations

- **Dependencies**: Relies on existing PoW and decay mechanisms; requires client-side filtering infrastructure
- **Complexity**: Multi-layer approach has coordination overhead; consensus blocklists require tooling
- **Prototype questions**:
  - How do reputation labels map to PoW difficulty modulation?
  - What's the minimum consensus threshold for shared blocklists (2 sources? 3?)?
  - How to handle blocklist "receipts" at protocol level?

## Remaining Gaps

Several problems remain unsolved in any decentralized system:

1. **Coordinated harassment campaigns**: No system has solved targeted, multi-account harassment. Victims cannot filter fast enough; attackers follow across migrations.

2. **Illegal content at protocol level**: All decentralized systems struggle with CSAM. Node-level filtering helps but content technically exists. Legal exposure for node operators unclear.

3. **AI-generated content at scale**: 2024-2025 research shows AI-generated manipulation is accelerating. Traditional approaches struggle.

4. **Minority protection within communities**: Collective exit protects communities but not dissidents within communities. A lone disagreer cannot meaningfully fork.

5. **Historical value recognition**: Content that becomes valuable later may decay before recognition. No system solves delayed-recognition preservation.

6. **Moderation labor sustainability**: All volunteer moderation faces burnout. Distributed moderation helps but doesn't eliminate.

These are acknowledged limitations, not solvable problems. Swimchain's honest answer is that it provides tools (fork, filter, decay) rather than solutions.

## References

### Usenet
- Wikipedia: Cancelbot - https://en.wikipedia.org/wiki/Cancelbot
- Policy Review: Decentralised Content Moderation - https://policyreview.info/glossary/decentralised-content-moderation
- The Register Forums: Usenet Discussion - https://forums.theregister.com/forum/all/2023/12/18/google_ends_usenet_links/

### BBS
- Driscoll, K. "Social Media's Dial-Up Ancestor" - https://ahc-ch.ch/wp-ahc21/wp-content/uploads/21-1-Driscoll.pdf
- IEEE Spectrum: BBS History - https://spectrum.ieee.org/social-medias-dialup-ancestor-the-bulletin-board-system
- Georgetown University Repository: BBS Research - https://repository.library.georgetown.edu/bitstream/handle/10822/1060525/Ackermann_georgetown_0076M_14743.pdf

### Forum Software
- phpBB Documentation: Moderator Permissions - https://www.phpbb.com/support/docs/en/3.2/ug/quickstart/permissions_moderators/
- Contabo Blog: phpBB Guide - https://contabo.com/blog/phpbb-guide-setup-manage-forum/

### Slashdot
- Slashdot FAQ: Karma - https://slashdot.org/faq/karma.shtml
- Slashdot: Moderation Guidelines - https://slashdot.org/moderation.shtml
- Chris DiBona: Karma Abuse Post - https://cdibona.substack.com/p/slashdot-karma-abusive-users-and

### Wikipedia
- Wikipedia: Arbitration Committee - https://en.wikipedia.org/wiki/Arbitration_Committee_(Wikipedia)
- Cambridge Law Journal: Social Capital in Wikipedia Arbitration - https://www.cambridge.org/core/journals/law-and-social-inquiry/article/canceling-disputes-how-social-capital-affects-the-arbitration-of-disputes-on-wikipedia/91BEE9C7E89DE234777B6FF04E82C1B9
- Wikipedia: Edit Warring - https://en.wikipedia.org/wiki/Wikipedia:Edit_warring

### Mastodon
- JoinFediverse Wiki: FediBlock - https://joinfediverse.wiki/FediBlock
- Oliphant Social Blocklist - https://writer.oliphant.social/oliphant/the-oliphant-social-blocklist
- Seirdy: Fediverse Blocklists - https://seirdy.one/posts/2023/05/02/fediverse-blocklists/
- arXiv: Fediverse Research - https://arxiv.org/html/2506.05522v1

### Matrix
- Matrix.org: Moderation Guide - https://matrix.org/docs/older/moderation/
- Mjolnir Documentation - https://github.com/matrix-org/mjolnir/blob/main/docs/moderators.md
- Matrix Spec Proposal 2313 - https://github.com/matrix-org/matrix-doc/blob/msc2313/proposals/2313-moderation-policy-rooms.md

### Email
- SpamAssassin TxRep Plugin - https://spamassassin.apache.org/full/3.4.x/doc/Mail_SpamAssassin_Plugin_TxRep.html
- Mailtrap: Email Sender Reputation - https://mailtrap.io/blog/email-sender-reputation/
- Microsoft: Sender Reputation - https://learn.microsoft.com/en-us/exchange/antispam-and-antimalware/antispam-protection/sender-reputation

### Reddit
- Reddit Help: Vote Manipulation - https://support.reddithelp.com/hc/en-us/articles/360043066412-What-constitutes-vote-cheating-or-vote-manipulation
- Wikipedia: Vote Brigading - https://en.wikipedia.org/wiki/Vote_brigading
- Medium: Reddit Manipulation Investigation - https://medium.com/@toffee/how-easy-and-cheap-it-is-to-manipulate-reddit-discussions-4139a488542

### Stack Overflow
- Stack Overflow Blog: Theory of Moderation - https://stackoverflow.blog/2009/05/18/a-theory-of-moderation/
- Wikipedia: Stack Overflow - https://en.wikipedia.org/wiki/Stack_Overflow
- PMC: Stack Overflow Research - https://pmc.ncbi.nlm.nih.gov/articles/PMC8211233/

### Hacker News
- Hacker News FAQ - https://news.ycombinator.com/newsfaq.html
- GitHub: HN Undocumented - https://github.com/minimaxir/hacker-news-undocumented
- Righto: HN Ranking - http://www.righto.com/2013/11/how-hacker-news-ranking-really-works.html

### Steemit/Hive
- Steemit: Whale Voting Experiment - https://steemit.com/steem/@timcliff/the-whale-voting-experiment-explained-including-downvotes-from-abit
- Decrypt: Sun/Steemit/Hive - https://decrypt.co/23259/sun-blockchain-steemit-hive
- Decrypt: Hive Outperforms Steemit - https://decrypt.co/23854/hive-decentralized-fork-outperforms-steemit
- HBS Case Study - https://www.hbs.edu/faculty/Pages/item.aspx?num=61580

### 4chan
- ResearchGate: 4chan Hate Measurement - https://www.researchgate.net/publication/390405232_Measuring_Online_Hate_on_4chan_using_Pre-trained_Deep_Learning_Models
- TechXplore: Unregulated Platforms - https://techxplore.com/news/2025-04-disturbing-reveal-unregulated-internet-platforms.html

### Cryptographic Approaches
- Wikipedia: Blind Signature - https://en.wikipedia.org/wiki/Blind_signature
- ACM: Blind Multisignatures - https://dl.acm.org/doi/10.1145/3658644.3690364
- IACR ePrint: UTT - https://eprint.iacr.org/2025/1969.pdf
- Medium: Commit-Reveal Scheme - https://medium.com/@regis-graptin/commit-reveal-scheme-in-solidity-prevent-front-running-in-voting-auctions-dapps-6b4bd43d2478
- GitHub: PLCR Voting - https://github.com/ConsenSys/PLCRVoting

---

*Research completed: 2025-12-24*
*Status: DRAFT - Ready for team review*
