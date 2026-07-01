# Swimchain Forum Client

The Forum Client is a reference implementation of a Swimchain client built with React and the `@swimchain/react` library. It demonstrates all core Swimchain functionality including identity management, heat/decay visualization, threaded discussions, and proof-of-work integration.

## Overview

### Features

- **Space Navigation**: Hierarchical browsing of discussion spaces
- **Thread Listing**: View threads with heat indicators and pool status
- **Deep Threading**: Recursive reply trees with unlimited nesting
- **Identity Management**: Create and manage cryptographic identities
- **Heat Visualization**: Real-time decay indicators per CLIENT_DESIGN.md
- **Engagement Pools**: Visualize and contribute to content persistence
- **Keyboard Navigation**: Vim-style shortcuts for power users
- **Accessibility**: WCAG 2.1 AA compliance

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or pnpm

### Installation

```bash
cd forum-client
npm install
```

### Development

```bash
npm run dev
```

The development server starts at http://localhost:5173 with hot module replacement.

### Building

```bash
npm run build
```

Produces a production build in `dist/`.

## Project Structure

```
forum-client/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── AddressDisplay.tsx
│   │   ├── EngagementPool.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Header.tsx
│   │   ├── HeatIndicator.tsx
│   │   ├── IdentityCard.tsx
│   │   ├── Loading.tsx
│   │   ├── Pagination.tsx
│   │   ├── PowProgress.tsx
│   │   ├── ProfileButton.tsx
│   │   ├── ReplyComposer.tsx
│   │   ├── ReplyTree.tsx
│   │   ├── SearchBox.tsx
│   │   ├── Sidebar.tsx
│   │   ├── SpaceTree.tsx
│   │   ├── StatusBar.tsx
│   │   ├── ThreadList.tsx
│   │   └── ThreadSortControls.tsx
│   ├── hooks/            # Custom React hooks
│   │   ├── useKeyboardNavigation.tsx
│   │   ├── usePreferences.tsx
│   │   ├── useStoredIdentity.ts
│   │   └── useSyncStatus.ts
│   ├── layouts/          # Page layouts
│   │   └── MainLayout.tsx
│   ├── mocks/            # Mock data for MVP
│   │   └── data.ts
│   ├── pages/            # Page components
│   │   ├── Identity.tsx
│   │   ├── Settings.tsx
│   │   ├── SpaceList.tsx
│   │   ├── SpaceView.tsx
│   │   └── ThreadView.tsx
│   ├── styles/           # Global styles
│   │   └── globals.css
│   ├── types/            # TypeScript definitions
│   │   └── index.ts
│   ├── utils/            # Utility functions
│   │   └── time.ts
│   ├── App.tsx           # Root app component
│   └── main.tsx          # Entry point
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Components Reference

### HeatIndicator

Displays heat/decay status for content.

```tsx
import { HeatIndicator } from './components/HeatIndicator';

<HeatIndicator
  createdAt={timestamp}
  lastEngagement={timestamp}
  compact={false}
/>
```

Props:
- `createdAt`: Unix timestamp (seconds) of content creation
- `lastEngagement`: Unix timestamp of last engagement
- `compact`: Optional boolean for compact display
- `className`: Optional additional CSS class

### EngagementPool

Shows pool status and allows contributions.

```tsx
import { EngagementPool } from './components/EngagementPool';

<EngagementPool
  pool={poolState}
  onContribute={(seconds) => handleContribute(seconds)}
  isContributing={false}
/>
```

### ReplyTree

Recursive component for displaying nested replies.

```tsx
import { ReplyTree } from './components/ReplyTree';

<ReplyTree
  replies={replies}
  threadId={threadId}
  depth={0}
  maxCollapsedDepth={5}
/>
```

### PowProgress

Displays proof-of-work mining progress.

```tsx
import { PowProgress } from './components/PowProgress';

<PowProgress
  attempts={123456}
  elapsedMs={5000}
  difficulty={20}
  onCancel={() => cancel()}
/>
```

## Hooks Reference

### usePreferences

Manages user preferences with localStorage persistence.

```tsx
import { usePreferences } from './hooks/usePreferences';

const { preferences, updatePreference, resetToDefaults } = usePreferences();

// Update a single preference
updatePreference('threadOrdering', 'newest');
```

### useStoredIdentity

Manages cryptographic identity storage.

```tsx
import { useStoredIdentity } from './hooks/useStoredIdentity';

const { identity, setIdentity, clearIdentity, isLoading } = useStoredIdentity();
```

### useKeyboardNavigation

Provides keyboard navigation context.

```tsx
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';

const { selectedIndex, setSelectedIndex, items, setItems } = useKeyboardNavigation();
```

### useSyncStatus

Returns current network sync status (mock for MVP).

```tsx
import { useSyncStatus } from './hooks/useSyncStatus';

const { syncStatus } = useSyncStatus();
// syncStatus.state: 'synced' | 'syncing' | 'behind' | 'offline'
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` | Move selection down |
| `k` | Move selection up |
| `Enter` | Open selected item |
| `n` | New thread |
| `r` | Reply to thread |
| `e` | Engage +5 seconds |
| `E` | Engage +15 seconds |
| `/` | Focus search |
| `?` | Show shortcuts modal |
| `Backspace` | Go back |
| `Escape` | Close modal |

## Preferences

User preferences are stored in localStorage under `swimchain-preferences`.

| Preference | Type | Default | Description |
|------------|------|---------|-------------|
| `threadOrdering` | string | `'heat'` | Thread sort order |
| `threadsPerPage` | number | `25` | Threads per page |
| `showDecaying` | boolean | `true` | Show content below decay threshold |
| `decayStyle` | string | `'progress'` | Heat indicator style |
| `storageTargetMB` | number | `500` | Max local storage (MB) |
| `autoPruneThreshold` | number | `5` | Auto-prune heat % threshold |

## Development Guide

### Adding a New Component

1. Create the component in `src/components/`
2. Create matching CSS in the same directory
3. Export from the component file
4. Import where needed

### Adding a New Page

1. Create the page component in `src/pages/`
2. Add a route in `src/App.tsx`
3. Update sidebar navigation if needed

### Working with Mock Data

Mock data is in `src/mocks/data.ts`. For MVP, all data is static. In production, this would be replaced with actual network calls.

### Styling

- Use CSS variables from `globals.css`
- Follow BEM-like naming conventions
- Ensure WCAG 2.1 AA compliance (4.5:1 contrast ratio)
- Minimum 44x44px touch targets

## Testing

```bash
npm run test
```

Tests use Vitest with happy-dom for DOM testing.

## Building for Production

```bash
npm run build
npm run preview
```

The production build is optimized and tree-shaken. WASM files are bundled automatically.

## Browser Support

- Chrome 88+
- Firefox 78+
- Safari 14+
- Edge 88+

Requires WebAssembly and ES2020 support.
