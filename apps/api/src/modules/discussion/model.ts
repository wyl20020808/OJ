export type DiscussionPostType = 'ARTICLE' | 'ANNOUNCEMENT';
export type DiscussionPostKind = 'DISCUSSION' | 'SOLUTION' | 'ANNOUNCEMENT';
export type DiscussionPostStatus = 'DRAFT' | 'PUBLISHED' | 'DELETED';
export type DiscussionCommentStatus = 'VISIBLE' | 'DELETED';
export type DiscussionDataOrigin = 'USER' | 'DEVELOPMENT_FIXTURE';
export type DiscussionViewerCapabilities = {
  canEdit: boolean;
  canDelete: boolean;
  canModerate: boolean;
};

export type DiscussionAuthor = {
  username: string;
  displayName: string;
  avatarUrl?: string;
};
export type DiscussionCategory = {
  slug: string;
  name: string;
  description: string;
  postCount: number;
  dataOrigin: 'SYSTEM' | 'DEVELOPMENT_FIXTURE';
};
export type DiscussionTag = {
  slug: string;
  name: string;
  postCount: number;
  dataOrigin: 'SYSTEM' | 'DEVELOPMENT_FIXTURE';
};
export type DiscussionPost = {
  id: string;
  publicId: string;
  authorId: string;
  type: DiscussionPostType;
  kind: DiscussionPostKind;
  status: DiscussionPostStatus;
  title: string;
  summary: string | null;
  contentMarkdown: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  category: DiscussionCategory | null;
  tags: DiscussionTag[];
  coverImageUrl: string | null;
  isFeatured: boolean;
  isPinned: boolean;
  dataOrigin: DiscussionDataOrigin;
  viewerLiked?: boolean;
  author?: DiscussionAuthor;
  capabilities?: DiscussionViewerCapabilities;
};
export type DiscussionComment = {
  id: string;
  postId: string;
  authorId: string;
  parentCommentId: string | null;
  contentMarkdown: string;
  status: DiscussionCommentStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dataOrigin?: DiscussionDataOrigin;
  likeCount?: number;
  viewerLiked?: boolean;
  author?: DiscussionAuthor;
  capabilities?: DiscussionViewerCapabilities;
};

export type DiscussionBlogOverview = {
  featured: DiscussionPost | null;
  hotPosts: DiscussionPost[];
  recommendedPosts: DiscussionPost[];
  categories: DiscussionCategory[];
  tags: DiscussionTag[];
  authors: Array<{
    author: DiscussionAuthor;
    postCount: number;
  }>;
  stats: {
    todayPosts: number;
    weekPosts: number;
    totalAuthors: number;
    totalPosts: number;
  };
  recentComments: Array<
    DiscussionComment & {
      post: { publicId: string; title: string };
    }
  >;
};
