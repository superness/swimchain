/**
 * ImageGallery - displays images with thumbnail preview and lightbox expansion
 *
 * Features:
 * - Hero mode: full-bleed swipe carousel for feed cards and post detail
 * - Thumbnail mode for compact rows
 * - Lightbox with keyboard navigation (arrows, Escape)
 * - Encrypted image indicators
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { activeIndexFromScroll } from '../lib/carousel';
import './ImageGallery.css';

interface MediaRef {
  mediaHash: string;
  mediaType: string;
  url?: string;
  sizeBytes?: number;
}

interface ImageGalleryProps {
  mediaRefs: MediaRef[];
  /** Show as small thumbnails (for feed list) */
  thumbnailMode?: boolean;
  /** Full-bleed swipe carousel (for feed cards / post detail) */
  heroMode?: boolean;
  /** Maximum thumbnails to show before "+N more" */
  maxThumbnails?: number;
  /** Function to get media URL from hash */
  getMediaUrl?: (hash: string) => Promise<string | null>;
}

/**
 * Check if a media type indicates encrypted content
 */
function isEncryptedMedia(mediaType: string): boolean {
  return mediaType.startsWith('encrypted:');
}

function LockIcon(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ImageIcon(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export function ImageGallery({
  mediaRefs,
  thumbnailMode = false,
  heroMode = false,
  maxThumbnails = 3,
  getMediaUrl,
}: ImageGalleryProps): JSX.Element | null {
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [encryptedLocked, setEncryptedLocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Load image URLs
  useEffect(() => {
    if (!mediaRefs || mediaRefs.length === 0) {
      setLoading(false);
      return;
    }

    setImageUrls(new Map());
    setEncryptedLocked(new Set());
    setLoading(true);
    setActiveIndex(0);

    const loadImages = async () => {
      const urls = new Map<string, string>();
      const locked = new Set<string>();

      for (const ref of mediaRefs) {
        try {
          // Check if this is an encrypted image
          if (isEncryptedMedia(ref.mediaType)) {
            locked.add(ref.mediaHash);
            continue;
          }

          // Use pre-loaded URL if available
          if (ref.url) {
            urls.set(ref.mediaHash, ref.url);
            continue;
          }

          // Try to get URL from provider
          if (getMediaUrl) {
            const url = await getMediaUrl(ref.mediaHash);
            if (url) {
              urls.set(ref.mediaHash, url);
            }
          }
        } catch (err) {
          console.error('[ImageGallery] Failed to load image:', ref.mediaHash, err);
        }
      }

      setImageUrls(urls);
      setEncryptedLocked(locked);
      setLoading(false);
    };

    loadImages();
  }, [mediaRefs, getMediaUrl]);

  // Handle keyboard navigation in lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex(prev =>
          prev !== null && prev < mediaRefs.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex(prev =>
          prev !== null && prev > 0 ? prev - 1 : prev
        );
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, mediaRefs.length]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [lightboxIndex]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goToPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(prev =>
      prev !== null && prev > 0 ? prev - 1 : prev
    );
  }, []);

  const goToNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(prev =>
      prev !== null && prev < mediaRefs.length - 1 ? prev + 1 : prev
    );
  }, [mediaRefs.length]);

  // Carousel: derive the active slide from the snap track's scroll position
  const handleTrackScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setActiveIndex(
      activeIndexFromScroll(track.scrollLeft, track.clientWidth, mediaRefs.length)
    );
  }, [mediaRefs.length]);

  const scrollToSlide = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  }, []);

  if (!mediaRefs || mediaRefs.length === 0) return null;

  if (loading) {
    if (heroMode) {
      return (
        <div className="image-hero image-hero--loading" aria-hidden="true">
          <div className="image-hero__shimmer" />
        </div>
      );
    }
    return (
      <div className={`image-gallery ${thumbnailMode ? 'thumbnail-mode' : ''} loading`}>
        <div className="image-loading-placeholder" />
      </div>
    );
  }

  // Shared lightbox (used by both layouts)
  const lightbox = lightboxIndex !== null && (
    <div
      className="image-lightbox-overlay"
      onClick={closeLightbox}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <div className="image-lightbox-content" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button
          className="image-lightbox-close"
          onClick={closeLightbox}
          aria-label="Close"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Navigation arrows */}
        {mediaRefs.length > 1 && (
          <>
            <button
              className="image-lightbox-nav prev"
              onClick={goToPrev}
              disabled={lightboxIndex === 0}
              aria-label="Previous image"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              className="image-lightbox-nav next"
              onClick={goToNext}
              disabled={lightboxIndex === mediaRefs.length - 1}
              aria-label="Next image"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </>
        )}

        {/* Main image */}
        {mediaRefs[lightboxIndex] && (
          <img
            src={imageUrls.get(mediaRefs[lightboxIndex].mediaHash) || ''}
            alt={`Image ${lightboxIndex + 1} of ${mediaRefs.length}`}
            className="image-lightbox-img"
          />
        )}

        {/* Counter */}
        {mediaRefs.length > 1 && (
          <div className="image-lightbox-counter">
            {lightboxIndex + 1} / {mediaRefs.length}
          </div>
        )}
      </div>
    </div>
  );

  // Hero mode: full-bleed swipe carousel (one full-width slide per image)
  if (heroMode) {
    const multi = mediaRefs.length > 1;
    return (
      <>
        <div className={`image-hero ${multi ? 'image-hero--multi' : 'image-hero--single'}`}>
          <div
            className="image-hero__track"
            ref={trackRef}
            onScroll={multi ? handleTrackScroll : undefined}
          >
            {mediaRefs.map((ref, index) => {
              const url = imageUrls.get(ref.mediaHash);
              const isLocked =
                encryptedLocked.has(ref.mediaHash) || isEncryptedMedia(ref.mediaType);

              if (url) {
                return (
                  <button
                    key={ref.mediaHash}
                    className="image-hero__slide"
                    onClick={() => openLightbox(index)}
                    type="button"
                    aria-label={`View image ${index + 1} of ${mediaRefs.length}`}
                  >
                    <img
                      src={url}
                      alt={`Attachment ${index + 1}`}
                      className="image-hero__img"
                      loading="lazy"
                    />
                  </button>
                );
              }

              return (
                <div
                  key={ref.mediaHash}
                  className={`image-hero__slide image-hero__placeholder ${isLocked ? 'encrypted-locked' : ''}`}
                  title={isLocked ? 'Encrypted image' : undefined}
                >
                  {isLocked ? <LockIcon /> : <ImageIcon />}
                </div>
              );
            })}
          </div>

          {multi && (
            <div className="image-hero__counter" aria-hidden="true">
              {activeIndex + 1}/{mediaRefs.length}
            </div>
          )}
        </div>

        {multi && (
          <div className="image-hero__dots">
            {mediaRefs.map((ref, index) => (
              <button
                key={ref.mediaHash}
                type="button"
                className={`image-hero__dot ${index === activeIndex ? 'image-hero__dot--active' : ''}`}
                onClick={() => scrollToSlide(index)}
                aria-label={`Go to image ${index + 1} of ${mediaRefs.length}`}
                aria-current={index === activeIndex}
              />
            ))}
          </div>
        )}

        {lightbox}
      </>
    );
  }

  // Determine which images to show (limit in thumbnail mode)
  const displayRefs = thumbnailMode ? mediaRefs.slice(0, maxThumbnails) : mediaRefs;
  const hiddenCount = thumbnailMode ? Math.max(0, mediaRefs.length - maxThumbnails) : 0;

  return (
    <>
      <div className={`image-gallery ${thumbnailMode ? 'thumbnail-mode' : ''}`}>
        {displayRefs.map((ref, index) => {
          const url = imageUrls.get(ref.mediaHash);
          const isLocked = encryptedLocked.has(ref.mediaHash);
          const isEncrypted = isEncryptedMedia(ref.mediaType);

          if (url) {
            return (
              <button
                key={ref.mediaHash}
                className="image-gallery-item"
                onClick={() => openLightbox(index)}
                type="button"
                aria-label={`View image ${index + 1} of ${mediaRefs.length}`}
              >
                <img
                  src={url}
                  alt={`Attachment ${index + 1}`}
                  className="image-gallery-img"
                  loading="lazy"
                />
              </button>
            );
          }

          // Show lock icon for encrypted images
          if (isLocked || isEncrypted) {
            return (
              <div key={ref.mediaHash} className="image-gallery-placeholder encrypted-locked" title="Encrypted image">
                <LockIcon />
              </div>
            );
          }

          // Default placeholder for loading/failed images
          return (
            <div key={ref.mediaHash} className="image-gallery-placeholder">
              <ImageIcon />
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <button
            className="image-gallery-more"
            onClick={() => openLightbox(maxThumbnails)}
            type="button"
          >
            +{hiddenCount}
          </button>
        )}
      </div>

      {lightbox}
    </>
  );
}

/**
 * Simple thumbnail indicator for feed cards
 * Shows a small icon indicating the post has images
 */
export function ImageThumbnailIndicator({ count }: { count: number }): JSX.Element {
  return (
    <span className="image-thumbnail-indicator" title={`${count} image${count > 1 ? 's' : ''} attached`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      {count > 1 && <span className="image-count">{count}</span>}
    </span>
  );
}
