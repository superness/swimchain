/**
 * Identity card showing user's identity details
 */

import type { StoredIdentity } from '../types';
import { AddressDisplay } from './AddressDisplay';
import './IdentityCard.css';

interface IdentityCardProps {
  identity: StoredIdentity;
}

export function IdentityCard({ identity }: IdentityCardProps): JSX.Element {
  const createdDate = new Date(identity.createdAt * 1000);

  return (
    <div className="identity-card card">
      <div className="identity-avatar">
        {identity.address.slice(3, 5).toUpperCase()}
      </div>

      <div className="identity-details">
        <div className="identity-address">
          <label>Your Address</label>
          <AddressDisplay address={identity.address} />
        </div>

        <div className="identity-meta">
          <div className="meta-item">
            <label>Created</label>
            <span>{createdDate.toLocaleDateString()}</span>
          </div>

          {identity.powSolution && (
            <div className="meta-item">
              <label>PoW Difficulty</label>
              <span>{identity.powSolution.difficulty}</span>
            </div>
          )}
        </div>

        <div className="identity-status">
          {identity.powSolution ? (
            <span className="status-badge badge-success">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verified Identity
            </span>
          ) : (
            <span className="status-badge badge-warning">
              Unverified
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
