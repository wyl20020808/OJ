import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ApiClient, Problem } from '../services/api.js';
import './TagSelector.css';

type Tag = NonNullable<Problem['tagDetails']>[number];

export function TagSelector({
  api,
  value,
  onChange,
  disabled = false,
  catalog: catalogOverride,
  selectionMode = 'multiple',
}: {
  api: ApiClient;
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  catalog?: Tag[];
  selectionMode?: 'single' | 'multiple';
}) {
  const [loadedCatalog, setLoadedCatalog] = useState<Tag[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();
  useEffect(() => {
    if (catalogOverride) return;
    const loader = api.tags?.();
    if (loader)
      void loader
        .then((tags) => setLoadedCatalog(Array.isArray(tags) ? tags : []))
        .catch(() => setLoadedCatalog([]));
  }, [api, catalogOverride]);

  const catalog = catalogOverride ?? loadedCatalog;

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return catalog.filter(
      (tag) =>
        !q ||
        `${tag.name} ${tag.slug} ${tag.category}`
          .toLocaleLowerCase()
          .includes(q),
    );
  }, [catalog, query]);
  const selected = new Set(value);
  const grouped = visible.reduce<Record<string, Tag[]>>((groups, tag) => {
    (groups[tag.category] ??= []).push(tag);
    return groups;
  }, {});
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    if (!pinned) closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  return (
    <fieldset className="tag-selector" disabled={disabled} ref={rootRef}>
      <legend>题目标签</legend>
      <div className="tag-selector-row">
        <div className="tag-selector-selected" aria-label="已选择标签">
          {value
            .map((id) => catalog.find((tag) => tag.id === id))
            .filter((tag): tag is Tag => Boolean(tag))
            .map((tag) => (
              <button
                type="button"
                className="tag-selected-chip"
                key={tag.id}
                aria-label={`移除标签 ${tag.name}`}
                onClick={() => onChange(value.filter((id) => id !== tag.id))}
              >
                {tag.name} <span aria-hidden="true">×</span>
              </button>
            ))}
        </div>
        <button
          type="button"
          className="tag-selector-trigger"
          aria-expanded={open}
          aria-controls={popoverId}
          onMouseEnter={show}
          onMouseLeave={scheduleClose}
          onFocus={show}
          onClick={() => {
            cancelClose();
            if (pinned) {
              setOpen(false);
              setPinned(false);
            } else {
              setOpen(true);
              setPinned(true);
            }
          }}
        >
          <span aria-hidden="true">+</span> 选择标签
        </button>
      </div>
      {open && (
        <section
          id={popoverId}
          className="tag-selector-popover"
          aria-label="选择标签"
          role="dialog"
          onMouseEnter={show}
          onMouseLeave={scheduleClose}
        >
          <header>
            <strong>选择标签</strong>
            <span>已选 {value.length}</span>
          </header>
          <input
            aria-label="搜索标签"
            placeholder="搜索标签..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="tag-selector-catalog">
            {Object.entries(grouped).map(([category, tags]) => (
              <section key={category} className="tag-selector-group">
                <h3>{category}</h3>
                <div className="tag-selector-matrix">
                  {tags.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      className={selected.has(tag.id) ? 'selected' : ''}
                      aria-pressed={selected.has(tag.id)}
                      onClick={() => {
                        onChange(
                          selected.has(tag.id)
                            ? value.filter((id) => id !== tag.id)
                            : selectionMode === 'single'
                              ? [tag.id]
                              : [...value, tag.id],
                        );
                        if (selectionMode === 'single') {
                          setOpen(false);
                          setPinned(false);
                          setQuery('');
                        }
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {!visible.length && (
              <p className="tag-selector-empty">暂无匹配标签。</p>
            )}
          </div>
        </section>
      )}
    </fieldset>
  );
}
