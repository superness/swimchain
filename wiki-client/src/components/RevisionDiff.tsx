/**
 * RevisionDiff - Visual inline diff viewer with dual line numbers.
 * Uses LCS-based diff from lib/diff.
 */

import { useMemo } from 'react';
import { computeDiff } from '../lib/diff';
import type { DiffLine } from '../lib/diff';
import './RevisionDiff.css';

interface RevisionDiffProps {
  oldText: string;
  newText: string;
  oldAuthor: string;
  newAuthor: string;
}

function lineClass(type: DiffLine['type']): string {
  switch (type) {
    case 'added': return 'wiki-diff__line wiki-diff__line--added';
    case 'removed': return 'wiki-diff__line wiki-diff__line--removed';
    default: return 'wiki-diff__line wiki-diff__line--unchanged';
  }
}

function linePrefix(type: DiffLine['type']): string {
  switch (type) {
    case 'added': return '+';
    case 'removed': return '-';
    default: return ' ';
  }
}

export function RevisionDiff({ oldText, newText, oldAuthor, newAuthor }: RevisionDiffProps) {
  const lines = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of lines) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
    }
    return { added, removed };
  }, [lines]);

  return (
    <div className="revision-diff">
      <div className="revision-diff__header">
        <div className="revision-diff__author revision-diff__author--old">
          <span className="revision-diff__label">Old</span>
          <span className="revision-diff__name">{oldAuthor}</span>
        </div>
        <div className="revision-diff__stats">
          {stats.added > 0 && <span className="revision-diff__stat--added">+{stats.added}</span>}
          {stats.removed > 0 && <span className="revision-diff__stat--removed">-{stats.removed}</span>}
        </div>
        <div className="revision-diff__author revision-diff__author--new">
          <span className="revision-diff__label">New</span>
          <span className="revision-diff__name">{newAuthor}</span>
        </div>
      </div>

      <div className="wiki-diff">
        {lines.map((line, i) => (
          <div key={i} className={lineClass(line.type)}>
            <span className="wiki-diff__line-num">
              {line.oldLineNumber ?? ''}
            </span>
            <span className="wiki-diff__line-num">
              {line.newLineNumber ?? ''}
            </span>
            <span className="wiki-diff__prefix">{linePrefix(line.type)}</span>
            <span className="wiki-diff__text">{line.text}</span>
          </div>
        ))}
        {lines.length === 0 && (
          <div className="wiki-diff__line wiki-diff__line--unchanged">
            <span className="wiki-diff__text">No differences</span>
          </div>
        )}
      </div>
    </div>
  );
}
