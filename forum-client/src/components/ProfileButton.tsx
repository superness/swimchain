/**
 * Profile button component showing identity status
 */

import { Link } from 'react-router-dom';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { isInIframe } from '../hooks/useParentRpcConfig';
import { AddressDisplay } from './AddressDisplay';
import './ProfileButton.css';

export function ProfileButton(): JSX.Element {
  const { identity, isLoading } = useNodeIdentity();

  // Node-wide centralized identity: when embedded in the desktop app the node owns
  // one central identity, so hide this client's own /identity entry point.
  const embedded = isInIframe();

  return (
    <div className="profile-button-container">
      {!embedded && (
      <Link
        to="/identity"
        className="profile-button"
        aria-label={identity ? `Identity: ${identity.address}` : 'Create Identity'}
      >
        {isLoading ? (
          <>
            <span className="profile-avatar empty" aria-hidden="true">...</span>
            <span className="profile-label">Loading...</span>
          </>
        ) : identity ? (
          <>
            <span className="profile-avatar" aria-hidden="true">
              {identity.address.slice(3, 5).toUpperCase()}
            </span>
            <AddressDisplay address={identity.address} />
          </>
        ) : (
          <>
            <span className="profile-avatar empty" aria-hidden="true">?</span>
            <span className="profile-label">No Node Identity</span>
          </>
        )}
      </Link>
      )}

      <Link
        to="/settings"
        className="settings-button btn btn-ghost"
        aria-label="Settings"
        title="Settings"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </Link>
    </div>
  );
}
