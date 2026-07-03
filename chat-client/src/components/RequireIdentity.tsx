/**
 * Guard component that requires a valid identity.
 *
 * Two modes (see useChatIdentity):
 *  - **node mode** (embedded in the desktop shell): the node's identity is
 *    adopted automatically. The browser-keypair onboarding gate is skipped
 *    entirely — no "create/import identity" prompt. We only wait for the node
 *    identity to load, then render.
 *  - **browser mode** (standalone tab): unchanged — redirect to /identity if
 *    there's no valid browser keypair identity.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useChatIdentity } from '../hooks/useChatIdentity';

interface RequireIdentityProps {
  children: React.ReactNode;
}

export function RequireIdentity({ children }: RequireIdentityProps): JSX.Element {
  const { mode, hasIdentity, isLoading } = useChatIdentity();
  const location = useLocation();

  // Show loading while the identity/mode is still being resolved. In node mode
  // this covers waiting for the shell's config and the node identity RPC.
  if (isLoading) {
    return (
      <div className="identity-loading">
        <div className="loading-spinner" />
        <p>Loading identity...</p>
      </div>
    );
  }

  // Node mode: the node owns the identity. Never send the user to onboarding.
  // If for some reason the node identity couldn't be loaded, keep waiting
  // rather than prompting for a separate browser identity.
  if (mode === 'node') {
    if (!hasIdentity) {
      return (
        <div className="identity-loading">
          <div className="loading-spinner" />
          <p>Loading identity from node...</p>
        </div>
      );
    }
    return <>{children}</>;
  }

  // Browser mode: require a valid browser-keypair identity.
  if (!hasIdentity) {
    console.log('[RequireIdentity] No valid browser identity, redirecting to /identity');
    return <Navigate to="/identity" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
