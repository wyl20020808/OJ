import { useEffect, useState } from 'react';
import type {
  Account,
  AccountIdentifier,
  ApiClient,
  AuthenticatedUser,
  AuthProvider,
  ConnectedIdentity,
  Session,
} from '../services/api.js';
import { ApiError } from '../services/api.js';

function safeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

export function AccountSettings({
  api,
  user,
}: {
  api: ApiClient;
  user: AuthenticatedUser | null;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [identifiers, setIdentifiers] = useState<AccountIdentifier[] | null>(
    null,
  );
  const [identities, setIdentities] = useState<ConnectedIdentity[] | null>(
    null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setError('');
    void Promise.all([api.account(), api.sessions()])
      .then(([nextAccount, nextSessions]) => {
        if (!active) return;
        setAccount(nextAccount);
        setSessions(nextSessions);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof ApiError
            ? reason.status === 401
              ? 'Your session has expired. Sign in again to view account security.'
              : 'Account security is temporarily unavailable.'
            : 'Account security could not be reached.',
        );
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    let active = true;
    if (
      typeof api.accountIdentifiers !== 'function' ||
      typeof api.connectedIdentities !== 'function'
    ) {
      setIdentifiers([]);
      setIdentities([]);
      return () => {
        active = false;
      };
    }
    void Promise.all([api.accountIdentifiers(), api.connectedIdentities()])
      .then(([nextIdentifiers, nextIdentities]) => {
        if (!active) return;
        setIdentifiers(Array.isArray(nextIdentifiers) ? nextIdentifiers : []);
        setIdentities(Array.isArray(nextIdentities) ? nextIdentities : []);
      })
      .catch(() => {
        if (!active) return;
        setIdentifiers([]);
        setIdentities([]);
      });
    return () => {
      active = false;
    };
  }, [api]);
  if (!user)
    return (
      <div className="state">
        <h2>Sign in required</h2>
        <p>Sign in to manage your account security.</p>
      </div>
    );
  if (error)
    return (
      <div className="state">
        <h2>Account settings unavailable</h2>
        <p role="alert">{error}</p>
      </div>
    );
  if (!account || !sessions)
    return (
      <div className="state" aria-busy="true">
        <h2>Loading account settings</h2>
        <p>Fetching your account and active sessions...</p>
      </div>
    );
  const revoke = async (id?: string) => {
    const key = id ?? 'all';
    setBusy(key);
    setError('');
    try {
      if (id) await api.revokeSession(id);
      else await api.revokeAllSessions();
      setSessions(await api.sessions());
    } catch (reason: unknown) {
      setError(
        reason instanceof ApiError
          ? 'The session change was rejected. Refresh and try again.'
          : 'The session service could not be reached.',
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h1>Settings &amp; security</h1>
        </div>
        <span className="status status-active">Session protected</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-grid">
        <article className="settings-panel">
          <p className="panel-label">PROFILE</p>
          <h2>{account.displayName}</h2>
          <p className="muted">@{account.username}</p>
          <dl className="settings-facts">
            <div>
              <dt>Email</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{safeDate(account.createdAt)}</dd>
            </div>
          </dl>
          <div className="unavailable-note">
            Profile editing and password changes are not available in the
            current public API.
          </div>
        </article>
        <article className="settings-panel">
          <div className="panel-row">
            <div>
              <p className="panel-label">SESSIONS</p>
              <h2>Signed-in devices</h2>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => void revoke()}
              disabled={
                busy !== null || !account.capabilities.canManageSessions
              }
            >
              {busy === 'all' ? 'Signing out...' : 'Sign out all'}
            </button>
          </div>
          <ul className="session-list">
            {sessions.length === 0 ? (
              <li className="muted">No active sessions.</li>
            ) : (
              sessions.map((session) => (
                <li key={session.id}>
                  <div>
                    <strong>{session.deviceLabel || 'Browser session'}</strong>
                    <span className="muted">
                      Last seen{' '}
                      {safeDate(session.lastSeenAt || session.createdAt)}
                    </span>
                  </div>
                  {!session.revokedAt && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void revoke(session.id)}
                      disabled={busy !== null}
                    >
                      {busy === session.id ? 'Signing out...' : 'Sign out'}
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
          <p className="muted settings-footnote">
            Session metadata is shown without tokens or secret credentials.
          </p>
        </article>
        <article className="settings-panel settings-wide">
          <div className="panel-row">
            <div>
              <p className="panel-label">IDENTITY</p>
              <h2>Login methods</h2>
            </div>
            <span className="muted">Verified identifiers and providers</span>
          </div>
          {identifiers === null || identities === null ? (
            <p className="muted" role="status">
              Loading connected identities...
            </p>
          ) : identifiers.length === 0 && identities.length === 0 ? (
            <p className="unavailable-note">
              Connected identity management is awaiting Auth V2 capability
              discovery.
            </p>
          ) : (
            <div className="identity-list">
              {identifiers.map((identifier) => (
                <div className="identity-row" key={identifier.id}>
                  <div>
                    <strong>
                      {identifier.type === 'EMAIL' ? 'Email' : 'Phone'}
                    </strong>
                    <span className="muted">{identifier.maskedValue}</span>
                  </div>
                  <span className="status status-active">
                    {identifier.primary ? 'Primary' : 'Verified'}
                  </span>
                </div>
              ))}
              {identities.map((identity) => {
                const canUnlink =
                  identifiers.some((item) => item.loginCapable) ||
                  identities.length > 1;
                return (
                  <div className="identity-row" key={identity.provider}>
                    <div>
                      <strong>{identity.provider}</strong>
                      <span className="muted">
                        {identity.subjectLabel || 'Connected provider'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!canUnlink || busy !== null}
                      onClick={() =>
                        void (async () => {
                          if (!window.confirm(`Unlink ${identity.provider}?`))
                            return;
                          setBusy(identity.provider);
                          try {
                            await api.unlinkIdentity(
                              identity.provider as AuthProvider,
                            );
                            setIdentities(
                              (items) =>
                                items?.filter(
                                  (item) => item.provider !== identity.provider,
                                ) ?? [],
                            );
                          } catch (reason) {
                            setError(
                              reason instanceof ApiError
                                ? 'The provider could not be unlinked.'
                                : 'The identity service could not be reached.',
                            );
                          } finally {
                            setBusy(null);
                          }
                        })()
                      }
                    >
                      {canUnlink
                        ? busy === identity.provider
                          ? 'Unlinking...'
                          : 'Unlink'
                        : 'Required login method'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="muted settings-footnote">
            Adding or linking a new identifier/provider requires a server-issued
            verification or OAuth transaction.
          </p>
        </article>
      </div>
    </section>
  );
}
