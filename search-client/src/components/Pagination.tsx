/**
 * Pagination Component
 *
 * Page navigation for search results.
 */

import './Pagination.css';

interface PaginationProps {
  page: number;
  total: number;
  resultsPerPage: number;
  onLoadMore: () => void;
  onPageChange?: (page: number) => void;
}

export function Pagination({
  page,
  total,
  resultsPerPage,
  onLoadMore,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / resultsPerPage);
  const showing = Math.min(page * resultsPerPage, total);

  // Generate page numbers to show
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first, last, current, and surrounding pages
      pages.push(1);

      if (page > 3) {
        pages.push('ellipsis');
      }

      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - 2) {
        pages.push('ellipsis');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav className="pagination" aria-label="Search results navigation">
      <div className="pagination-info">
        Showing {showing} of {total.toLocaleString()} results
      </div>

      <div className="pagination-controls">
        {/* Page numbers */}
        <div className="page-numbers">
          {pageNumbers.map((pageNum, index) => {
            if (pageNum === 'ellipsis') {
              return (
                <span key={`ellipsis-${index}`} className="page-ellipsis">
                  ...
                </span>
              );
            }

            const isCurrent = pageNum === page;
            return (
              <button
                key={pageNum}
                className={`page-number ${isCurrent ? 'current' : ''}`}
                aria-current={isCurrent ? 'page' : undefined}
                disabled={isCurrent}
                onClick={() => {
                  if (!isCurrent && onPageChange) {
                    onPageChange(pageNum);
                  } else if (!isCurrent) {
                    // Fallback: load pages sequentially to reach target
                    const pagesToLoad = pageNum - page;
                    for (let i = 0; i < pagesToLoad; i++) {
                      onLoadMore();
                    }
                  }
                }}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next button / Load more */}
        {page < totalPages && (
          <button
            className="load-more-button"
            onClick={onLoadMore}
          >
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </nav>
  );
}
