# Analytics Client - Client Documentation

## Overview

The **Swimchain Analytics Client** is a specialized read-only dashboard for monitoring Swimchain network health, space metrics, and content decay status. It provides real-time visualization of network statistics based on the SPEC_09 health score formula.

**Target Users**: Network operators, node administrators, and developers who need to monitor network health and identify at-risk content.

**Key Capabilities**:
- Real-time network health monitoring with configurable polling
- SPEC_09-compliant health score calculation (swimmers/risk/sync/heat)
- Heat distribution visualization across spaces
- Threshold-based alert system with notifications
- 24-hour health history tracking and trend analysis
- Per-space detailed analytics and content status

## Quick Start

```bash
# Navigate to client directory
cd analytics-client

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

**Prerequisites**:
- Node.js >= 18.0.0
- Running Swimchain node at `localhost:3030`
- pnpm package manager

## Architecture

### Tech Stack
- **Framework**: React 18.2.0
- **Language**: TypeScript 5.3.0
- **Build Tool**: Vite 5.0.0
- **Styling**: CSS with CSS Custom Properties (design tokens)
- **State**: React Context + Singleton Service Pattern
- **Testing**: Vitest + Testing Library
- **Routing**: react-router-dom 6.x

### Directory Structure
```
src/
├── components/       # Reusable UI components
│   ├── AlertBanner.tsx
│   ├── ErrorBoundary.tsx
│   ├── HealthGauge.tsx
│   ├── HeatHistogram.tsx
│   ├── Loading.tsx
│   └── MetricCard.tsx
├── pages/            # Page components (routes)
│   ├── Dashboard.tsx
│   ├── Settings.tsx
│   ├── SpaceDetail.tsx
│   └── Spaces.tsx
├── hooks/            # Custom React hooks
│   ├── useMetrics.ts
│   └── useRpc.tsx
├── lib/              # Utilities and helpers
│   └── rpc.ts
├── services/         # Business logic services
│   └── MetricsCollector.ts
├── types/            # TypeScript type definitions
│   ├── constants.ts
│   └── index.ts
├── styles/           # Global styles
│   └── globals.css
├── App.tsx           # Main routing configuration
└── main.tsx          # Application entry point
```

### Application Bootstrap

The application initializes through a layered provider architecture:

```
React.StrictMode
└── ErrorBoundary
    └── SwimchainProvider (WASM initialization)
        └── RpcProvider (node connection)
            └── App (routing)
```

## Features

### Network Health Monitoring
**Description**: Real-time monitoring of overall network health using the SPEC_09 health score formula (0-100 scale).
**User Flow**:
1. App auto-connects to local Swimchain node
2. MetricsCollector starts polling network stats (default: 30s interval)
3. Health score calculated from four weighted components
4. HealthGauge displays real-time score with color-coded status
5. Breakdown bars show individual component contributions

**Components**: `Dashboard`, `HealthGauge`, `MetricCard`
**Status**: Complete

---

### Alert System
**Description**: Automatic threshold-based alert generation for network health issues.
**User Flow**:
1. MetricsCollector continuously monitors health metrics
2. Alerts generated when values cross configured thresholds
3. Alert banners appear on Dashboard with severity icons
4. User can dismiss alerts by clicking the close button
5. Acknowledged alerts are removed from the active list

**Alert Thresholds**:
| Type | Severity | Trigger |
|------|----------|---------|
| `low_swimmers` | warning | Active swimmers < 3 |
| `high_risk_posts` | critical | Posts at risk > 20 |
| `stale_sync` | warning | Sync age > 15 minutes |
| `low_avg_heat` | warning | Average heat < 20% |

**Components**: `Dashboard`, `AlertBanner`
**Status**: Complete

---

### Space Analytics
**Description**: Detailed metrics and heat distribution for individual spaces.
**User Flow**:
1. Navigate to Spaces list (`/spaces`) - sorted by risk level
2. Click any space to view detailed analytics
3. View heat distribution histogram with median
4. Review recent posts table with health status
5. Identify at-risk content requiring attention

**Components**: `Spaces`, `SpaceDetail`, `HeatHistogram`
**Status**: Complete

---

### Health History Tracking
**Description**: 24-hour historical tracking of network health with trend visualization.
**User Flow**:
1. Health snapshots captured every 5 minutes
2. History persisted to localStorage (max 288 points)
3. Dashboard displays sparkline chart of 24h history
4. MetricCards show trend indicators (+/- from previous reading)

**Components**: `Dashboard` (sparkline SVG), `MetricCard`
**Status**: Complete

---

### Configuration Management
**Description**: User-configurable analytics settings with localStorage persistence.
**User Flow**:
1. Navigate to Settings page (`/settings`)
2. Toggle collection on/off, alerts, advanced metrics
3. Adjust poll interval (10-300 seconds)
4. Add/remove specific spaces to watch
5. Save configuration (persisted across sessions)

**Components**: `Settings`
**Status**: Complete

---

### Data Visualization
**Description**: Visual components for health metrics and heat distribution.

**Visualizations**:
| Component | Purpose |
|-----------|---------|
| `HealthGauge` | Circular SVG gauge (0-100) with color-coded status |
| `HeatHistogram` | 10-bucket bar chart with heat gradient colors |
| `MetricCard` | Single metric display with optional trend indicator |
| Sparkline | SVG polyline showing 24h health history |

**Status**: Complete

## Components Reference

### AlertBanner
**Location**: `src/components/AlertBanner.tsx`
**Purpose**: Displays dismissible alert notifications with severity-based styling

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| alert | `Alert` | Yes | Alert object containing type, severity, message |
| onDismiss | `() => void` | No | Callback when user dismisses the alert |

**Usage**:
```tsx
<AlertBanner
  alert={alert}
  onDismiss={() => acknowledgeAlert(alert.id)}
/>
```

---

### HealthGauge
**Location**: `src/components/HealthGauge.tsx`
**Purpose**: Circular gauge visualization for network health score

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| health | `NetworkHealth \| null` | Yes | Health data including score, status, timestamp |
| size | `number` | No | Gauge diameter in pixels (default: 200) |

**Usage**:
```tsx
<HealthGauge health={networkHealth} size={180} />
```

---

### HeatHistogram
**Location**: `src/components/HeatHistogram.tsx`
**Purpose**: Bar chart showing heat distribution across 10 buckets (0-100%)

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| buckets | `number[]` | Yes | Array of 10 counts for each 10% bucket |

**Usage**:
```tsx
<HeatHistogram buckets={heatDistribution.buckets.map(b => b.count)} />
```

---

### MetricCard
**Location**: `src/components/MetricCard.tsx`
**Purpose**: Display card for a single metric value with optional trend indicator

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| title | `string` | Yes | Metric label |
| value | `string` | Yes | Formatted metric value |
| icon | `string` | No | Emoji or icon character |
| trend | `number` | No | Change from previous value (+/-) |
| invertTrend | `boolean` | No | Reverse color logic (down=good) |

**Usage**:
```tsx
<MetricCard
  title="Posts at Risk"
  value="12"
  icon="⚠️"
  trend={-3}
  invertTrend={true}
/>
```

---

### ErrorBoundary
**Location**: `src/components/ErrorBoundary.tsx`
**Purpose**: Catches React errors and displays fallback UI with retry options

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| children | `ReactNode` | Yes | Child components to wrap |
| fallback | `ReactNode` | No | Custom fallback UI |

**Usage**:
```tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

### LoadingScreen
**Location**: `src/components/Loading.tsx`
**Purpose**: Full-screen loading indicator shown during WASM initialization

**Props**: None

**Usage**:
```tsx
<SwimchainProvider fallback={<LoadingScreen />}>
  <App />
</SwimchainProvider>
```

## Hooks Reference

### useRpc
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Provides RPC client context and connection management

**Returns**:
```typescript
{
  rpc: SwimchainRpc | null;      // RPC client instance
  connected: boolean;             // Connection status
  connecting: boolean;            // Connection in progress
  error: string | null;           // Connection error message
  nodeInfo: {                     // Connected node metadata
    version: string;
    network: string;
    peerCount: number;
  } | null;
}
```

**Usage**:
```tsx
const { rpc, connected, error } = useRpc();

if (!connected) {
  return <div>Connecting to node...</div>;
}
```

**Side Effects**:
- Auto-connects to `localhost:3030` on mount
- Retries connection every 5 seconds on failure

---

### useNetworkStats
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Fetches aggregated network-wide statistics

**Returns**:
```typescript
{
  stats: NetworkStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Usage**:
```tsx
const { stats, loading, refetch } = useNetworkStats();
```

---

### useSpaceStats
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Fetches statistics for a specific space

**Parameters**: `spaceId: string`

**Returns**:
```typescript
{
  stats: SpaceStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Usage**:
```tsx
const { stats } = useSpaceStats('space-abc123');
```

---

### useSpaceList
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Lists all available spaces with basic metadata

**Returns**:
```typescript
{
  spaces: Array<{ id: string; name: string; postCount: number }>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Usage**:
```tsx
const { spaces, loading } = useSpaceList();
```

---

### useMetrics
**Location**: `src/hooks/useMetrics.ts`
**Purpose**: Main analytics hook bridging React components to MetricsCollector singleton

**Returns**:
```typescript
{
  // Data
  networkHealth: NetworkHealth | null;
  healthHistory: HealthHistoryPoint[];
  spaceMetrics: SpaceMetrics[];
  recentPosts: RecentPost[];
  alerts: Alert[];
  unacknowledgedAlerts: Alert[];

  // State
  isCollecting: boolean;
  config: AnalyticsConfig;

  // Actions
  start: () => void;
  stop: () => void;
  refresh: () => Promise<void>;
  updateConfig: (updates: Partial<AnalyticsConfig>) => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAcknowledgedAlerts: () => void;
  getSpaceMetrics: (spaceId: string) => SpaceMetrics | undefined;
}
```

**Usage**:
```tsx
const {
  networkHealth,
  spaceMetrics,
  isCollecting,
  start,
  stop,
  refresh
} = useMetrics();
```

## State Management

### Context Providers

#### RpcProvider
**Location**: `src/hooks/useRpc.tsx`
**Purpose**: Provides RPC client connection to component tree

**Usage**:
```tsx
// In main.tsx
<RpcProvider>
  <App />
</RpcProvider>

// In components
const { rpc, connected } = useRpc();
```

### Singleton Service Pattern

The analytics client uses a **Singleton Service + React Context** pattern:

1. **MetricsCollector** (Singleton): Manages background data collection, caching, and history outside React lifecycle
2. **RpcProvider** (Context): Manages node connection state
3. **useMetrics** (Hook): Bridges React components to the singleton with reactive state updates

**Why Singleton?**
- Background polling should not restart on re-renders
- History data persists across navigation
- Single source of truth for metrics
- Decouples collection logic from React lifecycle

### Data Flow

```
RpcProvider (context)
    │
    ├── connect() → SwimchainRpc instance
    │
    ▼
useRpc() hook
    │
    ├── { rpc, connected }
    │
    ▼
MetricsCollector.setRpcClient(rpc)
    │
    ├── setInterval() polling (30s default)
    │
    ▼
fetchNetworkStats() / fetchSpaceStats()
    │
    ├── rpc.getSyncStatus()
    ├── rpc.getPeers()
    ├── rpc.listSpaces()
    ├── rpc.listSpaceContent()
    │
    ▼
MetricsCollector internal state
    │
    ├── networkHealth
    ├── spaceMetrics Map
    ├── healthHistory[]
    ├── alerts[]
    │
    ▼
callbacks.onNetworkHealth(health)
    │
    ▼
useMetrics() → setNetworkHealth()
    │
    ▼
Dashboard component re-render
```

## RPC Integration

### Methods Used
| Method | Endpoint | Purpose | Component |
|--------|----------|---------|-----------|
| `connect()` | GET /info | Verify node accessibility | RpcProvider |
| `getSyncStatus()` | GET /sync/status | Get sync state, block time | MetricsCollector |
| `getPeers()` | GET /peers | Get active swimmer count | MetricsCollector |
| `listSpaces()` | GET /spaces | List all spaces | MetricsCollector |
| `listSpaceContent(id)` | GET /spaces/:id/content | Get content with heat values | MetricsCollector |
| `getContent(id)` | GET /content/:id | Individual content lookup | (Available, not used) |

### Default Configuration
```typescript
const LOCAL_CONFIG: RpcConfig = {
  host: 'localhost',
  port: 3030,
  protocol: 'http',
};
```

## Health Score Formula (SPEC_09)

The network health score (0-100) is calculated from four weighted components:

| Component | Max Points | Calculation |
|-----------|------------|-------------|
| **Swimmers** | 30 | `min(30, (activeSwimmers / 10) * 30)` |
| **Risk** | 30 | 30 if `postsAtRisk < 5`, else `max(0, 30 - postsAtRisk)` |
| **Sync** | 20 | 20 if `lastSyncAge < 5 min`, else 0 |
| **Heat** | 20 | `(avgHeat / 100) * 20` |

**Status Categories**:
- **Healthy**: score >= 80
- **Degraded**: score >= 40
- **Unhealthy**: score > 0
- **Unknown**: score = 0

## Styling Guide

### Design Tokens (CSS Custom Properties)

The client uses CSS Custom Properties for theming in `globals.css`:

```css
:root {
  /* Background Colors */
  --color-bg-primary: #0f0f1a;
  --color-bg-secondary: #1a1a2e;

  /* Accent Colors */
  --color-accent-primary: #00d4ff;

  /* Status Colors */
  --color-success: #4caf50;
  --color-warning: #ff9800;
  --color-error: #f44336;

  /* Text Colors */
  --color-text-primary: #ffffff;
  --color-text-secondary: #b0b0b0;
  --color-text-tertiary: #666666;
}
```

### Heat Gradient Colors
10 colors for heat distribution visualization (0-100%):
```typescript
const CHART_COLORS.heatGradient = [
  '#fee2e2',  // 0-10%: danger (light red)
  '#fecaca',  // 10-20%
  '#fca5a5',  // 20-30%
  '#f87171',  // 30-40%
  '#fb923c',  // 40-50%
  '#fbbf24',  // 50-60%
  '#a3e635',  // 60-70%
  '#4ade80',  // 70-80%
  '#34d399',  // 80-90%
  '#22c55e',  // 90-100%: healthy (green)
];
```

### Accessibility
- WCAG 2.1 AA compliant color contrast
- Visible focus indicators
- ARIA labels on interactive elements
- Skip-link for keyboard navigation

## Testing

### Running Tests
```bash
# Run tests once
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Test Configuration
- **Framework**: Vitest
- **DOM**: happy-dom
- **Library**: React Testing Library
- **Config**: `vitest.config.ts`

### Test Structure
```
src/
├── components/
│   └── __tests__/
├── hooks/
│   └── __tests__/
└── services/
    └── __tests__/
```

## Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| VITE_RPC_HOST | Node RPC host | localhost |
| VITE_RPC_PORT | Node RPC port | 3030 |
| VITE_RPC_PROTOCOL | HTTP or HTTPS | http |

### localStorage Keys
| Key | Purpose | Format |
|-----|---------|--------|
| `analytics-config` | User configuration | `AnalyticsConfig` JSON |
| `analytics-history` | Health history points | `HealthHistoryPoint[]` JSON |
| `analytics-watched-spaces` | Watched space IDs | `string[]` JSON |

### AnalyticsConfig Schema
```typescript
interface AnalyticsConfig {
  enabled: boolean;           // Enable metrics collection
  pollIntervalMs: number;     // Polling interval (10000-300000ms)
  watchedSpaces: string[];    // Specific spaces to monitor (empty = all)
  enableAlerts: boolean;      // Enable alert notifications
  showAdvanced: boolean;      // Show advanced metrics (placeholder)
}
```

### Constants
```typescript
// Polling Intervals
METRICS_POLL_INTERVAL_MS = 30_000;      // 30 seconds
HISTORY_SNAPSHOT_INTERVAL_MS = 300_000; // 5 minutes

// Data Limits
MAX_HISTORY_POINTS = 288;               // 24 hours at 5-min intervals
MAX_SPACE_METRICS_CACHE = 100;          // Cache up to 100 spaces
MAX_RECENT_POSTS_DISPLAY = 50;          // Show last 50 posts

// Health Thresholds
HEALTH_SWIMMER_TARGET = 10;
HEALTH_RISK_THRESHOLD = 5;
HEALTH_SYNC_FRESH_MINUTES = 5;
```

## Known Issues & Limitations

### Incomplete Features
| Feature | Status | Notes |
|---------|--------|-------|
| Engagements Last 24h | Partial | Field exists but always returns 0 (TODO in code) |
| Advanced Metrics Toggle | Partial | Config option exists but no advanced UI implemented |
| Browser Notifications | Partial | Config toggle exists but notifications not implemented |
| Space Name Lookup | Partial | Uses spaceId as fallback (no metadata endpoint) |

### Limitations
- **Read-only**: This client cannot create or modify content
- **Single node**: Only connects to one node at a time (localhost:3030)
- **No authentication**: Assumes local trusted node
- **Browser only**: No server-side rendering support
- **WASM dependency**: Requires browser WASM support

### Known Bugs
- Heat histogram tooltips may overlap on narrow screens
- Connection retry does not exponentially back off

## Future Improvements

### Planned Features
- Multi-node monitoring support
- Custom alert threshold configuration
- Export analytics data (CSV/JSON)
- Browser push notifications for critical alerts
- Real-time WebSocket updates (replace polling)
- Space comparison view
- Historical data querying beyond 24 hours

### Technical Debt
- Implement advanced metrics UI
- Add engagement tracking
- Space name resolution via metadata endpoint
- Exponential backoff for connection retries
- Unit test coverage for MetricsCollector

## Routing Reference

| Path | Component | Description |
|------|-----------|-------------|
| `/` | Dashboard | Network health overview with metrics, alerts, heat distribution |
| `/spaces` | Spaces | List of all monitored spaces sorted by risk |
| `/spaces/:spaceId` | SpaceDetail | Detailed analytics for a single space |
| `/settings` | Settings | Configuration page for collection settings |
| `*` | Navigate → `/` | Catch-all redirect to dashboard |

## Type Definitions

### NetworkHealth
```typescript
interface NetworkHealth {
  score: number;                    // Overall health 0-100
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  activeSwimmers: number;
  postsAtRisk: number;
  lastSyncAgeMinutes: number;
  avgHeat: number;                  // 0-100
  breakdown: HealthBreakdown;
  timestamp: Date;
}

interface HealthBreakdown {
  swimmerScore: number;   // Max 30
  riskScore: number;      // Max 30
  syncScore: number;      // Max 20
  heatScore: number;      // Max 20
}
```

### SpaceMetrics
```typescript
interface SpaceMetrics {
  spaceId: string;
  name?: string;
  totalPosts: number;
  postsAtRisk: number;
  healthyPosts: number;             // Posts with heat > 75%
  avgHeat: number;                  // 0-100
  heatDistribution: HeatDistribution;
  activeContributors: number;
  postsLast24h: number;
  engagementsLast24h: number;       // Currently always 0
  timestamp: Date;
}
```

### Alert
```typescript
interface Alert {
  id: string;
  type: 'low_swimmers' | 'high_risk_posts' | 'stale_sync' | 'low_avg_heat' | 'space_degraded';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: string;
  spaceId?: string;
  timestamp: Date;
  acknowledged: boolean;
}
```

### HeatDistribution
```typescript
interface HeatDistribution {
  buckets: HeatBucket[];            // 10 buckets (0-100%)
  totalPosts: number;
  medianHeat: number;
}

interface HeatBucket {
  min: number;                      // Lower bound (inclusive)
  max: number;                      // Upper bound
  count: number;                    // Post count in bucket
  percentage: number;               // % of total
}
```

## Component Hierarchy

```
main.tsx
├── React.StrictMode
│   └── ErrorBoundary
│       └── SwimchainProvider (WASM)
│           └── RpcProvider
│               └── App
│                   └── ErrorBoundary
│                       └── BrowserRouter
│                           └── Routes
│                               ├── "/" → Dashboard
│                               │   ├── HealthGauge
│                               │   ├── AlertBanner (multiple)
│                               │   ├── MetricCard (4x)
│                               │   ├── HeatHistogram
│                               │   └── Space cards (links)
│                               ├── "/spaces" → Spaces
│                               │   └── Space rows (links)
│                               ├── "/spaces/:spaceId" → SpaceDetail
│                               │   └── HeatHistogram
│                               ├── "/settings" → Settings
│                               └── "*" → Navigate to "/"
```
