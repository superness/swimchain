/**
 * Start DM Button Component
 *
 * A button to initiate or open a DM with another user.
 * Handles the full DM lifecycle: request, accept, open.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { useRequestDM } from '../hooks/useRpc';
import { useActionPow } from '../hooks/useActionPow';
import { ActionType, solutionToRpcParams } from '../lib/action-pow';
import { getDMSpaceId, getDMSpaceName, getDMStatusText, getDMAction, DMStatus } from '../lib/dm';
import { generateSpaceKey, encryptSpaceKeyForRecipient, deriveX25519Keys, ed25519PublicToX25519, hexToBytes, bytesToHex } from '../lib/x25519';
import { encryptSpaceName } from '../lib/encryption';
import './StartDMButton.css';

interface StartDMButtonProps {
  recipientPk: string;
  recipientName?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function StartDMButton({
  recipientPk,
  recipientName,
  variant = 'primary',
  size = 'md',
  showIcon = true,
  className = '',
}: StartDMButtonProps): JSX.Element | null {
  const navigate = useNavigate();
  const { publicKey, keypair } = useStoredKeypair();
  const userPublicKeyHex = publicKey ? bytesToHex(publicKey) : undefined;
  const { hasSpaceKey, storeSpaceKey } = usePrivateSpaceKeys(userPublicKeyHex);
  const { request: requestDM, requesting } = useRequestDM();
  const { state: miningState, mine, cancel: cancelMining, solution, reset: resetMining } = useActionPow();

  const [status, setStatus] = useState<DMStatus>('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store DM setup data between mining start and completion
  const dmDataRef = useRef<{
    spaceKey: Uint8Array;
    encryptedKeyForRecipient: Uint8Array;
    spaceName: string;
    signature: Uint8Array;
    timestamp: number;
  } | null>(null);
  const submittedRef = useRef(false);

  // Compute deterministic DM space ID
  const dmSpaceId = userPublicKeyHex
    ? getDMSpaceId(userPublicKeyHex, recipientPk)
    : null;

  // Check if we already have this DM space
  useEffect(() => {
    if (dmSpaceId && hasSpaceKey(dmSpaceId)) {
      setStatus('active');
    }
  }, [dmSpaceId, hasSpaceKey]);

  // Don't show button for self
  if (userPublicKeyHex === recipientPk) {
    return null;
  }

  // Submit DM request after mining completes
  const submitDMRequest = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const dmData = dmDataRef.current;
    if (!dmData || !solution || !dmSpaceId || !userPublicKeyHex) {
      setError('Missing DM data or PoW solution');
      setLoading(false);
      resetMining();
      return;
    }

    const powParams = solutionToRpcParams(solution);

    try {
      const result = await requestDM({
        requester: userPublicKeyHex,
        recipient: recipientPk,
        keyShare: bytesToHex(dmData.encryptedKeyForRecipient),
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: bytesToHex(dmData.signature),
        timestamp: dmData.timestamp,
      });

      if (result) {
        console.log('DM request sent:', result.requestHash);
      } else {
        console.warn('DM request RPC failed, storing locally');
      }

      // Store the space key locally regardless
      await storeSpaceKey(
        dmSpaceId,
        dmData.spaceKey,
        userPublicKeyHex,
        0,
        dmData.spaceName
      );

      setStatus('pending_sent');
    } catch (err) {
      console.error('Failed to send DM request:', err);
      setError(err instanceof Error ? err.message : 'Failed to send DM request');
    } finally {
      setLoading(false);
      resetMining();
      dmDataRef.current = null;
    }
  }, [solution, dmSpaceId, userPublicKeyHex, recipientPk, requestDM, storeSpaceKey, resetMining]);

  // Auto-submit when mining completes
  useEffect(() => {
    if (miningState === 'complete' && solution && loading && !submittedRef.current) {
      submitDMRequest();
    }
  }, [miningState, solution, loading, submitDMRequest]);

  // Handle button click based on current status
  const handleClick = useCallback(async () => {
    if (!keypair || !publicKey || !dmSpaceId) {
      setError('No identity available');
      return;
    }

    const action = getDMAction(status);

    if (action === 'open') {
      // Navigate to existing DM
      navigate(`/chat/${dmSpaceId}`);
      return;
    }

    if (action === 'none') {
      // Request already pending, do nothing
      return;
    }

    if (action === 'send_request' || action === 'accept') {
      setLoading(true);
      setError(null);
      submittedRef.current = false;

      try {
        // Generate a new space key for this DM
        const spaceKey = generateSpaceKey();

        // Derive our X25519 keys
        const seed = keypair.seed();
        const { secretKey: myX25519SecretKey, publicKey: myX25519PublicKey } = deriveX25519Keys(seed);

        // Convert recipient's Ed25519 public key to X25519
        const recipientEd25519Pk = hexToBytes(recipientPk);
        const recipientX25519Pk = ed25519PublicToX25519(recipientEd25519Pk);

        // Encrypt space key for recipient
        const encryptedKeyForRecipient = encryptSpaceKeyForRecipient(
          spaceKey,
          recipientX25519Pk,
          myX25519SecretKey
        );

        // Encrypt space key for ourselves (for local storage backup)
        const _encryptedKeyForSelf = encryptSpaceKeyForRecipient(
          spaceKey,
          myX25519PublicKey,
          myX25519SecretKey
        );
        void _encryptedKeyForSelf; // Reserved for future use

        // Generate encrypted space name
        const spaceName = recipientName
          ? `DM: ${recipientName}`
          : getDMSpaceName(userPublicKeyHex!, recipientPk);
        const _encryptedName = await encryptSpaceName(spaceName, spaceKey);
        void _encryptedName; // Reserved for future use when backend supports encrypted names

        // Prepare signature
        const timestamp = Math.floor(Date.now() / 1000);
        const signatureMessage = new TextEncoder().encode(
          `dm_request:${userPublicKeyHex}:${recipientPk}:${timestamp}`
        );
        const signature = keypair.sign(signatureMessage);

        // Store data for use after mining completes
        dmDataRef.current = {
          spaceKey,
          encryptedKeyForRecipient,
          spaceName,
          signature,
          timestamp,
        };

        // Mine PoW for the DM request (uses Post difficulty)
        const dmContent = new TextEncoder().encode(
          `dm_request:${userPublicKeyHex}:${recipientPk}:${timestamp}`
        );
        await mine(ActionType.Post, dmContent, publicKey, true /* testnet */);
      } catch (err) {
        if (err instanceof Error && !err.message.includes('cancelled')) {
          console.error('Failed to create DM:', err);
          setError(err instanceof Error ? err.message : 'Failed to create DM');
        }
        setLoading(false);
        dmDataRef.current = null;
      }
    }
  }, [keypair, publicKey, dmSpaceId, status, recipientPk, recipientName, userPublicKeyHex, navigate, mine]);

  const isMining = miningState === 'mining';
  const isLoading = loading || requesting;
  const buttonText = isMining
    ? 'Mining PoW...'
    : isLoading
    ? 'Creating...'
    : getDMStatusText(status);
  const isDisabled = isLoading || status === 'pending_sent' || !keypair;

  return (
    <button
      type="button"
      className={`start-dm-button ${variant} ${size} ${className}`}
      onClick={isMining ? cancelMining : handleClick}
      disabled={isDisabled && !isMining}
      title={error || (isMining ? 'Click to cancel' : `Message ${recipientName || recipientPk.slice(0, 8)}...`)}
    >
      {showIcon && !isMining && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="dm-icon"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
      <span>{buttonText}</span>
    </button>
  );
}

export default StartDMButton;
