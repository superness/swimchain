/**
 * User Profile Page
 *
 * View and edit user profiles. Users can optionally set up their profile
 * with a display name, bio, and avatar. Profiles are stored on-chain
 * in a deterministic "profile space" tied to the user's public key.
 *
 * Profile updates require Argon2id action PoW per SPEC_03.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { useUserProfile, clearProfileCache } from '../hooks/useUserProfile';
import { useRpc, usePostSubmit, useMediaUpload } from '../hooks/useRpc';
import { usePostPow } from '../hooks/useActionPow';
import { useSponsorship } from '../hooks/useSponsorship';
import { solutionToRpcParams } from '../lib/action-pow';
import { PowProgress } from '../components/PowProgress';
import {
  getProfileSpaceId,
  encodeProfileInfo,
  encodeAvatarInfo,
  ProfileInfo,
  getAvatarColor,
  getAvatarInitials,
  truncateAddress,
} from '../lib/profile';
import './Profile.css';

export function ProfilePage(): JSX.Element {
  const { userPk: paramUserPk } = useParams<{ userPk?: string }>();
  // Identity + signer come from the unified feed identity: node mode uses the
  // node's pubkey + sign_message RPC, browser mode uses the local keypair. Reading
  // from useStoredIdentity/useStoredKeypair broke "your" profile in node mode
  // (no browser keypair → myPk null → own profile never resolved, save dead-ended).
  const { publicKey, sign, hasIdentity } = useFeedIdentity();
  const myPk = publicKey ?? undefined;
  const { connected } = useRpc();

  // Determine whose profile we're viewing
  const targetPk = paramUserPk || myPk;
  const isOwnProfile = targetPk === myPk;

  // Fetch profile data
  const { profile, loading, error, refetch } = useUserProfile(targetPk);

  // PoW and submission hooks
  const { state: powState, minePost, cancel: cancelMining, progress, reset: resetPow, solution } = usePostPow();
  const { submitPost, submitting, error: submitRpcError } = usePostSubmit();
  const { uploadImage } = useMediaUpload();
  const { isSponsored } = useSponsorship();

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStep, setSaveStep] = useState<'idle' | 'uploading' | 'mining' | 'submitting'>('idle');

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Refs for data needed after PoW completes
  const pendingProfileRef = useRef<{
    profileInfo: ProfileInfo;
    avatarContentId?: string;
    avatarFormat?: string;
  } | null>(null);
  const submittedRef = useRef(false);

  // Start editing
  const handleEdit = useCallback(() => {
    setDisplayName(profile?.info?.displayName || '');
    setBio(profile?.info?.bio || '');
    setWebsite(profile?.info?.website || '');
    setIsEditing(true);
    setSaveError(null);
  }, [profile]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setSaveError(null);
    setSaveStep('idle');
    pendingProfileRef.current = null;
    if (powState === 'mining') {
      cancelMining();
    }
    resetPow();
  }, [powState, cancelMining, resetPow]);

  // Whether the form is currently busy with saving operations
  const isSaving = saveStep !== 'idle' || submitting;

  // Handle avatar file selection
  const handleAvatarSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveError('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setSaveError('Image must be less than 2MB');
      return;
    }

    setAvatarFile(file);
    setSaveError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // Save profile - starts PoW mining process
  const handleSave = useCallback(async () => {
    if (!connected || !myPk || !hasIdentity) {
      setSaveError('Not connected or no identity');
      return;
    }

    // Gate on sponsorship BEFORE mining — profile updates are posts and the
    // node rejects unsponsored posts (SPEC_11), so mining first only wastes
    // proof-of-work and ends in a generic failure.
    if (isSponsored === false) {
      setSaveError(
        'Your identity is not sponsored yet. Find a sponsor before updating your profile — no proof-of-work is spent until then.'
      );
      return;
    }

    setSaveError(null);
    submittedRef.current = false;

    // Prepare profile info
    const profileInfo: ProfileInfo = {
      displayName: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
      website: website.trim() || undefined,
      updatedAt: Date.now(),
    };

    try {
      // Upload avatar first if selected (before mining)
      let avatarContentId: string | undefined;
      let avatarFormat: string | undefined;

      if (avatarFile) {
        setSaveStep('uploading');
        const result = await uploadImage(avatarFile);

        if (result.success && result.result) {
          avatarContentId = result.result.mediaHash;
          avatarFormat = avatarFile.type.split('/')[1] || 'png';
        } else {
          setSaveError('Failed to upload avatar image');
          setSaveStep('idle');
          return;
        }
      }

      // Store data for use after mining completes
      pendingProfileRef.current = {
        profileInfo,
        avatarContentId,
        avatarFormat,
      };

      // Build content for PoW (profile info as the "post" content)
      const content = encodeProfileInfo(profileInfo);

      // Convert hex public key to Uint8Array
      const publicKeyBytes = new Uint8Array(
        myPk.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );

      // Start mining
      setSaveStep('mining');
      await minePost(content, publicKeyBytes, true /* testnet */);
    } catch (err) {
      console.error('Profile save error:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save profile');
      setSaveStep('idle');
    }
  }, [connected, myPk, hasIdentity, isSponsored, displayName, bio, website, avatarFile, uploadImage, minePost]);

  // Handle mining completion - submit to network
  const handleMiningComplete = useCallback(async () => {
    if (submittedRef.current || !solution || !myPk || !hasIdentity) return;
    submittedRef.current = true;

    const pending = pendingProfileRef.current;
    if (!pending) {
      setSaveError('No pending profile data');
      setSaveStep('idle');
      resetPow();
      return;
    }

    setSaveStep('submitting');

    try {
      const profileSpaceId = getProfileSpaceId(myPk);
      const powParams = solutionToRpcParams(solution);

      // Create async sign wrapper
      const asyncSign = async (message: Uint8Array): Promise<Uint8Array | null> => {
        return sign(message);
      };

      // Build the post body combining avatar and profile info
      // For profile space, we post info as the body (no title needed)
      let postBody = encodeProfileInfo(pending.profileInfo);

      // If we have an avatar, include it in the profile info
      if (pending.avatarContentId && pending.avatarFormat) {
        const avatarInfo = encodeAvatarInfo({
          contentId: pending.avatarContentId,
          format: pending.avatarFormat,
          updatedAt: Date.now(),
        });
        // Combine avatar and profile info (avatar first, then profile)
        postBody = `${avatarInfo}\n---\n${postBody}`;
      }

      const result = await submitPost(
        profileSpaceId,
        '', // No title for profile posts
        postBody,
        myPk,
        asyncSign,
        powParams,
      );

      if (result.success) {
        clearProfileCache(myPk);
        await refetch();

        setIsEditing(false);
        setAvatarFile(null);
        setAvatarPreview(null);
        setSaveStep('idle');
        resetPow();
      } else {
        setSaveError('Failed to submit profile update');
        setSaveStep('idle');
        resetPow();
      }
    } catch (err) {
      console.error('[Profile] Submission error:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to submit profile');
      setSaveStep('idle');
      resetPow();
    }

    pendingProfileRef.current = null;
  }, [solution, myPk, hasIdentity, sign, submitPost, refetch, resetPow]);

  // Trigger submission when mining completes
  useEffect(() => {
    if (powState === 'complete' && !submitting && !submittedRef.current) {
      handleMiningComplete();
    }
  }, [powState, submitting, handleMiningComplete]);

  // Handle mining errors
  useEffect(() => {
    if (powState === 'error') {
      setSaveError('Mining failed. Please try again.');
      setSaveStep('idle');
    } else if (powState === 'cancelled') {
      setSaveStep('idle');
    }
  }, [powState]);

  // Not logged in
  if (!myPk && !paramUserPk) {
    return (
      <div className="profile-page">
        <div className="profile-empty">
          <h2>Profile</h2>
          <p>Create an identity to set up your profile.</p>
          <Link to="/identity" className="profile-btn profile-btn--primary">
            Create Identity
          </Link>
        </div>
      </div>
    );
  }

  // Invalid user
  if (!targetPk) {
    return (
      <div className="profile-page">
        <div className="profile-error">
          <h2>Profile Not Found</h2>
          <p>Invalid user address.</p>
          <Link to="/" className="profile-btn profile-btn--primary">
            Go to Feed
          </Link>
        </div>
      </div>
    );
  }

  const bannerColor = profile?.info?.bannerColor || getAvatarColor(targetPk);
  const avatarColor = getAvatarColor(targetPk);
  const initials = getAvatarInitials(profile?.info?.displayName, targetPk);

  return (
    <div className="profile-page">
      {/* Banner */}
      <div className="profile-banner" style={{ backgroundColor: bannerColor }} />

      {/* Header */}
      <div className="profile-header">
        <div className="profile-avatar-wrapper">
          {isEditing ? (
            <div className="avatar-edit-wrapper">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar preview" className="avatar-preview" />
              ) : (
                <div
                  className="profile-avatar"
                  style={{ backgroundColor: avatarColor }}
                >
                  {initials}
                </div>
              )}
              <button
                type="button"
                className="avatar-edit-button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change avatar"
                disabled={isSaving}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                style={{ display: 'none' }}
                disabled={isSaving}
              />
            </div>
          ) : (
            <div
              className="profile-avatar"
              style={{ backgroundColor: avatarColor }}
            >
              {initials}
            </div>
          )}
        </div>

        <div className="profile-info">
          {isEditing ? (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="profile-name-input"
              maxLength={50}
              disabled={isSaving}
            />
          ) : (
            <h1 className="profile-name">
              {profile?.info?.displayName || truncateAddress(targetPk)}
            </h1>
          )}

          <div className="profile-address">
            <code>{targetPk.slice(0, 12)}...{targetPk.slice(-8)}</code>
          </div>
        </div>

        {isOwnProfile && !isEditing && (
          <button type="button" className="profile-btn profile-btn--ghost" onClick={handleEdit}>
            Edit Profile
          </button>
        )}
      </div>

      {/* Content */}
      <div className="profile-content">
        {loading && !profile ? (
          <div className="profile-loading">Loading profile...</div>
        ) : error && !profile ? (
          <div className="profile-error-message">{error}</div>
        ) : (
          <>
            {/* Bio Section */}
            <section className="profile-section">
              <h3>About</h3>
              {isEditing ? (
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="profile-bio-input"
                  maxLength={500}
                  rows={4}
                  disabled={isSaving}
                />
              ) : (
                <p className="profile-bio">
                  {profile?.info?.bio || (isOwnProfile ? 'No bio yet. Click Edit to add one!' : 'No bio.')}
                </p>
              )}
            </section>

            {/* Website/Links Section */}
            <section className="profile-section">
              <h3>Links</h3>
              {isEditing ? (
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://your-website.com"
                  className="profile-website-input"
                  disabled={isSaving}
                />
              ) : profile?.info?.website ? (
                <a
                  href={profile.info.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile-website"
                >
                  {profile.info.website.replace(/^https?:\/\//, '')}
                </a>
              ) : (
                <p className="profile-no-links">No links added.</p>
              )}
            </section>

            {/* Actions */}
            {isEditing && (
              <div className="profile-actions">
                {/* Error display */}
                {(saveError || submitRpcError) && (
                  <div className="profile-save-error">{saveError || submitRpcError}</div>
                )}

                {/* Mining progress */}
                {saveStep === 'mining' && powState === 'mining' && (
                  <div className="profile-mining">
                    <PowProgress
                      attempts={progress.attempts}
                      elapsedMs={progress.elapsedMs}
                      difficulty={12}
                      onCancel={() => {
                        cancelMining();
                        setSaveStep('idle');
                      }}
                    />
                    <p className="profile-mining-hint">
                      Profile updates require proof-of-work (~30-60 seconds)
                    </p>
                  </div>
                )}

                {/* Uploading indicator */}
                {saveStep === 'uploading' && (
                  <div className="profile-status">Uploading avatar...</div>
                )}

                {/* Submitting indicator */}
                {saveStep === 'submitting' && (
                  <div className="profile-status">Submitting to network...</div>
                )}

                {/* Buttons (hide during active operations) */}
                {saveStep === 'idle' && (
                  <>
                    <button
                      type="button"
                      className="profile-btn profile-btn--ghost"
                      onClick={handleCancel}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="profile-btn profile-btn--primary"
                      onClick={handleSave}
                    >
                      Save Profile
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Follow button for other profiles */}
            {!isOwnProfile && myPk && (
              <div className="profile-actions">
                <Link
                  to={`/?author=${targetPk}`}
                  className="profile-btn profile-btn--primary"
                >
                  View Posts
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;
