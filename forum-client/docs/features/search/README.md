# Search Feature

Documentation for the forum-client search functionality.

## Feature Status: Placeholder/Not Implemented

**Important:** Search is currently **not fully implemented**. The search page exists but actual full-text search is not available.

## Current Implementation

### Search Page (`/search`)

The dedicated search page provides:

1. **Search Form** - Input field with "Search threads, topics, or keywords..." placeholder
2. **Search Button** - Submits the search form
3. **URL Query Support** - Accepts `?q=` parameter (e.g., `/search?q=test`)
4. **Browse Spaces Fallback** - Lists available spaces for manual browsing

### Header Search Box

The header contains a global search box with:
- Placeholder: "Search (Press / to focus)"
- Keyboard shortcut hint (`/`)
- Clear button (X) when text is entered

## Screenshots

### Search Input (Empty State)
![Search Input](search-input.png)
- Search page with empty input
- "Enter a search query above to find content" message
- Browse Spaces section listing available spaces

### Search Results
![Search Results](search-results.png)
- Shows "Results for: [query]"
- **Notice:** "Search is currently client-side only."
- Instructions to use browser's Ctrl+F/Cmd+F within spaces
- Browse Spaces section for manual discovery

### Header Search
![Header Search](header-search-typing.png)
- Global search box in the app header
- Shows typed query with clear (X) button

## Limitations

1. **No Server-Side Search** - The swimchain node RPC does not have a search endpoint
2. **No Full-Text Indexing** - Content is not indexed for search
3. **Client-Side Only** - Users must manually browse to spaces and use browser find (Ctrl+F)
4. **No Results Display** - Even when a query is submitted, no actual results are shown

## Bugs Found

| Bug | Severity | Description |
|-----|----------|-------------|
| **BUG 1** | Medium | Header search box form submission via keyboard doesn't navigate to `/search` page - React controlled input state issue with programmatic events |
| **BUG 2** | Low | Keyboard shortcut `/` to focus search doesn't work consistently |

## Technical Details

### Components

- `SearchBox.tsx` - Header search component
- `SearchResults.tsx` - Search results page at `/search`

### Routes

- `/search` - Search page (empty state)
- `/search?q=query` - Search results page with query

### Code Location

```
forum-client/src/
  components/
    SearchBox.tsx      # Header search
    SearchBox.css
  pages/
    SearchResults.tsx  # Search results page
    SearchResults.css
```

## Future Implementation

According to the code comments, server-side search will be implemented in a future version. This would require:

1. **Tantivy Integration** - The node has `cli/search_index/` with Tantivy full-text search
2. **RPC Endpoint** - Add `search_content` or similar RPC method
3. **Indexing** - Index content on sync/receive for searchability

## Test Date

2026-02-05
