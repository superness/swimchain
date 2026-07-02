/**
 * User Profile Page
 *
 * View and edit user profiles. Users can optionally set up their profile
 * with a display name, bio, and avatar. Profiles are stored on-chain
 * in a deterministic "profile space" tied to the user's public key.
 */

import { useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { useUserProfile, clearProfileCache } from '../hooks/useUserProfile';
import { useRpc } from '../hooks/useRpc';
import { UserAvatar } from '../components/UserAvatar';
import { StartDMButton } from '../components/StartDMButton';
import {
  getProfileSpaceId,
  encodeProfileInfo,
  encodeAvatarInfo,
  ProfileInfo,
  getAvatarColor,
} from '../lib/profile';
import { bytesToHex } from '../lib/x25519';
import { usePostPow } from '../hooks/useActionPow';
import { solutionToRpcParams } from '../lib/action-pow';
import './Profile.css';

// Validate that a string is a valid hex public key (64 hex chars)
function isValidPublicKey(pk: string | undefined): pk is string {
  if (!pk) return false;
  // Must be 64 hex characters
  return /^[0-9a-fA-F]{64}$/.test(pk);
}

export function ProfilePage(): JSX.Element {
  const { userPk: paramUserPk } = useParams<{ userPk?: string }>();
  const { publicKey, keypair } = useStoredKeypair();
  const myPk = publicKey ? bytesToHex(publicKey) : undefined;
  const { rpc, connected } = useRpc();

  // Determine whose profile we're viewing
  // Validate that paramUserPk is a valid hex public key (not a template variable like {userId})
  const validParamPk = isValidPublicKey(paramUserPk) ? paramUserPk : undefined;
  const targetPk = validParamPk || myPk;
  const isOwnProfile = targetPk === myPk;

  // Fetch profile data
  const { profile, loading, error, refetch } = useUserProfile(targetPk);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Start editing
  const handleEdit = useCallback(() => {
    setDisplayName(profile?.info?.displayName || '');
    setBio(profile?.info?.bio || '');
    setWebsite(profile?.info?.website || '');
    setIsEditing(true);
  }, [profile]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setSaveError(null);
  }, []);

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

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const { state: postPowState, minePost, progress: postPowProgress, reset: resetPostPow } = usePostPow();
  const isMining = postPowState === 'mining';

  // Save profile
  const handleSave = useCallback(async () => {
    if (!rpc || !connected || !myPk || !keypair) {
      setSaveError('Not connected');
      return;
    }

    setSaving(true);
    setSaveError(null);
    resetPostPow();

    try {
      const profileSpaceId = getProfileSpaceId(myPk);

      // Prepare profile info
      const profileInfo: ProfileInfo = {
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        website: website.trim() || undefined,
        updatedAt: Date.now(),
      };

      // Upload avatar if selected
      if (avatarFile) {
        // Convert file to base64
        const arrayBuffer = await avatarFile.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        // Upload image content via upload_media
        const uploadResult = await rpc.uploadMedia({
          data: base64,
          mediaType: avatarFile.type,
        });

        if (!uploadResult.success) {
          throw new Error('Failed to upload avatar');
        }

        // Post avatar info
        const avatarBody = encodeAvatarInfo({
          contentId: uploadResult.media_hash,
          format: avatarFile.type.split('/')[1] || 'png',
          updatedAt: Date.now(),
        });

        // Mine PoW for avatar info post
        const publicKeyBytes = new Uint8Array(myPk.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const avatarSolution = await minePost(avatarBody, publicKeyBytes, true /* testnet */);
        const avatarPowParams = solutionToRpcParams(avatarSolution);

        // Sign the avatar post
        const avatarSignMessage = new TextEncoder().encode(
          `post:${profileSpaceId}:${avatarBody}:${avatarPowParams.timestamp}`
        );
        const avatarSignature = keypair.sign(avatarSignMessage);
        const avatarSignatureHex = bytesToHex(avatarSignature);

        await rpc.submitPost({
          spaceId: profileSpaceId,
          title: '',
          body: avatarBody,
          authorId: myPk,
          powNonce: avatarPowParams.pow_nonce,
          powDifficulty: avatarPowParams.pow_difficulty,
          powNonceSpace: avatarPowParams.pow_nonce_space,
          powHash: avatarPowParams.pow_hash,
          signature: avatarSignatureHex,
          timestamp: avatarPowParams.timestamp,
        });
      }

      // Post profile info
      const infoBody = encodeProfileInfo(profileInfo);

      // Mine PoW for profile info post
      const publicKeyBytes = new Uint8Array(myPk.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const infoSolution = await minePost(infoBody, publicKeyBytes, true /* testnet */);
      const infoPowParams = solutionToRpcParams(infoSolution);

      // Sign the profile info post
      const infoSignMessage = new TextEncoder().encode(
        `post:${profileSpaceId}:${infoBody}:${infoPowParams.timestamp}`
      );
      const infoSignature = keypair.sign(infoSignMessage);
      const infoSignatureHex = bytesToHex(infoSignature);

      await rpc.submitPost({
        spaceId: profileSpaceId,
        title: '',
        body: infoBody,
        authorId: myPk,
        powNonce: infoPowParams.pow_nonce,
        powDifficulty: infoPowParams.pow_difficulty,
        powNonceSpace: infoPowParams.pow_nonce_space,
        powHash: infoPowParams.pow_hash,
        signature: infoSignatureHex,
        timestamp: infoPowParams.timestamp,
      });

      // Clear cache and refetch
      clearProfileCache(myPk);
      await refetch();

      setIsEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }, [rpc, connected, myPk, keypair, displayName, bio, website, avatarFile, refetch, minePost, resetPostPow]);

  // Not logged in
  if (!myPk && !paramUserPk) {
    return (
      <div className="profile-page">
        <div className="profile-empty">
          <h2>Profile</h2>
          <p>Create an identity to set up your profile.</p>
          <Link to="/identity" className="btn btn-primary">
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
          <Link to="/spaces" className="btn btn-primary">
            Go to Spaces
          </Link>
        </div>
      </div>
    );
  }

  const bannerColor = profile?.info?.bannerColor || getAvatarColor(targetPk);

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
                <UserAvatar
                  userPk={targetPk}
                  displayName={profile?.info?.displayName}
                  avatar={profile?.avatar}
                  size="xl"
                />
              )}
              <button
                type="button"
                className="avatar-edit-button"
                onClick={() => fileInputRef.current?.click()}
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
              />
            </div>
          ) : (
            <UserAvatar
              userPk={targetPk}
              displayName={profile?.info?.displayName}
              avatar={profile?.avatar}
              size="xl"
            />
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
            />
          ) : (
            <h1 className="profile-name">
              {profile?.info?.displayName || `${targetPk.slice(0, 8)}...${targetPk.slice(-4)}`}
            </h1>
          )}

          <div className="profile-address">
            <code>{targetPk.slice(0, 12)}...{targetPk.slice(-8)}</code>
          </div>
        </div>

        {isOwnProfile && !isEditing && (
          <button type="button" className="btn btn-ghost" onClick={handleEdit}>
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
                {saveError && <div className="profile-save-error">{saveError}</div>}
                {isMining && (
                  <div className="profile-mining">
                    <span>Mining PoW... {postPowProgress.attempts} attempts ({Math.round(postPowProgress.elapsedMs / 1000)}s)</span>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleCancel}
                  disabled={saving || isMining}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || isMining}
                >
                  {isMining ? 'Mining PoW...' : saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            )}

            {/* Message button for other profiles */}
            {!isOwnProfile && myPk && (
              <div className="profile-actions">
                <StartDMButton
                  recipientPk={targetPk}
                  recipientName={profile?.info?.displayName}
                  variant="primary"
                  size="md"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;
