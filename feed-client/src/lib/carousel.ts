/**
 * Carousel helpers for the full-bleed media carousel (ImageGallery hero mode).
 */

/**
 * Derive the active slide index from a scroll-snap track's scroll position.
 * Slides are full-width, so index = scrollLeft / slideWidth, rounded to the
 * nearest slide and clamped to [0, count - 1].
 */
export function activeIndexFromScroll(
  scrollLeft: number,
  slideWidth: number,
  count: number
): number {
  if (slideWidth <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / slideWidth)));
}
