import type { DiscussionAuthor, DiscussionPost } from '../../services/api.js';

type Navigate = (path: string) => void;

export function formatDiscussionDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function DiscussionTypeBadge({
  type,
}: {
  type: DiscussionPost['type'];
}) {
  return (
    <span
      className={`discussion-type${type === 'ANNOUNCEMENT' ? ' announcement' : ''}`}
    >
      {type === 'ANNOUNCEMENT' ? '公告' : '文章'}
    </span>
  );
}

export function DiscussionAuthorLink({
  author,
  navigate,
  avatarFallback = 'initial',
}: {
  author: DiscussionAuthor | undefined;
  navigate: Navigate;
  avatarFallback?: 'initial' | 'portrait';
}) {
  const safe = author ?? {
    username: 'deleted-user',
    displayName: 'Deleted User',
  };
  const href = `/profiles/${encodeURIComponent(safe.username)}`;
  return (
    <a
      className="discussion-author"
      href={href}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
    >
      <DiscussionAvatar author={safe} fallback={avatarFallback} />
      <span className="discussion-author-identity">
        <strong>{safe.displayName}</strong>
        <small>@{safe.username}</small>
      </span>
    </a>
  );
}

const avatarPalette = [
  ['#386fa4', '#d8ebff'],
  ['#5968a9', '#e2e5ff'],
  ['#337f78', '#d8f3ed'],
  ['#9a5f71', '#f8e2ea'],
] as const;

export function DiscussionAvatar({
  author,
  fallback = 'portrait',
}: {
  author: Pick<DiscussionAuthor, 'username' | 'displayName' | 'avatarUrl'>;
  fallback?: 'initial' | 'portrait';
}) {
  const paletteIndex = Array.from(author.username).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const [foreground, background] =
    avatarPalette[paletteIndex % avatarPalette.length]!;

  return (
    <span
      className="discussion-author-avatar"
      aria-hidden="true"
      title={author.displayName}
    >
      {author.avatarUrl ? (
        <img src={author.avatarUrl} alt="" />
      ) : fallback === 'initial' ? (
        author.displayName.slice(0, 1).toUpperCase()
      ) : (
        <svg viewBox="0 0 36 36" focusable="false">
          <rect width="36" height="36" rx="18" fill={background} />
          <circle cx="18" cy="13" r="6.2" fill={foreground} opacity=".92" />
          <path
            d="M7.5 32c.8-7 4.8-10.5 10.5-10.5S27.7 25 28.5 32"
            fill={foreground}
            opacity=".92"
          />
          <circle cx="27.5" cy="8.5" r="3" fill="#fff" opacity=".72" />
        </svg>
      )}
    </span>
  );
}

export function DiscussionFeedItem({
  post,
  navigate,
}: {
  post: DiscussionPost;
  navigate: Navigate;
}) {
  const href = `/discussion/${post.publicId}`;
  return (
    <article
      className={`discussion-feed-item${post.type === 'ANNOUNCEMENT' ? ' announcement' : ''}`}
      data-content-template="discussion"
    >
      <div className="discussion-feed-content">
        <div className="discussion-feed-heading">
          <h2>
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                navigate(href);
              }}
            >
              {post.title}
            </a>
          </h2>
          <DiscussionTypeBadge type={post.type} />
        </div>
        {post.summary && <p className="discussion-summary">{post.summary}</p>}
        <div className="discussion-feed-footer">
          <div className="discussion-feed-meta">
            <DiscussionAuthorLink author={post.author} navigate={navigate} />
            <time dateTime={post.publishedAt ?? post.createdAt}>
              {formatDiscussionDate(post.publishedAt ?? post.createdAt)}
            </time>
          </div>
          <div className="discussion-feed-counts" aria-label="内容数据">
            <span aria-label={`${post.likeCount} 个赞`}>
              ♡ {post.likeCount}
            </span>
            <span aria-label={`${post.commentCount} 条评论`}>
              评论 {post.commentCount}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function DiscussionFeedSkeleton() {
  return (
    <div className="discussion-feed-skeleton" aria-label="正在加载讨论内容">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          className="discussion-skeleton-item"
          key={index}
          aria-hidden="true"
        >
          <span />
          <strong />
          <p />
          <small />
        </div>
      ))}
    </div>
  );
}
