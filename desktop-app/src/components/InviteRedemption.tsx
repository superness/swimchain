/**
 * InviteRedemption (SWIM-INV-3, desktop)
 *
 * Overlay shown once the node is running and the newcomer arrived with an
 * invite code. Drives lib/redeem.ts and surfaces plain-language status.
 * Mirrors the feed-client component's UX; signing happens node-side.
 */

import { useEffect, useRef, useState } from 'react';
import type { InvitePayload } from '../lib/invite';
import {
  redeemInvite,
  friendlyClaimError,
  shortSponsor,
  type RpcClient,
} from '../lib/redeem';

type Stage = 'working' | 'done' | 'pending' | 'error';

interface Props {
  invite: InvitePayload;
  rpcEndpoint: string;
  rpcAuth: string;
  onDone: () => void;
}

export function InviteRedemption({ invite, rpcEndpoint, rpcAuth, onDone }: Props): JSX.Element {
  const [stage, setStage] = useState<Stage>('working');
  const [statusText, setStatusText] = useState('Connecting to your node...');
  const [error, setError] = useState<string | null>(null);
  const [dmSent, setDmSent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const runningRef = useRef(false);

  const sponsorShort = shortSponsor(invite.sponsor);

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const client: RpcClient = { endpoint: rpcEndpoint, auth: rpcAuth };

    const run = async () => {
      try {
        const result = await redeemInvite(client, invite, setStatusText);
        if (result.status === 'pending') {
          setStage('pending');
          return;
        }
        setDmSent(result.dmSent);
        setStage('done');
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        setError(friendlyClaimError(raw));
        setStage('error');
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const handleRetry = () => {
    setError(null);
    setStage('working');
    setStatusText('Connecting to your node...');
    runningRef.current = false;
    setAttempt((a) => a + 1);
  };

  return (
    <div className="app onboarding">
      <div className="onboarding-container" aria-live="polite">
        {stage === 'working' && (
          <>
            <div className="loading-spinner" style={{ margin: '0 auto 20px' }}>
              <div className="progress-bar"><div className="progress-bar-fill"></div></div>
            </div>
            <h1>Redeeming your invite</h1>
            <p className="subtitle">{statusText}</p>
          </>
        )}

        {stage === 'done' && (
          <>
            <h1>You&apos;re in</h1>
            <p className="subtitle">Sponsored by <code>{sponsorShort}</code></p>
            {dmSent ? (
              <p className="subtitle">
                We&apos;ve sent your friend a message request, so there&apos;s already a
                conversation waiting for you. Say hi!
              </p>
            ) : (
              <p className="subtitle">
                You&apos;re all set. (We couldn&apos;t start a chat with your friend
                automatically — you can message them from their profile later.)
              </p>
            )}
            <button type="button" className="btn btn-primary btn-large" onClick={onDone}>
              Start exploring
            </button>
          </>
        )}

        {stage === 'pending' && (
          <>
            <h1>Almost there</h1>
            <p className="subtitle">
              Your request went through, but this invite needs your friend&apos;s approval
              before you can post. You&apos;ll be in as soon as they accept — usually within
              a day.
            </p>
            <button type="button" className="btn btn-primary btn-large" onClick={onDone}>
              Continue
            </button>
          </>
        )}

        {stage === 'error' && (
          <>
            <h1>That invite didn&apos;t work</h1>
            <p className="subtitle" role="alert">{error}</p>
            <p className="subtitle">Your new identity is safe — this only affects the invite.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={handleRetry}>
                Try again
              </button>
              <button type="button" className="btn" onClick={onDone}>
                Skip for now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
