/**
 * New Thread page - Create a new post in a space
 *
 * Uses Argon2id action PoW for posts per SPEC_03.
 */

import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { usePostSubmit, useSpaces, useMediaUpload } from '../hooks/useRpc';
import { usePostPow } from '../hooks/useActionPow';
import { useSponsorship } from '../hooks/useSponsorship';
import { solutionToRpcParams } from '../lib/action-pow';
import { encryptPost, generatePassphrase } from '../lib/encryption';
import { PowProgress } from '../components/PowProgress';
import './NewThread.css';

interface UploadedImage {
  mediaHash: string;
  mediaType: string;
  sizeBytes: number;
  previewUrl: string;  // Local blob URL for preview
}

interface PendingCompression {
  file: File;
  originalSize: number;
}

export function NewThread(): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  // Compression prompt state
  const [pendingCompression, setPendingCompression] = useState<PendingCompression | null>(null);
  const { identity, sign } = useNodeIdentity();
  const { state, minePost, cancel, progress, reset } = usePostPow();
  const { isSponsored } = useSponsorship();
  const { submitPost, submitting, error: rpcError } = usePostSubmit();
  const { uploadImage, compressAndUpload, uploadEncryptedImage, compressAndUploadEncrypted, uploading, error: uploadError } = useMediaUpload();
  const { spaces } = useSpaces();

  const titleRef = useRef<string>('');
  const bodyRef = useRef<string>('');
  const imagesRef = useRef<UploadedImage[]>([]);
  const encryptedRef = useRef(false);
  const submittedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate random passphrase
  const handleGeneratePassphrase = useCallback(() => {
    setPassphrase(generatePassphrase(16));
    setShowPassphrase(true);
  }, []);

  // Get space name
  const space = spaces.find(s => s.id === spaceId);
  const spaceName = space?.name || (spaceId ? `Space ${spaceId.substring(0, 12)}...` : 'Unknown Space');

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

    // When encryption is enabled, require passphrase before uploading images
    if (encryptionEnabled && !passphrase.trim()) {
      setSubmitError('Enter a passphrase before adding images to an encrypted post');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setSubmitError(null);

    // Use encrypted upload if encryption is enabled
    const result = encryptionEnabled && passphrase.trim()
      ? await uploadEncryptedImage(file, passphrase)
      : await uploadImage(file);

    // Check if compression is needed
    if (result.needsCompression && result.originalSize) {
      // Store file for compression prompt
      setPendingCompression({
        file,
        originalSize: result.originalSize,
      });
      // Clear input so same file can be selected again
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

    // Clear input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [images.length, uploadImage, uploadEncryptedImage, encryptionEnabled, passphrase]);

  // Handle compression confirmation
  const handleCompressConfirm = useCallback(async () => {
    if (!pendingCompression) return;

    // Use encrypted compression if encryption is enabled
    const result = encryptionEnabled && passphrase.trim()
      ? await compressAndUploadEncrypted(pendingCompression.file, passphrase)
      : await compressAndUpload(pendingCompression.file);

    if (result.success && result.result) {
      const newImage: UploadedImage = {
        ...result.result,
        previewUrl: URL.createObjectURL(pendingCompression.file),
      };
      setImages(prev => [...prev, newImage]);
    }
    setPendingCompression(null);
  }, [pendingCompression, compressAndUpload, compressAndUploadEncrypted, encryptionEnabled, passphrase]);

  // Handle compression cancel
  const handleCompressCancel = useCallback(() => {
    setPendingCompression(null);
  }, []);

  // Remove uploaded image
  const handleRemoveImage = useCallback((index: number) => {
    setImages(prev => {
      const newImages = [...prev];
      const img = newImages[index];
      // Revoke blob URL to free memory
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
    if (!identity) {
      setSubmitError('Node identity not available - is the node running?');
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
    if (!spaceId) {
      setSubmitError('No space ID');
      return;
    }
    if (encryptionEnabled && !passphrase.trim()) {
      setSubmitError('Please enter a passphrase for encryption');
      return;
    }

    setSubmitError(null);
    submittedRef.current = false;

    // Encrypt content if enabled
    let finalTitle = title;
    let finalBody = body;
    encryptedRef.current = false;

    if (encryptionEnabled && passphrase.trim()) {
      try {
        const encrypted = await encryptPost(title, body, passphrase);
        finalTitle = encrypted.encryptedTitle;
        finalBody = encrypted.encryptedBody;
        encryptedRef.current = true;
      } catch (err) {
        console.error('[NewThread] Encryption failed:', err);
        setSubmitError('Failed to encrypt content');
        return;
      }
    }

    // Store content for use after mining completes
    titleRef.current = finalTitle;
    bodyRef.current = finalBody;
    imagesRef.current = [...images];

    // PoW is computed over final content (encrypted or plain)
    const postContent = `${finalTitle}\n\n${finalBody}`;

    // Convert hex public key to Uint8Array for PoW
    const publicKeyBytes = new Uint8Array(identity.publicKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    // Start mining with Argon2id action PoW
    try {
      const minedSolution = await minePost(postContent, publicKeyBytes, true /* testnet */);

      // Immediately submit after mining completes - don't rely on useEffect
      // This fixes the navigation bug where useEffect timing could cause issues
      if (submittedRef.current) return; // Guard against double submission
      submittedRef.current = true;

      // Get PoW params in RPC format
      const powParams = solutionToRpcParams(minedSolution);

      // Convert uploaded images to RPC format
      const mediaRefs = imagesRef.current.map(img => ({
        media_hash: img.mediaHash,
        media_type: img.mediaType,
        size_bytes: img.sizeBytes,
      }));

      const result = await submitPost(
        spaceId,
        titleRef.current,
        bodyRef.current,
        identity.publicKey,
        sign,
        powParams,
        mediaRefs.length > 0 ? mediaRefs : undefined,
      );

      if (result.success && result.contentId) {
        // Navigate to the new thread
        navigate(`/spaces/${spaceId}/thread/${result.contentId}`);
      } else {
        console.error('[NewThread] Submission failed:', result);
        setSubmitError('Failed to submit post');
        reset();
      }
    } catch (err) {
      // Mining cancelled or failed - error state is handled by hook
      if (!submittedRef.current) {
        setSubmitError(err instanceof Error ? err.message : 'Mining failed');
      }
    }
  }, [title, body, identity, spaceId, encryptionEnabled, passphrase, images, minePost, submitPost, sign, navigate, reset, isSponsored]);

  const isMining = state === 'mining';

  if (!spaceId) {
    return (
      <div className="new-thread-page">
        <div className="error-state">Invalid space</div>
      </div>
    );
  }

  return (
    <div className="new-thread-page">
      <nav className="thread-breadcrumb" aria-label="Breadcrumb">
        <Link to="/spaces">Spaces</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/spaces/${spaceId}`}>{spaceName}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">New Thread</span>
      </nav>

      <header className="new-thread-header">
        <h1>Create New Thread</h1>
        <p className="new-thread-subtitle">
          Post to <strong>{spaceName}</strong>
        </p>
      </header>

      <form className="new-thread-form" onSubmit={handleSubmit}>
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
        </div>

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
        </div>

        {/* Image Upload Section */}
        <div className="form-group">
          <label className="form-label">
            Images (optional)
          </label>

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
                {images.length}/4 images • Max 1MB each • JPEG, PNG, GIF, WebP
              </span>
            </div>
          )}

          {uploadError && !pendingCompression && (
            <p className="form-error">{uploadError}</p>
          )}

          {/* Compression Prompt Dialog */}
          {pendingCompression && (
            <div className="compression-prompt">
              <div className="compression-prompt-content">
                <p>
                  <strong>Image too large</strong>
                </p>
                <p>
                  This image is {(pendingCompression.originalSize / 1024 / 1024).toFixed(2)}MB,
                  which exceeds the 1MB limit.
                </p>
                <p>
                  Would you like to compress it? The image will be converted to JPEG
                  and resized to fit within the limit.
                </p>
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

        {/* Encryption Toggle */}
        <div className={`encryption-toggle ${encryptionEnabled ? 'active' : ''}`}>
          <label className="encryption-toggle-label">
            <input
              type="checkbox"
              checked={encryptionEnabled}
              onChange={(e) => setEncryptionEnabled(e.target.checked)}
              disabled={isMining || submitting}
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Encrypt this post</span>
          </label>

          {encryptionEnabled && (
            <div className="encryption-passphrase">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter passphrase..."
                disabled={isMining || submitting}
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                title={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showPassphrase ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                onClick={handleGeneratePassphrase}
                title="Generate random passphrase"
              >
                Generate
              </button>
            </div>
          )}
        </div>

        {encryptionEnabled && (
          <div className="encryption-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              Save your passphrase! Without it, no one (including you) can read this post.
            </span>
          </div>
        )}

        {isMining && (
          <div className="new-thread-mining">
            <PowProgress
              attempts={progress.attempts}
              elapsedMs={progress.elapsedMs}
              difficulty={12} /* Testnet Post difficulty */
              onCancel={cancel}
            />
          </div>
        )}

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
          <div className="new-thread-submitting">
            <span>Submitting to network...</span>
          </div>
        )}

        {!isMining && !submitting && state !== 'complete' && (
          <div className="form-actions">
            <Link
              to={`/spaces/${spaceId}`}
              className="btn btn-secondary"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!title.trim() || !body.trim() || !identity || (encryptionEnabled && !passphrase.trim())}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Create Thread
            </button>
          </div>
        )}

        <p className="form-hint">
          Creating a thread requires proof-of-work mining (~60 seconds)
        </p>
      </form>
    </div>
  );
}
