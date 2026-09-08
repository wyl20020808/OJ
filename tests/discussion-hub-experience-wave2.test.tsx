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
import {
  DiscussionHome,
  DiscussionPostPage,
} from '../apps/web/src/features/discussion/DiscussionExperience.js';
import { DiscussionRenderer } from '../apps/web/src/features/discussion/DiscussionRenderer.js';
import type {
  ApiClient,
  AuthenticatedUser,
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
    author: { username: 'alice', displayName: 'Alice' },
    capabilities: { canEdit: true, canDelete: true, canModerate: false },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('Discussion Hub Experience Wave 2', () => {
  it('renders loading skeleton, internal navigation and unified article/announcement feed rows', async () => {
    let resolvePosts!: (value: { items: DiscussionPost[] }) => void;
    const api = {
      discussionPosts: vi.fn(
        () =>
          new Promise<{ items: DiscussionPost[] }>((resolve) => {
            resolvePosts = resolve;
          }),
      ),
    } as unknown as ApiClient;
    render(<DiscussionHome api={api} navigate={vi.fn()} user={user} />);

    expect(screen.getByLabelText('正在加载讨论内容')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '讨论' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '全部' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '文章' })).toHaveAttribute(
      'href',
      '/discussion?type=article',
    );
    expect(screen.getByRole('link', { name: '公告' })).toHaveAttribute(
      'href',
      '/discussion?type=announcement',
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
    ).toHaveLength(2);
    expect(screen.getByText('Deleted User')).toBeInTheDocument();
    expect(screen.getAllByText('评论 1')).toHaveLength(2);
    expect(screen.getAllByText('♡ 4')).toHaveLength(2);
  });

  it('preserves type and search in URL-driven navigation and API query', async () => {
    window.history.pushState({}, '', '/discussion?type=announcement&q=release');
    const navigate = vi.fn();
    const discussionPosts = vi.fn().mockResolvedValue({ items: [] });
    const api = { discussionPosts } as unknown as ApiClient;
    render(<DiscussionHome api={api} navigate={navigate} user={null} />);

    await waitFor(() =>
      expect(discussionPosts).toHaveBeenCalledWith(
        'limit=20&type=ANNOUNCEMENT&q=release',
      ),
    );
    expect(screen.getByRole('link', { name: '公告' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(screen.getByRole('link', { name: '文章' }));
    expect(navigate).toHaveBeenCalledWith('/discussion?type=article&q=release');

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'compiler' },
    });
    fireEvent.submit(screen.getByRole('search'));
    expect(navigate).toHaveBeenLastCalledWith(
      '/discussion?type=announcement&q=compiler',
    );
  });

  it('shows content-specific empty state and compact retry state', async () => {
    window.history.pushState({}, '', '/discussion?type=announcement');
    const discussionPosts = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [] });
    const api = { discussionPosts } as unknown as ApiClient;
    render(<DiscussionHome api={api} navigate={vi.fn()} user={null} />);

    expect(
      await screen.findByRole('heading', { name: '加载讨论内容失败' }),
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
      <DiscussionPostPage
        api={api}
        navigate={vi.fn()}
        id="interval-dp"
        user={user}
      />,
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
    expect(screen.getByText('公告')).toBeInTheDocument();
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
