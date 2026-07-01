# Swimchain User Profiles (Swimmers in the Pool)

Every swimmer has a different stroke. This document defines who's in the pool.

This document defines the canonical user personas for Swimchain. These profiles inform design decisions, test scenarios, and threat modeling.

---

## Overview

Swimchain explicitly trades accessibility for decentralization. Our target users are **active swimmers**, not passive floaters. This is by design.

| Swimmer Type | Skill Level | Commitment | Primary Activity |
|--------------|-------------|------------|------------------|
| Lap Swimmer | High | Very High | Lane leadership, keeping content afloat |
| Regular Swimmer | Medium-High | High | Daily strokes, content creation |
| Casual Swimmer | Medium | Medium | Conversation, lane membership |
| Wader | Low-Medium | Low | Watching, occasional splashes |
| Hostile Actor | Varies | High (adversarial) | Fouling the pool |

---

## Primary Personas

### 1. Marcus - The Power User

**Demographics:**
- Age: 32
- Occupation: Software developer
- Location: Berlin, Germany
- Devices: Desktop (primary), laptop, phone

**Technical Profile:**
- Runs always-on node on home server
- Understands cryptographic key management
- Comfortable with command-line tools
- Has run Bitcoin/Ethereum nodes before

**Usage Pattern:**
```
Marcus's typical week:
├── Desktop always-on seed node (24/7)
├── Creates 5-10 posts per day
├── Moderates 3 spaces he founded
├── Reads 50+ posts daily
├── PoW is minor annoyance (desktop handles it fast)
└── Actively helps onboard new users
```

**Motivations:**
- Believes in decentralization philosophy
- Left Twitter/Reddit due to censorship concerns
- Wants spaces he controls, not rented from a platform
- Values permanence of identity across forks

**Pain Points:**
- Key management anxiety (backups, security)
- Watching spaces get spammed during attacks
- Sync time when traveling (laptop catches up)
- Explaining the system to less technical friends

**Value to Network:**
- High - provides seed capacity, creates content, onboards users
- Likely to maintain infrastructure voluntarily

---

### 2. Sarah - The Technical User

**Demographics:**
- Age: 28
- Occupation: Data analyst
- Location: Toronto, Canada
- Devices: Laptop (primary), phone

**Technical Profile:**
- Can follow technical instructions
- Uses password managers, understands 2FA
- Not a developer, but tech-comfortable
- Has used crypto wallets before

**Usage Pattern:**
```
Sarah's typical day:
├── Opens app on laptop after work
├── Syncs for 30 seconds (was offline all day)
├── Checks 4-5 spaces she follows
├── Posts 1-2 times per day
├── PoW: 15-20 seconds on laptop (acceptable)
├── Engages with replies, persists good content
└── Occasionally uses phone (tolerates slower PoW)
```

**Motivations:**
- Tired of algorithmic manipulation on Instagram
- Wants authentic conversations, not engagement bait
- Values privacy (no data collection)
- Interested in niche communities (data viz, local hiking)

**Pain Points:**
- Key backup felt scary at first
- Took a week to understand decay mechanics
- Mobile experience is slower than she'd like
- Some spaces feel dead (not enough activity)

**Value to Network:**
- Medium-High - consistent participant, creates content, syncs regularly

---

### 3. David - The Regular User

**Demographics:**
- Age: 45
- Occupation: High school teacher
- Location: Melbourne, Australia
- Devices: Phone (primary), old laptop

**Technical Profile:**
- Uses apps, not comfortable with technical details
- Needed help setting up his node initially
- Trusts the app to "just work"
- Key backup handled by app's guided flow

**Usage Pattern:**
```
David's typical week:
├── Opens app 3-4 times per week
├── Browses 2 spaces: local-teachers, australian-politics
├── Posts maybe once a week
├── PoW on phone: 45-60 seconds (uses while commuting)
├── Reads more than writes
└── Engages by persisting content he finds valuable
```

**Motivations:**
- Colleague introduced him, wanted to join that community
- Appreciates the "no ads" experience
- Likes that content isn't manipulated
- Enjoys the slower, more thoughtful pace

**Pain Points:**
- Initial setup was confusing
- Doesn't fully understand forks or decay
- Phone battery drains if app syncs in background
- Wishes posting was faster

**Value to Network:**
- Medium - regular participant, provides sync coverage in AU timezone

---

### 4. Emma - The Lurker

**Demographics:**
- Age: 23
- Occupation: Graduate student
- Location: Chicago, USA
- Devices: Phone only

**Technical Profile:**
- Tech-savvy but not technical
- Uses many apps, doesn't care how they work
- Key backup was "the annoying step" in setup
- Minimal configuration, default settings

**Usage Pattern:**
```
Emma's typical week:
├── Opens app daily during lunch
├── Follows 6 spaces: campus-life, memes, chicago-food, study-tips, etc.
├── Rarely posts (maybe once a month)
├── Reads a lot, caches content passively
├── Almost never engages with persistence
└── Uses dark mode, appreciates no notifications
```

**Motivations:**
- Roommate told her about it
- Likes that it's not Facebook (parents aren't here)
- No ads is great
- Less addictive than TikTok (by design)

**Pain Points:**
- Phone PoW is too slow to post casually
- Doesn't understand why old content disappears
- Confused when spaces fork
- Wishes there was an algorithm to help her find content

**Value to Network:**
- Low-Medium - provides read bandwidth, syncs content, occasional engagement

---

### 5. Carlos - The Community Leader

**Demographics:**
- Age: 38
- Occupation: Community organizer
- Location: Mexico City, Mexico
- Devices: Desktop, phone, tablet

**Technical Profile:**
- Moderate technical skills
- Runs a seed node with help from a friend
- Understands community dynamics better than tech
- Managed forums/Discord servers before

**Usage Pattern:**
```
Carlos's typical day:
├── Desktop seed node runs 18 hours/day
├── Creates 10-15 posts (often discussion starters)
├── Monitors 2 spaces he founded
├── Actively welcomes new members
├── PoW: mixes desktop (fast) and phone (slower, tolerates)
├── Uses engagement to persist valuable threads
└── Coordinates offline community events via the space
```

**Motivations:**
- Runs local activism community
- Doesn't trust US platforms with political organizing
- Needs space that can't be shut down
- Values ability to fork if community splits

**Pain Points:**
- Hard to onboard non-technical community members
- Worried about government surveillance (even though pseudonymous)
- Storage costs for seed node
- Coordinating moderation norms without enforcement tools

**Value to Network:**
- Very High - community builder, seed provider, content creator, onboarder

---

## Edge Case Personas

### 6. Anonymous Whistleblower

**Profile:**
- Uses Tor + Swimchain
- Single-use identity per disclosure
- Posts once, never returns to that identity
- Maximum operational security

**Usage Pattern:**
```
Whistleblower:
├── Creates new identity (key pair)
├── Connects via Tor
├── Posts single disclosure with evidence
├── PoW: accepts long wait for anonymity
├── Abandons identity permanently
└── Content persists if community engages
```

**Requirements:**
- No identity linkage between sessions
- No metadata leakage
- PoW must work over Tor (no CAPTCHA)
- Content must be viewable without identity

**Risks:**
- Single-use identities have no reputation
- Content may decay before noticed
- Coordination without persistent identity is hard

---

### 7. Journalist Covering Sensitive Topics

**Profile:**
- Pseudonymous but persistent identity
- Builds reputation over time
- Posts investigative content
- Needs content to persist (important public interest)

**Usage Pattern:**
```
Journalist:
├── Maintains single pseudonym for years
├── Posts investigative threads
├── Community engages to persist important content
├── Monitors engagement to ensure persistence
└── Key security is paramount (identity = career)
```

**Requirements:**
- Persistent pseudonymous reputation
- Content must be able to persist indefinitely (with engagement)
- Protection from de-anonymization attacks
- Ability to prove continuity of identity

**Risks:**
- Key compromise = identity theft
- Graph analysis may reveal real identity
- State actors may target

---

### 8. Small Business Owner

**Profile:**
- Wants to reach local customers
- No advertising possible (by design)
- Must build organic community presence

**Usage Pattern:**
```
Business owner:
├── Creates space for business community
├── Posts updates, photos, offers
├── Builds genuine relationships with customers
├── PoW limits spam (can't post ads everywhere)
└── Community persists content if valuable
```

**Constraints:**
- No guaranteed visibility (no paid placement)
- No metrics to prove ROI
- Must provide genuine value to get engagement
- Competing with traditional marketing channels

---

## Adversarial Personas

See [THREAT_MODEL.md](./THREAT_MODEL.md) for detailed attack scenarios.

### Quick Reference

| Adversary | Goal | Resources |
|-----------|------|-----------|
| Spammer | Visibility for products | Low-Medium |
| Propagandist | Narrative control | State-level |
| Harasser | Target individuals | Low-Medium |
| Abuser | Store illegal content | Low |
| State Actor | Shutdown/control | Unlimited |
| Competitor | Discredit platform | Medium |

---

## Usage Matrix

| Persona | Posts/Week | PoW Tolerance | Seed? | Spaces | Mobile? |
|---------|------------|---------------|-------|--------|---------|
| Marcus | 50+ | High | Yes (24/7) | 10+ | Backup |
| Sarah | 10-15 | Medium | No | 5-7 | Sometimes |
| David | 1-2 | Low | No | 2-3 | Primary |
| Emma | <1 | Very Low | No | 5-6 | Only |
| Carlos | 70+ | Medium | Yes (18h) | 3-4 | Sometimes |
| Whistleblower | 1 (ever) | Very High | No | 1 | No |
| Journalist | 5-10 | High | No | 3-5 | Backup |
| Business | 15-20 | Medium | Maybe | 1-2 | Sometimes |

---

## Design Implications

### From User Profiles

1. **Marcus proves** power users will run infrastructure voluntarily
2. **Sarah proves** technical-but-not-developer users can participate
3. **David proves** onboarding guidance is critical
4. **Emma proves** lurkers provide network value through sync
5. **Carlos proves** community leaders are force multipliers
6. **Whistleblower proves** single-use identities must work
7. **Journalist proves** long-term pseudonyms need protection
8. **Business proves** organic presence replaces advertising

### Feature Priority (by persona coverage)

| Feature | Marcus | Sarah | David | Emma | Carlos | Priority |
|---------|--------|-------|-------|------|--------|----------|
| Fast desktop PoW | ✅ | ✅ | ⚠️ | ❌ | ✅ | High |
| Good mobile UX | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | High |
| Guided key backup | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | High |
| Seed node easy setup | ✅ | ❌ | ❌ | ❌ | ⚠️ | Medium |
| Decay explanation | ❌ | ✅ | ✅ | ✅ | ⚠️ | High |
| Fork handling UX | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | Medium |

✅ = already comfortable | ⚠️ = needs some help | ❌ = doesn't need/use

---

## Test Scenarios by Persona

### Marcus (Power User)
- [ ] Run seed node for 30 days continuously
- [ ] Recover identity from backup after node failure
- [ ] Handle fork migration with content preservation
- [ ] Moderate space during spam attack

### Sarah (Technical User)
- [ ] Complete onboarding without external help
- [ ] Sync laptop after 3 days offline
- [ ] Create and manage a new space
- [ ] Post from mobile when desktop unavailable

### David (Regular User)
- [ ] Follow guided onboarding with key backup
- [ ] Use app for 1 month without understanding internals
- [ ] Recover from "content disappeared" confusion
- [ ] Continue using after major update

### Emma (Lurker)
- [ ] Install and onboard on phone only
- [ ] Use app for 1 month with minimal posting
- [ ] Contribute to network just by reading
- [ ] Understand why favorite content decayed

### Carlos (Community Leader)
- [ ] Create space and onboard 50 members
- [ ] Maintain space activity over 6 months
- [ ] Handle contentious community split (fork)
- [ ] Coordinate with other space moderators

---

*Document created: 2025-12-25*
*Last updated: 2025-12-25*
