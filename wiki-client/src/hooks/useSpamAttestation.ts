/**
 * Spam Attestation hooks (SPEC_12 §3) — moderation/report flow.
 *
 * Ported from search-client. Mines SHA-256 PoW for spam attestations and
 * counter-attestations, then submits via the node RPC.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';

export type SpamReason = 'advertising' | 'repetitive' | 'off_topic' | 'harassment' | 'illegal_content';

export interface SpamStatus {
  isFlagged: boolean;
  attestationCount: number;
  counterCount: number;
  reasons: string[];
  spamThreshold: number;
  counterThreshold: number;
}

interface RpcSpamStatusResult {
  content_id: string;
  is_flagged: boolean;
  attestation_count: number;
  counter_count: number;
  reasons: string[] | null;
  spam_threshold: number;
  counter_threshold: number;
}

/** Sign function — may be sync or async (WASM keypair vs. delegated signer) */
export type SignFn = (message: Uint8Array) => Uint8Array | Promise<Uint8Array>;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hook to fetch spam status for content
 */
export function useSpamStatus(contentId: string): {
  status: SpamStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const { rpc, connected } = useRpc();
  const [status, setStatus] = useState<SpamStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!rpc || !connected || !contentId) {
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.call<RpcSpamStatusResult>('get_spam_status', {
        content_id: contentId,
      });
      setStatus({
        isFlagged: result.is_flagged,
        attestationCount: result.attestation_count,
        counterCount: result.counter_count,
        reasons: result.reasons ?? [],
        spamThreshold: result.spam_threshold,
        counterThreshold: result.counter_threshold,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch spam status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, contentId]);

  useEffect(() => {
    if (contentId) {
      fetchStatus();
    }
  }, [fetchStatus, contentId]);

  return { status, loading, error, refetch: fetchStatus };
}

/** Mine SHA-256 leading-zero PoW over a text preimage (hex-digit zeros) */
async function mineSha256Pow(
  text: string,
  nonceSpace: Uint8Array,
  difficulty: number,
  onProgress: (attempts: number, elapsedMs: number) => void,
): Promise<{ nonce: number; hash: string }> {
  let nonce = 0n;
  const startTime = Date.now();
  let bestHash = '';

  while (Date.now() - startTime < 30000) {
    const nonceBytes = new Uint8Array(8);
    new DataView(nonceBytes.buffer).setBigUint64(0, nonce, true);

    const preimage = new Uint8Array([
      ...new TextEncoder().encode(text),
      ...nonceBytes,
      ...nonceSpace,
    ]);
    const hash = await crypto.subtle.digest('SHA-256', preimage);
    const hashHex = bytesToHex(new Uint8Array(hash));
    const leadingZeros = hashHex.match(/^0*/)?.[0].length ?? 0;

    if (leadingZeros >= difficulty) {
      return { nonce: Number(nonce), hash: hashHex };
    }

    if (leadingZeros > (bestHash.match(/^0*/)?.[0].length ?? 0)) {
      bestHash = hashHex;
    }

    nonce++;
    if (nonce % 1000n === 0n) {
      onProgress(Number(nonce), Date.now() - startTime);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return { nonce: Number(nonce), hash: bestHash || '0'.repeat(64) };
}

/**
 * Hook to submit spam reports and counter-attestations.
 * Mines PoW and handles the full submission flow.
 */
export function useSpamReport(): {
  reportSpam: (
    contentId: string,
    reason: SpamReason,
    identityPublicKey: string,
    signFn: SignFn,
  ) => Promise<{ success: boolean; thresholdReached: boolean }>;
  defendContent: (
    contentId: string,
    identityPublicKey: string,
    signFn: SignFn,
  ) => Promise<{ success: boolean }>;
  submitting: boolean;
  progress: { attempts: number; elapsedMs: number };
  error: string | null;
} {
  const { rpc, connected } = useRpc();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ attempts: 0, elapsedMs: 0 });
  const [error, setError] = useState<string | null>(null);

  const reportSpam = useCallback(async (
    contentId: string,
    reason: SpamReason,
    identityPublicKey: string,
    signFn: SignFn,
  ): Promise<{ success: boolean; thresholdReached: boolean }> => {
    if (!rpc || !connected) {
      return { success: false, thresholdReached: false };
    }

    setSubmitting(true);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0 });

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonceSpace = new Uint8Array(8);
      crypto.getRandomValues(nonceSpace);
      const nonceSpaceHex = bytesToHex(nonceSpace);

      // Mine PoW for SpamAttestation (fixed difficulty)
      const difficulty = 12;
      const { nonce, hash } = await mineSha256Pow(
        contentId + reason + timestamp.toString(),
        nonceSpace,
        difficulty,
        (attempts, elapsedMs) => setProgress({ attempts, elapsedMs }),
      );
      setProgress(p => ({ ...p, attempts: nonce }));

      // Sign the request
      const message = `spam_attestation:${contentId}:${reason}:${timestamp}`;
      const signature = await Promise.resolve(signFn(new TextEncoder().encode(message)));
      const signatureHex = bytesToHex(signature);

      const result = await rpc.call<{ success: boolean; threshold_reached: boolean }>(
        'submit_spam_attestation',
        {
          content_id: contentId,
          attester_id: identityPublicKey,
          reason,
          pow_nonce: nonce,
          pow_difficulty: difficulty,
          pow_nonce_space: nonceSpaceHex,
          pow_hash: hash,
          signature: signatureHex,
          timestamp,
        },
      );

      return { success: true, thresholdReached: result.threshold_reached };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit spam report';
      setError(msg);
      return { success: false, thresholdReached: false };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  const defendContent = useCallback(async (
    contentId: string,
    identityPublicKey: string,
    signFn: SignFn,
  ): Promise<{ success: boolean }> => {
    if (!rpc || !connected) {
      return { success: false };
    }

    setSubmitting(true);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0 });

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonceSpace = new Uint8Array(8);
      crypto.getRandomValues(nonceSpace);
      const nonceSpaceHex = bytesToHex(nonceSpace);

      // Mine PoW (lower difficulty for counter-attestation)
      const difficulty = 10;
      const { nonce, hash } = await mineSha256Pow(
        `counter:${contentId}:${timestamp}`,
        nonceSpace,
        difficulty,
        (attempts, elapsedMs) => setProgress({ attempts, elapsedMs }),
      );
      setProgress(p => ({ ...p, attempts: nonce }));

      const message = `counter_attestation:${contentId}:${timestamp}`;
      const signature = await Promise.resolve(signFn(new TextEncoder().encode(message)));
      const signatureHex = bytesToHex(signature);

      await rpc.call('submit_counter_attestation', {
        content_id: contentId,
        attester_id: identityPublicKey,
        pow_nonce: nonce,
        pow_difficulty: difficulty,
        pow_nonce_space: nonceSpaceHex,
        pow_hash: hash,
        signature: signatureHex,
        timestamp,
      });

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to defend content';
      setError(msg);
      return { success: false };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  return { reportSpam, defendContent, submitting, progress, error };
}
