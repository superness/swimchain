/**
 * PageCard - Card component for wiki page listings.
 * Shows title, excerpt, namespace badge, relative edit time, and author.
 */

import { Link } from 'react-router-dom';
import type { WikiPage } from '../types/wiki';
import './PageCard.css';

interface PageCardProps {
  page: WikiPage;
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

function excerpt(content: string): string {
  // Strip any HTML tags, take first 150 chars
  const plain = content.replace(/<[^>]+>/g, '').trim();
  if (plain.length <= 150) return plain;
  return plain.slice(0, 150) + '...';
}

export function PageCard({ page }: PageCardProps) {
  return (
    <div className="wiki-page-card">
      <div className="wiki-page-card__title">
        <Link to={`/page/${page.id}`}>{page.title}</Link>
      </div>
      <div className="wiki-page-card__meta">
        <span className="wiki-page-card__ns-badge">{page.namespaceId}</span>
        <span>{truncateAddress(page.authorAddress)}</span>
        <span>{relativeTime(page.lastEdited)}</span>
        {page.revisionCount > 1 && (
          <span>{page.revisionCount} revisions</span>
        )}
      </div>
      <div className="wiki-page-card__excerpt">{excerpt(page.content)}</div>
    </div>
  );
}
