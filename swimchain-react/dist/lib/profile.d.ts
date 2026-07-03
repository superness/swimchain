/**
 * User Profile Utilities
 *
 * Profiles are stored as a special "profile space" tied to each user's identity.
 * The profile space ID is deterministically derived from the user's public key.
 *
 * Profile data is stored as posts in this space:
 * - Profile info post: JSON with bio, display name, links, etc.
 * - Avatar post: Image content for the user's avatar
 *
 * This allows profiles to use existing space/thread infrastructure and benefit
 * from the same sync, storage, and content addressing.
 *
 * ## Private Profiles
 *
 * Users can make their profile "private" (encrypted). When private:
 * - Profile info is encrypted with a key derived from their identity
 * - Only the owner can decrypt and view the full profile
 * - Others see a "Private Profile" indicator
 * - Display name and avatar can optionally remain public
 *
 * @packageDocumentation
 */
/** Content type markers for profile posts */
export declare const PROFILE_INFO_TYPE = "PROFILE_INFO";
export declare const PROFILE_AVATAR_TYPE = "PROFILE_AVATAR";
/** Marker for encrypted/private profile info */
export declare const PROFILE_INFO_PRIVATE_TYPE = "PROFILE_INFO_PRIVATE";
/**
 * Profile information structure
 */
export interface ProfileInfo {
    /** Display name (optional, falls back to truncated address) */
    displayName?: string;
    /** Short bio/description */
    bio?: string;
    /** Website or other link */
    website?: string;
    /** Additional links (twitter, github, etc.) */
    links?: Record<string, string>;
    /** Profile banner color or image hash */
    bannerColor?: string;
    /** When the profile was last updated */
    updatedAt: number;
    /** Whether this profile is private (encrypted) */
    isPrivate?: boolean;
    /** Public display name even when profile is private (optional) */
    publicDisplayName?: string;
}
/**
 * Private profile metadata (stored unencrypted to indicate privacy)
 */
export interface PrivateProfileMeta {
    /** Indicates this is a private profile */
    isPrivate: true;
    /** Public display name (visible to everyone) */
    publicDisplayName?: string;
    /** Public avatar (visible to everyone) - if not set, avatar is also private */
    publicAvatar?: boolean;
    /** When the profile was last updated */
    updatedAt: number;
    /** Encrypted profile data (base64) */
    encryptedData: string;
}
/**
 * Avatar information
 */
export interface AvatarInfo {
    /** Content ID of the avatar image */
    contentId: string;
    /** Image format (png, jpg, webp) */
    format: string;
    /** Width in pixels */
    width?: number;
    /** Height in pixels */
    height?: number;
    /** When the avatar was set */
    updatedAt: number;
}
/**
 * Full user profile (combined info + avatar)
 */
export interface UserProfile {
    /** User's public key (hex) */
    userPk: string;
    /** Profile space ID */
    profileSpaceId: string;
    /** Profile information */
    info: ProfileInfo | null;
    /** Avatar information */
    avatar: AvatarInfo | null;
    /** Whether this profile exists on-chain */
    exists: boolean;
    /** Whether this profile is private/encrypted */
    isPrivate?: boolean;
    /** Whether we could decrypt the profile (only true if we're the owner) */
    isDecrypted?: boolean;
    /** Public display name (available even if profile is private) */
    publicDisplayName?: string;
}
/**
 * Generate a deterministic profile space ID from a user's public key.
 *
 * This ensures each user has exactly one profile space that can be
 * discovered by anyone who knows their public key.
 *
 * @param userPk - User's public key (hex string)
 * @returns Profile space ID (32 hex chars)
 */
export declare function getProfileSpaceId(userPk: string): string;
/**
 * Check if a space ID is a profile space for a given user
 */
export declare function isProfileSpace(spaceId: string, userPk: string): boolean;
/**
 * Encode profile info as a post body
 */
export declare function encodeProfileInfo(info: ProfileInfo): string;
/**
 * Decode profile info from a post body
 */
export declare function decodeProfileInfo(body: string): ProfileInfo | null;
/**
 * Encode avatar info as a post body
 */
export declare function encodeAvatarInfo(avatar: AvatarInfo): string;
/**
 * Decode avatar info from a post body
 */
export declare function decodeAvatarInfo(body: string): AvatarInfo | null;
/**
 * Generate a color from a public key for default avatar background
 */
export declare function getAvatarColor(userPk: string): string;
/**
 * Get initials from a display name or public key
 */
export declare function getAvatarInitials(displayName?: string, userPk?: string): string;
/**
 * Default empty profile
 */
export declare function createEmptyProfile(userPk: string): UserProfile;
/**
 * Derive a profile encryption key from a user's private key.
 *
 * Uses HKDF-like derivation: SHA256(privateKey || "profile-encryption-key-v1")
 * This ensures the profile key is deterministic and only known to the user.
 *
 * @param privateKey - User's Ed25519 private key (32 or 64 bytes hex)
 * @returns 32-byte profile encryption key
 */
export declare function deriveProfileKey(privateKey: string): Uint8Array;
/**
 * Encrypt profile info for private storage
 *
 * @param info - Profile info to encrypt
 * @param profileKey - 32-byte profile encryption key
 * @returns Encrypted data as base64 string
 */
export declare function encryptProfileInfo(info: ProfileInfo, profileKey: Uint8Array): Promise<string>;
/**
 * Decrypt profile info from private storage
 *
 * @param encryptedData - Base64 encrypted profile data
 * @param profileKey - 32-byte profile encryption key
 * @returns Decrypted profile info, or null if decryption fails
 */
export declare function decryptProfileInfo(encryptedData: string, profileKey: Uint8Array): Promise<ProfileInfo | null>;
/**
 * Encode a private profile as a post body
 *
 * The post body contains:
 * - Unencrypted metadata (isPrivate flag, public display name)
 * - Encrypted profile data (base64)
 *
 * @param info - Full profile info to encrypt
 * @param profileKey - 32-byte profile encryption key
 * @param publicDisplayName - Optional name to show publicly
 * @param publicAvatar - Whether avatar should remain public
 */
export declare function encodePrivateProfileInfo(info: ProfileInfo, profileKey: Uint8Array, publicDisplayName?: string, publicAvatar?: boolean): Promise<string>;
/**
 * Decode a private profile from a post body
 *
 * @param body - Post body containing private profile
 * @param profileKey - Profile key (if available, for decryption)
 * @returns Object with metadata and optionally decrypted info
 */
export declare function decodePrivateProfileInfo(body: string, profileKey?: Uint8Array): Promise<{
    meta: PrivateProfileMeta;
    info: ProfileInfo | null;
    isDecrypted: boolean;
} | null>;
/**
 * Check if a profile post body indicates a private profile
 */
export declare function isPrivateProfile(body: string): boolean;
/**
 * Try to decode profile info, handling both public and private formats
 *
 * @param body - Post body (could be public or private profile)
 * @param profileKey - Profile key (if available, for private profile decryption)
 * @returns Profile info with privacy metadata
 */
export declare function decodeAnyProfileInfo(body: string, profileKey?: Uint8Array): Promise<{
    info: ProfileInfo | null;
    isPrivate: boolean;
    isDecrypted: boolean;
    publicDisplayName?: string;
} | null>;
//# sourceMappingURL=profile.d.ts.map