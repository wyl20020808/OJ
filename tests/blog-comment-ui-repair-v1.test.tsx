// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscussionComments } from '../apps/web/src/features/discussion/DiscussionComments.js';
import type {
  ApiClient,
  AuthenticatedUser,
  DiscussionComment,
  DiscussionPost,
} from '../apps/web/src/services/api.js';

const viewer: AuthenticatedUser = {
  id: 'viewer-1',
  username: 'alice',
  displayName: 'Alice',
  email: null,
  status: 'active',
};

const post: DiscussionPost = {
  id: 'post-1',
  publicId: 'comment-layout',
  type: 'ARTICLE',
  kind: 'DISCUSSION',
  status: 'PUBLISHED',
  title: 'Comment layout',
  summary: null,
  contentMarkdown: 'Body',
  publishedAt: '2026-09-10T00:00:00.000Z',
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
  viewCount: 10,
  likeCount: 0,
  commentCount: 3,
  category: null,
  tags: [],
  coverImageUrl: null,
  isFeatured: false,
  isPinned: false,
  dataOrigin: 'USER',
  author: { username: 'alice', displayName: 'Alice' },
};

const comments: DiscussionComment[] = [
  {
    id: 'hot-root',
    postId: post.id,
    contentMarkdown: '热门评论',
    status: 'VISIBLE',
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    likeCount: 8,
    author: { username: 'alice', displayName: 'Alice' },
    capabilities: { canEdit: true, canDelete: true, canModerate: false },
  },
  {
    id: 'new-root',
    postId: post.id,
    contentMarkdown: '最新评论 with `inline_code` and a long English phrase',
    status: 'VISIBLE',
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    likeCount: 1,
    author: {
      username: 'long-reader-name',
      displayName: '很长的中英文用户名 Long Reader',
    },
    capabilities: { canEdit: false, canDelete: false, canModerate: false },
  },
  {
    id: 'reply-1',
    postId: post.id,
    parentCommentId: 'hot-root',
    contentMarkdown: '回复正文 123',
    status: 'VISIBLE',
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
    likeCount: 2,
    author: { username: 'bob', displayName: 'Bob' },
    replyTarget: { username: 'alice', displayName: 'Alice' },
    capabilities: { canEdit: false, canDelete: false, canModerate: false },
  },
];

afterEach(cleanup);

describe('Blog Comment UI Repair V1', () => {
  it('keeps composer before feed and sorts real comments by heat or time', async () => {
    const api = {
      discussionComments: vi.fn().mockResolvedValue({ items: comments }),
      createDiscussionComment: vi.fn().mockResolvedValue(comments[0]),
      updateDiscussionComment: vi.fn(),
      deleteDiscussionComment: vi.fn(),
      likeDiscussionComment: vi.fn(),
      unlikeDiscussionComment: vi.fn(),
    } as unknown as ApiClient;
    const { container } = render(
      <DiscussionComments
        api={api}
        navigate={vi.fn()}
        post={post}
        user={viewer}
        onCommentsChanged={vi.fn()}
      />,
    );

    expect(await screen.findByText('热门评论')).toBeInTheDocument();
    const composer = container.querySelector('.discussion-comment-composer');
    const list = container.querySelector('.discussion-comment-list');
    expect(composer).not.toBeNull();
    expect(list).not.toBeNull();
    expect(
      composer!.compareDocumentPosition(list!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '按热度' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(rootCommentIds(container)[0]).toBe('hot-root');

    fireEvent.click(screen.getByRole('button', { name: '按时间' }));
    expect(screen.getByRole('button', { name: '按时间' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(rootCommentIds(container)[0]).toBe('new-root');
    expect(
      container.querySelector('.discussion-comment-reply'),
    ).toHaveAttribute('data-comment-id', 'reply-1');
    expect(
      container.querySelector('.discussion-author-avatar svg'),
    ).not.toBeNull();
    expect(screen.getByText('作者')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('说点什么吧...'), {
      target: { value: '新的评论' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发表评论' }));
    await waitFor(() =>
      expect(api.createDiscussionComment).toHaveBeenCalledWith(
        post.id,
        '新的评论',
        null,
      ),
    );
  });

  it('opens a compact focused reply composer and preserves capability actions', async () => {
    const api = {
      discussionComments: vi.fn().mockResolvedValue({ items: comments }),
      createDiscussionComment: vi.fn().mockResolvedValue(comments[2]),
      updateDiscussionComment: vi.fn().mockResolvedValue(comments[0]),
      deleteDiscussionComment: vi.fn().mockResolvedValue(comments[0]),
      likeDiscussionComment: vi.fn().mockResolvedValue({
        liked: true,
        likeCount: 9,
      }),
      unlikeDiscussionComment: vi.fn(),
    } as unknown as ApiClient;
    const { container } = render(
      <DiscussionComments
        api={api}
        navigate={vi.fn()}
        post={post}
        user={viewer}
        onCommentsChanged={vi.fn()}
      />,
    );

    await screen.findByText('热门评论');
    const ownerComment = container.querySelector<HTMLElement>(
      '[data-comment-id="hot-root"]',
    );
    const otherComment = container.querySelector<HTMLElement>(
      '[data-comment-id="new-root"]',
    );
    expect(ownerComment).not.toBeNull();
    expect(otherComment).not.toBeNull();
    expect(
      within(ownerComment!).getByRole('button', { name: '编辑' }),
    ).toBeVisible();
    expect(
      within(ownerComment!).getByRole('button', { name: '删除' }),
    ).toBeVisible();
    expect(
      within(otherComment!).queryByRole('button', { name: '编辑' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(otherComment!).getByRole('button', { name: '回复' }),
    );
    const replyInput = screen.getByPlaceholderText('写下回复');
    expect(replyInput).toHaveFocus();
    expect(replyInput.closest('.discussion-inline-reply')).not.toBeNull();
    fireEvent.change(replyInput, { target: { value: '@reader 收到' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByPlaceholderText('写下回复')).not.toBeInTheDocument();

    fireEvent.click(
      within(otherComment!).getByRole('button', { name: '回复' }),
    );
    const submittedReply = screen.getByPlaceholderText('写下回复');
    fireEvent.change(submittedReply, { target: { value: '@reader 收到' } });
    fireEvent.click(
      within(submittedReply.closest<HTMLFormElement>('form')!).getByRole(
        'button',
        {
          name: '回复',
        },
      ),
    );
    await waitFor(() =>
      expect(api.createDiscussionComment).toHaveBeenCalledWith(
        post.id,
        '@reader 收到',
        'new-root',
      ),
    );

    fireEvent.click(
      within(ownerComment!).getByRole('button', { name: '编辑' }),
    );
    const editInput = screen.getByLabelText('编辑评论');
    fireEvent.change(editInput, { target: { value: '更新后的评论' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(api.updateDiscussionComment).toHaveBeenCalledWith(
        'hot-root',
        '更新后的评论',
      ),
    );

    fireEvent.click(
      within(ownerComment!).getByRole('button', { name: '删除' }),
    );
    await waitFor(() =>
      expect(api.deleteDiscussionComment).toHaveBeenCalledWith('hot-root'),
    );
  });
});

function rootCommentIds(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll('.discussion-comment[data-comment-depth="0"]'),
  ).map((item) => item.getAttribute('data-comment-id'));
}
