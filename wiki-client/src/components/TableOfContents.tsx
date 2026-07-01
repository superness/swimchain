/**
 * TableOfContents - Sticky sidebar TOC with scroll-aware active section highlighting.
 * Parses headings from rendered HTML and renders a collapsible nested list.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { extractTableOfContents } from '../lib/toc';
import type { TableOfContentsItem } from '../types/wiki';
import './TableOfContents.css';

interface TableOfContentsProps {
  html: string;
}

function TocList({ items, activeId }: { items: TableOfContentsItem[]; activeId: string }) {
  if (items.length === 0) return null;

  return (
    <ul className="wiki-toc__list">
      {items.map((item) => (
        <li
          key={item.id}
          className={`toc-level-${item.level}${activeId === item.id ? ' toc-active' : ''}`}
        >
          <a href={`#${item.id}`}>{item.text}</a>
          {item.children.length > 0 && (
            <TocList items={item.children} activeId={activeId} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Collect all heading IDs from the nested tree into a flat array. */
function collectIds(items: TableOfContentsItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.id) ids.push(item.id);
    if (item.children.length > 0) ids.push(...collectIds(item.children));
  }
  return ids;
}

export function TableOfContents({ html }: TableOfContentsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState('');

  const tocItems = useMemo(() => extractTableOfContents(html), [html]);
  const headingIds = useMemo(() => collectIds(tocItems), [tocItems]);

  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    // Find the topmost visible heading
    for (const entry of entries) {
      if (entry.isIntersecting) {
        setActiveId(entry.target.id);
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (headingIds.length === 0) return;

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0,
    });

    for (const id of headingIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headingIds, handleIntersect]);

  if (tocItems.length === 0) return null;

  return (
    <nav className="wiki-toc" aria-label="Table of contents">
      <div
        className="wiki-toc__title"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        aria-expanded={!collapsed}
      >
        Contents {collapsed ? '[show]' : '[hide]'}
      </div>
      {!collapsed && <TocList items={tocItems} activeId={activeId} />}
    </nav>
  );
}
