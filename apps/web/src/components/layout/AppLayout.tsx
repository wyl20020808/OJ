import type { ReactNode } from 'react';

type AppLayoutProps = {
  navbar: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  mainClassName: string;
  children: ReactNode;
};

export function AppLayout({
  navbar,
  breadcrumbs,
  className,
  mainClassName,
  children,
}: AppLayoutProps) {
  return (
    <div className={`app${className ? ` ${className}` : ''}`}>
      {navbar}
      {breadcrumbs}
      <main className={mainClassName}>{children}</main>
      <footer>OJPlatform · 练习、学习、持续进步。</footer>
    </div>
  );
}
