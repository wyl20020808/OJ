import type { ReactNode } from 'react';

export type ProblemLibraryIconName =
  | 'bookmark'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'clock'
  | 'empty'
  | 'filter'
  | 'grid'
  | 'list'
  | 'search'
  | 'source';

const paths: Record<ProblemLibraryIconName, ReactNode> = {
  bookmark: <path d="M6.5 4.5h11v15l-5.5-3.2-5.5 3.2Z" />,
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  'chevron-left': <path d="m14.5 6-6 6 6 6" />,
  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  empty: (
    <>
      <path d="M5 5h14v14H5z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
  source: (
    <>
      <path d="M7 4h10v16H7z" />
      <path d="M10 8h4M10 12h4M10 16h4" />
    </>
  ),
};

export function ProblemLibraryIcon({ name }: { name: ProblemLibraryIconName }) {
  return (
    <svg
      className="problem-library-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
