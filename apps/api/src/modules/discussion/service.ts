import type {
  DiscussionBlogOverviewData,
  DiscussionRepository,
} from './repository.js';

export class DiscussionBlogService {
  constructor(private readonly repository: DiscussionRepository) {}

  async getOverview(): Promise<DiscussionBlogOverviewData> {
    return this.repository.getBlogOverview();
  }
}
