# Archiver Client

The Archiver Client helps preserve valuable content from decay by monitoring at-risk posts and optionally auto-engaging to keep them alive.

## Features

- **Content Monitoring**: Track posts approaching decay threshold
- **Survival Prediction**: Calculate probability of content survival
- **Auto-Engage Engine**: Prioritized engagement to save valuable content
- **Local Archive**: IndexedDB storage for offline access to archived content
- **Budget Management**: Daily PoW budget with automatic reset at UTC midnight

## Decay Mechanics (SPEC_02)

Content heat decays over time following the formula:

```
survival = 0.5^(effectiveDecayTime / HALF_LIFE_SECONDS)

where:
  effectiveDecayTime = max(0, timeSinceEngagement - DECAY_FLOOR_SECONDS)
  DECAY_FLOOR_SECONDS = 172,800 (48 hours)
  HALF_LIFE_SECONDS = 604,800 (7 days)
  DECAY_THRESHOLD = 0.0625 (6.25%)
```

**Key Constants:**
- 48-hour decay floor: No decay for first 48 hours after engagement
- 7-day half-life: Heat halves every 7 days after decay floor
- 6.25% threshold: Content below this is considered "at risk"

## Architecture

```
┌─────────────────────────────────────────────┐
│              Archiver Dashboard              │
└──────────────────────┬──────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│ Content Monitor │         │ Archive Storage │
│  (Survival Calc)│         │   (IndexedDB)   │
└────────┬────────┘         └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Auto-Engage     │
│    Engine       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Swimchain API │
│ (PoW + Submit)  │
└─────────────────┘
```

## Content Priority Algorithm

The auto-engage engine prioritizes content using weighted factors:

```typescript
priority = heatUrgency * 0.5 + replyValue * 0.3 + poolProgress * 0.2

where:
  heatUrgency = max(0, (threshold - heat) / threshold)  // 0-1
  replyValue = min(1, log10(replyCount + 1) / 3)        // 0-1
  poolProgress = currentSeconds / requiredSeconds       // 0-1
```

Higher priority = more urgent need for engagement.

## Budget Management

- **Daily Budget**: Configurable PoW seconds per day
- **UTC Reset**: Budget resets at 00:00 UTC
- **Reserve**: Keeps 10% reserve for emergency preservation
- **Tracking**: Shows budget used vs remaining

## Urgency Classification

| Survival | Classification | Description |
|----------|---------------|-------------|
| > 20%    | low           | Safe, no action needed |
| 10-20%   | medium        | Monitor closely |
| 5-10%    | high          | Engage soon |
| < 5%     | critical      | Immediate action required |

## Archive Storage

Uses IndexedDB with:
- **Quota Enforcement**: Configurable max entries (default: 1000)
- **Full-Text Search**: Search archived content
- **Export**: Download archive as JSON
- **Automatic Pruning**: Oldest entries removed when quota exceeded

## Configuration

### Monitoring Settings

- **Watch Spaces**: Specific spaces to monitor (empty = all)
- **Heat Threshold**: Archive content below this heat level (default: 5%)
- **Auto-Engage Threshold**: Engage when heat drops below (default: 10%)

### Auto-Engage Settings

- **Enable Auto-Engage**: Toggle automatic engagement
- **Daily PoW Budget**: Max seconds per day (default: 3600)
- **Min Priority**: Only engage if priority > this value

## Running

```bash
cd archiver-client
npm install
npm run dev
```

Opens at http://localhost:5177

## Pages

- **Dashboard**: Overview with at-risk content and budget meter
- **Archived Content**: Browse and search archived posts
- **Settings**: Configure monitoring and auto-engage behavior
