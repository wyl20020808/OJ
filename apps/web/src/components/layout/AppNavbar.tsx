import { useState, type ReactNode } from 'react';
import type { ApiClient, AuthenticatedUser } from '../../services/api.js';
import { NotificationBell } from '../PortalExperience.js';
import './AppNavbar.css';

type NavigationLinkProps = {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

type AppNavbarProps = {
  Link: (props: NavigationLinkProps) => ReactNode;
  api: ApiClient;
  current: { name: string };
  user: AuthenticatedUser | null;
  canViewJudgeAdmin: boolean;
  navigate: (path: string) => void;
  onLogoutComplete: () => void;
};

export function AppNavbar({
  Link,
  api,
  current,
  user,
  canViewJudgeAdmin,
  navigate,
  onLogoutComplete,
}: AppNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const isDiscussion = current.name.startsWith('discussion');

  return (
    <header className={`app-navbar${mobileOpen ? ' app-navbar-open' : ''}`}>
      <Link to="/" className="app-navbar__brand">
        <span className="app-navbar__brand-mark" aria-hidden="true">
          OJ
        </span>
        <strong>
          AlgoOJ
          {isDiscussion && (
            <span className="app-navbar__brand-section">博客</span>
          )}
        </strong>
      </Link>
      <button
        type="button"
        className="app-navbar__toggle"
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? '关闭导航' : '打开导航'}
        onClick={() => setMobileOpen((open) => !open)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <nav className="app-navbar__links" aria-label="Primary navigation">
        <Link
          to="/"
          ariaLabel="Home"
          className={current.name === 'home' ? 'active' : ''}
        >
          首页
        </Link>
        <Link
          to="/problems"
          ariaLabel="Problems"
          className={
            current.name === 'problems' ||
            current.name === 'problem' ||
            current.name === 'submit'
              ? 'active'
              : ''
          }
        >
          题库
        </Link>
        <Link
          to="/contests"
          className={current.name.includes('contest') ? 'active' : ''}
        >
          比赛
        </Link>
        <Link
          to="/teams"
          className={current.name.startsWith('team') ? 'active' : ''}
        >
          团队
        </Link>
        <Link
          to="/homework"
          className={
            current.name === 'homework' || current.name === 'homework-detail'
              ? 'active'
              : ''
          }
        >
          作业
        </Link>
        <Link to="/discussion" className={isDiscussion ? 'active' : ''}>
          博客
        </Link>
        <Link
          to="/submissions"
          ariaLabel="Submissions"
          className={
            current.name === 'submissions' || current.name === 'submission'
              ? 'active'
              : ''
          }
        >
          评测
        </Link>
        {canViewJudgeAdmin && (
          <Link
            to="/admin/judge/nodes"
            className={current.name.startsWith('judge-') ? 'active' : ''}
          >
            管理
          </Link>
        )}
        <form
          className="app-navbar__search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const query = new FormData(event.currentTarget)
              .get('q')
              ?.toString()
              .trim();
            navigate(
              query
                ? `${isDiscussion ? '/discussion' : '/problems'}?q=${encodeURIComponent(
                    query,
                  )}`
                : isDiscussion
                  ? '/discussion'
                  : '/problems',
            );
          }}
        >
          <span aria-hidden="true">⌕</span>
          <input
            name="q"
            placeholder={
              isDiscussion ? '搜索文章、摘要或标签…' : '搜索题目、比赛、用户…'
            }
            aria-label="全站搜索"
          />
        </form>
        <NotificationBell navigate={navigate} api={api} />
        {user ? (
          <>
            {user.guest && (
              <span className="guest-badge app-navbar__guest-badge">游客</span>
            )}
            <Link
              to="/profile"
              className={current.name === 'profile' ? 'active' : ''}
            >
              {user.displayName}
            </Link>
            <button
              className="app-navbar__link-button"
              disabled={logoutBusy}
              onClick={() => {
                setLogoutBusy(true);
                setLogoutError(false);
                void api
                  .logout()
                  .then(onLogoutComplete)
                  .catch(() => setLogoutError(true))
                  .finally(() => setLogoutBusy(false));
              }}
            >
              {logoutBusy ? '正在退出…' : '退出登录'}
            </button>
            {logoutError && (
              <span className="app-navbar__logout-error" role="alert">
                退出失败，请重试
              </span>
            )}
          </>
        ) : (
          <>
            <Link to="/login" ariaLabel="Sign in">
              登录
            </Link>
            <Link to="/register" ariaLabel="Register">
              注册
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
