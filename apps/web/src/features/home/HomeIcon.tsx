import type { ReactNode } from 'react';

export type HomeIconName =
  | 'announcement'
  | 'calendar'
  | 'chart'
  | 'clipboard'
  | 'close'
  | 'recommendations'
  | 'star'
  | 'trophy';

const paths: Record<HomeIconName, ReactNode> = {
  announcement: (
    <>
      <path d="M3 11v2a2 2 0 0 0 2 2h2l4 4V5L7 9H5a2 2 0 0 0-2 2Z" />
      <path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20V7" />
      <path d="M2 20h22" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4" />
    </>
  ),
  close: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  recommendations: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22Z" />
    </>
  ),
  star: (
    <path d="m12 3 2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 17.02 6.9 19.7l.97-5.68L3.75 9l5.7-.83Z" />
  ),
  trophy: (
    <>
      <path d="M8 4h8v4a4 4 0 0 1-8 0ZM10 15h4M12 12v3M8 20h8" />
      <path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4" />
    </>
  ),
};

export function HomeIcon({ name }: { name: HomeIconName }) {
  return (
    <svg
      className="home-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
