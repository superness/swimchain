# Feed full-bleed media design

**Date:** 2026-07-24
**Scope:** `feed-client` (used by web deploy, desktop launcher app, and mobile app webview)

## Problem

Post images in the feed render as small boxed inline images (capped 400×300,
`object-fit: contain`, bordered rounded box) inside a padded card. On a phone
an image occupies roughly a third of the screen width with dead space around
it. Modern mobile social feeds (Instagram, Twitter/X) make media the dominant
element: full card width, edge-to-edge on mobile, swipeable carousels for
multiple images.

## Approved design (operator confirmed 2026-07-24)

1. **Aspect ratio — capped natural.** Single image: full card width, natural
   aspect ratio, height capped at ~4:5 portrait (`max-height:
   min(125vw, 640px)`) with `object-fit: cover` cropping beyond the cap. Wide
   images show fully; very tall images crop instead of eating the feed.
2. **Multi-image — swipe carousel.** Instagram-style: one full-width slide at
   a time, horizontal scroll with `scroll-snap`, dot indicators below and an
   `n/N` counter chip on the image. All slides share a fixed 4:5 frame
   (`object-fit: cover`) so the carousel height is stable while swiping.
   All images are rendered (no `+N more` cap in the feed).
3. **Scope — all viewports.** Media bleeds past the card's horizontal padding
   to the card edge at every width. Under 600px the card is already
   edge-to-edge, so media touches the screen edges there.

## Components

- **`ImageGallery`** gains a `heroMode` prop (alongside the existing
  `thumbnailMode`): renders the full-bleed carousel described above. Existing
  URL loading, encrypted-lock handling, and the lightbox are reused. Tapping a
  slide opens the lightbox. Active slide index derives from track scroll
  position (`round(scrollLeft / slideWidth)`), extracted as a pure helper for
  testing.
  - Loading state in hero mode: full-width shimmer block (16:10) instead of
    the 80px square.
  - Encrypted media in hero mode: full-width locked panel.
- **`FeedCard`** wraps the gallery in `.feed-card__media-bleed`, which owns
  the negative-margin bleed (`margin: 0 calc(-1 * var(--spacing-lg))`), so the
  card — not the gallery — knows its own padding. Non-compact cards use
  `heroMode`; compact rows keep the small indicator icon.
- **`Post` detail page** switches to `heroMode` too (same component, its
  container padding bleed handled with a local class).
- **Cleanup:** remove the dead `.feed-card__media*` grid CSS in
  `FeedCard.css` (never referenced from TSX).

## Error handling

Unchanged from current gallery behavior: failed loads show a placeholder
(now full-width in hero mode); encrypted images show a locked panel; posts
with no resolvable media render nothing extra.

## Testing

- Unit test the scroll→index helper (vitest, alongside existing
  `lib/*.test.ts` pattern).
- Visual verification: Vite dev server + Chrome mobile-viewport screenshots of
  single-image, multi-image (carousel swipe), and no-image posts, plus desktop
  width.
