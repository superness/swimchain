/**
 * Compose - Post creation page
 *
 * Uses Argon2id action PoW for posts per SPEC_03.
 * Simple version without encryption (encryption is Phase 8).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { usePostSubmit, useSpaces, useMediaUpload, usePrivateContent, usePrivateSpaceIds } from '../hooks/useRpc';
import { usePostPow } from '../hooks/useActionPow';
import { useSponsorship } from '../hooks/useSponsorship';
import { solutionToRpcParams } from '../lib/action-pow';
import { PowProgress } from '../components/PowProgress';
import { useToast } from '../components/Toast';
import './Compose.css';

interface UploadedImage {
  mediaHash: string;
  mediaType: string;
  sizeBytes: number;
  previewUrl: string;
}

interface PendingCompression {
  file: File;
  originalSize: number;
}

export function Compose(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const spaceIdParam = searchParams.get('space');

  const [selectedSpace, setSelectedSpace] = useState(spaceIdParam || '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [pendingCompression, setPendingCompression] = useState<PendingCompression | null>(null);

  const { identity, hasValidIdentity, mode } = useIdentityContext();
  // Unified signer: node's sign_message RPC when embedded, browser keypair otherwise.
  const { sign } = useFeedIdentity();
  // Node-managed private-space crypto (desktop mode): encrypt the post before mining.
  const { encryptForSpace } = usePrivateContent();
  const privateSpaceIds = usePrivateSpaceIds(identity?.publicKey);
  const { state, minePost, cancel, progress, reset, solution } = usePostPow();
  const { isSponsored } = useSponsorship();
  const { submitPost, submitting, error: rpcError } = usePostSubmit();
  const { uploadImage, compressAndUpload, uploading, error: uploadError } = useMediaUpload();
  const { spaces, loading: spacesLoading } = useSpaces();
  const { success, error: showError } = useToast();

  const titleRef = useRef<string>('');
  const bodyRef = useRef<string>('');
  const imagesRef = useRef<UploadedImage[]>([]);
  const submittedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update selected space if param changes
  useEffect(() => {
    if (spaceIdParam && !selectedSpace) {
      setSelectedSpace(spaceIdParam);
    }
  }, [spaceIdParam, selectedSpace]);

  // Get selected space (for validation, space name shown in dropdown)

  // Handle image file selection
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    // Check image limit (max 4 images per post)
    if (images.length >= 4) {
      setSubmitError('Maximum 4 images per post');
      return;
    }

    setSubmitError(null);
    const result = await uploadImage(file);

    // Check if compression is needed
    if (result.needsCompression && result.originalSize) {
      setPendingCompression({
        file,
        originalSize: result.originalSize,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (result.success && result.result) {
      const newImage: UploadedImage = {
        ...result.result,
        previewUrl: URL.createObjectURL(file),
      };
      setImages(prev => [...prev, newImage]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [images.length, uploadImage]);

  // Handle compression confirmation
  const handleCompressConfirm = useCallback(async () => {
    if (!pendingCompression) return;

    const result = await compressAndUpload(pendingCompression.file);

    if (result.success && result.result) {
      const newImage: UploadedImage = {
        ...result.result,
        previewUrl: URL.createObjectURL(pendingCompression.file),
      };
      setImages(prev => [...prev, newImage]);
    }
    setPendingCompression(null);
  }, [pendingCompression, compressAndUpload]);

  // Handle compression cancel
  const handleCompressCancel = useCallback(() => {
    setPendingCompression(null);
  }, []);

  // Remove uploaded image
  const handleRemoveImage = useCallback((index: number) => {
    setImages(prev => {
      const newImages = [...prev];
      const img = newImages[index];
      if (img) {
        URL.revokeObjectURL(img.previewUrl);
      }
      newImages.splice(index, 1);
      return newImages;
    });
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !body.trim()) return;
    if (!hasValidIdentity || !identity) {
      setSubmitError('Please create an identity first');
      return;
    }
    if (!selectedSpace) {
      setSubmitError('Please select a space');
      return;
    }
    // Gate on sponsorship BEFORE mining PoW — the node rejects unsponsored posts
    // (SPEC_11), so mining first only wastes the user's time.
    if (isSponsored === false) {
      setSubmitError(
        'You need a sponsor before you can post. Open "Get Sponsored" to redeem an invite or request sponsorship — no proof-of-work is spent until then.'
      );
      return;
    }

    setSubmitError(null);
    submittedRef.current = false;

    // Private space in node mode: encrypt the (title+body) with the space key via the
    // node BEFORE mining, and submit with an EMPTY title + [PRIVATE:v1:...] body. The
    // empty title matches forum/chat so the stored body reads back as `\n\n<cipher>`
    // and every client's stripTitleSeparator recovers the ciphertext identically. PoW
    // binds to sha256(finalTitle\n\nfinalBody), so we must mine over the CIPHERTEXT.
    let finalTitle = title;
    let finalBody = body;
    if (mode === 'node' && privateSpaceIds.has(selectedSpace)) {
      const cipher = await encryptForSpace(selectedSpace, `${title}\n\n${body}`);
      if (!cipher) {
        setSubmitError('Could not encrypt for this private space. Are you a member?');
        return;
      }
      finalTitle = '';
      finalBody = cipher;
    }

    // Store the FINAL (possibly encrypted) content for submission after mining.
    titleRef.current = finalTitle;
    bodyRef.current = finalBody;
    imagesRef.current = [...images];

    const postContent = `${finalTitle}\n\n${finalBody}`;

    // Convert hex public key to Uint8Array for PoW
    const publicKeyBytes = new Uint8Array(
      identity.publicKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );

    // Start mining with Argon2id action PoW
    try {
      await minePost(postContent, publicKeyBytes, true /* testnet */);
    } catch (err) {
      console.log('[Compose] Mining ended:', err);
    }
  }, [title, body, hasValidIdentity, identity, selectedSpace, images, minePost, isSponsored, mode, privateSpaceIds, encryptForSpace]);

  const handleMiningComplete = useCallback(async () => {
    // Prevent double submission
    if (submittedRef.current) return;
    submittedRef.current = true;

    if (!identity || !solution || !selectedSpace) {
      console.error('[Compose] Missing required data for submission');
      setSubmitError('Missing identity or PoW data');
      reset();
      return;
    }

    // Get PoW params in RPC format
    const powParams = solutionToRpcParams(solution);

    // Convert uploaded images to RPC format
    const mediaRefs = imagesRef.current.map(img => ({
      media_hash: img.mediaHash,
      media_type: img.mediaType,
      size_bytes: img.sizeBytes,
    }));

    console.log('[Compose] Submitting to network:', {
      spaceId: selectedSpace,
      titleLength: titleRef.current.length,
      bodyLength: bodyRef.current.length,
      imageCount: mediaRefs.length,
    });

    try {
      const result = await submitPost(
        selectedSpace,
        titleRef.current,
        bodyRef.current,
        identity.publicKey,
        sign,
        powParams,
        mediaRefs.length > 0 ? mediaRefs : undefined,
      );

      if (result.success && result.contentId) {
        console.log('[Compose] Successfully submitted:', result.contentId);
        success('Post created successfully!');
        navigate(`/post/${result.contentId}`);
      } else {
        console.error('[Compose] Submission failed');
        setSubmitError('Failed to submit post');
        showError('Failed to submit post');
        reset();
      }
    } catch (err) {
      console.error('[Compose] Submission error:', err);
      const errMsg = err instanceof Error ? err.message : 'Submission error';
      setSubmitError(errMsg);
      showError(errMsg);
      reset();
    }
  }, [selectedSpace, identity, sign, solution, submitPost, reset, navigate, success, showError]);

  // Trigger submission when mining completes
  useEffect(() => {
    if (state === 'complete' && !submitting && !submittedRef.current) {
      handleMiningComplete();
    }
  }, [state, submitting, handleMiningComplete]);

  const isMining = state === 'mining';

  // Redirect to identity page if no valid identity
  if (!hasValidIdentity) {
    return (
      <div className="compose-page">
        <div className="compose-page__empty">
          <h2>Identity Required</h2>
          <p>You need to create an identity before posting.</p>
          <Link to="/identity" className="btn btn-primary">
            Create Identity
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="compose-page">
      <header className="compose-page__header">
        <button
          type="button"
          className="compose-page__back"
          onClick={() => navigate(-1)}
          disabled={isMining || submitting}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>
        <h1 className="compose-page__title">Create Post</h1>
      </header>

      <form className="compose-form" onSubmit={handleSubmit}>
        {/* Space Selector */}
        <div className="form-group">
          <label htmlFor="post-space" className="form-label">
            Space
          </label>
          <select
            id="post-space"
            className="form-select"
            value={selectedSpace}
            onChange={(e) => setSelectedSpace(e.target.value)}
            disabled={isMining || submitting || spacesLoading}
            required
          >
            <option value="">Select a space...</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div className="form-group">
          <label htmlFor="post-title" className="form-label">
            Title
          </label>
          <input
            id="post-title"
            type="text"
            className="form-input"
            placeholder="What's this about?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isMining || submitting}
            required
            maxLength={256}
          />
          <span className="form-hint">{title.length}/256</span>
        </div>

        {/* Body */}
        <div className="form-group">
          <label htmlFor="post-body" className="form-label">
            Content
          </label>
          <textarea
            id="post-body"
            className="form-textarea"
            placeholder="Write your post..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={isMining || submitting}
            rows={8}
            required
            maxLength={4096}
          />
          <span className="form-hint">{body.length}/4096</span>
        </div>

        {/* Image Upload Section */}
        <div className="form-group">
          <label className="form-label">Images (optional)</label>

          {/* Image Previews */}
          {images.length > 0 && (
            <div className="image-previews">
              {images.map((img, index) => (
                <div key={img.mediaHash} className="image-preview">
                  <img src={img.previewUrl} alt={`Upload ${index + 1}`} />
                  <button
                    type="button"
                    className="image-remove-btn"
                    onClick={() => handleRemoveImage(index)}
                    disabled={isMining || submitting}
                    aria-label="Remove image"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <span className="image-size">
                    {(img.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Add Image Button */}
          {images.length < 4 && (
            <div className="image-upload-area">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageSelect}
                disabled={isMining || submitting || uploading}
                className="image-input"
                id="image-upload"
              />
              <label htmlFor="image-upload" className="image-upload-btn">
                {uploading ? (
                  <span>Uploading...</span>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>Add Image</span>
                  </>
                )}
              </label>
              <span className="image-hint">
                {images.length}/4 images - Max 1MB each
              </span>
            </div>
          )}

          {uploadError && !pendingCompression && (
            <p className="form-error">{uploadError}</p>
          )}

          {/* Compression Prompt */}
          {pendingCompression && (
            <div className="compression-prompt">
              <div className="compression-prompt-content">
                <p><strong>Image too large</strong></p>
                <p>
                  This image is {(pendingCompression.originalSize / 1024 / 1024).toFixed(2)}MB,
                  which exceeds the 1MB limit.
                </p>
                <p>Would you like to compress it?</p>
                <div className="compression-prompt-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCompressCancel}
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCompressConfirm}
                    disabled={uploading}
                  >
                    {uploading ? 'Compressing...' : 'Compress & Upload'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mining Progress */}
        {isMining && (
          <div className="compose-mining">
            <PowProgress
              attempts={progress.attempts}
              elapsedMs={progress.elapsedMs}
              difficulty={12}
              onCancel={cancel}
            />
          </div>
        )}

        {/* Status Messages */}
        {state === 'cancelled' && (
          <p className="form-cancelled">Mining cancelled.</p>
        )}

        {state === 'error' && (
          <p className="form-error">An error occurred. Please try again.</p>
        )}

        {(submitError || rpcError) && (
          <p className="form-error">{submitError || rpcError}</p>
        )}

        {submitting && (
          <div className="compose-submitting">
            <span>Submitting to network...</span>
          </div>
        )}

        {/* Submit Button */}
        {!isMining && !submitting && state !== 'complete' && (
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!title.trim() || !body.trim() || !selectedSpace}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Create Post
            </button>
          </div>
        )}

        <p className="form-hint compose-hint">
          Creating a post requires proof-of-work mining (~30-60 seconds)
        </p>
      </form>
    </div>
  );
}
