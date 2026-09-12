// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../apps/web/src/components/Toast.js';
import {
  DiscussionHome,
  DiscussionPostPage,
} from '../apps/web/src/features/discussion/DiscussionExperience.js';
import { DiscussionRenderer } from '../apps/web/src/features/discussion/DiscussionRenderer.js';
import type {
  ApiClient,
  AuthenticatedUser,
  DiscussionBlogOverview,
  DiscussionPost,
} from '../apps/web/src/services/api.js';

const user: AuthenticatedUser = {
  id: 'user-1',
  username: 'alice',
  displayName: 'Alice',
  email: null,
  status: 'active',
};

function post(overrides: Partial<DiscussionPost> = {}): DiscussionPost {
  return {
    id: 'post-1',
    publicId: 'interval-dp',
    type: 'ARTICLE',
    kind: 'DISCUSSION',
    status: 'PUBLISHED',
    title: '区间 DP 中最容易写错的三个地方',
    summary: '整理状态设计、枚举顺序和常见边界错误。',
    contentMarkdown: '# 正文\n\n```cpp\nint main() {}\n```',
    publishedAt: '2026-09-08T00:00:00.000Z',
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    viewCount: 18,
    likeCount: 4,
    commentCount: 1,
    category: null,
    tags: [],
    coverImageUrl: null,
    isFeatured: false,
    isPinned: false,
    dataOrigin: 'USER',
    author: { username: 'alice', displayName: 'Alice' },
    capabilities: { canEdit: true, canDelete: true, canModerate: false },
    ...overrides,
  };
}

const emptyOverview: DiscussionBlogOverview = {
  featured: null,
  hotPosts: [],
  recommendedPosts: [],
  categories: [],
  tags: [],
  authors: [],
  stats: { todayPosts: 0, weekPosts: 0, totalAuthors: 0, totalPosts: 0 },
  recentComments: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('Blog Hub Reference Experience', () => {
  it('renders the blog masthead, editorial navigation and data-backed article cards', async () => {
    let resolvePosts!: (value: { items: DiscussionPost[] }) => void;
    const api = {
      discussionBlogOverview: vi.fn().mockResolvedValue(emptyOverview),
      discussionPosts: vi.fn(
        () =>
          new Promise<{ items: DiscussionPost[] }>((resolve) => {
            resolvePosts = resolve;
          }),
      ),
    } as unknown as ApiClient;
    render(<DiscussionHome api={api} navigate={vi.fn()} user={user} />);

    expect(screen.getByLabelText('正在加载讨论内容')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: '用文字记录思考，让算法的世界更温暖',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '讨论' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '公告' })).toHaveAttribute(
      'href',
      '/discussion?type=announcement',
    );
    expect(screen.getByRole('link', { name: '题解' })).toHaveAttribute(
      'href',
      '/discussion?type=solution',
    );

    const announcement = post({
      id: 'post-2',
      publicId: 'training-notice',
      type: 'ANNOUNCEMENT',
      title: '秋季训练安排调整',
      summary: '训练时间与场地调整说明。',
    });
    delete announcement.author;
    resolvePosts({
      items: [post(), announcement],
    });

    expect(
      await screen.findByRole('heading', {
        name: '区间 DP 中最容易写错的三个地方',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '秋季训练安排调整' }),
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-content-template="discussion"]'),
    ).toHaveLength(1);
    expect(screen.getByText('Deleted User')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '优秀作者榜' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '社区数据' }),
    ).toBeInTheDocument();
  });

  it('preserves type and search in URL-driven navigation and API query', async () => {
    window.history.pushState({}, '', '/discussion?type=announcement&q=release');
    const navigate = vi.fn();
    const discussionPosts = vi.fn().mockResolvedValue({ items: [] });
    const api = {
      discussionPosts,
      discussionBlogOverview: vi.fn().mockResolvedValue(emptyOverview),
    } as unknown as ApiClient;
    render(<DiscussionHome api={api} navigate={navigate} user={null} />);

    await waitFor(() =>
      expect(discussionPosts).toHaveBeenCalledWith(
        'limit=8&kind=ANNOUNCEMENT&q=release',
      ),
    );
    expect(screen.getByRole('link', { name: '公告' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(screen.getByRole('link', { name: '讨论' }));
    expect(navigate).toHaveBeenCalledWith('/discussion?q=release');

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'compiler' },
    });
    fireEvent.submit(screen.getByRole('search'));
    expect(navigate).toHaveBeenLastCalledWith(
      '/discussion?type=announcement&q=compiler',
    );
  });

  it('renders persisted Blog facets and loads cursor-paginated cards', async () => {
    const navigate = vi.fn();
    const featured = post({ id: 'featured', publicId: 'featured' });
    const first = post({
      id: 'post-2',
      publicId: 'metadata-card',
      title: '带完整元数据的文章',
      category: {
        slug: 'technical-sharing',
        name: '技术分享',
        description: '工程实践',
        postCount: 3,
        dataOrigin: 'DEVELOPMENT_FIXTURE',
      },
      tags: [
        {
          slug: 'backend',
          name: 'Backend',
          postCount: 2,
          dataOrigin: 'DEVELOPMENT_FIXTURE',
        },
      ],
      coverImageUrl: '/blog-mountain-hero.png',
      dataOrigin: 'DEVELOPMENT_FIXTURE',
    });
    const second = post({
      id: 'post-3',
      publicId: 'next-page',
      title: '下一页文章',
    });
    const discussionPosts = vi
      .fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [second] });
    const api = {
      discussionPosts,
      discussionBlogOverview: vi.fn().mockResolvedValue({
        ...emptyOverview,
        featured,
        categories: [first.category],
        tags: first.tags,
        authors: [{ author: first.author!, postCount: 3 }],
        stats: {
          todayPosts: 1,
          weekPosts: 4,
          totalAuthors: 2,
          totalPosts: 9,
        },
      }),
    } as unknown as ApiClient;

    const view = render(
      <DiscussionHome api={api} navigate={navigate} user={user} />,
    );
    expect(
      await screen.findByRole('heading', { name: '带完整元数据的文章' }),
    ).toBeInTheDocument();
    expect(screen.getByText('DEMO')).toBeInTheDocument();
    expect(
      view.container.querySelector('.blog-post-thumb img'),
    ).toHaveAttribute('src', '/blog-mountain-hero.png');
    expect(screen.getByRole('link', { name: /技术分享/ })).toHaveAttribute(
      'href',
      '/discussion?category=technical-sharing',
    );
    expect(screen.getByRole('button', { name: /Backend 2/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '加载更多文章' }));
    expect(
      await screen.findByRole('heading', { name: '下一页文章' }),
    ).toBeInTheDocument();
    expect(discussionPosts).toHaveBeenLastCalledWith(
      'limit=8&cursor=cursor-2&kind=DISCUSSION',
    );
  });

  it('shows content-specific empty state and compact retry state', async () => {
    window.history.pushState({}, '', '/discussion?type=announcement');
    const discussionPosts = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [] });
    const api = {
      discussionPosts,
      discussionBlogOverview: vi.fn().mockResolvedValue(emptyOverview),
    } as unknown as ApiClient;
    render(<DiscussionHome api={api} navigate={vi.fn()} user={null} />);

    expect(
      await screen.findByRole('heading', { name: '加载博客内容失败' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(
      await screen.findByRole('heading', { name: '暂时没有公告' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('新的站内公告会统一出现在这里。'),
    ).toBeInTheDocument();
  });

  it('uses one reading template with capability actions, comments, like and copy feedback', async () => {
    let current = post();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const api = {
      discussionPost: vi.fn(async () => current),
      discussionComments: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'comment-1',
            postId: current.id,
            contentMarkdown: '评论中的 `code`',
            status: 'VISIBLE',
            createdAt: current.createdAt,
            updatedAt: current.updatedAt,
            author: { username: 'bob', displayName: 'Bob' },
            capabilities: {
              canEdit: true,
              canDelete: true,
              canModerate: false,
            },
          },
        ],
      }),
      likeDiscussionPost: vi.fn(async () => {
        current = { ...current, likeCount: 5 };
        return { liked: true };
      }),
      unlikeDiscussionPost: vi.fn(),
      createDiscussionComment: vi.fn(),
      updateDiscussionComment: vi.fn(),
      deleteDiscussionComment: vi.fn(),
      deleteDiscussionPost: vi.fn(),
    } as unknown as ApiClient;
    const view = render(
      <ToastProvider>
        <DiscussionPostPage
          api={api}
          navigate={vi.fn()}
          id="interval-dp"
          user={user}
        />
      </ToastProvider>,
    );

    expect(
      await screen.findByRole('heading', {
        name: '区间 DP 中最容易写错的三个地方',
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText('评论中的', { exact: false }),
      ).toBeInTheDocument(),
    );
    expect(
      view.container.querySelector('[data-content-template="discussion"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '题目链接' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '删除' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '♡ 4' }));
    expect(await screen.findByRole('button', { name: '♥ 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '复制链接' }));
    expect(await screen.findByText('链接已复制')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it('renders announcement detail through same template and hides non-owner controls', async () => {
    const announcement = post({
      type: 'ANNOUNCEMENT',
      title: '系统维护公告',
      capabilities: { canEdit: false, canDelete: false, canModerate: false },
    });
    delete announcement.author;
    const api = {
      discussionPost: vi.fn().mockResolvedValue(announcement),
      discussionComments: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ApiClient;
    const view = render(
      <DiscussionPostPage
        api={api}
        navigate={vi.fn()}
        id="maintenance"
        user={null}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: '系统维护公告' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('公告')).not.toHaveLength(0);
    expect(
      screen.queryByRole('heading', { name: '题目链接' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Deleted User/ })).toHaveAttribute(
      'href',
      '/profiles/deleted-user',
    );
    expect(
      view.container.querySelector('.discussion-detail.announcement'),
    ).toHaveAttribute('data-content-template', 'discussion');
    expect(
      screen.queryByRole('button', { name: '编辑' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '删除' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle('登录后点赞')).toBeDisabled();
  });

  it('shows the problem-link preview only for posts identified as solutions', async () => {
    const solution = post({
      title: '【题解】 CF 1920F：从贪心到构造的完整思路',
      contentMarkdown:
        '## 题意概述\n\n先理解约束。\n\n## 代码实现\n\n```cpp\nint main() {}\n```',
    });
    const api = {
      discussionPost: vi.fn(async () => solution),
      discussionComments: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ApiClient;

    render(
      <DiscussionPostPage
        api={api}
        navigate={vi.fn()}
        id="cf-1920f"
        user={null}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: /题意概述/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /代码实现/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI总结' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '题目链接' }),
    ).toBeInTheDocument();
    expect(screen.getByTitle('题目关联功能将在后续接入')).toHaveAttribute(
      'data-ui-only',
      'true',
    );
  });

  it('preserves GFM, math and rich content while dropping unsafe HTML', () => {
    const { container } = render(
      <DiscussionRenderer
        content={
          '# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n> Quote\n\n`inline`\n\n```ts\nconst x = 1\n```\n\n$x^2$\n\n[link](https://example.com)\n\n![image](https://example.com/a.png)\n\n<script>alert(1)</script> [bad](javascript:alert(1))'
        }
      />,
    );
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelector('blockquote')).toBeInTheDocument();
    expect(container.querySelector('pre code')).toHaveTextContent(
      'const x = 1',
    );
    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/a.png',
    );
    expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
  });
});
