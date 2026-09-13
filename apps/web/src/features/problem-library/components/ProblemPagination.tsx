import { ProblemLibraryIcon as Icon } from './ProblemLibraryIcon.js';

type PaginationItem = number | 'ellipsis';

function paginationItems(current: number, total: number): PaginationItem[] {
  if (total <= 0) return [];
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total];
  if (current >= total - 3)
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

export function ProblemPagination({
  current,
  total,
  totalItems,
  onChange,
  loading,
}: {
  current: number;
  total: number;
  totalItems: number;
  onChange: (page: number) => void;
  loading: boolean;
}) {
  return (
    <nav
      className="pagination problem-list-pagination"
      aria-label="分页"
      aria-busy={loading}
      data-loading={loading ? 'true' : 'false'}
    >
      <span className="pagination-summary" aria-live="polite">
        第 {total ? current : 0} / {total} 页 · 共{' '}
        {totalItems.toLocaleString('zh-CN')} 道
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-control"
          aria-label="上一页"
          disabled={loading || current <= 1 || total === 0}
          onClick={() => onChange(current - 1)}
        >
          <Icon name="chevron-left" />
          <span>上一页</span>
        </button>
        <div className="pagination-pages">
          {paginationItems(current, total).map((item, index) =>
            item === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="pagination-ellipsis"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className="pagination-page"
                aria-current={item === current ? 'page' : undefined}
                aria-label={`第 ${item} 页`}
                disabled={loading}
                onClick={() => onChange(item)}
              >
                {item}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className="pagination-control"
          aria-label="下一页"
          disabled={loading || current >= total || total === 0}
          onClick={() => onChange(current + 1)}
        >
          <span>下一页</span>
          <Icon name="chevron-right" />
        </button>
      </div>
      {loading && <span className="pagination-loading">加载中…</span>}
    </nav>
  );
}
