export type DiscussionPostType = 'ARTICLE' | 'ANNOUNCEMENT';
export type DiscussionPostStatus = 'DRAFT' | 'PUBLISHED' | 'DELETED';
export type DiscussionCommentStatus = 'VISIBLE' | 'DELETED';

export type DiscussionAuthor = { id: string; username: string; displayName: string; avatarUrl?: string };
export type DiscussionPost = {
  id: string; publicId: string; authorId: string; type: DiscussionPostType;
  status: DiscussionPostStatus; title: string; summary: string | null;
  contentMarkdown: string; publishedAt: string | null; createdAt: string; updatedAt: string;
  deletedAt: string | null; deletedBy: string | null; viewCount: number;
  likeCount: number; commentCount: number; author?: DiscussionAuthor;
};
export type DiscussionComment = {
  id: string; postId: string; authorId: string; parentCommentId: string | null;
  contentMarkdown: string; status: DiscussionCommentStatus; createdAt: string; updatedAt: string;
  deletedAt: string | null; author?: DiscussionAuthor;
};
