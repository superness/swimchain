# Tidal: A Novel Social Media UX for Swimchain

## Core Concept: The Living Feed

Traditional social media treats content as static objects you scroll past. Tidal reimagines content as **living entities** that breathe, pulse, and eventually die - unless the community keeps them alive.

The central metaphor is **tending** - you don't "like" content, you **tend to it**, investing real computational effort to keep what matters alive.

---

## 1. The Breath Indicator

Every piece of content has a visible "breath" - a subtle pulsing animation that shows its life state.

```
┌─────────────────────────────────────────┐
│  ○ ○ ○ ○ ○ ● ● ● ● ●                   │  ← Breath dots
│                                         │
│  Why decentralization matters           │
│  by @alice · 2h ago                     │
│                                         │
│  The key insight is that...             │
│                                         │
│  ∿∿∿∿∿∿∿∿∿∿∿                            │  ← Life wave (animated)
│  23 breaths remaining                   │
│                                         │
│  [Tend 5s] [Tend 15s] [Tend 30s]        │
└─────────────────────────────────────────┘
```

**Breath States:**
- **Strong (●●●●●)**: Full dots, fast pulse, vibrant colors
- **Steady (●●●○○)**: Medium pulse, content slightly desaturated
- **Fading (●●○○○)**: Slow pulse, content becoming translucent
- **Gasping (●○○○○)**: Irregular pulse, red tint, urgent
- **Final Breath (○○○○○)**: Single slow pulse, nearly invisible

The breath is **not a number** - it's a felt sense. Users learn to read vitality intuitively.

---

## 2. The Depth Feed

Instead of infinite scroll, Tidal uses **depth** as the organizing principle.

```
Surface (Now)
    │
    ▼
┌─────────────────────────────────────┐
│  🌊 SURFACE - Fresh Content         │  ← Newest, needs first tending
│  ════════════════════════════════   │
│                                     │
│  [New post] [New post] [New post]   │
│                                     │
└─────────────────────────────────────┘
    │
    ▼ Swipe down to dive deeper
┌─────────────────────────────────────┐
│  🐚 SHALLOWS - Finding Footing      │  ← 1-6 hours old, establishing
│  ────────────────────────────────   │
│                                     │
│  Posts that have received some      │
│  tending but need more to survive   │
│                                     │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  🦑 THE DEEP - Proven Survivors     │  ← 6h-24h, community-validated
│  ────────────────────────────────   │
│                                     │
│  Content the community has kept     │
│  alive through sustained effort     │
│                                     │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  🏛️ THE ARCHIVE - Permanent         │  ← 24h+, achieved permanence
│  ════════════════════════════════   │
│                                     │
│  Content that survived long enough  │
│  to be considered worth preserving  │
│                                     │
└─────────────────────────────────────┘
```

**Key Insight**: Content doesn't just get older - it gets **deeper**. Depth represents earned permanence through collective effort.

---

## 3. Tending Interactions

### 3.1 The Tend Gesture

Instead of tapping a heart, users perform a **hold-and-breathe** gesture:

```
┌─────────────────────────────────────────┐
│                                         │
│         ╭───────────────────╮           │
│         │                   │           │
│         │   Hold to Tend    │           │
│         │                   │           │
│         │   ◯ ──────▶ ●     │           │
│         │                   │           │
│         │   5s  15s  30s    │           │
│         │                   │           │
│         ╰───────────────────╯           │
│                                         │
│  As you hold, your device mines PoW.    │
│  The longer you hold, the more breath   │
│  you give.                              │
│                                         │
└─────────────────────────────────────────┘
```

**The Experience:**
1. User holds finger on content
2. Phone begins mining (gentle vibration feedback)
3. Visual: ripples emanate from touch point
4. Audio: soft breathing sound syncs with mining progress
5. The content's breath indicator visibly strengthens
6. Release when satisfied (or when target reached)

**Why This Works**: The physical act of holding creates emotional investment. You're literally giving your device's energy (battery) to keep something alive.

### 3.2 Tending History

Every piece of content shows its **stewardship lineage**:

```
┌─────────────────────────────────────────┐
│  Kept alive by:                         │
│                                         │
│  @alice ●●●●● (first breath, 2h ago)    │
│  @bob ●●● (sustained, 1h ago)           │
│  @carol ●● (rescue, 30m ago)            │
│  You could be next...                   │
│                                         │
│  Total: 47 breaths from 12 stewards     │
└─────────────────────────────────────────┘
```

---

## 4. The Rescue Mission

When content enters its "gasping" state, Tidal triggers a **Rescue Mission** - a collaborative real-time experience.

```
┌─────────────────────────────────────────┐
│  ⚠️ RESCUE MISSION ACTIVE               │
│                                         │
│  "Why decentralization matters"         │
│  is gasping for breath!                 │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │    │
│  │  3 stewards tending now...      │    │
│  │  Need 15 more seconds of breath │    │
│  └─────────────────────────────────┘    │
│                                         │
│  @alice is tending... ●●●               │
│  @bob is tending... ●●                  │
│  @carol is tending... ●●●●              │
│                                         │
│  [Join Rescue] [Let it rest]            │
│                                         │
└─────────────────────────────────────────┘
```

**Mechanics:**
- Multiple users can tend simultaneously
- Progress bar fills with combined effort
- Names appear in real-time as others join
- Creates urgency and community bonding
- If rescue fails, content fades with dignity

**The "Let it rest" option** is crucial - not all content should be saved. Users can consciously choose to let something go.

---

## 5. The Compose Ritual

Creating content is reframed as a **ritual** with visible costs:

```
┌─────────────────────────────────────────┐
│  Begin a New Thought                    │
│  ═══════════════════                    │
│                                         │
│  Space: s/philosophy                    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Title                           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │ What do you want to say?        │    │
│  │                                 │    │
│  │ Remember: this will require     │    │
│  │ effort from others to survive.  │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  The Cost of Creation           │    │
│  │  ─────────────────────          │    │
│  │  ⚡ ~2% battery                  │    │
│  │  ⏱️ ~30 seconds of mining        │    │
│  │  🌱 Starts with 60s of breath   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Cancel] [Begin Mining →]              │
│                                         │
└─────────────────────────────────────────┘
```

### The Mining Meditation

While mining, show a **contemplative screen**:

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│              ∿∿∿∿∿∿∿∿∿                   │
│                                         │
│         Your thought is forming         │
│                                         │
│              ◯ ───▶ ●                   │
│              23 seconds                 │
│                                         │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  While you wait, consider:      │    │
│  │                                 │    │
│  │  "Is this worth others'         │    │
│  │   effort to keep alive?"        │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│           [Cancel Creation]             │
│                                         │
└─────────────────────────────────────────┘
```

**The prompts rotate:**
- "Is this worth others' effort to keep alive?"
- "What would this add to the conversation?"
- "Would you tend to this if someone else posted it?"
- "Take a breath. Your thought is taking shape."

---

## 6. Stewardship Profile

Instead of followers/following, users have a **Stewardship Profile**:

```
┌─────────────────────────────────────────┐
│  @alice                                 │
│  ════════                               │
│                                         │
│  Steward since March 2024               │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Your Garden                    │    │
│  │  ─────────────                  │    │
│  │                                 │    │
│  │  🌳 12 posts reached The Deep   │    │
│  │  🌿 8 currently in Shallows     │    │
│  │  🌱 3 at Surface (new)          │    │
│  │  🍂 47 returned to earth        │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Tending Stats                  │    │
│  │  ─────────────                  │    │
│  │                                 │    │
│  │  Breaths given: 2,847           │    │
│  │  Rescues joined: 34             │    │
│  │  Rescues succeeded: 28          │    │
│  │  Unique posts tended: 412       │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Spaces You Tend                │    │
│  │  ───────────────                │    │
│  │                                 │    │
│  │  s/philosophy ●●●●●             │    │
│  │  s/rust ●●●●                    │    │
│  │  s/music ●●●                    │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Key Metrics:**
- **Breaths Given**: Total PoW contributed to others' content
- **Rescues Joined/Succeeded**: Collaborative saves participated in
- **Garden Health**: The lifecycle of your own content
- **Tending Affinity**: Which spaces you invest in most

---

## 7. The Letting Go Ritual

When content finally dies, Tidal marks it with dignity:

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │      This thought has          │    │
│  │      returned to earth         │    │
│  │                                 │    │
│  │      ─────────────────         │    │
│  │                                 │    │
│  │  "Why decentralization..."     │    │
│  │                                 │    │
│  │  Lived for: 4 hours, 23 min    │    │
│  │  Stewards: 7 people            │    │
│  │  Final depth: Shallows         │    │
│  │                                 │    │
│  │      ─────────────────         │    │
│  │                                 │    │
│  │  Its essence contributed to    │    │
│  │  the conversations it sparked. │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│            [View Replies]               │
│      (replies may still live)           │
│                                         │
└─────────────────────────────────────────┘
```

**Philosophy**: Death is not failure. Not all content should live forever. The system celebrates the cycle.

---

## 8. Fork as Divergence

When users fork content, it's visualized as a **path diverging**:

```
┌─────────────────────────────────────────┐
│  Original thought by @alice             │
│  ═══════════════════════                │
│                                         │
│  "Decentralization requires..."         │
│                                         │
│              │                          │
│              │                          │
│       ┌──────┴──────┐                   │
│       │             │                   │
│       ▼             ▼                   │
│  ┌─────────┐  ┌─────────┐              │
│  │ @alice  │  │ @bob    │              │
│  │ cont'd  │  │ fork    │              │
│  │ ●●●●●   │  │ ●●●     │              │
│  └─────────┘  └─────────┘              │
│                                         │
│  "Different paths exploring             │
│   the same root thought"                │
│                                         │
└─────────────────────────────────────────┘
```

Users can **follow the fork** - seeing how the same seed grew differently.

---

## 9. Space as Ecosystem

Spaces aren't just categories - they're **ecosystems** with their own health:

```
┌─────────────────────────────────────────┐
│  s/philosophy                           │
│  ═══════════                            │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Ecosystem Health               │    │
│  │  ────────────────               │    │
│  │                                 │    │
│  │  ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿     │    │
│  │  Thriving                       │    │
│  │                                 │    │
│  │  142 living thoughts            │    │
│  │  23 in rescue                   │    │
│  │  8 reached Archive today        │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Active Stewards: 47            │    │
│  │  ────────────────               │    │
│  │                                 │    │
│  │  @alice ●●●●● (top tender)      │    │
│  │  @bob ●●●●                      │    │
│  │  @carol ●●●                     │    │
│  │  + 44 more                      │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [View Thoughts] [Needs Tending]        │
│                                         │
└─────────────────────────────────────────┘
```

The **"Needs Tending"** tab shows content in that space that's gasping - encouraging community care.

---

## 10. Notification Philosophy

Tidal doesn't spam notifications. Instead, it sends **Stewardship Calls**:

```
┌─────────────────────────────────────────┐
│  🌿 Stewardship Call                    │
│                                         │
│  3 thoughts you tended are gasping.     │
│  Would you like to check on them?       │
│                                         │
│  [View Garden] [Later]                  │
└─────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────┐
│  🏛️ Archive Celebration                 │
│                                         │
│  Your thought "Why decentralization..." │
│  has reached The Archive!               │
│                                         │
│  17 stewards helped it survive.         │
│                                         │
│  [View Journey] [Share]                 │
└─────────────────────────────────────────┘
```

---

## 11. Visual Language

### Color Palette

| State | Color | Meaning |
|-------|-------|---------|
| Strong breath | Vibrant teal | Life, vitality |
| Steady | Soft blue | Calm, stable |
| Fading | Desaturated lavender | Uncertainty |
| Gasping | Warm amber | Urgency, warmth needed |
| Final | Pale gray | Acceptance |
| Archive | Deep gold | Achievement, permanence |

### Animation Principles

1. **Breathing**: All living content subtly pulses
2. **Ripples**: Tending creates ripples from touch point
3. **Fading**: Dying content doesn't disappear suddenly - it gracefully becomes translucent
4. **Depth**: Diving deeper has parallax, slight blur on shallower content
5. **Growth**: Successful rescues bloom outward

### Haptics

- **Mining**: Gentle, rhythmic pulse matching breath indicator
- **Rescue joined**: Strong tap as others join
- **Rescue success**: Celebratory pattern
- **Content death**: Soft fade-out vibration

---

## 12. Empty States

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│              🌱                         │
│                                         │
│      This space is quiet.               │
│                                         │
│      Be the first to plant              │
│      a thought here.                    │
│                                         │
│      [Begin a Thought]                  │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│              🍂                         │
│                                         │
│      Your garden is empty.              │
│                                         │
│      Your tending helps others'         │
│      thoughts survive. Explore          │
│      and find something worth           │
│      keeping alive.                     │
│                                         │
│      [Explore Surface]                  │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

---

## Implementation Notes

### Key Components to Build

1. **BreathIndicator** - Animated life state visualization
2. **DepthFeed** - Vertical navigation with depth layers
3. **TendGesture** - Hold-to-tend with mining integration
4. **RescueMission** - Real-time collaborative tending
5. **StewardshipProfile** - Garden and stats view
6. **ComposeRitual** - Mining meditation compose flow
7. **SpaceEcosystem** - Space health visualization
8. **ForkTree** - Divergence visualization

### Data Requirements

The RPC layer already supports:
- `survival_probability` → maps to breath state
- `last_engagement` → maps to pulse timing
- `contributor attribution` → maps to stewardship lineage
- `pools at risk` → maps to rescue missions

### Performance Considerations

- Breath animations should be GPU-accelerated
- Depth feed uses virtualization with prefetch
- Rescue missions use WebSocket for real-time updates
- Mining runs in native module (already implemented)

---

## Why This Works

1. **Transforms passive scrolling into active stewardship** - Users have agency and responsibility

2. **Makes the cost of content visible** - Both to create and to maintain

3. **Creates genuine community bonds** - Rescue missions are shared experiences

4. **Respects content death** - Not everything should live forever, and that's okay

5. **Aligns incentives** - Only content worth effort survives, naturally filtering quality

6. **Differentiates from all other platforms** - No likes, no infinite scroll, no algorithmic manipulation

---

## Appendix: Interaction Glossary

| Traditional | Tidal |
|-------------|-------|
| Like/Upvote | Tend |
| Feed | Depth |
| Trending | Gasping (needs help) |
| Archive | The Deep / The Archive |
| Profile | Garden |
| Followers | - (not applicable) |
| Karma | Breaths Given |
| Post | Thought |
| Delete | Let it Rest |
