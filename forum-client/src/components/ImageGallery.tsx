import { useState, useEffect, useCallback } from 'react';
import { useMediaUpload, useRpc } from '../hooks/useRpc';
import './ImageGallery.css';

interface MediaRef {
  mediaHash: string;
  mediaType: string;
  sizeBytes?: number;
}

interface ImageGalleryProps {
  mediaRefs: MediaRef[];
  /** Show as small thumbnails (for thread list) */
  thumbnailMode?: boolean;
  /** Maximum thumbnails to show before "+N more" */
  maxThumbnails?: number;
  /** Passphrase for decrypting encrypted images */
  encryptionPassphrase?: string;
}

/**
 * Check if a media type indicates encrypted content
 */
function isEncryptedMedia(mediaType: string): boolean {
  return mediaType.startsWith('encrypted:');
}

/**
 * Extract original media type from encrypted type
 * e.g., "encrypted:image/jpeg" -> "image/jpeg"
 */
function getOriginalMediaType(encryptedType: string): string {
  return encryptedType.replace('encrypted:', '');
}

/**
 * ImageGallery - displays images with thumbnail preview and lightbox expansion
 *
 * In thumbnail mode: shows small previews, click to open lightbox
 * In full mode: shows larger images, click to open lightbox
 *
 * Supports encrypted images - when mediaType starts with "encrypted:",
 * the image bytes are decrypted using the provided passphrase before display.
 */
export function ImageGallery({
  mediaRefs,
  thumbnailMode = false,
  maxThumbnails = 3,
  encryptionPassphrase
}: ImageGalleryProps): JSX.Element | null {
  const { getMediaUrl } = useMediaUpload();
  const { rpc, connected } = useRpc();
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [encryptedLocked, setEncryptedLocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Load image URLs (with decryption support for encrypted images)
  useEffect(() => {
    if (!mediaRefs || mediaRefs.length === 0) {
      setLoading(false);
      return;
    }

    // Clear existing state immediately when passphrase changes
    // This prevents showing old decrypted images while loading new state
    setImageUrls(new Map());
    setEncryptedLocked(new Set());
    setLoading(true);

    const loadImages = async () => {
      const urls = new Map<string, string>();
      const locked = new Set<string>();

      for (const ref of mediaRefs) {
        try {
          // Check if this is an encrypted image
          if (isEncryptedMedia(ref.mediaType)) {
            if (!encryptionPassphrase) {
              // No passphrase - mark as locked
              locked.add(ref.mediaHash);
              continue;
            }

            // Fetch encrypted data and decrypt
            if (!rpc || !connected) {
              locked.add(ref.mediaHash);
              continue;
            }

            try {
              // Import decryption functions
              const { decryptMedia, base64ToBytes, bytesToBase64 } = await import('../lib/encryption');
              const { getMediaFromCache, setMediaInCache } = await import('../lib/cache');

              // Check cache first for decrypted version
              const cacheKey = `${ref.mediaHash}:decrypted`;
              const cached = await getMediaFromCache(cacheKey);
              if (cached) {
                urls.set(ref.mediaHash, `data:${cached.mediaType};base64,${cached.data}`);
                continue;
              }

              // Fetch encrypted data from node
              const result = await rpc.getMedia(ref.mediaHash);
              const encryptedBytes = base64ToBytes(result.data);

              // Decrypt the image
              const decryptedBytes = await decryptMedia(encryptedBytes, encryptionPassphrase);
              if (!decryptedBytes) {
                console.error('[ImageGallery] Decryption failed:', ref.mediaHash.substring(0, 12));
                locked.add(ref.mediaHash);
                continue;
              }

              // Get original media type
              const originalType = getOriginalMediaType(ref.mediaType);
              const decryptedBase64 = bytesToBase64(decryptedBytes);

              // Cache the decrypted image
              await setMediaInCache(cacheKey, decryptedBase64, originalType);

              // Create data URL
              urls.set(ref.mediaHash, `data:${originalType};base64,${decryptedBase64}`);
            } catch (decryptErr) {
              console.error('[ImageGallery] Failed to decrypt:', ref.mediaHash, decryptErr);
              locked.add(ref.mediaHash);
            }
          } else {
            // Non-encrypted image - load normally
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
  }, [mediaRefs, getMediaUrl, encryptionPassphrase, rpc, connected]);

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

  if (!mediaRefs || mediaRefs.length === 0) return null;

  if (loading) {
    return (
      <div className={`image-gallery ${thumbnailMode ? 'thumbnail-mode' : ''} loading`}>
        <div className="image-loading-placeholder" />
      </div>
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

          // Show lock icon for encrypted images without passphrase
          if (isLocked || isEncrypted) {
            return (
              <div key={ref.mediaHash} className="image-gallery-placeholder encrypted-locked" title="Encrypted image - enter passphrase to view">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            );
          }

          // Default placeholder for loading/failed images
          return (
            <div key={ref.mediaHash} className="image-gallery-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
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

      {/* Lightbox */}
      {lightboxIndex !== null && (
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
      )}
    </>
  );
}

/**
 * Simple thumbnail indicator for thread list
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
