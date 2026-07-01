/**
 * RecentChanges - Feed of recent wiki edits.
 * Shows page title (linked), namespace badge, author, and relative timestamp.
 */

import { Link } from 'react-router-dom';
import type { WikiPage } from '../types/wiki';
import './RecentChanges.css';

interface RecentChangesProps {
  changes: WikiPage[];
}

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function RecentChanges({ changes }: RecentChangesProps) {
  if (changes.length === 0) {
    return (
      <div className="wiki-empty">
        <div className="wiki-empty__title">No recent changes</div>
      </div>
    );
  }

  return (
    <ul className="wiki-recent-changes">
      {changes.map((page, i) => (
        <li key={page.id} className={`wiki-recent-change${i % 2 === 1 ? ' wiki-recent-change--alt' : ''}`}>
          <span className="wiki-recent-change__time">
            {relativeTime(page.lastEdited)}
          </span>
          <span className="wiki-recent-change__page">
            <Link to={`/page/${page.id}`}>{page.title}</Link>
          </span>
          <span className="wiki-recent-change__ns">{page.namespaceId}</span>
          <span className="wiki-recent-change__author">
            {truncateAddress(page.authorAddress)}
          </span>
        </li>
      ))}
    </ul>
  );
}
