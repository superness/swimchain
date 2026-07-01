/**
 * Hook for managing stored identity in localStorage
 *
 * Supports encrypted storage of private keys using Argon2id key derivation.
 * Legacy unencrypted identities are detected and can be migrated.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { StoredIdentity } from '../types';
import {
  encryptSeed,
  decryptSeed,
  isEncryptedSeed,
  validatePassphrase,
} from '../lib/identity-encryption';
import { logger } from '../lib/logger';

const STORAGE_KEY = 'swimchain-identity';

interface UseStoredIdentityResult {
  /** The decrypted identity (null if not loaded or locked) */
  identity: StoredIdentity | null;
  /** Whether an identity exists in storage (may be encrypted) */
  hasStoredIdentity: boolean;
  /** Whether the stored identity is encrypted */
  isEncrypted: boolean;
  /** Whether the identity needs passphrase to unlock */
  needsPassphrase: boolean;
  /** Save a new identity (encrypts seed with passphrase) */
  setIdentity: (identity: StoredIdentity, passphrase: string) => Promise<void>;
  /** Unlock an encrypted identity with passphrase */
  unlockIdentity: (passphrase: string) => Promise<boolean>;
  /** Lock the identity (clears in-memory seed) */
  lockIdentity: () => void;
  /** Clear identity from storage */
  clearIdentity: () => void;
  /** Migrate a legacy unencrypted identity to encrypted */
  migrateToEncrypted: (passphrase: string) => Promise<boolean>;
  /** Whether we're still loading initial state */
  isLoading: boolean;
  /** Current error message (e.g., wrong passphrase) */
  error: string | null;
}

interface StoredIdentityRaw {
  address: string;
  publicKey: string;
  seed: string; // May be encrypted or plaintext
  createdAt: number;
  powSolution?: {
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}

export function useStoredIdentity(): UseStoredIdentityResult {
  const [identity, setIdentityState] = useState<StoredIdentity | null>(null);
  const [storedRaw, setStoredRaw] = useState<StoredIdentityRaw | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const passphraseRef = useRef<string | null>(null);

  // Load raw identity from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      logger.info('[useStoredIdentity] Loading from localStorage:', {
        hasStored: !!stored,
        storageKey: STORAGE_KEY,
      });

      if (stored) {
        const parsed = JSON.parse(stored) as StoredIdentityRaw;
        logger.info('[useStoredIdentity] Parsed stored identity:', {
          address: parsed.address,
          publicKey: parsed.publicKey?.substring(0, 16) + '...',
          isEncrypted: isEncryptedSeed(parsed.seed),
        });
        setStoredRaw(parsed);

        // If not encrypted, set identity directly (legacy support)
        if (!isEncryptedSeed(parsed.seed)) {
          logger.info('[useStoredIdentity] Using unencrypted identity directly');
          setIdentityState(parsed);
        }
      } else {
        logger.info('[useStoredIdentity] No stored identity found');
      }
    } catch (err) {
      logger.error('[useStoredIdentity] Failed to load identity:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const hasStoredIdentity = storedRaw !== null;
  const isEncrypted = storedRaw ? isEncryptedSeed(storedRaw.seed) : false;
  const needsPassphrase = isEncrypted && identity === null;

  // Save a new identity with encryption
  const setIdentity = useCallback(
    async (newIdentity: StoredIdentity, passphrase: string) => {
      const validationError = validatePassphrase(passphrase);
      if (validationError) {
        setError(validationError);
        throw new Error(validationError);
      }

      try {
        // Encrypt the seed
        const encryptedSeed = await encryptSeed(newIdentity.seed, passphrase);

        const toStore: StoredIdentityRaw = {
          ...newIdentity,
          seed: encryptedSeed,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        setStoredRaw(toStore);
        setIdentityState(newIdentity); // Keep decrypted in memory
        passphraseRef.current = passphrase;
        setError(null);
      } catch (err) {
        console.error('[useStoredIdentity] Failed to save identity:', err);
        setError(err instanceof Error ? err.message : 'Failed to save identity');
        throw err;
      }
    },
    []
  );

  // Unlock an encrypted identity
  const unlockIdentity = useCallback(
    async (passphrase: string): Promise<boolean> => {
      if (!storedRaw) {
        setError('No identity stored');
        return false;
      }

      try {
        const decryptedSeed = await decryptSeed(storedRaw.seed, passphrase);
        if (!decryptedSeed) {
          setError('Incorrect passphrase');
          return false;
        }

        const decrypted: StoredIdentity = {
          ...storedRaw,
          seed: decryptedSeed,
        };

        setIdentityState(decrypted);
        passphraseRef.current = passphrase;
        setError(null);
        return true;
      } catch (err) {
        console.error('[useStoredIdentity] Failed to unlock:', err);
        setError('Incorrect passphrase');
        return false;
      }
    },
    [storedRaw]
  );

  // Lock identity (clear in-memory seed)
  const lockIdentity = useCallback(() => {
    setIdentityState(null);
    passphraseRef.current = null;
  }, []);

  // Clear identity from storage
  const clearIdentity = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setStoredRaw(null);
      setIdentityState(null);
      passphraseRef.current = null;
      setError(null);
    } catch (err) {
      console.error('[useStoredIdentity] Failed to clear identity:', err);
    }
  }, []);

  // Migrate legacy unencrypted identity to encrypted
  const migrateToEncrypted = useCallback(
    async (passphrase: string): Promise<boolean> => {
      if (!storedRaw || !identity) {
        setError('No identity to migrate');
        return false;
      }

      if (isEncryptedSeed(storedRaw.seed)) {
        // Already encrypted
        return true;
      }

      const validationError = validatePassphrase(passphrase);
      if (validationError) {
        setError(validationError);
        return false;
      }

      try {
        const encryptedSeed = await encryptSeed(identity.seed, passphrase);

        const toStore: StoredIdentityRaw = {
          ...storedRaw,
          seed: encryptedSeed,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        setStoredRaw(toStore);
        passphraseRef.current = passphrase;
        setError(null);
        return true;
      } catch (err) {
        console.error('[useStoredIdentity] Migration failed:', err);
        setError(err instanceof Error ? err.message : 'Migration failed');
        return false;
      }
    },
    [storedRaw, identity]
  );

  return {
    identity,
    hasStoredIdentity,
    isEncrypted,
    needsPassphrase,
    setIdentity,
    unlockIdentity,
    lockIdentity,
    clearIdentity,
    migrateToEncrypted,
    isLoading,
    error,
  };
}
