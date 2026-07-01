# Swimchain Client Design Specification

## Overview

Swimchain's protocol is **format-agnostic**. The same underlying data (spaces, posts, replies, engagement, decay) can be rendered in completely different ways by different clients. This document specifies the design patterns, UI components, and UX considerations for the Swimchain client ecosystem.

**Design Philosophy:**
- One protocol, many views
- Competition at client layer, cooperation at protocol layer
- Progressive disclosure (lurk → participate → power use)
- Transparent mechanics (no hidden algorithms)
- Friction is visible and intentional

---

## Table of Contents

1. [Client Ecosystem Overview](#1-client-ecosystem-overview)
2. [Common UI Components](#2-common-ui-components)
3. [Forum Client](#3-forum-client)
4. [Reddit-Style Client](#4-reddit-style-client)
5. [Chat Client](#5-chat-client)
6. [Mobile Client](#6-mobile-client)
7. [Search/Discovery Client](#7-searchdiscovery-client)
8. [Reader Client (Web Gateway)](#8-reader-client-web-gateway)
9. [CLI Client](#9-cli-client)
10. [Specialized Clients](#10-specialized-clients)
11. [Cross-Client Considerations](#11-cross-client-considerations)
12. [Implementation Architecture](#12-implementation-architecture)
13. [Release Strategy](#13-release-strategy)

---

## 1. Client Ecosystem Overview

### 1.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CHAINSOCIAL CLIENT ECOSYSTEM                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                         ONE PROTOCOL                                │
│                    (Chain + P2P Content)                            │
│                              │                                      │
│              ┌───────────────┼───────────────┐                      │
│              │               │               │                      │
│              ▼               ▼               ▼                      │
│                                                                     │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│    │   FORUM     │  │   REDDIT    │  │    CHAT     │               │
│    │   CLIENT    │  │   CLIENT    │  │   CLIENT    │               │
│    │             │  │             │  │             │               │
│    │ Deep threads│  │ Card-based  │  │ Real-time   │               │
│    │ Hierarchical│  │ Browsing    │  │ Conversation│               │
│    │ Power users │  │ Discovery   │  │ Quick reply │               │
│    └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                     │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│    │   MOBILE    │  │   SEARCH    │  │    CLI      │               │
│    │   CLIENT    │  │   CLIENT    │  │   CLIENT    │               │
│    │             │  │             │  │             │               │
│    │ Touch-first │  │ Discovery   │  │ Terminal    │               │
│    │ Minimal     │  │ Indexing    │  │ Scripting   │               │
│    │ On-the-go   │  │ Google-like │  │ Automation  │               │
│    └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                     │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│    │   READER    │  │  ARCHIVER   │  │   BRIDGE    │               │
│    │   CLIENT    │  │   CLIENT    │  │   CLIENT    │               │
│    │             │  │             │  │             │               │
│    │ Read-only   │  │ Preserve    │  │ Matrix/IRC  │               │
│    │ Low barrier │  │ Seed old    │  │ Fediverse   │               │
│    │ Web gateway │  │ content     │  │ Integration │               │
│    └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Client Categories

| Tier | Clients | Target Users | Priority |
|------|---------|--------------|----------|
| **Core** | Forum, Search/Reader, Mobile | Power users, discoverers, everyone | Launch |
| **Extended** | Chat, CLI, Reddit-style | Specific use cases | Post-launch |
| **Integration** | Bridge, Archiver | Communities, preservationists | Ecosystem |

### 1.3 Client Capabilities Matrix

| Capability | Forum | Reddit | Chat | Mobile | Search | Reader | CLI |
|------------|-------|--------|------|--------|--------|--------|-----|
| Full node | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create posts | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Read content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mine PoW | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Engage content | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Create spaces | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Fork management | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Deep threading | ✅ | ⚡ | ❌ | ⚡ | ⚡ | ⚡ | ✅ |
| Real-time updates | ⚡ | ⚡ | ✅ | ⚡ | ❌ | ❌ | ❌ |
| Offline capable | ✅ | ✅ | ❌ | ⚡ | ❌ | ❌ | ✅ |

Legend: ✅ Full support | ⚡ Partial | ❌ Not supported

---

## 2. Common UI Components

All Swimchain clients share common UI patterns that visualize the protocol's unique mechanics.

### 2.1 Heat Indicator (Decay Visualization)

Content decay is core to Swimchain. Every client must visualize heat/decay state.

**Visual States:**

```
FULL HEAT (just posted or recently engaged):
🔥 ████████████████████ 100%
   Bright, vibrant colors
   No visual degradation

WARM (active discussion, stable):
🔥 ████████████░░░░░░░░  60%
   Slightly muted colors
   Content clearly visible

COOLING (needs engagement to survive):
🔥 ████░░░░░░░░░░░░░░░░  20%
   Muted/grayed appearance
   Warning indicators

FADING (will decay soon):
░░░░░░░░░░░░░░░░░░░░░░   5%
   Heavy visual degradation
   "Fading" or "Decaying" label
   May show countdown

DECAYED (content gone):
[This content has decayed]
   Placeholder only
   No content visible
```

**Implementation Options:**

| Style | Description | Best For |
|-------|-------------|----------|
| Progress bar | Horizontal/vertical fill | All clients |
| Opacity | Content fades visually | Subtle indication |
| Color gradient | Hot→cold (red→blue) | At-a-glance status |
| Numeric | "82% heat" | Data-focused users |
| Time-based | "~3 days remaining" | Planning engagement |
| Icon | 🔥→💨→❄️ | Minimal UI |

**Code Example (CSS):**

```css
.content-heat-100 { opacity: 1.0; filter: none; }
.content-heat-80  { opacity: 0.95; filter: saturate(0.9); }
.content-heat-60  { opacity: 0.85; filter: saturate(0.8); }
.content-heat-40  { opacity: 0.70; filter: saturate(0.6) grayscale(0.2); }
.content-heat-20  { opacity: 0.55; filter: saturate(0.4) grayscale(0.4); }
.content-heat-5   { opacity: 0.40; filter: saturate(0.2) grayscale(0.6); }
.content-decayed  { display: none; } /* or placeholder */
```

### 2.2 Engagement Pool Progress

Unlike upvotes (which are free), Swimchain engagement costs PoW. Clients must show:
- Current pool state (X seconds of Y needed)
- Number of contributors
- User's contribution options

**Visual Design:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ENGAGEMENT POOL                                                 │
│                                                                  │
│  ████████████████████░░░░░░░░░░░░░░░░  45s / 60s                │
│                                                                  │
│  12 contributors • Need 15s more to persist                     │
│                                                                  │
│  Your options:                                                   │
│  [+5s] Quick     [+15s] Standard     [+30s] Champion            │
│                                                                  │
│  Mining: ░░░░░░░░░░░░░░░░░░░░ Ready to contribute               │
└─────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Display | User Action |
|-------|---------|-------------|
| Empty pool (0s) | Empty bar, urgent styling | "Be first to engage" |
| Partial (<60s) | Progress bar, remaining time | "Add Xs to help persist" |
| Complete (60s+) | Full bar, checkmark | "Persisted until next cycle" |
| Locked (user contributed max) | Disabled buttons | "You've contributed" |

**Pool Contribution Flow:**

```
User clicks [+5s]
    │
    ▼
┌─────────────────┐
│ Mining PoW...   │
│ ████░░░░░░ 2s   │
│                 │
│ [Cancel]        │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ ✓ Contributed!  │
│                 │
│ Pool: 50s/60s   │
│ Your total: 5s  │
└─────────────────┘
```

### 2.3 PoW Mining Status

All content creation requires PoW. Clients must show mining progress.

**Mining States:**

```
IDLE (ready to post):
┌─────────────────────────────────────────┐
│ [POST]  Ready • ~30s wait when posted   │
└─────────────────────────────────────────┘

MINING (in progress):
┌─────────────────────────────────────────┐
│ Mining PoW...                            │
│ ████████████░░░░░░░░░░░░  18s remaining │
│                                          │
│ [Cancel]                                 │
└─────────────────────────────────────────┘

COMPLETE (posted):
┌─────────────────────────────────────────┐
│ ✓ Posted!                                │
│ ████████████████████████  0s            │
│                                          │
│ Hash: Qm7x9abc...                        │
└─────────────────────────────────────────┘

ERROR (failed):
┌─────────────────────────────────────────┐
│ ✗ Mining failed                          │
│                                          │
│ Error: Connection lost to peers          │
│                                          │
│ [Retry] [Cancel]                         │
└─────────────────────────────────────────┘
```

**Action-Based Difficulty:**

| Action | Time | Visual Indicator |
|--------|------|------------------|
| Create Space | ~60s | "Creating space... (this takes longer)" |
| Post | ~30s | Standard progress |
| Reply | ~15s | "Quick reply..." |
| Engage | ~5s | Nearly instant |
| Identity Update | ~30s | Standard progress |

**The Waiting Experience:**

The 10-60 second PoW wait is **intentional friction**. Clients should:
- NOT hide or minimize the wait
- Possibly show "tips" or "did you know" content
- Allow reading other content while mining
- Show clear progress with time remaining

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ⏳ Mining your post... 24 seconds remaining                    │
│                                                                  │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░                         │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  💡 Did you know?                                                │
│                                                                  │
│  This proof-of-work prevents spam without needing moderators.   │
│  Every post costs compute, making advertising economically      │
│  irrational. You're not just waiting - you're defending        │
│  the network.                                                    │
│                                                                  │
│  [Continue browsing while mining...]                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Identity Display

Swimchain uses cryptographic identities (Bech32m-encoded public keys).

**Display Formats:**

```
FULL ADDRESS (42 characters):
sw1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m

SHORT ADDRESS (truncated):
sw1q9x7...2k4m

VERY SHORT (minimal):
...2k4m

WITH CHECKSUM HIGHLIGHT:
sw1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b[2k4m]
                                              ↑ checksum
```

**Identity Card Component:**

```
┌─────────────────────────────────────────────────────────────────┐
│  IDENTITY                                                        │
│                                                                  │
│  ┌────┐                                                          │
│  │ 🔑 │  sw1q9x7...2k4m                                         │
│  └────┘                                                          │
│         ↳ Copy full address                                      │
│                                                                  │
│  Created: 2024-01-15                                             │
│  Posts: 142                                                      │
│  Spaces: 12                                                      │
│                                                                  │
│  [View on chain] [Export identity]                               │
└─────────────────────────────────────────────────────────────────┘
```

**Displaying Other Users:**

```
┌─────────────────────────────────────────┐
│  sw1qab...3f2j                          │
│  ├── First seen: 6 months ago           │
│  ├── Posts in this space: 42            │
│  └── [View profile]                     │
└─────────────────────────────────────────┘
```

### 2.5 Space Navigation

Spaces are the core organizational unit. Clients must provide clear navigation.

**Space Hierarchy:**

```
SPACES
├── 📁 Technology (892 posts)
│   ├── 📂 rust-lang (42 new)
│   ├── 📂 web-dev (18 new)
│   └── 📂 self-hosting (7 new)
│
├── 📁 Local (345 posts)
│   ├── 📂 boston (12 new)
│   └── 📂 chicago (5 new)
│
└── 📁 Hobbies (567 posts)
    ├── 📂 woodworking (8 new)
    └── 📂 fishing (3 new)
```

**Space Info Panel:**

```
┌─────────────────────────────────────────────────────────────────┐
│  s/rust-lang                                                     │
│  ═══════════                                                     │
│                                                                  │
│  The Rust programming language community.                        │
│                                                                  │
│  Created: 2024-01-01                                             │
│  Posts: 892 (42 active, 850 decayed)                            │
│  Participants: 234 unique identities                             │
│  Storage: 45 MB in your local sync                               │
│                                                                  │
│  [Join/Leave] [Mute] [Settings]                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.6 Sync Status

Users need to know their node's state.

**Sync Status Bar:**

```
┌─────────────────────────────────────────────────────────────────┐
│  NODE STATUS                                                     │
│                                                                  │
│  Chain:    ████████████████░░░░  82% synced                     │
│  Peers:    23 connected (12 sending, 11 receiving)              │
│  Storage:  412 MB / 500 MB target                               │
│  Branches: 12 synced                                             │
│                                                                  │
│  Last block: 2 minutes ago                                       │
│  Estimated sync complete: ~15 minutes                           │
└─────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Display | Color |
|-------|---------|-------|
| Synced | ✓ Synced | Green |
| Syncing | Syncing... X% | Yellow |
| Behind | Behind by X blocks | Orange |
| Offline | Offline | Red |
| No peers | No peers found | Red |

### 2.7 Fork Indicator

Users may be on different chain forks. This must be visible.

```
┌─────────────────────────────────────────────────────────────────┐
│  CHAIN: swimchain-main                                         │
│  ════════════════════════                                        │
│                                                                  │
│  Origin chain • 12,345 participants                              │
│  Genesis: 2024-01-01                                             │
│  Last block: 2 min ago                                           │
│                                                                  │
│  ───────────────────────────────────────────────────────────── │
│                                                                  │
│  AVAILABLE FORKS:                                                │
│                                                                  │
│  ○ cs-free-speech                                                │
│    Forked 2 weeks ago • 890 participants                        │
│    [Switch to this fork]                                        │
│                                                                  │
│  ○ cs-academic                                                   │
│    Forked 1 month ago • 234 participants                        │
│    [Switch to this fork]                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Forum Client

The Forum Client is the **power user reference implementation**. It provides full access to all protocol features with a classic forum aesthetic.

### 3.1 Design Philosophy

- Deep threading with unlimited nesting
- Information density over visual flair
- Full feature access
- Keyboard navigation
- Power user shortcuts

### 3.2 Main Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  CHAINSOCIAL                                    [Search] [Profile]   │
│  ═══════════                                                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ NAVIGATION ─────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  📁 Technology                                    1,234 posts │   │
│  │     ├─ 📂 rust-lang                    42 new │   892 total  │   │
│  │     ├─ 📂 web-dev                      18 new │   567 total  │   │
│  │     └─ 📂 self-hosting                  7 new │   234 total  │   │
│  │                                                               │   │
│  │  📁 Local                                         567 posts   │   │
│  │     ├─ 📂 boston                       12 new │   345 total  │   │
│  │     └─ 📂 chicago                       5 new │   222 total  │   │
│  │                                                               │   │
│  │  📁 Hobbies                                       890 posts   │   │
│  │     ├─ 📂 woodworking                   8 new │   456 total  │   │
│  │     └─ 📂 fishing                       3 new │   123 total  │   │
│  │                                                               │   │
│  │  ─────────────────────────────────────────────────────────── │   │
│  │  [+ Create Space]                                             │   │
│  │  Mining: ░░░░░░░░░░░░░░░░░░░░ Ready (60s required)           │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ SPACE: rust-lang ───────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  THREAD                          REPLIES   HEAT    LAST       │   │
│  │  ────────────────────────────────────────────────────────────│   │
│  │  🔥 Async traits finally stable!      47    82%    2 min     │   │
│  │  ⚡ Performance tips for beginners    23    71%    15 min    │   │
│  │  💡 My first Rust CLI tool            12    65%    1 hour    │   │
│  │  📝 Question about lifetimes           8    45%    3 hours   │   │
│  │  ⏳ Memory management patterns         5    20%    6 hours   │   │
│  │  ░░ Old thread about errors            2     5%    2 days ░░ │   │
│  │                                                               │   │
│  │  ─────────────────────────────────────────────────────────── │   │
│  │  Page 1 of 12  [1] [2] [3] ... [12]  [Next →]               │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ NEW THREAD ─────────────────────────────────────────────────┐   │
│  │  Title: [                                                  ] │   │
│  │  ────────────────────────────────────────────────────────── │   │
│  │  [                                                         ] │   │
│  │  [                      Content                            ] │   │
│  │  [                                                         ] │   │
│  │  ────────────────────────────────────────────────────────── │   │
│  │  [POST] Mining: ░░░░░░░░░░ Ready • ~30s when posted         │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  Node: ✓ Synced │ Peers: 23 │ Storage: 412/500 MB │ Fork: main     │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 Thread View

```
┌──────────────────────────────────────────────────────────────────────┐
│  s/rust-lang › Async traits finally stable!                         │
│  ═══════════════════════════════════════════                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ ORIGINAL POST ──────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  sw1q9x7...2k4m  •  2 hours ago                              │   │
│  │  Heat: ████████░░ 82%  •  Pool: 45s/60s (12 contributors)   │   │
│  │                                                               │   │
│  │  ─────────────────────────────────────────────────────────── │   │
│  │                                                               │   │
│  │  Finally! After years of waiting, async traits are stable    │   │
│  │  in Rust 1.75. Here's what this means for the ecosystem:     │   │
│  │                                                               │   │
│  │  1. No more `#[async_trait]` macro                           │   │
│  │  2. Better error messages                                     │   │
│  │  3. Improved performance                                      │   │
│  │                                                               │   │
│  │  This is a huge milestone for async Rust development.        │   │
│  │                                                               │   │
│  │  ─────────────────────────────────────────────────────────── │   │
│  │                                                               │   │
│  │  [REPLY]  [ENGAGE +5s]  [ENGAGE +15s]  [Share link]          │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  47 REPLIES                                                          │
│  ══════════                                                          │
│                                                                      │
│  ├─ sw1qab...3f2j  •  1 hour ago  •  Heat: 78%                      │
│  │                                                                   │
│  │  This is huge! I've been waiting for this for my web server.    │
│  │                                                                   │
│  │  [Reply] [Engage]                                                │
│  │                                                                   │
│  │  ├─ sw1q9x7...2k4m (OP)  •  45 min ago  •  Heat: 75%            │
│  │  │                                                               │
│  │  │  Right? The ecosystem implications are massive. I expect     │
│  │  │  we'll see major framework updates within weeks.             │
│  │  │                                                               │
│  │  │  [Reply] [Engage]                                            │
│  │  │                                                               │
│  │  │  └─ sw1qcd...8k2n  •  30 min ago  •  Heat: 70%               │
│  │  │                                                               │
│  │  │     Already seeing crates update! tokio just merged support. │
│  │  │                                                               │
│  │  │     [Reply] [Engage]                                         │
│  │  │                                                               │
│  │  └─ sw1qef...1m3p  •  40 min ago  •  Heat: 72%                  │
│  │                                                                   │
│  │     Any benchmarks yet? I'm curious about the overhead.         │
│  │                                                                   │
│  │     [Reply] [Engage]                                            │
│  │                                                                   │
│  └─ sw1qgh...4n5r  •  15 min ago  •  Heat: 90%                      │
│                                                                      │
│     This thread is 🔥! Adding my +5s to keep it alive.              │
│                                                                      │
│     [Reply] [Engage]                                                │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  QUICK REPLY                                                         │
│  ───────────                                                         │
│  [                                                               ]   │
│  [                                                               ]   │
│  [POST REPLY] Mining: ░░░░░░░░░░ Ready • ~15s                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.4 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate threads up/down |
| `n` | New thread |
| `r` | Reply to selected |
| `e` | Engage selected (+5s) |
| `E` | Engage selected (+15s) |
| `Enter` | Open selected thread |
| `Backspace` | Back to thread list |
| `/` | Focus search |
| `g` then `h` | Go to home |
| `g` then `s` | Go to spaces |
| `?` | Show keyboard shortcuts |

### 3.5 Preferences Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│  FORUM PREFERENCES                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DISPLAY                                                            │
│  ───────                                                            │
│  Thread ordering:    [Heat ▼] [Newest] [Oldest] [Replies]          │
│  Threads per page:   [25 ▼]                                        │
│  Show decaying:      [✓] Show content below 10% heat               │
│  Compact mode:       [ ] Reduce spacing                            │
│                                                                     │
│  DECAY VISUALIZATION                                                │
│  ──────────────────                                                 │
│  Style:              [Progress bar ▼]                               │
│                      Options: Progress bar, Opacity, Color, Numeric │
│  Show time estimate: [✓] "~3 days remaining"                        │
│                                                                     │
│  NODE                                                               │
│  ────                                                               │
│  Storage target:     [500 ▼] MB                                    │
│  Auto-prune below:   [5 ▼] % heat                                  │
│  Sync on startup:    [✓]                                           │
│                                                                     │
│  NOTIFICATIONS                                                      │
│  ─────────────                                                      │
│  Reply to my posts:  [✓]                                           │
│  Mentions:           [✓]                                           │
│  Space activity:     [Daily digest ▼]                              │
│                                                                     │
│  [Save] [Reset to defaults]                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Reddit-Style Client

The Reddit-Style Client focuses on **browsing and discovery**. Card-based layout, infinite scroll feeling (without actual infinite scroll - decay handles that).

### 4.1 Design Philosophy

- Card-based content presentation
- Quick scanning and browsing
- Inline previews
- Less threading depth than forum
- Mobile-friendly desktop layout

### 4.2 Main Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔗 CHAINSOCIAL                        [Search]     sw1q9x7...2k4m  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Home] [Popular] [Your Spaces] [New]                                │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  s/rust-lang • sw1qab...3f2j • 2h                             │  │
│  │                                                                │  │
│  │  Async traits finally stable!                                 │  │
│  │  ═══════════════════════════                                  │  │
│  │                                                                │  │
│  │  Finally! After years of waiting, async traits are stable    │  │
│  │  in Rust 1.75. Here's what this means for the ecosystem...   │  │
│  │                                                                │  │
│  │  ────────────────────────────────────────────────────────────│  │
│  │  💬 47 replies  •  🔥 82%  •  ⚡ 45s/60s  •  [Engage +5s]    │  │
│  │                                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  s/boston • sw1qcd...8k2n • 4h                                │  │
│  │                                                                │  │
│  │  Best coffee shops near Kendall?                              │  │
│  │  ═══════════════════════════════                              │  │
│  │                                                                │  │
│  │  Just moved to the area. Looking for good spots to work      │  │
│  │  from. Bonus points for outdoor seating!                     │  │
│  │                                                                │  │
│  │  ────────────────────────────────────────────────────────────│  │
│  │  💬 12 replies  •  🔥 67%  •  ⚡ 30s/60s  •  [Engage +5s]    │  │
│  │                                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  │
│  │                                                                │  │
│  │  s/fishing • sw1qef...1m3p • 3d                [DECAYING]     │  │
│  │                                                                │  │
│  │  Anyone know good spots on Cape Cod?                          │  │
│  │  ═══════════════════════════════════                          │  │
│  │                                                                │  │
│  │  Planning a trip next month...                                │  │
│  │                                                                │  │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  │
│  │  ────────────────────────────────────────────────────────────│  │
│  │  💬 3  •  🔥 8%  •  ⚡ 5s/60s needs 55s  •  [SAVE IT +15s]   │  │
│  │                                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  [Load more...]                                                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  ✓ Synced • 23 peers • 412 MB                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Sidebar

```
┌─────────────────────────┐
│  YOUR SPACES            │
│                         │
│  🦀 s/rust-lang    42● │
│  📍 s/boston       12● │
│  🪵 s/woodworking   8● │
│  🎣 s/fishing       3○ │
│  💻 s/self-hosting  7● │
│                         │
│  [Browse all spaces]    │
│                         │
│  ───────────────────── │
│                         │
│  POPULAR NOW            │
│                         │
│  🔥 s/news         89% │
│  🔥 s/tech         85% │
│  🔥 s/gaming       82% │
│                         │
│  ───────────────────── │
│                         │
│  FILTERS                │
│                         │
│  [✓] Hot (>50% heat)   │
│  [✓] New (<24h)        │
│  [ ] Decaying (<20%)   │
│  [ ] My posts only     │
│                         │
└─────────────────────────┘
```

### 4.4 Card Expanded View

When clicking a card, it expands inline or in a modal:

```
┌───────────────────────────────────────────────────────────────────────┐
│                                                              [✕ Close]│
│  s/rust-lang                                                          │
│                                                                       │
│  Async traits finally stable!                                         │
│  ═══════════════════════════                                          │
│  sw1qab...3f2j • 2 hours ago                                         │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────── │
│                                                                       │
│  Finally! After years of waiting, async traits are stable in         │
│  Rust 1.75. Here's what this means for the ecosystem:                │
│                                                                       │
│  1. No more `#[async_trait]` macro                                   │
│  2. Better error messages                                             │
│  3. Improved performance                                              │
│                                                                       │
│  This is a huge milestone for async Rust development.                │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────── │
│                                                                       │
│  🔥 82% heat  •  ⚡ 45s/60s pool  •  12 contributors                 │
│                                                                       │
│  [Reply] [Engage +5s] [Engage +15s] [Share]                          │
│                                                                       │
│  ═══════════════════════════════════════════════════════════════════ │
│                                                                       │
│  TOP REPLIES (47 total)                                               │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ sw1qcd...8k2n • 1h • 78%                                        │ │
│  │ This is huge! I've been waiting for this for my web server.    │ │
│  │ [Reply] [Engage]                                                │ │
│  │   └─ sw1qef...1m3p • 30m • 75%                                 │ │
│  │      Already seeing crates update!                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  [Show all 47 replies...]                                             │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────── │
│                                                                       │
│  ADD REPLY                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  [Post Reply] ~15s PoW                                                │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.5 Key Differences from Forum

| Aspect | Forum | Reddit-Style |
|--------|-------|--------------|
| Threading | Deep, unlimited | Shallow, 2-3 levels visible |
| Layout | Dense list | Cards with whitespace |
| Navigation | Hierarchical folder | Flat tabs + sidebar |
| Focus | Discussion | Discovery |
| Default view | Thread list | Content cards |
| Target user | Power users | Casual browsers |

---

## 5. Chat Client

The Chat Client provides **real-time conversation** experience. Think Discord meets Swimchain.

### 5.1 Design Philosophy

- Real-time message flow
- Minimal friction visibility (PoW happens in background)
- Channel/room organization
- Presence awareness (who's online)
- Quick replies over deep threads

### 5.2 Main Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  CHAINSOCIAL CHAT                                                    │
├────────────┬─────────────────────────────────────────────────────────┤
│            │                                                         │
│  SPACES    │  # rust-lang                                            │
│  ────────  │  ─────────────────────────────────────────────────────  │
│            │                                                         │
│  ▼ Tech    │                          TODAY                          │
│    # rust  │                                                         │
│    # web   │  ─────────────────────────────────────────────────────  │
│    # self  │                                                         │
│            │  sw1qab...3f2j                           2:15 PM        │
│  ▼ Local   │  ┌────────────────────────────────────────────────────┐│
│    # bos   │  │ Async traits finally stable! 🎉                    ││
│    # chi   │  │                                                    ││
│            │  │ Here's what this means for the ecosystem...        ││
│  ▼ Hobbies │  │                                                    ││
│    # wood  │  │ 🔥 82% • ⚡ 45s/60s                                ││
│    # fish  │  └────────────────────────────────────────────────────┘│
│            │                                                         │
│  ──────── │  ├─ sw1qcd...8k2n                        2:30 PM        │
│            │  │  This is huge for tokio!                            │
│  ONLINE    │  │                                                      │
│  (12)      │  └─ sw1qef...1m3p                        2:45 PM        │
│            │     Already seeing updates land                         │
│  ●sw1q9x.. │                                                         │
│  ●sw1qab.. │  ─────────────────────────────────────────────────────  │
│  ●sw1qcd.. │                                                         │
│  ○sw1qef.. │  sw1qgh...4n5r                           2:50 PM        │
│  ...+8     │  Quick question: anyone tried the new nightly?         │
│            │  🔥 95% • ⚡ 5s/60s                                     │
│            │                                                         │
│            │  ─────────────────────────────────────────────────────  │
│            │                                                         │
│            │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│            │  sw1qij...6o7q                           Yesterday      │
│            │  [Fading] Old discussion about error handling...        │
│            │  🔥 5% • Needs engagement to survive                    │
│            │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│            │                                                         │
│            │                                                         │
├────────────┴─────────────────────────────────────────────────────────┤
│  [+] │ Message #rust-lang...                    │ Mining: ░░ Ready  │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.3 Message Input States

```
READY:
┌──────────────────────────────────────────────────────────────────────┐
│  [+] │ Message #rust-lang...                    │ [Send] ~15s PoW   │
└──────────────────────────────────────────────────────────────────────┘

TYPING:
┌──────────────────────────────────────────────────────────────────────┐
│  [+] │ This is my message about async traits   │ [Send] ~15s PoW   │
└──────────────────────────────────────────────────────────────────────┘

MINING:
┌──────────────────────────────────────────────────────────────────────┐
│  [+] │ This is my message about async traits   │ ████░░░░ 8s       │
└──────────────────────────────────────────────────────────────────────┘

SENT:
┌──────────────────────────────────────────────────────────────────────┐
│  [+] │ Message #rust-lang...                    │ ✓ Sent            │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.4 Thread Expansion

Clicking on a message with replies expands a thread panel:

```
│  sw1qab...3f2j                           2:15 PM        │
│  ┌────────────────────────────────────────────────────┐│
│  │ Async traits finally stable! 🎉                    ││
│  │ 🔥 82% • 5 replies                                 ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─ THREAD ──────────────────────────────────────────┐ │
│  │                                                    │ │
│  │  sw1qcd...8k2n • 2:30 PM                          │ │
│  │  This is huge for tokio!                          │ │
│  │                                                    │ │
│  │  sw1qef...1m3p • 2:35 PM                          │ │
│  │  Already seeing updates land                      │ │
│  │                                                    │ │
│  │  sw1q9x7...2k4m • 2:40 PM                         │ │
│  │  The ecosystem implications are massive           │ │
│  │                                                    │ │
│  │  ────────────────────────────────────────────────│ │
│  │  [Reply to thread...]              [Close thread] │ │
│  │                                                    │ │
│  └────────────────────────────────────────────────────┘ │
```

### 5.5 Engagement Quick Actions

Hover over a message shows quick actions:

```
│  sw1qab...3f2j                           2:15 PM        │
│  ┌────────────────────────────────────────────────────┐│
│  │ Async traits finally stable! 🎉                    ││
│  │                                                    ││
│  │ ┌────────────────────────────────────────────────┐││
│  │ │ [💬 Reply] [⚡+5s] [⚡+15s] [🔗 Share] [⋮ More] │││
│  │ └────────────────────────────────────────────────┘││
│  └────────────────────────────────────────────────────┘│
```

### 5.6 Presence & Activity

```
┌─────────────────────────┐
│  ONLINE IN #rust-lang   │
│                         │
│  ● sw1q9x7...2k4m       │
│    Active now           │
│                         │
│  ● sw1qab...3f2j        │
│    Typing...            │
│                         │
│  ● sw1qcd...8k2n        │
│    Last seen 5m ago     │
│                         │
│  ○ sw1qef...1m3p        │
│    Last seen 2h ago     │
│                         │
│  ───────────────────── │
│  12 online • 45 members │
└─────────────────────────┘
```

### 5.7 Chat-Specific Features

| Feature | Implementation |
|---------|----------------|
| Real-time updates | WebSocket/P2P push |
| Typing indicators | Ephemeral broadcasts (no chain record) |
| Read receipts | Optional, client-side only |
| Message reactions | Lightweight engagement (1s PoW) |
| Thread collapsing | UI state, not protocol |
| Pinned messages | High engagement = naturally pinned |

---

## 6. Mobile Client

The Mobile Client is **touch-first, simplified**. Optimized for one-handed use and constrained attention.

### 6.1 Design Philosophy

- Touch targets 44pt minimum
- One-handed operation
- Simplified feature set
- Battery-conscious PoW
- Quick consumption and participation

### 6.2 Home Screen

```
┌─────────────────────────────────┐
│  ≡  CHAINSOCIAL        🔍  👤  │
├─────────────────────────────────┤
│                                 │
│  YOUR SPACES                    │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🦀 rust-lang         42 ● │  │
│  ├───────────────────────────┤  │
│  │ 📍 boston            12 ● │  │
│  ├───────────────────────────┤  │
│  │ 🪵 woodworking        8 ● │  │
│  ├───────────────────────────┤  │
│  │ 🎣 fishing            3 ○ │  │
│  └───────────────────────────┘  │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  HOT RIGHT NOW 🔥               │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Async traits stable!      │  │
│  │ s/rust-lang • 47💬 • 82% │  │
│  ├───────────────────────────┤  │
│  │ Best coffee near Kendall  │  │
│  │ s/boston • 12💬 • 67%    │  │
│  └───────────────────────────┘  │
│                                 │
├─────────────────────────────────┤
│   🏠      🔍      ➕      👤   │
│  Home   Search   Post   Profile │
└─────────────────────────────────┘
```

### 6.3 Space View

```
┌─────────────────────────────────┐
│  ← rust-lang             ⋮     │
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────────┐  │
│  │ Async traits stable! 🔥   │  │
│  │ sw1qab...3f2j • 2h        │  │
│  │ 47 💬  82% heat           │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Performance tips          │  │
│  │ sw1qcd...8k2n • 4h        │  │
│  │ 23 💬  71% heat           │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ My first Rust CLI         │  │
│  │ sw1qef...1m3p • 8h        │  │
│  │ 12 💬  65% heat           │  │
│  └───────────────────────────┘  │
│                                 │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ┌───────────────────────────┐  │
│  │ Memory patterns (fading)  │  │
│  │ sw1qgh...4n5r • 2d        │  │
│  │  5 💬   8% heat ⚠️        │  │
│  └───────────────────────────┘  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│                                 │
├─────────────────────────────────┤
│          [+ NEW POST]           │
└─────────────────────────────────┘
```

### 6.4 Post View

```
┌─────────────────────────────────┐
│  ← rust-lang                    │
├─────────────────────────────────┤
│                                 │
│  Async traits stable!           │
│  ═══════════════════            │
│                                 │
│  sw1qab...3f2j                  │
│  2 hours ago                    │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  Finally! After years of        │
│  waiting, async traits are      │
│  stable in Rust 1.75.           │
│                                 │
│  Here's what this means:        │
│  • No more #[async_trait]       │
│  • Better error messages        │
│  • Improved performance         │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🔥 82%    ⚡ 45s/60s      │  │
│  │                           │  │
│  │ [ENGAGE +5s] [ENGAGE+15s] │  │
│  └───────────────────────────┘  │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  47 REPLIES                     │
│                                 │
│  ┌───────────────────────────┐  │
│  │ sw1qcd...8k2n • 1h        │  │
│  │ This is huge for tokio!   │  │
│  │                           │  │
│  │   └ sw1qef...1m3p • 30m   │  │
│  │     Already updating!     │  │
│  └───────────────────────────┘  │
│                                 │
│  [Load more replies...]         │
│                                 │
├─────────────────────────────────┤
│  [Reply]         ░░ ~15s PoW   │
└─────────────────────────────────┘
```

### 6.5 Compose Post

```
┌─────────────────────────────────┐
│  ✕ New Post         s/rust-lang │
├─────────────────────────────────┤
│                                 │
│  Title                          │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│  Content                        │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │                           │  │
│  │                           │  │
│  │                           │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  📷 Add image (optional)        │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ⚠️ Posting requires ~30s of   │
│     proof-of-work mining.       │
│     Battery usage: ~5%          │
│                                 │
├─────────────────────────────────┤
│  [POST]                         │
│  Mining will begin when tapped  │
└─────────────────────────────────┘
```

### 6.6 Mining Screen (Mobile)

```
┌─────────────────────────────────┐
│                                 │
│                                 │
│         ⏳                      │
│                                 │
│    Mining your post...          │
│                                 │
│    ████████████░░░░░░░░░░░░    │
│                                 │
│    18 seconds remaining         │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  💡 Tip                         │
│                                 │
│  This proof-of-work prevents    │
│  spam without needing           │
│  moderators. You're helping     │
│  keep the network healthy.      │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  🔋 Battery: Estimated 3%       │
│  🌡️ May get warm - normal      │
│                                 │
│                                 │
│         [Cancel]                │
│                                 │
└─────────────────────────────────┘
```

### 6.7 Mobile-Specific Considerations

| Aspect | Implementation |
|--------|----------------|
| Battery | Lower parallelism PoW, show battery estimate |
| Heat | Warn user device may warm during PoW |
| Background PoW | Allow mining while reading other content |
| Offline | Queue posts for when back online |
| Storage | Aggressive pruning, smaller storage target |
| Sync | WiFi-only sync by default |
| Threading | Limit depth to 2 levels visible |
| Touch targets | Minimum 44pt hit areas |

### 6.8 Gesture Navigation

| Gesture | Action |
|---------|--------|
| Swipe right on post | Quick engage (+5s) |
| Swipe left on post | Expand thread |
| Pull down | Refresh/sync |
| Long press | Context menu |
| Double tap | Reply |

---

## 7. Search/Discovery Client

The Search/Discovery Client is **Google for Swimchain**. Index content, provide discovery, serve as web gateway.

### 7.1 Design Philosophy

- Fast, relevant search
- Transparent ranking (no hidden algorithm)
- Gateway for non-users
- Discoverability for the network
- Index publicly available content

### 7.2 Main Search Interface

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                         🔗 CHAINSOCIAL                               │
│                            SEARCH                                    │
│                                                                      │
│     ┌────────────────────────────────────────────────────────┐      │
│     │  async traits rust                              🔍     │      │
│     └────────────────────────────────────────────────────────┘      │
│                                                                      │
│     [All] [Spaces] [Posts] [Users] [Hot 🔥] [Recent] [Decaying]     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  About 127 results (0.23 seconds)                                    │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  s/rust-lang › Async traits finally stable!                         │
│  cs://rust-lang/async-traits-stable                                  │
│  sw1qab...3f2j • 2 hours ago • 🔥 82% heat                          │
│  Finally! After years of waiting, async traits are stable in        │
│  Rust 1.75. Here's what this means for the ecosystem...             │
│  47 replies • 45s/60s engaged                                        │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  s/rust-lang › Performance tips for async Rust                      │
│  cs://rust-lang/performance-tips-async                               │
│  sw1qcd...8k2n • 6 hours ago • 🔥 71% heat                          │
│  A collection of patterns I've learned while building async         │
│  applications. Covers cancellation, timeouts, and...                │
│  23 replies • 38s/60s engaged                                        │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  s/web-dev › Rust + async for backend services                      │
│  cs://web-dev/rust-async-backend                                     │
│  sw1qef...1m3p • 1 day ago • 🔥 45% heat                            │
│  How we migrated our Node.js backend to Rust with async...          │
│  12 replies • 22s/60s engaged                                        │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  s/rust-lang › Old async patterns                    [DECAYING]     │
│  cs://rust-lang/old-async-patterns                                   │
│  sw1qgh...4n5r • 5 days ago • 🔥 8% heat                            │
│  Discussion about pre-stable async patterns... This content is      │
│  fading and may disappear soon.                                      │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  [Page 1] [2] [3] ... [10] [Next →]                                  │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  RELATED SPACES                                                      │
│  [s/rust-lang] [s/web-dev] [s/async-programming] [s/tokio]          │
│                                                                      │
│  ACTIVE CONTRIBUTORS                                                 │
│  sw1qab...3f2j (42 posts) • sw1qcd...8k2n (38 posts)                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.3 Advanced Search

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ADVANCED SEARCH                                                     │
│  ═══════════════                                                     │
│                                                                      │
│  ┌─ CONTENT ────────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Keywords:     [async traits                              ]  │   │
│  │  Exact phrase: ["stable in Rust"                          ]  │   │
│  │  Exclude:      [deprecated                                ]  │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ FILTERS ────────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Space:        [rust-lang                    ▼]  [Any space] │   │
│  │  Author:       [                              ]  (address)   │   │
│  │  Time:         [Last week                    ▼]              │   │
│  │                 Options: Any time, Today, This week,         │   │
│  │                          This month, This year, Custom       │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ HEAT & ENGAGEMENT ──────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Minimum heat: [████████░░░░░░░░░░] 50%                      │   │
│  │                 ○ Any  ○ >25%  ● >50%  ○ >75%  ○ >90%        │   │
│  │                                                               │   │
│  │  Engagement:   [████░░░░░░░░░░░░░░] 20s minimum              │   │
│  │                 ○ Any  ● >20s  ○ >40s  ○ Complete (60s)      │   │
│  │                                                               │   │
│  │  Include decaying content (<20% heat): [✓]                   │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ SORT BY ────────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  ● Relevance (text match quality)                            │   │
│  │  ○ Heat (decay state)                                        │   │
│  │  ○ Engagement (pool completeness)                            │   │
│  │  ○ Newest first                                               │   │
│  │  ○ Most replies                                               │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [SEARCH]  [Reset filters]                                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.4 Ranking Factors (Transparent)

Unlike traditional search engines with opaque ranking, Swimchain search is **fully transparent**:

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  HOW RESULTS ARE RANKED                                              │
│  ══════════════════════                                              │
│                                                                      │
│  Your search results are ordered by these transparent factors:       │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  1. TEXT RELEVANCE (40% weight)                                 │ │
│  │     • Keyword matches in title (high weight)                    │ │
│  │     • Keyword matches in body (medium weight)                   │ │
│  │     • Exact phrase matches (bonus)                              │ │
│  │                                                                 │ │
│  │  2. HEAT / DECAY STATE (25% weight)                             │ │
│  │     • Current heat percentage                                   │ │
│  │     • Higher heat = more recently engaged                       │ │
│  │                                                                 │ │
│  │  3. ENGAGEMENT POOL (20% weight)                                │ │
│  │     • Pool completeness (0-60s)                                 │ │
│  │     • Number of unique contributors                             │ │
│  │                                                                 │ │
│  │  4. RECENCY (15% weight)                                        │ │
│  │     • Time since original post                                  │ │
│  │     • Time since last engagement                                │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  These weights are fixed. There is no personalization,               │
│  no advertising influence, no hidden boosting.                       │
│                                                                      │
│  [Learn more about Swimchain's transparent ranking]                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.5 Space Search

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  BROWSE SPACES                                                       │
│  ═════════════                                                       │
│                                                                      │
│  Search: [rust                                              🔍]     │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  🦀 s/rust-lang                                                 │ │
│  │                                                                 │ │
│  │  The Rust programming language community                        │ │
│  │                                                                 │ │
│  │  892 posts • 234 participants • Created Jan 2024               │ │
│  │  Average heat: 67% • Most active space in Technology           │ │
│  │                                                                 │ │
│  │  Recent topics: async traits, error handling, web frameworks   │ │
│  │                                                                 │ │
│  │  [View space] [Preview posts]                                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  🔧 s/rust-gamedev                                              │ │
│  │                                                                 │ │
│  │  Game development with Rust                                     │ │
│  │                                                                 │ │
│  │  234 posts • 89 participants • Created Mar 2024                │ │
│  │  Average heat: 52%                                              │ │
│  │                                                                 │ │
│  │  [View space] [Preview posts]                                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  📚 s/rust-beginners                                            │ │
│  │                                                                 │ │
│  │  Learning Rust - no question too basic                          │ │
│  │                                                                 │ │
│  │  567 posts • 432 participants • Created Feb 2024               │ │
│  │  Average heat: 48%                                              │ │
│  │                                                                 │ │
│  │  [View space] [Preview posts]                                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.6 User/Identity Search

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  SEARCH IDENTITIES                                                   │
│  ════════════════                                                    │
│                                                                      │
│  Address: [sw1qab                                          🔍]      │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  🔑 sw1qab...3f2j                                               │ │
│  │                                                                 │ │
│  │  Full address: sw1qab7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y3f2j       │ │
│  │                                                                 │ │
│  │  First seen: 6 months ago                                       │ │
│  │  Total posts: 142                                                │ │
│  │  Active spaces: s/rust-lang, s/web-dev, s/boston               │ │
│  │                                                                 │ │
│  │  Recent activity:                                                │ │
│  │  • "Async traits finally stable!" (2h ago)                      │ │
│  │  • "Performance tips for async" (6h ago)                        │ │
│  │                                                                 │ │
│  │  [View all posts by this identity]                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  🔑 sw1qab...8k2n                                               │ │
│  │                                                                 │ │
│  │  Full address: sw1qab7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y8k2n       │ │
│  │                                                                 │ │
│  │  First seen: 2 months ago                                       │ │
│  │  Total posts: 34                                                 │ │
│  │  Active spaces: s/boston, s/food                                │ │
│  │                                                                 │ │
│  │  [View all posts by this identity]                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.7 Search as Network Gateway

The search client can also be hosted as a web gateway, allowing non-users to discover Swimchain content:

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  🌐 search.swimchain.io                                          │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  s/rust-lang › Async traits finally stable!                         │
│  ...content preview...                                               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  👀 YOU'RE VIEWING CHAINSOCIAL FROM THE WEB                    │ │
│  │                                                                 │ │
│  │  This is a read-only gateway. To fully participate:            │ │
│  │                                                                 │ │
│  │  ┌───────────────────┐  ┌───────────────────┐                  │ │
│  │  │ 📱 Mobile App     │  │ 💻 Desktop App    │                  │ │
│  │  │                   │  │                   │                  │ │
│  │  │ iOS / Android     │  │ Windows / Mac     │                  │ │
│  │  │                   │  │ Linux             │                  │ │
│  │  │ [Download]        │  │ [Download]        │                  │ │
│  │  └───────────────────┘  └───────────────────┘                  │ │
│  │                                                                 │ │
│  │  Your device becomes a node on the network.                    │ │
│  │  No account needed - just your cryptographic keys.             │ │
│  │                                                                 │ │
│  │  [What is Swimchain?] [How does it work?]                    │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 8. Reader Client (Web Gateway)

The Reader Client is a **zero-barrier entry point**. Read Swimchain content without running a node.

### 8.1 Design Philosophy

- No node required
- No client download
- Pure web experience
- Read-only (cannot post/engage)
- Gateway to full participation

### 8.2 URL Structure

```
read.swimchain.io/
├── s/{space}                    → Space listing
├── s/{space}/{post-id}          → Single post view
├── u/{address}                  → User profile
└── about                        → What is Swimchain
```

### 8.3 Post View (Read-Only)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  📖 read.swimchain.io                                            │
│                                                                      │
│  s/rust-lang › Async traits finally stable!                         │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Async traits finally stable!                                        │
│  ══════════════════════════════                                      │
│                                                                      │
│  sw1qab...3f2j • 2 hours ago • 🔥 82% heat                          │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  Finally! After years of waiting, async traits are stable in         │
│  Rust 1.75. Here's what this means for the ecosystem:                │
│                                                                      │
│  1. No more `#[async_trait]` macro                                   │
│  2. Better error messages                                             │
│  3. Improved performance                                              │
│                                                                      │
│  This is a huge milestone for async Rust development.                │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  47 REPLIES                                                          │
│                                                                      │
│  ├─ sw1qcd...8k2n • 1 hour ago                                      │
│  │  This is huge! I've been waiting for this for my web server.    │
│  │                                                                   │
│  │  └─ sw1qef...1m3p • 30 min ago                                   │
│  │     Already seeing crates update!                                │
│  │                                                                   │
│  └─ sw1qgh...4n5r • 15 min ago                                      │
│     Anyone benchmarked the overhead yet?                            │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  📱 WANT TO REPLY OR ENGAGE?                                   │ │
│  │                                                                 │ │
│  │  This is a read-only gateway. To participate:                  │ │
│  │                                                                 │ │
│  │  [Download Swimchain] → Become a full node                   │ │
│  │                                                                 │ │
│  │  • Reply to posts                                               │ │
│  │  • Engage content (help it persist)                            │ │
│  │  • Create your own posts                                       │ │
│  │  • Join communities                                             │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Powered by Swimchain • Decentralized Social Media                │
│  [What is Swimchain?] [Download] [GitHub]                         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.4 Space View (Read-Only)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  📖 read.swimchain.io/s/rust-lang                                │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  s/rust-lang                                                         │
│  ════════════                                                        │
│                                                                      │
│  The Rust programming language community                             │
│                                                                      │
│  892 posts • 234 participants • Created Jan 2024                    │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  RECENT POSTS                                                        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Async traits finally stable!                         🔥 82%  │ │
│  │  sw1qab...3f2j • 2 hours ago • 47 replies                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Performance tips for async Rust                      🔥 71%  │ │
│  │  sw1qcd...8k2n • 6 hours ago • 23 replies                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  My first Rust CLI tool                               🔥 65%  │ │
│  │  sw1qef...1m3p • 8 hours ago • 12 replies                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Load more...]                                                      │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ℹ️ Content older than the gateway's sync window may not appear.   │
│     For full history, use a Swimchain client.                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.5 Gateway Operator Model

Anyone can run a reader gateway:

```
GATEWAY OPERATOR
────────────────

Requirements:
• Run a Swimchain full node
• Run a web server
• Serve read-only HTML views

What gateway provides:
• SEO-friendly content (Google can index)
• Link sharing (share URLs on other platforms)
• Preview for non-users
• Onboarding funnel

What gateway CANNOT do:
• Post on behalf of users
• Engage content
• Modify content
• Censor content (others can run gateways)

Multiple gateways can exist:
• read.swimchain.io (official)
• swimchain.example.com (community)
• archive.swimchain.org (preservation-focused)
```

---

## 9. CLI Client

The CLI Client is for **developers, power users, and automation**. Full protocol access via terminal.

### 9.1 Design Philosophy

- Complete feature parity with GUI
- Scriptable and automatable
- Unix philosophy (composable)
- Machine-readable output (JSON)
- Efficient for power users

### 9.2 Command Structure

```
cs <command> [subcommand] [options] [arguments]

COMMANDS:
  identity    Manage your cryptographic identity
  space       Space operations
  post        Create and manage posts
  search      Search content
  sync        Sync and node operations
  config      Configuration
  help        Show help
```

### 9.3 Identity Commands

```bash
# Generate new identity
$ cs identity create
Creating new identity...
Mining proof-of-work... ████████████████████ Done (32s)

Your new identity:
  Address: sw1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m
  Created: 2024-12-25T10:30:00Z

Private key saved to ~/.swimchain/identity.enc
IMPORTANT: Back up your private key. There is no recovery!

# Show current identity
$ cs identity show
Address: sw1q9x7...2k4m
Created: 2024-12-25T10:30:00Z
Posts: 142
Spaces: 12

# Export identity (for backup)
$ cs identity export > backup.json
Exported identity to backup.json

# Import identity
$ cs identity import backup.json
Identity imported successfully.
```

### 9.4 Space Commands

```bash
# List spaces
$ cs space list
SPACE               POSTS   HEAT    SYNCED
rust-lang           892     67%     ✓
boston              345     52%     ✓
woodworking         456     48%     ✓
fishing             123     35%     ✓

# Join a space
$ cs space join rust-lang
Joining s/rust-lang...
Syncing content... ████████████████████ Done
Joined successfully. 892 posts synced.

# Leave a space
$ cs space leave fishing
Left s/fishing. Local content removed.

# Create a space (high PoW cost)
$ cs space create --name "my-new-space" --description "A new space"
Creating space requires ~60s proof-of-work.
Proceed? [y/N] y
Mining... ████████████████████ Done (58s)
Space created: s/my-new-space
```

### 9.5 Post Commands

```bash
# Create a post
$ cs post create --space rust-lang --title "My Rust Project" --body "Check out what I built..."
Mining proof-of-work... ████████████████████ Done (28s)
Posted successfully.
Hash: Qm7x9abc...
URL: cs://rust-lang/Qm7x9abc

# Create a post from file
$ cs post create --space rust-lang --title "Long Post" --body-file ./post.md
Mining proof-of-work... ████████████████████ Done (31s)
Posted successfully.

# Reply to a post
$ cs post reply Qm7x9abc "Great work!"
Mining proof-of-work... ████████████████ Done (14s)
Reply posted.

# Engage a post
$ cs post engage Qm7x9abc --seconds 5
Mining proof-of-work... ████ Done (5s)
Engaged! Pool now at 50s/60s.

# View a post
$ cs post show Qm7x9abc
s/rust-lang > My Rust Project
═══════════════════════════════
sw1q9x7...2k4m • 2 hours ago • Heat: 82%

Check out what I built...

Pool: 50s/60s (8 contributors)
Replies: 12
```

### 9.6 Search Commands

```bash
# Basic search
$ cs search "async traits"
RESULTS (12 matches)

[1] s/rust-lang • sw1qab...3f2j • 2h • 82%
    Async traits finally stable!
    47 replies • 45s/60s engaged

[2] s/rust-lang • sw1qcd...8k2n • 6h • 71%
    Performance tips for async Rust
    23 replies • 38s/60s engaged

# Search with filters
$ cs search "async" --space rust-lang --min-heat 50 --sort heat
...

# Search with JSON output (for scripting)
$ cs search "async traits" --json
{
  "results": [
    {
      "space": "rust-lang",
      "title": "Async traits finally stable!",
      "author": "sw1qab...3f2j",
      "heat": 82,
      "replies": 47,
      "hash": "Qm7x9abc..."
    },
    ...
  ]
}
```

### 9.7 Sync Commands

```bash
# Check sync status
$ cs sync status
Node Status:
  Chain:    82% synced
  Peers:    23 connected
  Storage:  412 MB / 500 MB target
  Branches: 12 synced

Last block: 2 minutes ago

# Force sync
$ cs sync now
Syncing with peers...
████████████████████ 100%
Synced to block #12345

# List peers
$ cs sync peers
PEER                 LATENCY   STATUS
192.168.1.50:8333    12ms      connected
45.32.100.25:8333    45ms      connected
...

# Adjust storage target
$ cs sync config --storage-target 1000
Storage target set to 1000 MB
```

### 9.8 Scripting Examples

```bash
#!/bin/bash
# Auto-engage content in your spaces above 50% heat

for post in $(cs search --space rust-lang --min-heat 50 --json | jq -r '.results[].hash'); do
    echo "Engaging $post..."
    cs post engage "$post" --seconds 5
    sleep 1
done
```

```bash
#!/bin/bash
# Daily digest of new posts in subscribed spaces

echo "=== Swimchain Daily Digest ==="
echo "$(date)"
echo ""

for space in rust-lang boston woodworking; do
    echo "## s/$space"
    cs search --space "$space" --time today --sort newest | head -5
    echo ""
done
```

```bash
#!/bin/bash
# Export all your posts to markdown files

mkdir -p ~/swimchain-backup

cs post list --author self --json | jq -r '.posts[] | .hash' | while read hash; do
    cs post show "$hash" --format markdown > ~/swimchain-backup/"$hash".md
done

echo "Exported $(ls ~/swimchain-backup | wc -l) posts"
```

### 9.9 Configuration

```bash
# Show config
$ cs config show
storage_target: 500
sync_on_startup: true
default_engage_seconds: 5
pow_parallelism: auto
output_format: text

# Set config
$ cs config set storage_target 1000
storage_target = 1000

# Reset to defaults
$ cs config reset
Configuration reset to defaults.
```

---

## 10. Specialized Clients

### 10.1 Archiver Client

**Purpose:** Preserve important content from decay. Run by enthusiasts, historians, or community leaders.

```
ARCHIVER CLIENT
───────────────

Mode: Preservation

Configuration:
• Target spaces: [rust-lang, programming-history, ...]
• Minimum heat before archiving: 5%
• Auto-engage threshold: 10% (prevent decay)
• Storage budget: 50 GB

Operations:
• Monitor content approaching decay
• Auto-engage important content
• Store decayed content locally (off-chain backup)
• Provide content to peers who request it

Dashboard:
┌────────────────────────────────────────────────────────────────┐
│  ARCHIVER STATUS                                                │
│                                                                 │
│  Monitoring: 5 spaces                                           │
│  Archived: 1,234 posts (2.3 GB)                                │
│  Auto-engaged today: 45 posts (225s PoW)                       │
│  Rescued from decay: 12 posts                                   │
│                                                                 │
│  AT RISK (< 10% heat):                                         │
│  • "History of Rust async" - 8% - [Engage] [Archive] [Ignore]  │
│  • "Old compiler bug" - 6% - [Engage] [Archive] [Ignore]       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 10.2 Bridge Client

**Purpose:** Connect Swimchain to other platforms (Matrix, IRC, Fediverse).

```
BRIDGE CLIENT
─────────────

Connections:
• Matrix: #rust-lang:matrix.org ↔ s/rust-lang
• IRC: #rust on Libera.Chat ↔ s/rust-lang
• Mastodon: @cs_rust_bot@mastodon.social ← s/rust-lang (one-way)

Configuration:
┌────────────────────────────────────────────────────────────────┐
│  BRIDGE: Matrix ↔ Swimchain                                   │
│                                                                 │
│  Direction: Bidirectional                                       │
│                                                                 │
│  Matrix → Swimchain:                                         │
│  • Messages become replies                                      │
│  • Bridge identity: sw1qbridge...                              │
│  • PoW paid by bridge operator                                  │
│                                                                 │
│  Swimchain → Matrix:                                         │
│  • New posts become messages                                    │
│  • Replies become threads                                       │
│  • Heat shown as reactions (🔥)                                │
│                                                                 │
│  Limits:                                                        │
│  • Max 10 bridge posts/hour (PoW budget)                       │
│  • No media bridging (text only)                               │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 10.3 Analytics Client

**Purpose:** Understand network health and space activity (for community leaders, researchers).

```
ANALYTICS CLIENT
────────────────

┌────────────────────────────────────────────────────────────────┐
│  NETWORK HEALTH                                                 │
│                                                                 │
│  Active nodes: 12,345                                          │
│  Posts today: 4,567                                             │
│  Avg heat: 52%                                                  │
│  Decayed today: 234 posts                                       │
│  Engagement rate: 67%                                           │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  SPACE: s/rust-lang                                             │
│                                                                 │
│  Activity (7 days):                                             │
│  ████████████████████████████████ 892 posts                    │
│  Mon Tue Wed Thu Fri Sat Sun                                   │
│   ▁   ▃   ▅   ▇   █   ▃   ▁                                   │
│                                                                 │
│  Top contributors:                                              │
│  1. sw1qab...3f2j - 42 posts                                   │
│  2. sw1qcd...8k2n - 38 posts                                   │
│  3. sw1qef...1m3p - 29 posts                                   │
│                                                                 │
│  Heat distribution:                                             │
│  90-100%: ██████ 12%                                           │
│  70-89%:  ████████████████ 32%                                 │
│  50-69%:  ████████████ 24%                                     │
│  30-49%:  ████████ 16%                                         │
│  10-29%:  ██████ 12%                                           │
│  0-9%:    ██ 4%                                                │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 11. Cross-Client Considerations

### 11.1 Consistent Data Model

All clients share the same underlying data:

```
PROTOCOL DATA STRUCTURES
────────────────────────

Identity:
{
  publicKey: Ed25519 public key
  address: Bech32m encoded (sw1q...)
  created: Timestamp (from chain)
}

Post:
{
  hash: Content-addressed ID
  author: Identity address
  space: Space ID
  title: String (optional for replies)
  body: String
  parent: Post hash (null for top-level)
  timestamp: Unix timestamp
  powNonce: PoW solution
  signature: Ed25519 signature
}

Space:
{
  id: Unique identifier
  name: Human-readable name
  description: String
  created: Timestamp
  creator: Identity address
}

EngagementPool:
{
  targetHash: Post hash
  totalSeconds: 0-60
  contributors: [Identity addresses]
  complete: Boolean
}

Heat:
{
  postHash: Post hash
  percentage: 0-100
  lastEngaged: Timestamp
  estimatedDecay: Timestamp
}
```

### 11.2 Deep Linking

All clients should support deep links:

```
CHAINSOCIAL URI SCHEME
──────────────────────

cs://{space}/{post-hash}           → Open post
cs://{space}                       → Open space
cs://identity/{address}            → View identity
cs://search?q={query}              → Search results

Examples:
cs://rust-lang/Qm7x9abc            → Specific post
cs://rust-lang                     → Space listing
cs://identity/sw1qab...3f2j        → User profile
cs://search?q=async%20traits       → Search results

Web fallback:
https://read.swimchain.io/s/rust-lang/Qm7x9abc
```

### 11.3 Inter-Client Communication

Clients can share session state (optional):

```
SESSION SYNC
────────────

Export session:
{
  identity: { encrypted private key },
  spaces: ["rust-lang", "boston", ...],
  preferences: { ... },
  syncState: { lastBlock, syncedBranches }
}

Use cases:
• Switch from desktop to mobile
• Backup and restore
• Multiple devices
```

### 11.4 Accessibility Requirements

All clients should support:

| Requirement | Implementation |
|-------------|----------------|
| Screen reader | Semantic HTML, ARIA labels |
| Keyboard navigation | Full keyboard access |
| Color contrast | WCAG 2.1 AA minimum |
| Text scaling | Responsive to system font size |
| Reduced motion | Respect prefers-reduced-motion |
| Color blindness | Don't rely on color alone |

### 11.5 Internationalization

```
LOCALIZATION SUPPORT
────────────────────

UI strings: Localizable
Content: User-generated (any language)
RTL support: Yes
Date/time: Localized formats
Numbers: Localized formats

Priority languages:
• English (default)
• Spanish
• Chinese (Simplified)
• Japanese
• German
• French
• Portuguese
• Russian
```

---

## 12. Implementation Architecture

### 12.1 Shared Core Library

All clients share a common core:

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                       │
│                                                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  Forum  │ │ Reddit  │ │  Chat   │ │ Mobile  │ │   CLI   │  │
│  │  (Web)  │ │  (Web)  │ │  (Web)  │ │ (React  │ │ (Rust)  │  │
│  │         │ │         │ │         │ │ Native) │ │         │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
│       │          │          │          │          │           │
│       └──────────┴──────────┴──────────┴──────────┘           │
│                            │                                   │
│  ┌─────────────────────────┴─────────────────────────────────┐ │
│  │                     CORE LIBRARY                           │ │
│  │                                                            │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │ │
│  │  │   Protocol   │ │    Crypto    │ │   Storage    │      │ │
│  │  │   (Wire,     │ │   (Ed25519,  │ │   (Chain,    │      │ │
│  │  │   Sync,      │ │   Blake3,    │ │   Content,   │      │ │
│  │  │   P2P)       │ │   PoW)       │ │   Index)     │      │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘      │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │                    RUST CORE                          │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Platform Bindings

| Platform | Binding Strategy |
|----------|------------------|
| Web (JS) | WASM compilation of Rust core |
| Mobile (React Native) | Native module (Rust via FFI) |
| Desktop (Electron) | WASM or Native addon |
| CLI | Pure Rust |
| Server (Gateway) | Pure Rust |

### 12.3 Client-Specific Layers

Each client adds its own:
- **UI framework** (React, React Native, Tauri, etc.)
- **State management** (Redux, MobX, etc.)
- **Persistence** (localStorage, SQLite, etc.)
- **Platform APIs** (notifications, background tasks, etc.)

### 12.4 API Surface

The core library exposes:

```rust
// Identity
pub fn create_identity() -> Result<Identity>;
pub fn export_identity(id: &Identity, password: &str) -> Result<String>;
pub fn import_identity(data: &str, password: &str) -> Result<Identity>;

// Posts
pub fn create_post(space: &str, title: &str, body: &str) -> Result<PendingPost>;
pub fn mine_pow(post: &PendingPost) -> Result<SignedPost>;
pub fn broadcast_post(post: &SignedPost) -> Result<()>;

// Engagement
pub fn engage_post(hash: &str, seconds: u8) -> Result<PendingEngagement>;
pub fn mine_engagement(eng: &PendingEngagement) -> Result<SignedEngagement>;

// Sync
pub fn sync_status() -> Result<SyncStatus>;
pub fn sync_space(space: &str) -> Result<()>;
pub fn get_peers() -> Result<Vec<Peer>>;

// Search
pub fn search(query: &str, filters: SearchFilters) -> Result<Vec<SearchResult>>;

// Spaces
pub fn list_spaces() -> Result<Vec<Space>>;
pub fn join_space(space: &str) -> Result<()>;
pub fn leave_space(space: &str) -> Result<()>;
pub fn create_space(name: &str, desc: &str) -> Result<PendingSpace>;
```

---

## 13. Release Strategy

### 13.1 Phase 1: MVP (Launch)

| Client | Platform | Priority | Status |
|--------|----------|----------|--------|
| Forum | Web (Desktop) | P0 | Reference implementation |
| Reader | Web | P0 | Discovery gateway |
| Mobile | iOS/Android | P1 | Mass adoption |

**MVP Feature Set:**
- Create/import identity
- Join spaces
- Create posts and replies
- Engage content
- Basic search
- Sync status

### 13.2 Phase 2: Ecosystem Growth

| Client | Platform | Priority | Status |
|--------|----------|----------|--------|
| CLI | Cross-platform | P2 | Developer adoption |
| Reddit-style | Web | P2 | Alternative UX |
| Search | Web | P2 | Enhanced discovery |

**Added Features:**
- Advanced search
- Analytics
- Export/import
- Scripting (CLI)

### 13.3 Phase 3: Integration

| Client | Platform | Priority | Status |
|--------|----------|----------|--------|
| Chat | Web/Electron | P3 | Real-time use case |
| Bridge | Server | P3 | Connect existing communities |
| Archiver | Server | P3 | Preservation |

**Added Features:**
- Real-time updates
- Platform bridges
- Content archiving
- Analytics dashboards

### 13.4 Success Metrics

| Metric | Target |
|--------|--------|
| Client download completion | >80% |
| First post within 24h | >30% |
| 7-day retention | >40% |
| Spaces joined (avg) | >3 |
| Posts created (monthly active) | >5 |

---

## Appendix A: Visual Asset Requirements

### A.1 Icons

| Icon | Usage | Sizes |
|------|-------|-------|
| App icon | Desktop, mobile | 16, 32, 64, 128, 256, 512, 1024 |
| Space icon | Default space | 32, 64, 128 |
| Heat icon | Decay indicator | 16, 24, 32 |
| Engage icon | Action button | 16, 24, 32 |
| Identity icon | Profile, author | 32, 64 |

### A.2 Color Palette

```
PRIMARY
  Brand:     #6B5CE7 (purple)
  Accent:    #4CAF50 (green)

HEAT GRADIENT
  Hot:       #FF5722 (red-orange)
  Warm:      #FF9800 (orange)
  Cool:      #2196F3 (blue)
  Cold:      #9E9E9E (gray)

SEMANTIC
  Success:   #4CAF50
  Warning:   #FF9800
  Error:     #F44336
  Info:      #2196F3

NEUTRAL
  Text:      #212121
  Secondary: #757575
  Disabled:  #BDBDBD
  Background:#FAFAFA
  Surface:   #FFFFFF
```

### A.3 Typography

```
HEADINGS:    Inter, system-ui, sans-serif
BODY:        Inter, system-ui, sans-serif
MONOSPACE:   JetBrains Mono, Fira Code, monospace

SIZES:
  h1: 32px / 40px line-height
  h2: 24px / 32px
  h3: 20px / 28px
  body: 16px / 24px
  small: 14px / 20px
  caption: 12px / 16px
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| Heat | Content freshness metric (0-100%), decreases over time without engagement |
| Engagement | PoW contribution to keep content alive |
| Engagement Pool | Accumulated PoW for a piece of content (0-60s) |
| Decay | Content becoming less visible as heat decreases |
| Space | Topic-based community/forum |
| Fork | Independent chain split from another |
| PoW | Proof-of-work, computational cost to post |
| Identity | Cryptographic keypair (Ed25519) |
| Address | Bech32m-encoded public key (sw1q...) |
| Node | Device running Swimchain client |
| Gateway | Read-only web interface |

---

*Document created: 2024-12-25*
*Last updated: 2025-12-26*
*Version: 1.1.0*
*Status: Specialized clients implemented*

---

## Changelog

### v1.1.0 (2025-12-26)
- **Specialized Clients Implemented (§10):** All three specialized clients (Bridge, Archiver, Analytics) are now fully implemented
  - Bridge Client: Matrix/IRC integration with bidirectional sync, echo prevention, rate limiting
  - Archiver Client: Decay monitoring, proactive engagement, IndexedDB storage with priority-based preservation
  - Analytics Client: Network health scoring per SPEC_09, alert system, heat distribution histograms
- Implementation details match CLIENT_DESIGN.md specifications for archiver priority algorithm (§10.1)

### v1.0.0 (2024-12-25)
- Initial specification covering all client types: Forum, Reddit-style, Chat, Mobile, Search, Reader, CLI, and Specialized clients
- Common UI components defined: Heat Indicator, Engagement Pool, PoW Mining Status, Identity Display, Space Navigation, Sync Status
- Cross-client considerations: deep linking, accessibility (WCAG 2.1 AA), internationalization
