/**
 * Renders markdown to HTML with wiki link support.
 * Intercepts wiki link clicks for client-side navigation.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderMarkdown } from '../lib/markdown';
import { parseWikiLinks } from '../lib/wikilinks';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  markdown: string;
  existingPages: string[];
}

export function MarkdownRenderer({ markdown, existingPages }: MarkdownRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a.wiki-link');
      if (!link) return;

      e.preventDefault();
      const href = link.getAttribute('href');
      if (href) {
        navigate(href);
      }
    },
    [navigate]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [handleClick]);

  const rawHtml = renderMarkdown(markdown);
  const html = parseWikiLinks(rawHtml, existingPages);

  return (
    <div
      ref={containerRef}
      className="markdown-renderer"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
