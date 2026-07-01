/**
 * WikiBreadcrumbs - Breadcrumb navigation (Home > Namespace > Page).
 * Last item renders as plain text (current page, not linked).
 */

import { Link } from 'react-router-dom';
import './WikiBreadcrumbs.css';

interface BreadcrumbItem {
  label: string;
  path: string;
}

interface WikiBreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function WikiBreadcrumbs({ items }: WikiBreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="wiki-breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.path}>
            {i > 0 && <span className="wiki-breadcrumbs__separator" aria-hidden="true"> &gt; </span>}
            {isLast ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <Link to={item.path}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
