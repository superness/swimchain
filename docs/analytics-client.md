# Analytics Client

The Analytics Client provides real-time monitoring of network health and space metrics for Swimchain.

## Features

- **Network Health Score**: Aggregate health metric (0-100)
- **Space Metrics**: Per-space statistics and heat distribution
- **Heat Histograms**: Visual distribution of content heat
- **Alert System**: Configurable alerts for health issues
- **Historical Tracking**: 24-hour health history with sparklines

## Health Score Formula (SPEC_09)

The network health score is calculated from four components:

```typescript
function calculateHealthScore(
  activeSwimmers: number,
  postsAtRisk: number,
  lastSyncAgeMinutes: number,
  avgHeat: number
): number {
  // Swimmer score: up to 30 points (10+ swimmers = full score)
  const swimmerScore = Math.min(30, (activeSwimmers / 10) * 30);

  // Risk score: 30 points if < 5 at-risk, decreases after
  const riskScore = postsAtRisk < 5 ? 30 : Math.max(0, 30 - postsAtRisk);

  // Sync score: 20 points if sync < 5 minutes old
  const syncScore = lastSyncAgeMinutes < 5 ? 20 : 0;

  // Heat score: up to 20 points based on average heat
  const heatScore = (avgHeat / 100) * 20;

  return Math.min(100, swimmerScore + riskScore + syncScore + heatScore);
}
```

## Health Status Categories

| Score | Status | Description |
|-------|--------|-------------|
| 80-100 | Healthy | Network is functioning well |
| 60-79 | Degraded | Some issues, monitor closely |
| 40-59 | Degraded | Multiple issues present |
| 0-39 | Unhealthy | Critical issues requiring attention |

## Architecture

```
┌─────────────────────────────────────────────┐
│            Analytics Dashboard               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Health  │ │ Metrics │ │ Alerts  │       │
│  │ Gauge   │ │ Cards   │ │ Banner  │       │
│  └─────────┘ └─────────┘ └─────────┘       │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
            ┌─────────────────┐
            │ Metrics         │
            │ Collector       │
            └────────┬────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Network Stats   │     │  Space Stats    │
│    (polled)     │     │   (polled)      │
└─────────────────┘     └─────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ Swimchain API │
            └─────────────────┘
```

## Heat Distribution

Heat values are bucketed into 10 ranges (0-10%, 10-20%, ..., 90-100%) for histogram display:

| Range | Color | Meaning |
|-------|-------|---------|
| 0-30% | Red shades | At risk, needs engagement |
| 30-60% | Yellow/Orange | Moderate, monitoring |
| 60-100% | Green shades | Healthy, well-engaged |

## Alert System

Alerts are triggered when:

| Alert Type | Threshold | Severity |
|------------|-----------|----------|
| Low Swimmers | < 3 active | Warning |
| High Risk Posts | > 20 posts | Critical |
| Stale Sync | > 15 minutes | Warning |
| Low Average Heat | < 20% | Warning |

## Configuration

### General Settings

- **Enable Collection**: Toggle metrics polling
- **Poll Interval**: Seconds between fetches (default: 30)
- **Enable Alerts**: Show/hide alert notifications
- **Show Advanced**: Display detailed metrics

### Watched Spaces

Add specific space IDs to monitor, or leave empty to monitor all accessible spaces.

## Data Retention

- **History Points**: Last 288 points (24 hours at 5-minute intervals)
- **Space Cache**: Up to 100 spaces
- **Recent Posts**: Last 50 posts per space

## Running

```bash
cd analytics-client
npm install
npm run dev
```

Opens at http://localhost:5178

## Pages

- **Dashboard**: Health gauge, metrics cards, heat histogram, watched spaces
- **Spaces**: List of all monitored spaces with metrics
- **Space Detail**: Deep dive into single space metrics
- **Settings**: Configure collection and watched spaces
