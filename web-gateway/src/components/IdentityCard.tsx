'use client';

import type { IdentityInfo } from '@/lib/rpc';
import { AddressDisplay } from './AddressDisplay';
import { addressToColor } from '@/lib/address';

interface IdentityCardProps { identity: IdentityInfo; showFullAddress?: boolean; }

export function IdentityCard({ identity, showFullAddress = false }: IdentityCardProps) {
  const color = addressToColor(identity.identity_id);
  const age = identity.created_at > 0 ? formatAge(Math.floor((Date.now() - identity.created_at) / 1000)) : 'Unknown age';
  return (
    <div className="identity-card">
      <div className="identity-header">
        <div className="identity-avatar" style={{ backgroundColor: color }}><span className="avatar-letter">{identity.identity_id.slice(-2).toUpperCase()}</span></div>
        <div className="identity-info">
          {identity.display_name && <span className="identity-display-name">{identity.display_name}</span>}
          <AddressDisplay address={identity.identity_id} format={showFullAddress ? 'full' : 'short'} copyable />
          <span className="identity-age">{age}</span>
        </div>
      </div>
      {identity.bio && <p className="identity-bio">{identity.bio}</p>}
      <div className="identity-stats">
        <div className="stat"><span className="stat-value">{identity.post_count}</span><span className="stat-label">Posts</span></div>
        <div className="stat"><span className="stat-value">{identity.reply_count}</span><span className="stat-label">Replies</span></div>
        <div className="stat"><span className="stat-value">{identity.reactions_received}</span><span className="stat-label">Received</span></div>
      </div>
      <div className="identity-meta"><span>First seen: {identity.created_at > 0 ? new Date(identity.created_at).toLocaleDateString() : 'Unknown'}</span></div>
    </div>
  );
}

function formatAge(s: number): string {
  if (s < 60) return 'New identity';
  const m = Math.floor(s / 60), h = Math.floor(s / 3600), d = Math.floor(s / 86400), mo = Math.floor(d / 30), y = Math.floor(d / 365);
  if (y > 0) return y + ' year' + (y !== 1 ? 's' : '') + ' old';
  if (mo > 0) return mo + ' month' + (mo !== 1 ? 's' : '') + ' old';
  if (d > 0) return d + ' day' + (d !== 1 ? 's' : '') + ' old';
  if (h > 0) return h + ' hour' + (h !== 1 ? 's' : '') + ' old';
  return m + ' minute' + (m !== 1 ? 's' : '') + ' old';
}
