import { describe, expect, it } from 'vitest';
import { ApiError } from '../apps/web/src/services/api.js';
import { ProductSubmissionAdapter } from '../apps/web/src/services/submission-adapter.js';

describe('ProductSubmissionAdapter', () => {
  it('reuses Product submission service and preserves business errors', async () => {
    const adapter = new ProductSubmissionAdapter({
      createSubmission: async () => {
        throw new ApiError(
          {
            code: 'JUDGE_DATA_UNAVAILABLE',
            message: 'No published Judge Data version is available',
            requestId: 'request-1',
          },
          409,
        );
      },
    });
    await expect(
      adapter.submit({
        problemId: 'p1',
        problemRevisionId: 'r1',
        languageId: 'cpp20',
        source: 'int main() {}',
      }),
    ).rejects.toMatchObject({
      code: 'JUDGE_DATA_UNAVAILABLE',
      status: 409,
      message: 'No published Judge Data version is available',
    });
  });

  it('returns formal submission identity from Product service', async () => {
    const adapter = new ProductSubmissionAdapter({
      createSubmission: async () =>
        ({ id: 'submission-1', status: 'PENDING' }) as never,
    });
    await expect(
      adapter.submit({
        problemId: 'p1',
        problemRevisionId: 'r1',
        languageId: 'cpp20',
        source: 'int main() {}',
      }),
    ).resolves.toEqual({ id: 'submission-1', status: 'PENDING' });
  });
});
