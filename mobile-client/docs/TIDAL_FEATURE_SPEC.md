# Tidal Feature Specifications

Detailed specifications for core Tidal features. Each feature includes user stories, requirements, edge cases, and technical details.

---

## Table of Contents

1. [Breath System](#1-breath-system)
2. [Tend Gesture](#2-tend-gesture)
3. [Depth Feed](#3-depth-feed)
4. [Rescue Missions](#4-rescue-missions)
5. [Compose Ritual](#5-compose-ritual)
6. [Stewardship Profile](#6-stewardship-profile)
7. [Space Ecosystems](#7-space-ecosystems)
8. [Notification System](#8-notification-system)
9. [Onboarding Flow](#9-onboarding-flow)
10. [Settings & Preferences](#10-settings--preferences)

---

## 1. Breath System

### Overview

The Breath System is the core visual language of Tidal. Every piece of content has a visible "breath" that communicates its life state without numbers.

### User Stories

```
AS A user browsing content
I WANT TO see how alive each post is at a glance
SO THAT I can decide what needs my attention

AS A content creator
I WANT TO see my content's vitality
SO THAT I understand if it's thriving or needs help

AS A rescuer
I WANT TO quickly identify gasping content
SO THAT I can join rescue efforts
```

### Breath States

| State | Survival Probability | Visual | Animation | Color |
|-------|---------------------|--------|-----------|-------|
| **Strong** | 80-100% | ●●●●● | Fast pulse (1s cycle) | Vibrant Teal `#14B8A6` |
| **Steady** | 50-79% | ●●●○○ | Medium pulse (1.5s cycle) | Soft Blue `#60A5FA` |
| **Fading** | 20-49% | ●●○○○ | Slow pulse (2.5s cycle) | Lavender `#A78BFA` |
| **Gasping** | 5-19% | ●○○○○ | Irregular pulse | Amber `#F59E0B` |
| **Final** | 0-4% | ○○○○○ | Single slow pulse (6s) | Gray `#9CA3AF` |

### Breath Indicator Components

#### 1.1 Dot Array

```
┌─────────────────────────────────┐
│  ● ● ● ○ ○                      │  Five dots, filled based on state
│                                 │  Spacing: 4px between dots
│  Dot size: 8px (md), 6px (sm)   │  Active dots pulse in unison
└─────────────────────────────────┘
```

**Animation Details:**
- Scale oscillates between 0.85 and 1.15
- Opacity oscillates between 0.7 and 1.0
- Easing: `Easing.inOut(Easing.sine)`
- Inactive dots: scale 0.8, opacity 0.4, no animation

**Gasping Special Case:**
```javascript
// Irregular breathing pattern for gasping state
withSequence(
  withTiming(1, { duration: 800 }),   // Quick inhale
  withTiming(0, { duration: 400 }),   // Exhale
  withTiming(0.3, { duration: 200 }), // Weak gasp
  withTiming(0, { duration: 2600 }), // Long pause
)
```

#### 1.2 Life Wave

```
┌─────────────────────────────────┐
│  ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿             │  Animated sine wave
│                                 │  Amplitude = survival probability
│  Width: 100px, Height: 12px    │  Scrolls left continuously
└─────────────────────────────────┘
```

**Wave Parameters:**
- Frequency: 2 complete waves across width
- Scroll speed: 3 seconds per cycle
- Amplitude multiplier: `survivalProbability * (height / 2)`
- Rendered as connected dots for performance

#### 1.3 Content Opacity

Content itself becomes translucent as it approaches death:

| State | Content Opacity | Background |
|-------|-----------------|------------|
| Strong | 1.0 | Normal |
| Steady | 1.0 | Normal |
| Fading | 0.85 | Slight desaturation |
| Gasping | 0.7 | Warm tint overlay |
| Final | 0.5 | Grayscale filter |

### Edge Cases

**E1.1: Rapid State Changes**
- When tending causes rapid state improvement, animate smoothly over 500ms
- Don't jump between states; interpolate colors and pulse speeds

**E1.2: Death Transition**
- When content dies (probability hits 0), play "final breath" animation
- Fade out over 2 seconds with scale down to 0.95
- Show "Returned to Earth" overlay briefly before removal

**E1.3: Resurrection**
- If tending brings content back from Final to Gasping, play "revival" animation
- Quick pulse to full opacity, then settle into Gasping rhythm

### Technical Requirements

```typescript
interface BreathConfig {
  survivalProbability: number; // 0-1
  lastEngagement: number;      // timestamp
  createdAt: number;           // timestamp
}

interface BreathState {
  state: 'strong' | 'steady' | 'fading' | 'gasping' | 'final';
  activeDots: number;          // 0-5
  pulseDuration: number;       // ms
  color: string;               // hex
  opacity: number;             // 0-1
  isIrregular: boolean;        // true for gasping
}

function computeBreathState(config: BreathConfig): BreathState;
```

### Accessibility

- Breath states must have text alternatives for screen readers
- Announce state changes: "Post now steady" / "Post is gasping"
- Reduce motion setting disables animations, shows static indicators
- Color-blind mode uses patterns in addition to colors

---

## 2. Tend Gesture

### Overview

The Tend Gesture replaces the tap-to-like with a deliberate hold-and-release interaction that initiates PoW mining.

### User Stories

```
AS A user who finds valuable content
I WANT TO contribute to its survival
SO THAT it stays alive for others to see

AS A user tending content
I WANT TO feel my contribution
SO THAT the action feels meaningful

AS A user in a hurry
I WANT TO give a small contribution quickly
SO THAT I can still help without much time
```

### Interaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. USER TOUCHES TEND AREA                                  │
│     └─> Haptic: impactLight                                 │
│     └─> Visual: Scale to 0.95, begin glow                   │
│     └─> Start hold timer                                    │
│                                                             │
│  2. HOLD CONTINUES (0-1s)                                   │
│     └─> Ripple effect emanates from touch point             │
│     └─> Progress bar begins filling                         │
│     └─> Tier indicator shows "5s" highlighted               │
│                                                             │
│  3. FIRST TIER REACHED (1s)                                 │
│     └─> Haptic: impactMedium                                │
│     └─> Visual: First tier locks in                         │
│     └─> Mining begins in background                         │
│                                                             │
│  4. HOLD CONTINUES (1-2.5s)                                 │
│     └─> Progress bar continues                              │
│     └─> Mining continues                                    │
│                                                             │
│  5. SECOND TIER REACHED (2.5s)                              │
│     └─> Haptic: impactMedium                                │
│     └─> Visual: Second tier (15s) highlighted               │
│                                                             │
│  6. HOLD CONTINUES (2.5-5s)                                 │
│     └─> Progress bar nearing full                           │
│                                                             │
│  7. THIRD TIER REACHED (5s)                                 │
│     └─> Haptic: impactHeavy                                 │
│     └─> Visual: All tiers lit, max contribution             │
│                                                             │
│  8. USER RELEASES                                           │
│     └─> Haptic: notificationSuccess                         │
│     └─> Visual: Scale back to 1.0, ripple completes         │
│     └─> Mining finalizes                                    │
│     └─> Breath indicator on content strengthens             │
│     └─> Stewardship record created                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Tier System

| Tier | Hold Duration | Breaths Given | PoW Difficulty | Est. Battery |
|------|---------------|---------------|----------------|--------------|
| Quick | 1.0s | 5 seconds | 8 | 0.1% |
| Standard | 2.5s | 15 seconds | 10 | 0.3% |
| Deep | 5.0s | 30 seconds | 12 | 0.8% |

### Visual Specifications

#### 2.1 Tend Button (Collapsed)

```
┌─────────────────────────────────────┐
│                                     │
│         Hold to Tend                │
│         5s | 15s | 30s              │
│                                     │
└─────────────────────────────────────┘

Height: 64px
Background: surface color
Border radius: 12px
Text: 16px semibold
Tier preview: 12px, tertiary color
```

#### 2.2 Tend Button (Active)

```
┌─────────────────────────────────────┐
│  ◯──────────────────────────────●   │  Progress bar
│                                     │
│           Tending...                │
│         ●5s  ●15s  ○30s             │  Tier indicators
│                                     │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  Mining progress
└─────────────────────────────────────┘

Glow: Teal at 20% opacity, full coverage
Progress bar: 4px height, teal fill
Tier dots: 8px, filled when reached
Mining bar: Shows PoW computation progress
```

#### 2.3 Ripple Effect

```
Origin: Touch point
Expansion: 0 → 3x container width
Duration: 2 seconds
Opacity: 0.6 → 0
Color: Teal
Easing: Easing.out(Easing.ease)
```

### Haptic Patterns

```typescript
const HAPTICS = {
  touchStart: 'impactLight',
  tierReached: 'impactMedium',
  maxTier: 'impactHeavy',
  complete: 'notificationSuccess',
  cancel: 'impactLight',
};
```

### Edge Cases

**E2.1: Release Before First Tier**
- If released before 1s hold, cancel without contribution
- Show brief "Hold longer to tend" toast
- No haptic on cancel (feels like mistake, not action)

**E2.2: Mining Failure**
- If PoW fails (rare), show error state
- Allow retry without re-holding
- Log failure for debugging

**E2.3: App Backgrounded During Tend**
- Mining continues in background (native module)
- On return, show completion state
- If killed, contribution is lost (show explanation)

**E2.4: Content Dies During Tend**
- If content dies while user is tending, complete the tend anyway
- Show "Your breath helped, but it wasn't enough" message
- Credit user's stewardship stats

**E2.5: Network Offline**
- Queue tending action for later submission
- Show "Will tend when online" indicator
- Complete mining locally, submit when connected

### Technical Requirements

```typescript
interface TendAction {
  contentId: string;
  tier: 5 | 15 | 30;
  powNonce: number;
  powHash: string;
  timestamp: number;
  signature: string;
}

interface TendResult {
  success: boolean;
  newSurvivalProbability: number;
  totalBreathsOnContent: number;
  stewardPosition: number; // nth steward
}

// Mining must happen on native thread
interface NativeTendModule {
  startMining(challenge: Uint8Array, difficulty: number): Promise<PowSolution>;
  cancelMining(): void;
  getMiningProgress(): MiningProgress;
}
```

### Accessibility

- VoiceOver/TalkBack: "Tend button. Double tap and hold to contribute."
- Progress announced at each tier: "5 seconds contribution ready"
- Completion announced: "Tending complete. 15 seconds contributed."
- Alternative: Double-tap to open tier selection menu for users who can't hold

---

## 3. Depth Feed

### Overview

The Depth Feed organizes content by survival time rather than chronology, creating a vertical journey from new (Surface) to proven (Archive).

### User Stories

```
AS A user opening Tidal
I WANT TO see what's new at the Surface
SO THAT I can help new content find its footing

AS A user seeking quality content
I WANT TO dive into The Deep
SO THAT I can find content the community has kept alive

AS A user researching a topic
I WANT TO explore The Archive
SO THAT I can find historically preserved content
```

### Depth Layers

| Layer | Age | Survival Required | Icon | Color |
|-------|-----|-------------------|------|-------|
| **Surface** | 0-1 hour | None (new) | 🌊 | Blue `#60A5FA` |
| **Shallows** | 1-6 hours | Survived first hour | 🐚 | Green `#34D399` |
| **The Deep** | 6-24 hours | Sustained engagement | 🦑 | Purple `#A78BFA` |
| **The Archive** | 24+ hours | Community-validated | 🏛️ | Gold `#FBBF24` |

### Visual Layout

```
┌──────────────────────────────────────────────────┐
│ ┌────┐                                           │
│ │ 🌊 │  ═══════════════════════════════════════  │
│ │    │  SURFACE - Fresh Content                  │
│ │ 🐚 │  ───────────────────────────────────────  │
│ │    │                                           │
│ │ 🦑 │  ┌─────────────────────────────────────┐  │
│ │    │  │  Post Card                          │  │
│ │ 🏛️ │  │  ● ● ● ○ ○  ∿∿∿∿∿∿∿                │  │
│ └────┘  │  Title of the post...               │  │
│         │  @author · 23m ago                  │  │
│ Depth   │  [Tend]                             │  │
│ Rail    └─────────────────────────────────────┘  │
│                                                  │
│         ┌─────────────────────────────────────┐  │
│         │  Another Post                       │  │
│         │  ...                                │  │
│         └─────────────────────────────────────┘  │
│                                                  │
│         ═══════════════════════════════════════  │
│         SHALLOWS - Finding Footing               │
│         ───────────────────────────────────────  │
│                                                  │
│         ┌─────────────────────────────────────┐  │
│         │  Older Post                         │  │
│         │  ...                                │  │
│         └─────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Depth Rail

The left rail shows current position and allows quick navigation:

```
┌────┐
│ 🌊 │ ← Current layer highlighted
│    │   Marker moves with scroll
│ 🐚 │
│    │
│ 🦑 │
│    │
│ 🏛️ │
└────┘

Width: 40px
Track: 2px vertical line
Marker: 10px circle, matches layer color
Icons: 16px, 50% opacity when not current
Tap icon: Scroll to that layer
```

### Section Headers

```
┌─────────────────────────────────────────────────┐
│  🌊  SURFACE                    12 thoughts     │
│      Fresh Content                              │
├─────────────────────────────────────────────────┤
│  Background: Layer-specific dark shade          │
│  Sticky: Yes, pins to top while in section      │
│  Height: 56px                                   │
└─────────────────────────────────────────────────┘
```

### Content Cards in Feed

```
┌─────────────────────────────────────────────────┐
│  ● ● ● ○ ○  ∿∿∿∿∿∿∿∿∿∿∿                        │  Breath indicator
│                                                 │
│  Why decentralization matters for social        │  Title (max 2 lines)
│                                                 │
│  The key insight is that traditional platforms  │  Preview (max 3 lines)
│  extract value from communities while...        │
│                                                 │
│  @alice · 2h ago · s/philosophy                 │  Meta line
│                                                 │
│  7 stewards · 3 replies                         │  Stats line
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │           Hold to Tend                  │    │  Inline tend button
│  └─────────────────────────────────────────┘    │
│                                                 │
└─────────────────────────────────────────────────┘

Padding: 16px
Border: 1px bottom, border color
Background: surface (default), layer-tinted when gasping
```

### Navigation Behaviors

**Scroll Down = Dive Deeper**
- Natural scroll moves through layers
- Parallax: shallower layers move faster (0.5x)
- Background color subtly shifts with depth

**Pull Down at Surface = Refresh**
- Standard pull-to-refresh
- Fetches new Surface content

**Pull Up at Archive = Load More**
- Paginate older Archive content
- Show "Exploring deeper archives..."

**Tap Depth Rail Icon = Jump to Layer**
- Smooth scroll to layer header
- Haptic feedback on arrival

### Edge Cases

**E3.1: Empty Layer**
- Don't show empty layer headers
- Jump directly to next populated layer

**E3.2: Single Item in Layer**
- Still show layer header
- Content orphan is valid state

**E3.3: Content Moves Layers While Viewing**
- Content ages into next layer during session
- Don't move card visually during session
- Update on next refresh

**E3.4: Very Deep Archive**
- Paginate at 50 items per request
- Show "Load more from Archive" button
- Consider date-based bucketing for very old content

### Technical Requirements

```typescript
interface DepthFeedSection {
  layer: 'surface' | 'shallows' | 'deep' | 'archive';
  items: ContentItem[];
  totalCount: number;
  hasMore: boolean;
}

interface DepthFeedState {
  sections: DepthFeedSection[];
  currentLayer: string;
  scrollPosition: number;
  isRefreshing: boolean;
  isLoadingMore: boolean;
}

// Layer boundaries (in hours)
const LAYER_BOUNDARIES = {
  surface: { min: 0, max: 1 },
  shallows: { min: 1, max: 6 },
  deep: { min: 6, max: 24 },
  archive: { min: 24, max: Infinity },
};
```

---

## 4. Rescue Missions

### Overview

Rescue Missions are collaborative, real-time events where multiple users work together to save gasping content.

### User Stories

```
AS A user who cares about content
I WANT TO be notified when it's dying
SO THAT I can help save it

AS A rescuer
I WANT TO see others joining in real-time
SO THAT I feel part of a collective effort

AS A user with limited time
I WANT TO know if rescue is likely to succeed
SO THAT I can prioritize my contributions
```

### Rescue Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. CONTENT ENTERS GASPING STATE                            │
│     └─> survivalProbability drops below 0.2                 │
│     └─> Rescue window opens (60 seconds default)            │
│     └─> Notifications sent to previous stewards             │
│                                                             │
│  2. RESCUE MISSION ACTIVE                                   │
│     └─> Modal available from content or notification        │
│     └─> Real-time steward list updates                      │
│     └─> Progress bar shows collective contribution          │
│     └─> Countdown timer visible                             │
│                                                             │
│  3a. RESCUE SUCCEEDS                                        │
│     └─> Progress reaches 100% (enough breaths)              │
│     └─> Content returns to Fading state                     │
│     └─> All participants credited                           │
│     └─> Celebration animation                               │
│                                                             │
│  3b. RESCUE FAILS                                           │
│     └─> Countdown reaches 0                                 │
│     └─> Content dies                                        │
│     └─> "Returned to Earth" ceremony                        │
│     └─> Participants still credited for effort              │
│                                                             │
│  3c. USER CHOOSES "LET IT REST"                             │
│     └─> Graceful exit from rescue                           │
│     └─> No negative consequence                             │
│     └─> Philosophy: not everything should be saved          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Rescue Modal Design

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           ⚠️ RESCUE MISSION ACTIVE                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  "Why decentralization matters"                             │
│  by @alice                                                  │
│                                                             │
│  ● ○ ○ ○ ○  is gasping for breath!                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │    │
│  │ 67%                                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  5 stewards tending now...    Need 12 more seconds         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ @alice is tending... ●●●                            │    │
│  │ @bob is tending... ●●                               │    │
│  │ @carol is tending... ●●●●                           │    │
│  │ @dave just joined!                                  │    │
│  │ @eve is tending... ●●                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│                    ⏱️ 34s remaining                         │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │    Join Rescue       │  │    Let it rest       │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                             │
│  Not all content needs saving. Choose wisely.              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Real-Time Updates

**WebSocket Events:**

```typescript
// Steward joins rescue
{
  type: 'rescue:steward_joined',
  contentId: string,
  steward: {
    address: string,
    joinedAt: number,
  }
}

// Steward contributes breath
{
  type: 'rescue:breath_contributed',
  contentId: string,
  steward: string,
  breathsAdded: number,
  totalBreaths: number,
  percentComplete: number,
}

// Rescue outcome
{
  type: 'rescue:complete',
  contentId: string,
  success: boolean,
  totalStewards: number,
  totalBreaths: number,
}
```

### Rescue Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Window Duration | 60s | Time before content dies |
| Target Breaths | 30s | Breaths needed to stabilize |
| Min Stewards | 1 | Can succeed solo |
| Max Visible Stewards | 5 | Show "+N more" after |
| Notification Delay | 5s | Wait before alerting |

### Edge Cases

**E4.1: Rescue Completes While Mining**
- If progress hits 100% while user is still mining, complete their contribution
- Show "Rescue succeeded! Your breath helped."
- Credit full contribution to stewardship

**E4.2: Multiple Simultaneous Rescues**
- User can only participate in one rescue at a time
- If multiple alerts, show count: "3 thoughts gasping"
- Let user choose which to rescue

**E4.3: Content Creator Joins Rescue**
- Creator can rescue their own content
- No special treatment, same contribution required
- Shows "Creator is tending" in steward list

**E4.4: Very Popular Content**
- If many stewards join, rescue completes quickly
- Consider "overflow" breaths going to buffer
- Celebrate with larger animation

**E4.5: No One Joins**
- Content can die with zero rescue attempts
- This is acceptable - natural selection
- Don't guilt users about unrescued content

### Success/Failure Ceremonies

**Success Animation:**
```
1. Progress bar fills with glow
2. All steward dots pulse simultaneously
3. Content card blooms outward briefly
4. "Rescued!" text with confetti particles
5. Steward list transforms to "Wall of Stewards"
6. Modal closes after 3 seconds
```

**Failure Animation:**
```
1. Countdown reaches 0 with final pulse
2. Progress bar fades to gray
3. Content preview dims and shrinks
4. "Returned to Earth" text fades in
5. Steward list shows "Thank you for trying"
6. Brief pause, then modal closes
```

### Technical Requirements

```typescript
interface RescueMission {
  contentId: string;
  contentTitle: string;
  contentAuthor: string;
  startedAt: number;
  expiresAt: number;
  targetBreaths: number;
  currentBreaths: number;
  activeStewards: RescueSteward[];
  status: 'active' | 'succeeded' | 'failed';
}

interface RescueSteward {
  address: string;
  breathsContributed: number;
  joinedAt: number;
  isCurrentUser: boolean;
}

interface RescueWebSocket {
  connect(contentId: string): void;
  disconnect(): void;
  onStewardJoined(callback: (steward: RescueSteward) => void): void;
  onProgressUpdate(callback: (progress: number) => void): void;
  onComplete(callback: (success: boolean) => void): void;
}
```

---

## 5. Compose Ritual

### Overview

The Compose Ritual reframes content creation as a deliberate, costly act that requires reflection.

### User Stories

```
AS A user with something to say
I WANT TO understand the cost before committing
SO THAT I only post what's worth others' effort

AS A user during mining
I WANT TO reflect on my contribution
SO THAT the wait feels meaningful, not frustrating

AS A user who changes their mind
I WANT TO cancel before mining completes
SO THAT I'm not locked into posting
```

### Compose Flow

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. ENTER COMPOSE                                           │
│     └─> From: FAB, space header, or reply button            │
│     └─> Show space context if applicable                    │
│     └─> Show "replyTo" preview if reply                     │
│                                                             │
│  2. WRITE CONTENT                                           │
│     └─> Title field (posts only, not replies)               │
│     └─> Body field with character count                     │
│     └─> Real-time cost estimate updates                     │
│                                                             │
│  3. REVIEW COST                                             │
│     └─> Mining time estimate                                │
│     └─> Battery usage estimate                              │
│     └─> Initial breath allocation                           │
│     └─> "Is this worth others' effort?"                     │
│                                                             │
│  4. BEGIN MINING                                            │
│     └─> Tap "Begin Mining" button                           │
│     └─> Transition to mining meditation screen              │
│                                                             │
│  5. MINING MEDITATION                                       │
│     └─> Calming animation                                   │
│     └─> Progress indicator                                  │
│     └─> Rotating reflection prompts                         │
│     └─> Cancel button available                             │
│                                                             │
│  6. COMPLETE                                                │
│     └─> Content submitted to network                        │
│     └─> Confirmation with initial breath state              │
│     └─> Return to previous screen                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Compose Screen Design

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Begin a New Thought                          [X]           │
│  ═══════════════════                                        │
│                                                             │
│  Posting to: s/philosophy                                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Title                                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │ What do you want to say?                            │    │
│  │                                                     │    │
│  │ Remember: this will require effort from             │    │
│  │ others to survive.                                  │    │
│  │                                                     │    │
│  │                                                     │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                              247 / 2000     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  The Cost of Creation                               │    │
│  │  ─────────────────────                              │    │
│  │  ⚡ ~2% battery                                     │    │
│  │  ⏱️ ~30 seconds of mining                           │    │
│  │  🌱 Starts with 60s of breath                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Begin Mining →                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Mining Meditation Screen

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                                                             │
│                        ∿∿∿∿∿∿∿∿∿                            │
│                                                             │
│                  Your thought is forming                    │
│                                                             │
│                     ◯────────●                              │
│                     18 seconds                              │
│                                                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │  While you wait, consider:                          │    │
│  │                                                     │    │
│  │  "Is this worth others' effort                      │    │
│  │   to keep alive?"                                   │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│                                                             │
│                   [Cancel Creation]                         │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Reflection Prompts

Rotate every 8 seconds during mining:

```typescript
const REFLECTION_PROMPTS = [
  "Is this worth others' effort to keep alive?",
  "What would this add to the conversation?",
  "Would you tend to this if someone else posted it?",
  "Take a breath. Your thought is taking shape.",
  "Good content is worth the wait.",
  "The community will decide if this survives.",
  "What do you hope others take from this?",
  "Clarity over cleverness.",
];
```

### Content Limits

| Field | Limit | Notes |
|-------|-------|-------|
| Title | 120 chars | Required for posts, none for replies |
| Body | 2000 chars | Required |
| Min Body | 10 chars | Prevent empty posts |

### Cost Estimates

```typescript
interface PostCost {
  miningTimeMs: number;     // Based on difficulty
  batteryPercent: number;   // Rough estimate
  initialBreaths: number;   // Starting survival time
}

function estimatePostCost(
  contentLength: number,
  isReply: boolean
): PostCost {
  const difficulty = isReply ? 10 : 12;
  const baseTime = Math.pow(2, difficulty) * 50; // ms
  const battery = (baseTime / 30000) * 5; // ~5% per 30s
  const initialBreaths = 60; // Always starts with 60s

  return {
    miningTimeMs: baseTime,
    batteryPercent: Math.round(battery * 10) / 10,
    initialBreaths,
  };
}
```

### Edge Cases

**E5.1: Cancel During Mining**
- Show confirmation: "Cancel this thought?"
- If confirmed, stop mining immediately
- No content created, no cost incurred
- Return to compose screen with content preserved

**E5.2: App Backgrounded During Mining**
- Mining continues in native module
- On return, show completion or current progress
- If app killed, mining lost (show explanation on next open)

**E5.3: Network Error on Submit**
- Mining completes successfully
- Submit fails
- Cache locally, retry automatically
- Show "Will post when online"

**E5.4: Content Too Short**
- Disable "Begin Mining" button
- Show "Add more to your thought"
- Min 10 characters for body

**E5.5: Reply to Dying Content**
- Allow reply even if parent is gasping
- Reply success doesn't save parent
- Show warning: "Note: parent thought is gasping"

---

## 6. Stewardship Profile

### Overview

The Stewardship Profile replaces traditional follower/karma metrics with stewardship-focused statistics.

### User Stories

```
AS A user viewing my profile
I WANT TO see my contribution history
SO THAT I understand my impact on the community

AS A user viewing another's profile
I WANT TO see their stewardship record
SO THAT I can understand what they care about

AS A content creator
I WANT TO see my garden's health
SO THAT I know which of my content is thriving
```

### Profile Sections

#### 6.1 Header

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                        @alice                               │
│                  0x1234...5678                              │
│                                                             │
│              Steward since March 2024                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 6.2 Your Garden

Content the user has created, organized by current state:

```
┌─────────────────────────────────────────────────────────────┐
│  Your Garden                                                │
│  ───────────                                                │
│                                                             │
│  🏛️ 12 posts reached The Archive                            │
│  🦑  8 currently in The Deep                                │
│  🐚  5 in the Shallows                                      │
│  🌊  3 at Surface (new)                                     │
│  🍂 47 returned to earth                                    │
│                                                             │
│  ┌───────────────────────────────────────────────────┐      │
│  │ Living Thoughts                                   │      │
│  │ ─────────────                                     │      │
│  │ ●●●●○ Why decentralization...                     │      │
│  │ ●●●○○ The problem with algo...                    │      │
│  │ ●●○○○ Consider this approach...                   │      │
│  │                        [View All]                 │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 6.3 Tending Stats

```
┌─────────────────────────────────────────────────────────────┐
│  Tending Stats                                              │
│  ────────────                                               │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    💨       │  │    🚨       │  │    ✨       │         │
│  │   2,847     │  │     34      │  │     28      │         │
│  │  Breaths    │  │  Rescues    │  │  Rescues    │         │
│  │   given     │  │   joined    │  │  succeeded  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐                                           │
│  │    🌿       │                                           │
│  │    412      │                                           │
│  │   Unique    │                                           │
│  │   tended    │                                           │
│  └─────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 6.4 Space Affinity

```
┌─────────────────────────────────────────────────────────────┐
│  Spaces You Tend                                            │
│  ──────────────                                             │
│                                                             │
│  s/philosophy     ●●●●●                                     │
│  s/rust           ●●●●○                                     │
│  s/music          ●●●○○                                     │
│  s/startups       ●●○○○                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Stats Calculations

```typescript
interface StewardshipStats {
  // Garden
  gardenCounts: {
    archive: number;
    deep: number;
    shallows: number;
    surface: number;
    returned: number;
  };

  // Tending
  totalBreathsGiven: number;     // Sum of all contributions
  rescuesJoined: number;         // Rescue missions participated in
  rescuesSucceeded: number;      // Successful rescues
  uniqueContentTended: number;   // Distinct content pieces

  // Derived
  rescueSuccessRate: number;     // succeeded / joined
  avgBreathsPerTend: number;     // total / unique

  // Space affinity
  topSpaces: {
    spaceId: string;
    breathsGiven: number;
    strength: number; // Normalized 0-1
  }[];
}
```

### Edge Cases

**E6.1: New User (No History)**
- Show encouraging empty states
- "Your garden is waiting to be planted"
- "Start tending to build your stewardship"

**E6.2: Very Active User**
- Paginate garden items (max 20 per section)
- Summarize stats with "K" notation (2.8K breaths)
- Show top 5 spaces only, with "View all" link

**E6.3: Viewing Others' Profiles**
- Can see their garden and public stats
- Cannot see their exact contribution amounts (privacy)
- Show: "Steward of 412 thoughts"

---

## 7. Space Ecosystems

### Overview

Spaces are communities with their own ecosystem health, based on collective content survival.

### Space Health Metrics

```typescript
interface SpaceHealth {
  spaceId: string;
  name: string;

  // Vitality
  livingThoughts: number;       // Content still alive
  gaspingThoughts: number;      // In rescue-needed state
  archivedToday: number;        // Reached archive in 24h

  // Activity
  activeStewards: number;       // Tended in last hour
  breathsToday: number;         // Total contributions today

  // Computed
  healthScore: number;          // 0-100
  healthTrend: 'growing' | 'stable' | 'declining';
}
```

### Space View Design

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  s/philosophy                                               │
│  ═══════════                                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Ecosystem Health                                   │    │
│  │  ────────────────                                   │    │
│  │                                                     │    │
│  │  ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿                      │    │
│  │  Thriving                                           │    │
│  │                                                     │    │
│  │  142 living thoughts                                │    │
│  │  23 gasping (need help)                             │    │
│  │  8 reached Archive today                            │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Active Stewards: 47                                │    │
│  │  ────────────────                                   │    │
│  │  @alice ●●●●● (most active)                         │    │
│  │  @bob ●●●●                                          │    │
│  │  @carol ●●●                                         │    │
│  │  + 44 more                                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌───────────────────┐  ┌───────────────────┐              │
│  │  View Thoughts    │  │  Needs Tending    │              │
│  └───────────────────┘  └───────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### "Needs Tending" Tab

Special filtered view showing only gasping content in the space:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🚨 Needs Tending in s/philosophy                          │
│                                                             │
│  These thoughts are gasping. Consider helping.             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ●○○○○ "The ethics of AI alignment"                  │    │
│  │ 12s remaining · 2 stewards helping                  │    │
│  │ [Join Rescue]                                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ●○○○○ "Why virtue ethics matters"                   │    │
│  │ 34s remaining · 0 stewards helping                  │    │
│  │ [Join Rescue]                                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Notification System

### Overview

Tidal uses notifications sparingly and meaningfully, focused on stewardship rather than engagement.

### Notification Types

| Type | Trigger | Frequency Limit |
|------|---------|-----------------|
| **Rescue Alert** | Content you tended is gasping | Max 5/day |
| **Garden Alert** | Your content is gasping | Immediate |
| **Archive Celebration** | Your content reached Archive | Immediate |
| **Rescue Success** | Rescue you joined succeeded | Immediate |
| **Space Digest** | Weekly summary of tended spaces | Weekly |

### Notification Design

```
┌─────────────────────────────────────────────────────────────┐
│  🚨 Rescue Alert                                            │
│                                                             │
│  A thought you tended is gasping:                          │
│  "Why decentralization matters"                             │
│                                                             │
│  [View] [Let it rest]                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🏛️ Archive Celebration                                     │
│                                                             │
│  Your thought reached The Archive!                         │
│  "The problem with algorithmic feeds"                       │
│                                                             │
│  17 stewards helped it survive.                            │
│                                                             │
│  [View Journey]                                            │
└─────────────────────────────────────────────────────────────┘
```

### Notification Settings

```
┌─────────────────────────────────────────────────────────────┐
│  Notification Preferences                                   │
│                                                             │
│  Rescue Alerts                                              │
│  Content you've tended needs help                          │
│  [On] ○────────● [Off]                                     │
│  Max per day: [5 ▼]                                        │
│                                                             │
│  Garden Alerts                                              │
│  Your own content needs help                               │
│  [On] ●────────○ [Off]                                     │
│                                                             │
│  Celebrations                                               │
│  Archive achievements                                       │
│  [On] ●────────○ [Off]                                     │
│                                                             │
│  Weekly Digest                                              │
│  Summary of your spaces                                    │
│  [On] ●────────○ [Off]                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Onboarding Flow

### Overview

Onboarding introduces the core concepts of Tidal while creating the user's identity.

### Flow Steps

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  STEP 1: PHILOSOPHY INTRO                                   │
│                                                             │
│  "Welcome to Tidal"                                        │
│                                                             │
│  Here, content lives and dies.                             │
│                                                             │
│  Every post is born with a lifespan.                       │
│  Without care, it fades away.                              │
│                                                             │
│  Your attention has weight here.                           │
│                                                             │
│  [Continue]                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  STEP 2: TENDING CONCEPT                                    │
│                                                             │
│  "Tending, not Liking"                                     │
│                                                             │
│  To keep content alive, you tend to it.                    │
│                                                             │
│  Hold to contribute your device's energy.                  │
│  Watch breath flow into what you care about.               │
│                                                             │
│  [Interactive demo: try holding]                           │
│                                                             │
│  [Continue]                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  STEP 3: IDENTITY CREATION                                  │
│                                                             │
│  "Create Your Identity"                                    │
│                                                             │
│  Your identity is a cryptographic keypair.                 │
│  No email, no password, no tracking.                       │
│                                                             │
│  This requires a one-time proof of work.                   │
│  About 30 seconds of mining.                               │
│                                                             │
│  [Create Identity]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  STEP 4: MINING IDENTITY                                    │
│                                                             │
│  "Forging Your Identity"                                   │
│                                                             │
│              ∿∿∿∿∿∿∿∿∿                                      │
│                                                             │
│         Your identity is taking shape                      │
│                                                             │
│              ◯─────────●                                   │
│              24 seconds                                    │
│                                                             │
│  This one-time cost ensures you're human.                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  STEP 5: SPACE SELECTION                                    │
│                                                             │
│  "Find Your Communities"                                   │
│                                                             │
│  Spaces are communities you'll tend.                       │
│  Select a few to get started:                              │
│                                                             │
│  ○ s/philosophy                                            │
│  ○ s/technology                                            │
│  ○ s/creative                                              │
│  ○ s/local                                                 │
│  ○ s/science                                               │
│                                                             │
│  [Continue with 3 selected]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  STEP 6: COMPLETE                                           │
│                                                             │
│  "You're Ready"                                            │
│                                                             │
│  Your identity: @0x1234...5678                             │
│                                                             │
│  Remember:                                                 │
│  • Content breathes - watch for gasping                    │
│  • Hold to tend - give your attention weight               │
│  • Rescue together - save what matters                     │
│  • Let go gracefully - not everything survives             │
│                                                             │
│  [Enter Tidal]                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Settings & Preferences

### Settings Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Identity                                           │    │
│  │  ─────────                                          │    │
│  │  Address: 0x1234...5678            [Copy]           │    │
│  │  Created: March 2024                                │    │
│  │  [Export Seed Phrase]                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Node Connection                                    │    │
│  │  ───────────────                                    │    │
│  │  Status: Connected ●                                │    │
│  │  Node: localhost:3030                               │    │
│  │  [Change Node]                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Notifications                                      │    │
│  │  ─────────────                                      │    │
│  │  [Configure →]                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Appearance                                         │    │
│  │  ──────────                                         │    │
│  │  Theme: [System ▼]                                  │    │
│  │  Reduce Motion: [Off]                               │    │
│  │  Haptic Feedback: [On]                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Battery & Performance                              │    │
│  │  ─────────────────────                              │    │
│  │  Mining Intensity: [Balanced ▼]                     │    │
│  │  Background Mining: [Off]                           │    │
│  │  Low Battery Mode: [Auto]                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  About Tidal                                        │    │
│  │  ───────────                                        │    │
│  │  Version: 1.0.0                                     │    │
│  │  [View Philosophy]                                  │    │
│  │  [Open Source Licenses]                             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Danger Zone                                        │    │
│  │  ───────────                                        │    │
│  │  [Export All Data]                                  │    │
│  │  [Delete Identity]                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Mining Intensity Options

| Setting | Description | Battery Impact |
|---------|-------------|----------------|
| **Efficient** | Slower mining, less heat | Low |
| **Balanced** | Default, reasonable speed | Medium |
| **Performance** | Fastest mining | High |

### Low Battery Mode

When battery < 20%:
- Disable background mining
- Reduce animation frame rate
- Show warning before mining actions
- Can be overridden per-action

---

## Appendix: Component Inventory

### New Components Required

| Component | Priority | Status |
|-----------|----------|--------|
| BreathIndicator | P0 | ✅ Built |
| TendGesture | P0 | ✅ Built |
| DepthFeed | P0 | ✅ Built |
| RescueMission | P0 | ✅ Built |
| StewardshipProfile | P1 | ✅ Built |
| ComposeRitual | P0 | Needs update |
| SpaceEcosystem | P1 | Not started |
| OnboardingFlow | P1 | Not started |
| NotificationCard | P2 | Not started |
| SettingsScreen | P2 | Not started |

### Existing Components to Modify

| Component | Changes Needed |
|-----------|----------------|
| ThreadCard | Add BreathIndicator, TendGesture |
| ThreadList | Replace with DepthFeed |
| HomeScreen | Integrate depth navigation |
| ComposeScreen | Add mining meditation |

---

*Document version 1.0*
*Last updated: January 2026*
