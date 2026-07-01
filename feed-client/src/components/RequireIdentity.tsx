/**
 * Guard component that requires a valid identity
 * Redirects to /identity if no identity or invalid identity exists
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useIdentityContext } from '../providers/IdentityProvider';

interface RequireIdentityProps {
  children: React.ReactNode;
}

export function RequireIdentity({ children }: RequireIdentityProps): JSX.Element {
  const { identity, isLoading, hasValidIdentity } = useIdentityContext();
  const location = useLocation();

  // Show loading state while checking identity
  if (isLoading) {
    return (
      <div className="identity-loading">
        <div className="loading-spinner" />
        <p>Loading identity...</p>
      </div>
    );
  }

  // No identity at all - redirect to create one
  if (!identity) {
    return <Navigate to="/identity" state={{ from: location }} replace />;
  }

  // Identity exists but not valid - redirect to recreate
  if (!hasValidIdentity) {
    return (
      <Navigate
        to="/identity"
        state={{ from: location, needsUpgrade: true }}
        replace
      />
    );
  }

  // Valid identity exists - render children
  return <>{children}</>;
}
