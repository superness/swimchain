/**
 * Guard component that requires a valid identity
 * Redirects to /identity if no identity or invalid identity exists
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useIdentityContext } from '../providers/IdentityProvider';
import { logger } from '../lib/logger';

interface RequireIdentityProps {
  children: React.ReactNode;
}

export function RequireIdentity({ children }: RequireIdentityProps): JSX.Element {
  const { identity, isLoading, hasValidIdentity } = useIdentityContext();
  const location = useLocation();

  logger.info('[RequireIdentity] ===== GUARD CHECK =====', {
    path: location.pathname,
    isLoading,
    hasIdentity: !!identity,
    identityAddress: identity?.address?.substring(0, 20),
    hasValidIdentity,
  });

  // Show loading state while checking identity
  if (isLoading) {
    logger.info('[RequireIdentity] DECISION: SHOWING LOADING SPINNER (identity still loading)');
    return (
      <div className="identity-loading">
        <div className="loading-spinner" />
        <p>Loading identity...</p>
      </div>
    );
  }

  // No identity at all - redirect to create one
  if (!identity) {
    logger.info('[RequireIdentity] DECISION: REDIRECTING TO /identity (no identity found)');
    return <Navigate to="/identity" state={{ from: location }} replace />;
  }

  // Identity exists but not valid - redirect to recreate
  if (!hasValidIdentity) {
    logger.info('[RequireIdentity] DECISION: REDIRECTING TO /identity (identity not valid)');
    return (
      <Navigate
        to="/identity"
        state={{ from: location, needsUpgrade: true }}
        replace
      />
    );
  }

  // Valid identity exists - render children
  logger.info('[RequireIdentity] DECISION: ALLOWING ACCESS - rendering page for path:', location.pathname);
  return <>{children}</>;
}
