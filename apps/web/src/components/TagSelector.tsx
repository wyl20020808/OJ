import { useEffect, useMemo, useState } from 'react';
import type { ApiClient, Problem } from '../services/api.js';

type Tag = NonNullable<Problem['tagDetails']>[number];

export function TagSelector({
  api,
  value,
  onChange,
  disabled = false,
}: {
  api: ApiClient;
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const loader = api.tags?.();
    if (loader)
      void loader
        .then((tags) => setCatalog(Array.isArray(tags) ? tags : []))
        .catch(() => setCatalog([]));
  }, [api]);
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
  return (
    <fieldset className="tag-selector" disabled={disabled}>
      <legend>标签</legend>
      <input
        aria-label="搜索标签"
        placeholder="搜索标签..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="tag-selector-selected" aria-label="已选择标签">
        {value
          .map((id) => catalog.find((tag) => tag.id === id))
          .filter(Boolean)
          .map((tag) => (
            <button
              type="button"
              key={tag!.id}
              onClick={() => onChange(value.filter((item) => item !== tag!.id))}
            >
              {tag!.name} ×
            </button>
          ))}
      </div>
      {Object.entries(grouped).map(([category, tags]) => (
        <div key={category} className="tag-selector-group">
          <strong>{category}</strong>
          {tags.map((tag) => (
            <label key={tag.id}>
              <input
                type="checkbox"
                checked={selected.has(tag.id)}
                onChange={() =>
                  onChange(
                    selected.has(tag.id)
                      ? value.filter((id) => id !== tag.id)
                      : [...value, tag.id],
                  )
                }
              />
              {tag.name}
            </label>
          ))}
        </div>
      ))}
      {!visible.length && <p className="field-help">暂无匹配标签。</p>}
    </fieldset>
  );
}
