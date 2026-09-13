type IconName =
  | 'book'
  | 'calendar'
  | 'chart'
  | 'chevron'
  | 'clock'
  | 'document'
  | 'flag'
  | 'bell'
  | 'alert';

export function HomeworkIcon({
  name,
  className = '',
}: {
  name: IconName;
  className?: string;
}) {
  const shared = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.9,
  };
  const path = {
    book: (
      <>
        <path
          {...shared}
          d="M4 5.4c2.8-1.1 5.3-.7 8 1.1v12.2c-2.7-1.8-5.2-2.2-8-1.1V5.4Z"
        />
        <path
          {...shared}
          d="M20 5.4c-2.8-1.1-5.3-.7-8 1.1v12.2c2.7-1.8 5.2-2.2 8-1.1V5.4Z"
        />
      </>
    ),
    calendar: (
      <>
        <rect {...shared} x="3.5" y="5" width="17" height="15" rx="2" />
        <path {...shared} d="M7.5 3v4M16.5 3v4M3.5 9h17" />
      </>
    ),
    chart: (
      <>
        <rect x="4" y="13" width="3.5" height="7" rx="1" fill="currentColor" />
        <rect
          x="10.2"
          y="8.5"
          width="3.5"
          height="11.5"
          rx="1"
          fill="currentColor"
        />
        <rect
          x="16.5"
          y="4"
          width="3.5"
          height="16"
          rx="1"
          fill="currentColor"
        />
      </>
    ),
    chevron: <path {...shared} d="m9 6 6 6-6 6" />,
    clock: (
      <>
        <circle {...shared} cx="12" cy="12" r="9" />
        <path {...shared} d="M12 7v5l3.5 2" />
      </>
    ),
    document: (
      <>
        <path {...shared} d="M6 3.5h8l4 4V20H6V3.5Z" />
        <path {...shared} d="M14 3.5v4h4M9 12h6M9 15.5h6" />
      </>
    ),
    flag: (
      <>
        <path {...shared} d="M6 21V4" />
        <path
          d="M7 4.5c4-2.1 6.6 1.8 11-.2v9c-4.4 2-7-1.9-11 .2v-9Z"
          fill="currentColor"
        />
      </>
    ),
    bell: (
      <>
        <path
          d="M5 17h14l-1.4-2.2V10a5.6 5.6 0 0 0-11.2 0v4.8L5 17Z"
          fill="currentColor"
        />
        <path {...shared} d="M9.5 20h5" />
      </>
    ),
    alert: (
      <>
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path
          d="M12 6.8v6.4M12 17.2h.01"
          stroke="white"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </>
    ),
  }[name];

  return (
    <svg
      aria-hidden="true"
      className={`homework-icon ${className}`.trim()}
      viewBox="0 0 24 24"
    >
      {path}
    </svg>
  );
}
