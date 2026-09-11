import { useEffect, useState } from 'react';
import type {
  Account,
  AccountIdentifier,
  ApiClient,
  AuthenticatedUser,
  AuthProvider,
  ConnectedIdentity,
  Session,
  EditableProfile,
} from '../services/api.js';
import { ApiError } from '../services/api.js';
import '../features/profile/ProfilePage.css';
import { useToast } from './Toast.js';

function safeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间未知'
    : date.toLocaleString('zh-CN');
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
  const [profile, setProfile] = useState<EditableProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<EditableProfile | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const toast = useToast();
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
              ? '登录状态已过期，请重新登录后查看账户安全。'
              : '账户安全服务暂时不可用。'
            : '暂时无法连接账户安全服务。',
        );
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    if (!user || typeof api.editableProfile !== 'function') return;
    void api.editableProfile().then((value) => {
      const normalized: EditableProfile = {
        username: value.username ?? user.username,
        displayName: value.displayName ?? user.displayName,
        headline: value.headline ?? '',
        bio: value.bio ?? '',
        location: value.location ?? '',
        organization: value.organization ?? '',
        website: value.website ?? '',
        github: value.github ?? '',
        avatarUrl: value.avatarUrl ?? '',
        backgroundUrl: value.backgroundUrl ?? '',
      };
      setProfile(normalized);
      setProfileDraft(normalized);
    }).catch(() => setProfileMessage('公开资料加载失败，请稍后重试。'));
  }, [api, user]);
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
        <h2>请先登录</h2>
        <p>登录后才能管理账户安全。</p>
      </div>
    );
  if (error)
    return (
      <div className="state">
        <h2>账户设置暂不可用</h2>
        <p role="alert">{error}</p>
      </div>
    );
  if (!account || !sessions)
    return (
      <div className="state" aria-busy="true">
        <h2>正在加载账户设置</h2>
        <p>正在获取账户信息和活跃会话…</p>
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
          ? '会话变更被拒绝，请刷新后重试。'
          : '暂时无法连接会话服务。',
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">账户与安全</p>
          <h1>账户设置</h1>
        </div>
        <span className="status status-active">会话受保护</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-grid">
        {profileDraft && <ProfileEditor profile={profileDraft} setProfile={setProfileDraft} saving={profileSaving} message={profileMessage} onSave={async () => { setProfileSaving(true); setProfileMessage(''); try { const { avatarUrl = '', backgroundUrl = '', ...fields } = profileDraft; const saved = await api.updateProfile(fields); setProfile({ ...saved, avatarUrl, backgroundUrl }); setProfileDraft({ ...saved, avatarUrl, backgroundUrl }); toast({ kind: 'success', title: '资料已保存' }); } catch (reason) { const detail = reason instanceof ApiError && reason.details && typeof reason.details === 'object' ? Object.values(reason.details as Record<string, string>).join(' ') : ''; toast({ kind: 'error', title: '资料保存失败', description: detail || '请稍后重试。' }); } finally { setProfileSaving(false); } }} onCancel={() => profile && setProfileDraft(profile)} api={api} />}
        <article className="settings-panel">
          <p className="panel-label">基本资料</p>
          <h2>{account.displayName}</h2>
          <p className="muted">@{account.username}</p>
          <dl className="settings-facts">
            <div>
              <dt>邮箱</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt>注册时间</dt>
              <dd>{safeDate(account.createdAt)}</dd>
            </div>
          </dl>
          <div className="unavailable-note">
            用户名、邮箱和密码属于账户安全信息，需通过对应安全流程修改。
          </div>
        </article>
        <article className="settings-panel">
          <div className="panel-row">
            <div>
              <p className="panel-label">登录会话</p>
              <h2>登录设备</h2>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => void revoke()}
              disabled={
                busy !== null || !account.capabilities.canManageSessions
              }
            >
              {busy === 'all' ? '退出中…' : '退出全部会话'}
            </button>
          </div>
          <ul className="session-list">
            {sessions.length === 0 ? (
              <li className="muted">暂无活跃会话。</li>
            ) : (
              sessions.map((session) => (
                <li key={session.id}>
                  <div>
                    <strong>{session.deviceLabel || '浏览器会话'}</strong>
                    <span className="muted">
                      最近活动：
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
                      {busy === session.id ? '退出中…' : '退出'}
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
          <p className="muted settings-footnote">
            页面只展示会话元数据，不展示令牌或其他机密凭据。
          </p>
        </article>
        <article className="settings-panel settings-wide">
          <div className="panel-row">
            <div>
              <p className="panel-label">登录与验证方式</p>
              <h2>登录方式</h2>
            </div>
            <span className="muted">已验证身份与登录 provider</span>
          </div>
          {identifiers === null || identities === null ? (
            <p className="muted" role="status">
              正在加载已连接的登录方式…
            </p>
          ) : identifiers.length === 0 && identities.length === 0 ? (
            <p className="unavailable-note">
              已连接登录方式的管理功能正在等待 Auth V2 能力发现。
            </p>
          ) : (
            <div className="identity-list">
              {identifiers.map((identifier) => (
                <div className="identity-row" key={identifier.id}>
                  <div>
                    <strong>
                      {identifier.type === 'EMAIL'
                        ? '已验证邮箱'
                        : '已验证手机号'}
                    </strong>
                    <span className="muted">{identifier.maskedValue}</span>
                  </div>
                  <span className="status status-active">
                    {identifier.primary ? '主登录方式' : '已验证'}
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
                        {identity.subjectLabel || '已连接 provider'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!canUnlink || busy !== null}
                      onClick={() =>
                        void (async () => {
                          if (
                            !window.confirm(
                              `确定要解绑 ${identity.provider} 吗？`,
                            )
                          )
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
                                ? '无法解绑该登录方式。'
                                : '暂时无法连接身份服务。',
                            );
                          } finally {
                            setBusy(null);
                          }
                        })()
                      }
                    >
                      {canUnlink
                        ? busy === identity.provider
                          ? '解绑中…'
                          : '解绑'
                        : '必要登录方式'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="muted settings-footnote">
            添加或绑定新的身份需要服务端签发的验证凭据或 OAuth 事务。
          </p>
        </article>
      </div>
    </section>
  );
}

function ProfileEditor({ profile, setProfile, saving, message, onSave, onCancel, api }: { profile: EditableProfile; setProfile: (p: EditableProfile) => void; saving: boolean; message: string; onSave: () => Promise<void>; onCancel: () => void; api: ApiClient }) {
  const [mediaBusy, setMediaBusy] = useState<'avatar' | 'background' | null>(null);
  const [mediaError, setMediaError] = useState('');
  const selectMedia = async (kind: 'avatar' | 'background', file?: File) => { if (!file) return; setMediaBusy(kind); setMediaError(''); try { const result = await api.uploadProfileMedia(kind, file); setProfile({ ...profile, ...(kind === 'avatar' ? { avatarUrl: result.url } : { backgroundUrl: result.url }) }); } catch { setMediaError('上传失败，请稍后重试。'); } finally { setMediaBusy(null); } };
  const removeMedia = async (kind: 'avatar' | 'background') => { setMediaBusy(kind); setMediaError(''); try { await api.removeProfileMedia(kind); setProfile({ ...profile, ...(kind === 'avatar' ? { avatarUrl: '' } : { backgroundUrl: '' }) }); } catch { setMediaError('移除失败，请稍后重试。'); } finally { setMediaBusy(null); } };
  const errors = {
    displayName: profile.displayName.trim() ? '' : '请输入显示名称。',
    headline: profile.headline.length > 100 ? '个性标题过长。' : '',
    bio: profile.bio.length > 800 ? '个人简介过长。' : '',
    location: profile.location.length > 100 ? '地区过长。' : '',
    organization: profile.organization.length > 120 ? '组织名称过长。' : '',
    websiteLength: profile.website.length > 300 ? '个人网站过长。' : '',
    githubLength: profile.github.length > 100 ? 'GitHub 信息过长。' : '',
    website: profile.website && !/^https?:\/\/[^\s]+$/i.test(profile.website) ? '网站需使用 http 或 https 地址。' : '',
    github: profile.github && !/^(?:[A-Za-z0-9-]{1,39}|https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/?$)/.test(profile.github) ? '请输入 GitHub 用户名或 GitHub 主页地址。' : '',
  };
  const invalid = Object.values(errors).some(Boolean);
  const field = (key: keyof Omit<EditableProfile, 'username'>, label: string, type: 'input' | 'textarea' = 'input') => {
    const error = errors[key as keyof typeof errors] ?? '';
    const control = type === 'textarea'
      ? <textarea maxLength={800} value={profile[key]} aria-invalid={Boolean(error)} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} />
      : <input maxLength={key === 'displayName' ? 60 : key === 'headline' ? 100 : key === 'organization' ? 120 : key === 'location' ? 100 : key === 'website' ? 300 : 100} value={profile[key]} aria-invalid={Boolean(error)} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} />;
    return <label className="profile-editor-field">{label}{control}{error && <span className="field-error" role="alert">{error}</span>}</label>;
  };
  return <article className="settings-panel settings-wide profile-editor"><div className="panel-row"><div><p className="panel-label">公开个人资料</p><h2>编辑个人资料</h2></div><span className="muted">这些信息会显示在你的公开主页。</span></div><div className="profile-media-edit"><div className="media-edit-item"><img src={profile.avatarUrl || undefined} alt="头像预览" className="profile-editor-avatar" /> <div><label className="secondary">更换头像<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void selectMedia('avatar', e.target.files?.[0])} /></label>{profile.avatarUrl && <button type="button" className="secondary" onClick={() => void removeMedia('avatar')}>移除头像</button>}</div></div><div className="media-edit-item"><div className="profile-editor-banner" style={profile.backgroundUrl ? { backgroundImage: `url(${profile.backgroundUrl})` } : undefined} aria-label="背景图片预览" /><div><label className="secondary">更换背景<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void selectMedia('background', e.target.files?.[0])} /></label>{profile.backgroundUrl && <button type="button" className="secondary" onClick={() => void removeMedia('background')}>移除背景</button>}</div></div></div>{mediaBusy && <p role="status" className="muted">上传中…</p>}{mediaError && <p role="alert" className="field-error">{mediaError}</p>}<div className="profile-editor-grid"><div>{field('displayName', '显示名称')}{field('headline', '一句话介绍')}{field('bio', `个人简介（${profile.bio.length}/800）`, 'textarea')}</div><div>{field('location', '地区')}{field('organization', '学校 / 组织')}{field('website', '个人网站')}{field('github', 'GitHub')}</div></div><div className="profile-editor-actions"><span className="muted">@{profile.username}</span><button type="button" className="secondary" onClick={onCancel} disabled={saving || Boolean(mediaBusy)}>取消</button><button type="button" onClick={() => void onSave()} disabled={saving || invalid || Boolean(mediaBusy)}>{saving ? '保存中…' : '保存资料'}</button></div>{message && <p role="status" className="muted">{message}</p>}</article>;
}
