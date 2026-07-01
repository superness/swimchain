# Swimchain Reddit-Style Client

**Version:** 1.0.0
**Last Updated:** 2025-12-26

Card-based browsing client for casual discovery, distinct from the forum client.

## Overview

The Reddit-Style Client provides a card-based, casual browsing experience for Swimchain content. Unlike the forum client's deep threading and hierarchical navigation, this client focuses on quick discovery, inline expansion, and streamlined engagement.

## Getting Started

### Prerequisites

- Node.js 18.0.0+
- npm or yarn

### Installation

```bash
cd reddit-client
npm install
npm run dev
```

The client will be available at `http://localhost:5174` (different port from forum-client).

## Key Differences from Forum Client

| Aspect | Forum Client | Reddit-Style Client |
|--------|--------------|---------------------|
| Threading | Deep, unlimited nesting | Shallow, 2 levels visible |
| Layout | Dense list with tree navigation | Cards with whitespace |
| Navigation | Hierarchical folder structure | Flat tabs + sidebar |
| Focus | In-depth discussion | Quick discovery |
| Expansion | Full page view | Inline modal expansion |
| Engagement | Traditional buttons | Quick-engage on cards |

## Project Structure

```
reddit-client/
├── src/
│   ├── components/     # React components
│   ├── contexts/       # React contexts (FilterContext)
│   ├── hooks/          # Custom hooks
│   ├── layouts/        # Layout components
│   ├── mocks/          # Mock data
│   ├── pages/          # Page components
│   ├── styles/         # Global CSS
│   ├── types/          # TypeScript types
│   └── utils/          # Utility functions
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## Components

### Core Components

- **ContentCard**: Card-based display of posts with heat, engagement, and preview
- **CardExpanded**: Modal view showing full content and replies
- **ShallowReplyTree**: Reply tree limited to 2 levels with "show all" option
- **FeedView**: Main feed with filtering and sorting
- **Sidebar**: Navigation with spaces and filter controls
- **Header**: Navigation tabs (Home, Popular, Your Spaces, New)

### Shared Components (from forum-client)

- **HeatIndicator**: Heat/decay visualization
- **AddressDisplay**: Truncated address display with copy
- **StatusBar**: Sync status, peers, storage
- **SearchBox**: Search with keyboard shortcut
- **ProfileButton**: Identity display

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` | Move selection down |
| `k` | Move selection up |
| `Enter` | Expand selected card |
| `e` | Quick engage (+5s) |
| `E` (Shift+E) | Standard engage (+15s) |
| `/` | Focus search |
| `Escape` | Close expanded view |
| `g` (Shift+G) | Go to top |
| `G` (Shift+G) | Go to bottom |

## Filters

Filters are available in the sidebar and use OR logic (content matches if it meets ANY active filter):

| Filter | Criteria |
|--------|----------|
| Hot | Heat > 50% |
| New | Created < 24 hours ago |
| Decaying | Heat < 20% |
| My posts only | Posts by current identity |

Filter state persists in localStorage.

## Routes

| Path | Description |
|------|-------------|
| `/` | Home feed (hot sorted) |
| `/popular` | Popular content |
| `/your-spaces` | Posts from subscribed spaces |
| `/new` | Newest posts |
| `/s/:spaceId` | Space-specific feed |
| `/spaces` | Browse all spaces |
| `/identity` | Manage identity |
| `/settings` | User preferences |

## Styling

### CSS Variables

Key variables for theming (defined in `globals.css`):

```css
--card-bg: var(--color-bg-secondary);
--card-border: var(--color-border);
--min-touch-target: 44px;
--bp-mobile: 768px;
--bp-tablet: 1024px;
```

### Responsive Breakpoints

- **Desktop** (>1024px): Sidebar visible, full layout
- **Tablet** (768-1024px): Collapsible sidebar overlay
- **Mobile** (<768px): Single column, hamburger menu

## Accessibility

- WCAG 2.1 AA compliance
- 44x44px minimum touch targets
- Full keyboard navigation
- Focus indicators
- Semantic HTML structure
- ARIA labels and roles
- Screen reader support

## Technical Details

### Constants

```typescript
// Filter thresholds
FILTER_HOT_THRESHOLD = 0.50      // 50%
FILTER_NEW_MS = 86400000         // 24 hours
FILTER_DECAYING_THRESHOLD = 0.20 // 20%

// Pool
POOL_TARGET_SECONDS = 60
ENGAGE_QUICK_SECONDS = 5
ENGAGE_STANDARD_SECONDS = 15

// Reply depth
MAX_VISIBLE_REPLY_DEPTH = 2
```

### State Management

- **FilterContext**: Global filter state with localStorage persistence
- **PreferencesContext**: User preferences
- **Local component state**: Selected cards, expanded view, mining status

## Development

### Scripts

```bash
npm run dev        # Start dev server
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm run test       # Run tests
```

### Testing

Tests use Vitest with Testing Library. Run with:

```bash
npm test
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## Contributing

See the main project CONTRIBUTING.md for guidelines.

---

## Changelog

### 1.0.0 (2025-12-26)

- Initial release as part of Milestone 6.6
- Card-based ContentCard component with heat indicators and quick engage
- Sidebar with YOUR SPACES, POPULAR NOW, and FILTERS sections
- CardExpanded modal with ShallowReplyTree (2-level depth)
- CardEngagement with +5s/+15s quick engagement buttons
- useFeed hook with OR filter logic and 4 sort modes
- FeedView with decay-bounded [Load more...] pagination
- useCardNavigation for vim-style keyboard shortcuts (j/k/e/E/Enter/Escape)
- Mobile-responsive design with collapsible sidebar and 44px touch targets
- FilterContext with localStorage persistence
- ESLint and TypeScript clean, production build passes
- 14 tests passing, 6 metrics within target
