# Archiver Client - Client Documentation

## Overview

The Swimchain Archiver Client is a specialized React application for monitoring and preserving content at risk of decay in the Swimchain network. It helps users identify content with low "heat" (survival probability), contribute Proof-of-Work (PoW) to prevent decay, and archive content locally before it disappears from the network.

**Target Users**: Content preservationists, community archivists, and users who want to maintain valuable discussions and posts in the Swimchain ecosystem.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint
```

## Architecture

### Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2.0 | UI framework |
| TypeScript | 5.3.0 | Type-safe development |
| Vite | 5.0.0 | Build tooling |
| React Router DOM | 6.20.0 | Client-side routing |
| hash-wasm | 4.11.0 | Hash computation for PoW |
| Vitest | 1.0.0 | Testing framework |

**Styling**: Component-scoped CSS files (WCAG 2.1 AA compliant)
**State Management**: React Context API + Local State + Singleton Services
**Storage**: IndexedDB (for archives), localStorage (for config/budget)

### Directory Structure

```
src/
├── components/        # Reusable UI components
│   ├── AtRiskList.tsx         # At-risk content display
│   ├── BudgetMeter.tsx        # Daily PoW budget display
│   ├── EngageButton.tsx       # PoW contribution button
│   ├── ErrorBoundary.tsx      # Error handling wrapper
│   ├── Loading.tsx            # WASM loading screen
│   └── StatusCard.tsx         # Metric display card
├── pages/             # Page components (routes)
│   ├── Dashboard.tsx          # Main monitoring dashboard
│   ├── ArchivedContent.tsx    # Archive browser
│   └── Settings.tsx           # Configuration page
├── hooks/             # Custom React hooks
│   ├── useArchiveStorage.ts   # IndexedDB management
│   ├── useContentMonitor.ts   # Content decay monitoring
│   └── useRpc.tsx             # RPC context & data hooks
├── services/          # Singleton services
│   ├── ArchiveStorage.ts      # IndexedDB wrapper
│   ├── AutoEngageEngine.ts    # PoW budget management
│   └── ContentMonitor.ts      # Decay monitoring
├── lib/               # Utilities
│   └── rpc.ts                 # RPC client implementation
├── types/             # Type definitions
│   ├── index.ts               # Core types
│   └── constants.ts           # App constants
├── styles/            # Global styles
│   └── globals.css
├── App.tsx            # Root component with routing
└── main.tsx           # Entry point
```

### Key Dependencies

| Dependency | Purpose |
|------------|---------|
| `@swimchain/core` | Core Swimchain library (local) |
| `@swimchain/react` | React bindings and WASM provider |
| `hash-wasm` | Hash computation for PoW |
| `react-router-dom` | Client-side routing |
| `@tauri-apps/api` | Desktop app integration (optional) |

---

## Architecture Overview

### Provider Hierarchy
```
React.StrictMode
└── ErrorBoundary
    └── SwimchainProvider (WASM initialization)
        └── RpcProvider (Node connection)
            └── App (Router)
```

### Data Flow
1. **SwimchainProvider** initializes WASM modules from `@swimchain/react`
2. **RpcProvider** establishes connection to local Swimchain node (localhost:3030)
3. **ContentMonitor** service polls for at-risk content via RPC
4. **AutoEngageEngine** manages PoW budget and automatic engagement
5. **ArchiveStorage** persists archived content in IndexedDB

---

## Component Inventory

### Component Hierarchy
```
App (BrowserRouter)
├── Dashboard (/)
│   ├── StatusCard (x5)
│   ├── BudgetMeter
│   └── AtRiskList
│       └── EngageButton (x3 per expanded item)
├── ArchivedContent (/archived)
│   └── (inline archive-item components)
└── Settings (/settings)
    └── (inline form controls)

Provider Wrapper:
ErrorBoundary
└── SwimchainProvider
    └── RpcProvider
        └── App
```

### Pages

#### Dashboard (`src/pages/Dashboard.tsx`)
**Purpose**: Main dashboard showing at-risk content, status metrics, and engagement controls
**Props**: None
**State**:
- `selectedSpace: string` - Filter selection ('all' or specific space ID)
**Hooks Used**: `useContentMonitor`, `useArchiveStorage`
**Renders**: `StatusCard` (x5), `BudgetMeter`, `AtRiskList`
**Routes To**: `/archived`, `/settings`
**Styling**: `Dashboard.css`

#### ArchivedContent (`src/pages/ArchivedContent.tsx`)
**Purpose**: Browse, search, and manage locally archived content
**Props**: None
**State**:
- `searchQuery: string` - Current search input value
- `searchResults: ArchiveEntry[] | null` - Filtered results (null = show all)
- `expandedHash: string | null` - Currently expanded archive entry
- `deleting: string | null` - Entry currently being deleted
**Hooks Used**: `useArchiveStorage`
**Renders**: Inline archive list with expandable items
**Routes To**: `/dashboard`
**Styling**: `ArchivedContent.css`

#### Settings (`src/pages/Settings.tsx`)
**Purpose**: Configure archiver behavior, thresholds, budgets, and target spaces
**Props**: None
**State**:
- `config: ArchiverConfig` - Full configuration object
- `saved: boolean` - Shows save confirmation briefly
- `spaceInput: string` - Input for adding new space
**Effects**:
- Load config from localStorage on mount
**Hooks Used**: None (direct localStorage access)
**Renders**: Form sections for spaces, thresholds, budgets, auto-engage toggle
**Routes To**: `/dashboard`
**Styling**: `Settings.css`

### Shared Components

#### AtRiskList (`src/components/AtRiskList.tsx`)
**Purpose**: Displays expandable list of at-risk content with urgency badges and engagement controls
**Props**:
```typescript
interface AtRiskListProps {
  content: AtRiskContent[];
}
```
**State**:
- `expandedHash: string | null` - Currently expanded item's post hash
**Events**: Click/keyboard on item header to expand/collapse
**Renders**: `EngageButton` (x3 per expanded item: +5s, +15s, +30s)
**Styling**: `AtRiskList.css`
**Accessibility**:
- `role="list"`, `aria-label="Content at risk of decay"`
- `role="button"`, `tabIndex={0}` on expandable headers
- `aria-expanded` state on list items

#### BudgetMeter (`src/components/BudgetMeter.tsx`)
**Purpose**: Visual progress bar showing daily PoW budget usage
**Props**: None
**State**:
- `used: number` - Seconds of PoW used today
- `limit: number` - Daily budget limit in seconds
**Effects**:
- Updates from `AutoEngageEngine` singleton every 1 second
**Hooks Used**: None (uses `getAutoEngageEngine()` singleton)
**Styling**: `BudgetMeter.css`
**Accessibility**: `role="progressbar"`, `aria-valuenow`, `aria-valuemax`

#### EngageButton (`src/components/EngageButton.tsx`)
**Purpose**: Button to contribute PoW to content preservation with visual mining progress
**Props**:
```typescript
interface EngageButtonProps {
  postHash: string;
  seconds: 5 | 15 | 30;
  onComplete?: (success: boolean) => void;
}
```
**State**:
- `state: 'idle' | 'mining' | 'complete' | 'error'` - Current button state
- `progress: number` - Mining progress percentage (0-100)
**Events**: Click to start engagement
**Hooks Used**: None (uses `getAutoEngageEngine()` singleton)
**Styling**: `EngageButton.css`
**Accessibility**: `aria-label` describes action, `title` shows budget warning

#### StatusCard (`src/components/StatusCard.tsx`)
**Purpose**: Reusable card displaying a single metric with icon and optional urgency variant
**Props**:
```typescript
interface StatusCardProps {
  label: string;
  value: string | number;
  icon?: 'eye' | 'alert' | 'warning' | 'archive' | 'database' | 'clock';
  variant?: 'default' | 'critical' | 'warning' | 'success';
}
```
**State**: None (stateless)
**Styling**: `StatusCard.css`
**Accessibility**: `role="status"`, `aria-label` with label and value

#### ErrorBoundary (`src/components/ErrorBoundary.tsx`)
**Purpose**: Class component catching React errors with recovery UI
**Props**:
```typescript
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
```
**State**:
- `hasError: boolean` - Whether an error has occurred
- `error: Error | null` - The caught error
- `errorInfo: ErrorInfo | null` - React component stack
**Methods**: `handleRetry()` resets error state
**Styling**: `ErrorBoundary.css`
**Accessibility**: `role="alert"` on error display

#### LoadingScreen (`src/components/Loading.tsx`)
**Purpose**: Loading spinner shown during WASM initialization
**Props**: None
**State**: None (stateless)
**Styling**: `Loading.css`
**Accessibility**: `role="status"`, `aria-live="polite"`

---

## Hooks & State Inventory

### Custom Hooks

#### useRpc (`src/hooks/useRpc.tsx`)
**Purpose**: RPC client for node communication with React Context
**Parameters**: None (uses context internally)
**Returns**:
```typescript
{
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: {
    version: string;
    network: string;
    peerCount: number;
  } | null;
}
```
**Used By**: `useContentMonitor` (injects RPC client), `useNetworkStats`, `useSpaceStats`, `useSpaceList`
**Dependencies**: `RpcContext`
**Side Effects**:
- Auto-connects to localhost:3030 on mount
- Retries connection every 5 seconds on failure
- Stores connection state and node info
**Storage**: None

#### useNetworkStats (`src/hooks/useRpc.tsx`)
**Purpose**: Fetch network-wide statistics (active swimmers, total posts, at-risk content)
**Parameters**: None
**Returns**:
```typescript
{
  stats: NetworkStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```
**Used By**: (Available for Dashboard analytics)
**Dependencies**: `useRpc`
**Side Effects**:
- Fetches sync status, peers, and spaces on mount
- Iterates through all spaces to calculate aggregate stats
**Storage**: None

#### useSpaceStats (`src/hooks/useRpc.tsx`)
**Purpose**: Fetch statistics for a specific space
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
**Used By**: (Available for space detail views)
**Dependencies**: `useRpc`
**Side Effects**: Fetches space content on mount and when spaceId changes
**Storage**: None

#### useSpaceList (`src/hooks/useRpc.tsx`)
**Purpose**: List all available spaces
**Parameters**: None
**Returns**:
```typescript
{
  spaces: Array<{ id: string; name: string; postCount: number }>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```
**Used By**: (Available for space selection)
**Dependencies**: `useRpc`
**Side Effects**: Fetches space list on mount
**Storage**: None

#### useArchiveStorage (`src/hooks/useArchiveStorage.ts`)
**Purpose**: Manage archived content in IndexedDB
**Parameters**: `spaceId?: SpaceId` (optional filter)
**Returns**:
```typescript
{
  isReady: boolean;
  stats: StorageStats | null;
  entries: ArchiveEntry[];
  isLoading: boolean;
  error: Error | null;
  archive: (content: ArchiveEntry) => Promise<boolean>;
  deleteEntry: (postHash: string) => Promise<boolean>;
  search: (query: string) => Promise<ArchiveEntry[]>;
  refresh: () => Promise<void>;
  clearAll: () => Promise<boolean>;
  formatBytes: (bytes: number) => string;
}
```
**Used By**: `Dashboard`, `ArchivedContent`
**Dependencies**: `ArchiveStorage` service (singleton)
**Side Effects**:
- Initializes IndexedDB on mount
- Refreshes entries and stats when storage is ready
**Storage**: IndexedDB (`archiver-db`)

#### useContentMonitor (`src/hooks/useContentMonitor.ts`)
**Purpose**: Monitor content at risk of decay with automatic polling
**Parameters**:
```typescript
spaces: SpaceId[]     // Spaces to monitor
threshold?: number    // Heat threshold (default: 0.10)
```
**Returns**:
```typescript
{
  atRiskContent: AtRiskContent[];
  isLoading: boolean;
  lastChecked: Date | null;
  error: Error | null;
  refresh: () => Promise<void>;
  criticalCount: number;
  warningCount: number;
}
```
**Used By**: `Dashboard`
**Dependencies**: `useRpc`, `ContentMonitor` service (singleton)
**Side Effects**:
- Injects RPC client into ContentMonitor when connected
- Subscribes to ContentMonitor updates
- Starts/stops polling based on component lifecycle
- Polls every 60 seconds by default
**Storage**: None (in-memory only)

### Context Providers

#### RpcProvider (`src/hooks/useRpc.tsx`)
**Purpose**: Provides RPC client to component tree
**Value Shape**:
```typescript
interface RpcContextValue {
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: {
    version: string;
    network: string;
    peerCount: number;
  } | null;
}
```
**Initialization**: Connects to `http://localhost:3030` on mount
**Retry Strategy**: Retries every 5 seconds on connection failure
**Children Access**: `useRpc()` hook

#### SwimchainProvider (`@swimchain/react`)
**Purpose**: Initializes WASM modules for cryptographic operations
**Value Shape**: (External - from @swimchain/react)
**Initialization**: Loads WASM on mount, shows `LoadingScreen` during load
**Children Access**: WASM utilities via @swimchain/react hooks

### Singleton Services (Non-Hook State)

#### ArchiveStorage (`src/services/ArchiveStorage.ts`)
**Purpose**: IndexedDB persistence for archived content
**Access**: `getArchiveStorage()` singleton factory
**State**:
```typescript
{
  db: IDBDatabase | null;
  storageBudgetGB: number;  // Loaded from localStorage
}
```
**Storage**:
- IndexedDB: `archiver-db` (archives, metadata stores)
- localStorage: `archiver_config.storageBudgetGB`

#### ContentMonitor (`src/services/ContentMonitor.ts`)
**Purpose**: Content decay monitoring with pub/sub
**Access**: `getContentMonitor()` singleton factory
**State**:
```typescript
{
  pollingTimer: NodeJS.Timer | null;
  subscribers: Set<ContentSubscriber>;
  isRunning: boolean;
  lastContent: AtRiskContent[];
  rpcClient: SwimchainRpc | null;
}
```
**Storage**: None (in-memory only)

#### AutoEngageEngine (`src/services/AutoEngageEngine.ts`)
**Purpose**: PoW budget management and engagement logic
**Access**: `getAutoEngageEngine()` singleton factory
**State**:
```typescript
{
  dailyBudgetUsed: number;
  dailyBudgetLimit: number;
  lastResetDate: string;  // YYYY-MM-DD UTC
  isEngaging: boolean;
}
```
**Storage**: localStorage key `archiver_budget`
```typescript
interface BudgetState {
  used: number;
  date: string;
  limit: number;
}
```

### State Patterns

#### Async Data Pattern
Used throughout for API data fetching:
```typescript
const [data, setData] = useState<T | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<Error | null>(null);
```
**Used in**: `useArchiveStorage`, `useContentMonitor`, `useNetworkStats`, `useSpaceStats`, `useSpaceList`

#### Singleton Service Pattern
Services use module-level singleton factories:
```typescript
let _instance: ServiceClass | null = null;

export function getService(): ServiceClass {
  if (!_instance) {
    _instance = new ServiceClass();
  }
  return _instance;
}
```
**Used in**: `ArchiveStorage`, `ContentMonitor`, `AutoEngageEngine`

#### Pub/Sub Pattern
ContentMonitor uses subscriber callbacks for real-time updates:
```typescript
type ContentSubscriber = (content: AtRiskContent[]) => void;

class ContentMonitor {
  private subscribers: Set<ContentSubscriber> = new Set();

  subscribe(callback: ContentSubscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}
```

#### Form State Pattern (Settings Page)
Configuration forms use controlled components with localStorage persistence:
```typescript
const [config, setConfig] = useState<ArchiverConfig>(getDefaultConfig());

useEffect(() => {
  const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (stored) setConfig(JSON.parse(stored));
}, []);

const handleSave = () => {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
};
```

#### UI Toggle State Pattern
Used for expandable/collapsible items:
```typescript
const [expandedHash, setExpandedHash] = useState<string | null>(null);

const handleToggle = (hash: string) => {
  setExpandedHash(expandedHash === hash ? null : hash);
};
```
**Used in**: `AtRiskList`, `ArchivedContent`

#### Button State Machine Pattern
EngageButton uses explicit state machine:
```typescript
type ButtonState = 'idle' | 'mining' | 'complete' | 'error';
const [state, setState] = useState<ButtonState>('idle');
const [progress, setProgress] = useState(0);
```

### Data Flow

#### RPC to UI Data Flow
```
SwimchainProvider (WASM init)
    ↓
RpcProvider (connection)
    ↓ (context)
useRpc() hook
    ↓ (rpc client)
ContentMonitor.setRpcClient()
    ↓ (polling)
ContentMonitor.getAtRiskContent()
    ↓ (RPC calls)
rpc.listSpaceContent()
    ↓ (HTTP)
Node API (localhost:3030)
    ↓ (response)
ContentMonitor.subscribe() callbacks
    ↓
useContentMonitor setState
    ↓ (re-render)
Dashboard UI
```

#### Archive Storage Data Flow
```
User Action (archive content)
    ↓
useArchiveStorage.archive()
    ↓
ArchiveStorage.archiveContent()
    ↓ (quota check)
IndexedDB transaction
    ↓ (persist)
useArchiveStorage.refresh()
    ↓ (re-fetch)
Component setState
    ↓
UI Update
```

#### Budget Tracking Data Flow
```
EngageButton click
    ↓
AutoEngageEngine.canEngage() (budget check)
    ↓ (if allowed)
PoW computation (simulated)
    ↓
AutoEngageEngine.recordEngagement()
    ↓
localStorage persist (archiver_budget)
    ↓
BudgetMeter polling (1s interval)
    ↓
UI Update
```

### Caching Strategies

| Data Type | Cache Location | TTL | Invalidation |
|-----------|----------------|-----|--------------|
| RPC Connection | React state | Session | Manual reconnect |
| At-Risk Content | Memory (singleton) | 60s polling | Manual refresh |
| Archive Entries | IndexedDB | Persistent | CRUD operations |
| Budget State | localStorage | Daily (UTC) | Midnight reset |
| Config | localStorage | Persistent | Manual save |

### Optimistic Updates

Currently, the archiver-client does **not** implement optimistic updates. All state changes wait for:
1. RPC responses to complete
2. IndexedDB transactions to commit
3. Service method promises to resolve

This is appropriate given the archiver's monitoring/preservation role where data accuracy is more important than perceived speed.

---

## Components Reference

### AtRiskList
**File**: `src/components/AtRiskList.tsx`

Displays a list of content at risk of decay with urgency indicators and engagement controls.

**Props**:
```typescript
interface AtRiskListProps {
  content: AtRiskContent[];
}
```

**Features**:
- Expandable items showing pool progress and engagement buttons
- Urgency badges (critical/warning/normal)
- Time remaining until decay estimation
- Heat percentage display
- Keyboard accessible (Enter/Space to expand)

**Internal State**:
- `expandedHash: string | null` - Currently expanded item

---

### BudgetMeter
**File**: `src/components/BudgetMeter.tsx`

Displays the daily PoW budget usage as a progress bar.

**Props**: None (connects directly to AutoEngageEngine singleton)

**Features**:
- Real-time budget tracking (updates every second)
- Visual progress bar
- Time formatting (hours/minutes/seconds)
- Shows used vs. limit

**Internal State**:
- `used: number` - Seconds of PoW used today
- `limit: number` - Daily budget limit in seconds

---

### EngageButton
**File**: `src/components/EngageButton.tsx`

Button to contribute PoW to content preservation with progress indicator.

**Props**:
```typescript
interface EngageButtonProps {
  postHash: string;
  seconds: 5 | 15 | 30;
  onComplete?: (success: boolean) => void;
}
```

**Features**:
- Three engagement levels: +5s, +15s, +30s
- Visual progress during mining
- Completion/error states with icons
- Budget checking before engagement

**Internal State**:
- `state: 'idle' | 'mining' | 'complete' | 'error'`
- `progress: number` - Mining progress (0-100)

---

### ErrorBoundary
**File**: `src/components/ErrorBoundary.tsx`

Class component for catching and displaying React errors.

**Props**:
```typescript
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
```

**Features**:
- Error message display
- WASM-specific error hints
- Retry and reload buttons
- Technical details in dev mode

---

### Loading (LoadingScreen)
**File**: `src/components/Loading.tsx`

Loading screen shown during WASM initialization.

**Props**: None

**Features**:
- Animated spinner rings
- Status message
- Accessible with role="status"

---

### StatusCard
**File**: `src/components/StatusCard.tsx`

Displays a single metric with label, value, and icon.

**Props**:
```typescript
interface StatusCardProps {
  label: string;
  value: string | number;
  icon?: 'eye' | 'alert' | 'warning' | 'archive' | 'database' | 'clock';
  variant?: 'default' | 'critical' | 'warning' | 'success';
}
```

**Features**:
- Emoji icons for visual indicators
- Variant styling for urgency
- Accessible with role="status"

---

## Hooks Reference

### useRpc
**File**: `src/hooks/useRpc.tsx`

Provides RPC connection to Swimchain node via React Context.

**Returns**:
```typescript
interface RpcContextValue {
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: {
    version: string;
    network: string;
    peerCount: number;
  } | null;
}
```

**Features**:
- Auto-connects to localhost:3030
- Retries every 5 seconds on failure
- Provides node info on connection

**Additional Hooks** (exported from same file):
- `useNetworkStats()` - Network-wide statistics
- `useSpaceStats(spaceId)` - Space-specific statistics
- `useSpaceList()` - List all spaces

---

### useArchiveStorage
**File**: `src/hooks/useArchiveStorage.ts`

Manages archived content in IndexedDB.

**Parameters**:
```typescript
spaceId?: SpaceId  // Optional filter by space
```

**Returns**:
```typescript
interface UseArchiveStorageResult {
  isReady: boolean;
  stats: StorageStats | null;
  entries: ArchiveEntry[];
  isLoading: boolean;
  error: Error | null;
  archive: (content: ArchiveEntry) => Promise<boolean>;
  deleteEntry: (postHash: string) => Promise<boolean>;
  search: (query: string) => Promise<ArchiveEntry[]>;
  refresh: () => Promise<void>;
  clearAll: () => Promise<boolean>;
  formatBytes: (bytes: number) => string;
}
```

**Features**:
- IndexedDB initialization on mount
- CRUD operations for archived content
- Full-text search in title and body
- Storage statistics and formatting

---

### useContentMonitor
**File**: `src/hooks/useContentMonitor.ts`

Monitors content at risk of decay with polling.

**Parameters**:
```typescript
spaces: SpaceId[]     // Spaces to monitor
threshold?: number    // Heat threshold (default: 0.10)
```

**Returns**:
```typescript
interface UseContentMonitorResult {
  atRiskContent: AtRiskContent[];
  isLoading: boolean;
  lastChecked: Date | null;
  error: Error | null;
  refresh: () => Promise<void>;
  criticalCount: number;
  warningCount: number;
}
```

**Features**:
- Automatic polling via ContentMonitor service
- Subscriber pattern for updates
- Urgency classification (critical/warning/normal)
- Manual refresh capability

---

## Services Reference

### ArchiveStorage
**File**: `src/services/ArchiveStorage.ts`

IndexedDB storage service for archived content.

**Key Methods**:
```typescript
class ArchiveStorage {
  init(): Promise<void>
  archiveContent(content: ArchiveEntry): Promise<void>
  getEntry(postHash: ContentHash): Promise<ArchiveEntry | null>
  getArchivedContent(spaceId?: SpaceId): Promise<ArchiveEntry[]>
  searchArchive(query: string): Promise<ArchiveEntry[]>
  deleteEntry(postHash: ContentHash): Promise<void>
  clearAll(): Promise<void>
  getStats(): Promise<StorageStats>
  setStorageBudget(gb: number): void
  formatBytes(bytes: number): string
}
```

**IndexedDB Schema**:
- Database: `archiver-db` (version 1)
- Store: `archives` - Content entries (keyPath: `postHash`)
  - Indexes: `spaceId`, `archivedAt`, `title`, `author`
- Store: `metadata` - Key-value storage stats

**Storage Quota**: Configurable (default: 50GB, range: 1-1000GB)

---

### ContentMonitor
**File**: `src/services/ContentMonitor.ts`

Monitors content decay and identifies at-risk posts.

**Key Methods**:
```typescript
class ContentMonitor {
  calculateSurvival(lastEngagementTime: Date, now?: Date): number
  estimateDecayTime(lastEngagementTime: Date): Date
  estimateTimeUntilDecay(currentHeat: number): number
  classifyUrgency(heat: number): UrgencyLevel
  setRpcClient(client: SwimchainRpc | null): void
  getAtRiskContent(spaces: SpaceId[], threshold?: number): Promise<AtRiskContent[]>
  startPolling(spaces: SpaceId[], intervalMs?: number): void
  stopPolling(): void
  subscribe(callback: (content: AtRiskContent[]) => void): () => void
}
```

**Decay Calculation** (per SPEC_02):
- Half-life: 7 days (604,800 seconds)
- Decay floor: 48 hours before decay starts
- Decay threshold: 6.25% (content removed below this)
- Formula: `survival = 0.5^(effectiveDecayTime / HALF_LIFE_SECONDS)`

**Urgency Levels**:
- `critical`: Heat < 5%
- `warning`: Heat < 10%
- `normal`: Heat >= 10%

---

### AutoEngageEngine
**File**: `src/services/AutoEngageEngine.ts`

Manages automatic engagement with at-risk content.

**Key Methods**:
```typescript
class AutoEngageEngine {
  calculatePriority(content: AtRiskContent): number
  shouldAutoEngage(content: AtRiskContent, policy: ArchiverPolicy): boolean
  getEngagementQueue(atRisk: AtRiskContent[], policies: Map<SpaceId, ArchiverPolicy>): AtRiskContent[]
  engage(content: AtRiskContent, seconds: number): Promise<EngagementResult>
  canEngage(seconds: number): boolean
  recordEngagement(seconds: number): void
  getRemainingBudget(): number
  getUsedBudget(): number
  getBudgetLimit(): number
  setBudgetLimit(seconds: number): void
}
```

**Priority Calculation**:
```
priority = (heatUrgency * 0.5) + (replyValue * 0.3) + (poolProgress * 0.2)
```
- `heatUrgency`: Lower heat = higher urgency
- `replyValue`: More replies = more valuable (log scale)
- `poolProgress`: Closer to completion = higher priority

**Budget Management**:
- Daily budget resets at midnight UTC
- Persisted in localStorage (`archiver_budget`)
- Default: 3600 seconds (1 hour) per day

---

## Pages Reference

### Dashboard
**File**: `src/pages/Dashboard.tsx`

Main dashboard showing at-risk content and archiver status.

**Features**:
- Status cards row (spaces monitored, critical/warning counts, archived count, storage used)
- Budget meter display
- Space filter dropdown
- At-risk content list with expand/collapse
- Manual refresh button
- Footer with version and storage percentage

**State**:
- `selectedSpace: string` - Filter selection ('all' or space ID)

---

### ArchivedContent
**File**: `src/pages/ArchivedContent.tsx`

Browse and search archived content.

**Features**:
- Full-text search with clear button
- Content grouped by space
- Expandable entries showing full body
- Delete functionality with confirmation
- Entry metadata (archived date, original heat, author, created date)

**State**:
- `searchQuery: string` - Current search input
- `searchResults: ArchiveEntry[] | null` - Search results
- `expandedHash: string | null` - Currently expanded entry
- `deleting: string | null` - Entry being deleted

---

### Settings
**File**: `src/pages/Settings.tsx`

Configure archiver behavior and preferences.

**Configuration Options**:
1. **Target Spaces**: Add/remove spaces to monitor (bech32m format: sp1...)
2. **Archive Threshold**: Heat percentage to trigger archiving (1-50%, default: 5%)
3. **Auto-Engage Threshold**: Heat percentage to trigger engagement (1-50%, default: 10%)
4. **Storage Budget**: Maximum storage in GB (1-1000, default: 50)
5. **Daily PoW Budget**: Maximum seconds per day (60-28800, default: 3600)
6. **Enable Auto-Engage**: Toggle automatic engagement

**Persistence**: localStorage key `archiver_config`

---

## Type Definitions

### Core Types
```typescript
type SpaceId = string;           // bech32m format: sp1...
type ContentHash = string;       // sha256:...
type IdentityAddress = string;   // bech32m format: cs1...
type UrgencyLevel = 'critical' | 'warning' | 'normal';
```

### ArchiverConfig
```typescript
interface ArchiverConfig {
  targetSpaces: SpaceId[];
  minHeatBeforeArchiving: number;    // default: 0.05
  autoEngageThreshold: number;       // default: 0.10
  storageBudgetGB: number;           // default: 50
  dailyPowBudgetSeconds: number;     // default: 3600
  enableAutoEngage: boolean;         // default: true
}
```

### AtRiskContent
```typescript
interface AtRiskContent {
  postHash: ContentHash;
  spaceId: SpaceId;
  title: string;
  author: IdentityAddress;
  heat: number;                      // 0-1
  estimatedDecayTime: Date;
  replyCount: number;
  poolStatus: PoolStatus;
  urgency: UrgencyLevel;
}
```

### ArchiveEntry
```typescript
interface ArchiveEntry {
  postHash: ContentHash;
  spaceId: SpaceId;
  title: string;
  body: string;
  author: IdentityAddress;
  timestamp: Date;                   // Original creation
  archivedAt: Date;
  originalHeat: number;
  replies?: ArchiveEntry[];
}
```

### PoolStatus
```typescript
interface PoolStatus {
  currentSeconds: number;
  requiredSeconds: number;           // Always 60 per SPEC_03
  contributorCount: number;
}
```

---

## Constants Reference

**File**: `src/types/constants.ts`

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_HEAT_ARCHIVE_THRESHOLD` | 0.05 | Archive content below 5% |
| `AUTO_ENGAGE_THRESHOLD` | 0.10 | Auto-engage below 10% |
| `DECAY_THRESHOLD` | 0.0625 | Content decayed below 6.25% |
| `HALF_LIFE_SECONDS` | 604,800 | 7 days half-life |
| `DECAY_FLOOR_SECONDS` | 172,800 | 48 hours before decay starts |
| `POOL_REQUIRED_POW_SECS` | 60 | PoW seconds needed per pool |
| `SCAN_INTERVAL_MS` | 60,000 | 1 minute between scans |
| `DAILY_POW_BUDGET_SECS` | 3,600 | 1 hour default daily budget |
| `DEFAULT_STORAGE_BUDGET_GB` | 50 | Default storage limit |

---

## RPC Integration

**File**: `src/lib/rpc.ts`

### Configuration
```typescript
const LOCAL_CONFIG: RpcConfig = {
  host: 'localhost',
  port: 3030,
  protocol: 'http',
};
```

### API Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/info` | GET | Node version and network info |
| `/sync/status` | GET | Sync state and statistics |
| `/peers` | GET | Connected peer list |
| `/spaces` | GET | List all spaces |
| `/spaces/{id}/content` | GET | List content in a space |
| `/content/{id}` | GET | Get specific content |

### Response Types
- `NodeInfo`: version, network, peer_count
- `SyncStatus`: chain_percent, peer_count, storage, state
- `ContentResult`: Full content data with decay info

---

## User Flows

### 1. View At-Risk Content
1. Dashboard loads and ContentMonitor starts polling
2. RPC fetches content from monitored spaces
3. Content below 10% heat displayed in AtRiskList
4. User can filter by space or manually refresh

### 2. Manual Engagement
1. User expands an at-risk item
2. Clicks EngageButton (+5s, +15s, or +30s)
3. Progress bar shows mining progress
4. Budget is deducted on completion
5. Pool status updates

### 3. Archive Content
1. (Future) Content below archive threshold triggers archiving
2. Content stored in IndexedDB with full metadata
3. User can browse/search archived content
4. Can delete individual entries

### 4. Configure Settings
1. Navigate to Settings page
2. Add/remove target spaces
3. Adjust thresholds and budgets
4. Save to localStorage
5. Settings applied on next scan

---

## Special Features

### Content Decay System
- Implements SPEC_02 survival probability formula
- 7-day half-life with 48-hour floor before decay starts
- Content removed from network at 6.25% heat
- Visual urgency indicators for at-risk content

### PoW Budget Management
- Daily budget tracked per UTC day
- Automatic reset at midnight
- Persisted across sessions
- Visual meter shows remaining capacity

### Local Archiving
- IndexedDB for client-side persistence
- Storage quota enforcement
- Full-text search across title and body
- Space-based organization

### Desktop Support
- Optional `@tauri-apps/api` dependency
- Can be packaged as desktop application

---

## Development

### Scripts
```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm preview      # Preview production build
pnpm lint         # Run ESLint
pnpm lint:fix     # Auto-fix lint issues
pnpm test         # Run tests
pnpm test:watch   # Watch mode
pnpm test:coverage # Coverage report
```

### Environment
- Node.js >= 18.0.0
- Requires local Swimchain node at localhost:3030

---

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `main.tsx` | 37 | Application entry point |
| `App.tsx` | 23 | Router configuration |
| `types/index.ts` | 188 | Core type definitions |
| `types/constants.ts` | 51 | Protocol constants |
| `lib/rpc.ts` | 207 | RPC client implementation |
| `hooks/useRpc.tsx` | 329 | RPC React hooks |
| `hooks/useArchiveStorage.ts` | 191 | Archive storage hook |
| `hooks/useContentMonitor.ts` | 111 | Content monitoring hook |
| `services/ArchiveStorage.ts` | 413 | IndexedDB storage service |
| `services/ContentMonitor.ts` | 275 | Decay monitoring service |
| `services/AutoEngageEngine.ts` | 317 | Engagement engine |
| `pages/Dashboard.tsx` | 160 | Main dashboard |
| `pages/ArchivedContent.tsx` | 186 | Archive browser |
| `pages/Settings.tsx` | 265 | Configuration page |
| `components/AtRiskList.tsx` | 130 | At-risk content list |
| `components/BudgetMeter.tsx` | 68 | Budget display |
| `components/EngageButton.tsx` | 94 | Engagement button |
| `components/StatusCard.tsx` | 51 | Metric card |
| `components/ErrorBoundary.tsx` | 98 | Error handling |
| `components/Loading.tsx` | 23 | Loading screen |

---

## Feature Map

### Navigation Features

#### Route Navigation
**User Flow**: User clicks navigation link → Route changes → Page component renders
**Components**: `App.tsx` (BrowserRouter), page components
**Routes**:
| Path | Component | Description |
|------|-----------|-------------|
| `/` | Redirect | Redirects to `/dashboard` |
| `/dashboard` | Dashboard | Main monitoring dashboard |
| `/archived` | ArchivedContent | Browse archived content |
| `/settings` | Settings | Configure archiver behavior |
| `*` | Redirect | Fallback to `/dashboard` |

**Navigation Links**:
- Dashboard header → ArchivedContent, Settings
- ArchivedContent header → Dashboard (back link)
- Settings header → Dashboard (back link)

**Status**: ✓ Complete

---

### Authentication Features

#### Identity / Connection
**User Flow**:
1. App loads with ErrorBoundary wrapper
2. SwimchainProvider initializes WASM modules (LoadingScreen shown)
3. RpcProvider auto-connects to localhost:3030
4. Connection state propagates to components via context
5. Node info displayed in UI when connected

**Components**: `main.tsx`, `RpcProvider`, `LoadingScreen`, `ErrorBoundary`
**Hooks**: `useRpc`
**RPC Methods**: `GET /info` (node version, network, peer count)
**Status**: ✓ Complete

*Note: No user authentication required - archiver operates with local node connection*

---

### Content Monitoring Features

#### View At-Risk Content
**User Flow**:
1. User lands on Dashboard
2. ContentMonitor starts polling monitored spaces (every 60s)
3. At-risk content (heat < 10%) displayed in AtRiskList
4. User can filter by space dropdown
5. User can manually refresh with button
6. Content sorted by urgency (lowest heat first)

**Components**: `Dashboard`, `AtRiskList`, `StatusCard` (x5)
**Hooks**: `useContentMonitor`, `useArchiveStorage` (for stats)
**RPC Methods**: `GET /spaces/{id}/content` (for each monitored space)
**Services**: `ContentMonitor` (singleton with pub/sub)

**Display Metrics**:
| Metric | Source |
|--------|--------|
| Spaces Monitored | Config (targetSpaces.length) |
| Critical Count | Items with heat < 5% |
| Warning Count | Items with 5% ≤ heat < 10% |
| Archived Count | IndexedDB entry count |
| Storage Used | IndexedDB bytes used |

**Status**: ✓ Complete

#### Expand At-Risk Item
**User Flow**:
1. User clicks/presses Enter on collapsed item
2. Item expands showing:
   - Pool progress bar (current/60 seconds)
   - Contributor count
   - Three EngageButton options (+5s, +15s, +30s)
3. Click again to collapse

**Components**: `AtRiskList` (expandable items)
**State**: `expandedHash: string | null`
**Accessibility**: `role="button"`, `tabIndex={0}`, `aria-expanded`
**Status**: ✓ Complete

---

### Content Engagement Features

#### Manual PoW Engagement
**User Flow**:
1. User expands at-risk item
2. Clicks EngageButton (+5s, +15s, or +30s)
3. Budget check occurs (canEngage)
4. Button shows mining progress (0% → 100%)
5. On complete: checkmark (✓), budget deducted
6. On error: X icon, no budget change
7. Button resets to idle after 2-3 seconds

**Components**: `EngageButton`
**State Machine**: `idle` → `mining` → `complete|error` → `idle`
**Hooks**: None (direct singleton access)
**Services**: `AutoEngageEngine` (budget tracking, engagement)
**Storage**: localStorage (`archiver_budget`)

**Budget Tracking**:
- Daily limit checked before engagement
- Used seconds recorded on completion
- Resets at midnight UTC

**Status**: ◐ Partial
- UI and budget tracking complete
- Actual PoW submission mocked (awaits `@swimchain/react usePow()` integration)

#### View PoW Budget
**User Flow**:
1. BudgetMeter displays on Dashboard
2. Shows used/limit in human-readable format (e.g., "30m / 1h")
3. Progress bar fills as budget consumed
4. Updates every 1 second
5. Auto-resets at midnight UTC

**Components**: `BudgetMeter`
**State**: `used: number`, `limit: number`
**Services**: `AutoEngageEngine` (budget state)
**Storage**: localStorage (`archiver_budget`)
**Status**: ✓ Complete

---

### Archive Management Features

#### Browse Archived Content
**User Flow**:
1. User navigates to `/archived`
2. Header shows total entries and storage used
3. Content grouped by space with section headers
4. Click item to expand and view full content
5. Expanded view shows: body, author, creation date, archived date, original heat

**Components**: `ArchivedContent`
**Hooks**: `useArchiveStorage`
**Storage**: IndexedDB (`archiver-db.archives`)
**Status**: ✓ Complete

#### Search Archived Content
**User Flow**:
1. User types query in search input
2. Clicks "Search" button (or Enter key)
3. Results filtered by title/body (case-insensitive)
4. Shows "Found X results" message
5. Click "Clear" to reset and show all entries

**Components**: `ArchivedContent` (inline search controls)
**Hooks**: `useArchiveStorage.search()`
**State**: `searchQuery`, `searchResults`
**Status**: ✓ Complete

#### Delete Archived Entry
**User Flow**:
1. User expands archived item
2. Clicks "Delete" button
3. Confirmation dialog appears
4. On confirm: entry removed from IndexedDB
5. Stats updated, UI refreshes

**Components**: `ArchivedContent` (delete button in expanded view)
**Hooks**: `useArchiveStorage.deleteEntry()`
**State**: `deleting: string | null` (shows loading state)
**Status**: ✓ Complete

#### Auto-Archive Content
**User Flow**:
1. ContentMonitor detects content below archive threshold (5%)
2. Content automatically archived to IndexedDB
3. User can browse in ArchivedContent page

**Components**: (Background service)
**Services**: `ContentMonitor`, `ArchiveStorage`
**Storage**: IndexedDB
**Status**: ⊘ Placeholder
- Detection logic exists
- Auto-archive trigger not implemented (manual archive only)

---

### Configuration Features

#### Manage Target Spaces
**User Flow**:
1. Navigate to Settings page
2. View current target spaces as removable tags
3. Enter space ID in input (bech32m format: sp1...)
4. Click "Add Space" or press Enter
5. Click × to remove a space
6. Click "Save Settings"

**Components**: `Settings` (inline form)
**State**: `config.targetSpaces[]`, `spaceInput`
**Storage**: localStorage (`archiver_config`)
**Status**: ✓ Complete

#### Configure Thresholds
**User Flow**:
1. Navigate to Settings page
2. Adjust "Archive Threshold" slider (1-50%)
3. Adjust "Auto-Engage Threshold" slider (1-50%)
4. Click "Save Settings"

**Components**: `Settings` (range inputs)
**State**: `config.minHeatBeforeArchiving`, `config.autoEngageThreshold`
**Storage**: localStorage (`archiver_config`)
**Default Values**: Archive: 5%, Engage: 10%
**Status**: ✓ Complete

#### Configure Budgets
**User Flow**:
1. Navigate to Settings page
2. Adjust "Storage Budget" input (1-1000 GB)
3. Adjust "Daily PoW Budget" input (60-28800 seconds)
4. Click "Save Settings"
5. New budget applied to AutoEngageEngine and ArchiveStorage

**Components**: `Settings` (number inputs)
**State**: `config.storageBudgetGB`, `config.dailyPowBudgetSeconds`
**Storage**: localStorage (`archiver_config`)
**Services**: `AutoEngageEngine.setBudgetLimit()`, `ArchiveStorage.setStorageBudget()`
**Default Values**: Storage: 50GB, PoW: 3600s (1 hour)
**Status**: ✓ Complete

#### Toggle Auto-Engage
**User Flow**:
1. Navigate to Settings page
2. Check/uncheck "Enable automatic engagement"
3. Click "Save Settings"

**Components**: `Settings` (checkbox)
**State**: `config.enableAutoEngage`
**Storage**: localStorage (`archiver_config`)
**Status**: ◐ Partial
- Toggle UI and persistence complete
- Auto-engage logic not connected to ContentMonitor polling

#### Reset to Defaults
**User Flow**:
1. Navigate to Settings page
2. Click "Reset to Defaults"
3. Confirmation dialog appears
4. On confirm: config reverts to hardcoded defaults
5. UI updates immediately

**Components**: `Settings` (reset button)
**Status**: ✓ Complete

---

### Real-time Update Features

#### Content Polling
**Mechanism**: ContentMonitor polls every 60 seconds
**Components Affected**: `Dashboard`, `AtRiskList`
**Hooks**: `useContentMonitor` (subscription pattern)
**Status**: ✓ Complete

#### Budget Updates
**Mechanism**: BudgetMeter polls AutoEngageEngine every 1 second
**Components Affected**: `BudgetMeter`
**Status**: ✓ Complete

#### Daily Budget Reset
**Mechanism**: AutoEngageEngine checks date on every budget query
**Trigger**: Midnight UTC (YYYY-MM-DD change)
**Status**: ✓ Complete

---

### Error Handling Features

#### Error Boundary
**User Flow**:
1. React error occurs in component tree
2. ErrorBoundary catches error
3. Fallback UI displayed with error message
4. User can click "Retry" or "Reload"

**Components**: `ErrorBoundary` (class component)
**State**: `hasError`, `error`, `errorInfo`
**Status**: ✓ Complete

#### Connection Error Recovery
**User Flow**:
1. RPC connection fails
2. RpcProvider retries every 5 seconds
3. Connection status shown to user
4. Auto-reconnects when node available

**Components**: `RpcProvider`
**Hooks**: `useRpc` (exposes `connecting`, `error` states)
**Status**: ✓ Complete

---

## Feature Matrix

| Feature | Status | Components | Hooks | RPC | Storage |
|---------|--------|------------|-------|-----|---------|
| **Navigation** |
| Route Navigation | ✓ Complete | App, Pages | - | - | - |
| **Connection** |
| Node Connection | ✓ Complete | RpcProvider | useRpc | /info | - |
| WASM Init | ✓ Complete | SwimchainProvider | - | - | - |
| **Monitoring** |
| View At-Risk Content | ✓ Complete | Dashboard, AtRiskList | useContentMonitor | /spaces/{id}/content | - |
| Expand Item Details | ✓ Complete | AtRiskList | - | - | - |
| Space Filter | ✓ Complete | Dashboard | - | - | - |
| Manual Refresh | ✓ Complete | Dashboard | useContentMonitor | /spaces/{id}/content | - |
| **Engagement** |
| Manual PoW | ◐ Partial | EngageButton | - | (mocked) | localStorage |
| Budget Tracking | ✓ Complete | BudgetMeter | - | - | localStorage |
| Budget Reset | ✓ Complete | (service) | - | - | localStorage |
| **Archives** |
| Browse Archives | ✓ Complete | ArchivedContent | useArchiveStorage | - | IndexedDB |
| Search Archives | ✓ Complete | ArchivedContent | useArchiveStorage | - | IndexedDB |
| Delete Entry | ✓ Complete | ArchivedContent | useArchiveStorage | - | IndexedDB |
| Auto-Archive | ⊘ Placeholder | - | - | - | IndexedDB |
| **Settings** |
| Manage Spaces | ✓ Complete | Settings | - | - | localStorage |
| Configure Thresholds | ✓ Complete | Settings | - | - | localStorage |
| Configure Budgets | ✓ Complete | Settings | - | - | localStorage |
| Toggle Auto-Engage | ◐ Partial | Settings | - | - | localStorage |
| Reset Defaults | ✓ Complete | Settings | - | - | localStorage |
| **Error Handling** |
| Error Boundary | ✓ Complete | ErrorBoundary | - | - | - |
| Connection Recovery | ✓ Complete | RpcProvider | useRpc | - | - |

---

## Incomplete Features Summary

### Partial Implementations

1. **Manual PoW Engagement** (◐ Partial)
   - **What works**: UI, progress display, budget tracking
   - **Missing**: Actual PoW computation and RPC submission
   - **Blocked by**: `@swimchain/react usePow()` hook integration

2. **Toggle Auto-Engage** (◐ Partial)
   - **What works**: Toggle UI, config persistence
   - **Missing**: Auto-engage execution during polling
   - **Requires**: Connect AutoEngageEngine to ContentMonitor

### Placeholder Features

1. **Auto-Archive Content** (⊘ Placeholder)
   - **What exists**: Archive threshold in config, ArchiveStorage service
   - **Missing**: Automatic trigger when content drops below threshold
   - **Requires**: Add archive logic to ContentMonitor polling cycle

### Feature Completion Summary

| Status | Count |
|--------|-------|
| ✓ Complete | 16 |
| ◐ Partial | 2 |
| ⊘ Placeholder | 1 |
| **Total** | **19** |

**Completion Rate**: 84% (16/19 features complete)
