import type { ApiClient } from './api.js';

export type ProductSubmissionRequest = {
  problemId: string;
  problemRevisionId: string;
  languageId: 'cpp20';
  source: string;
};

export type ProductSubmissionResponse = {
  id: string;
  status?: string;
};

/** Adapter used by the hosted plugin; keeps Product API error semantics intact. */
export class ProductSubmissionAdapter {
  constructor(private readonly api: Pick<ApiClient, 'createSubmission'>) {}

  async submit(
    request: ProductSubmissionRequest,
  ): Promise<ProductSubmissionResponse> {
    const submission = await this.api.createSubmission(request);
    return { id: submission.id, status: submission.status };
  }
}
