import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  registerCodeRunRoutes,
  judgeInputForCodeRun,
  translateCodeRunStatus,
} from '../apps/api/src/modules/code-run/routes.js';
import { validateCodeRun } from '../apps/api/src/modules/code-run/validation.js';

describe('ad-hoc code run API', () => {
  it('validates cpp20 and bounded input', () => {
    expect(
      validateCodeRun({
        language: 'cpp20',
        source: 'int main(){}',
        stdin: '1 2',
      }),
    ).toEqual({ language: 'cpp20', source: 'int main(){}', stdin: '1 2' });
    expect(() =>
      validateCodeRun({ language: 'python', source: 'x', stdin: '' }),
    ).toThrow();
    expect(() =>
      validateCodeRun({ language: 'cpp20', source: ' ', stdin: '' }),
    ).toThrow();
    expect(() =>
      validateCodeRun({
        language: 'cpp20',
        source: 'x',
        stdin: 'x'.repeat(64 * 1024 + 1),
      }),
    ).toThrow();
  });

  it('creates and polls a run without submission routes', async () => {
    const app = Fastify({ logger: false });
    let submitted: Record<string, unknown> | undefined;
    await registerCodeRunRoutes(app, {
      getAuthContext: async () => ({
        userId: 'u1',
        sessionId: 's1',
        strength: 'guest',
      }),
      submit: async (input) => {
        submitted = input;
        return {
          judgeJobId: '11111111-1111-4111-8111-111111111111',
          status: 'QUEUED',
        };
      },
      get: async () => ({
        judgeJobId: '11111111-1111-4111-8111-111111111111',
        status: 'RUNNING',
      }),
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/code-runs',
      headers: { cookie: 'oj_csrf=t', 'x-csrf-token': 't' },
      payload: { language: 'cpp20', source: 'int main(){}', stdin: '1 2' },
    });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toEqual({
      runId: '11111111-1111-4111-8111-111111111111',
      status: 'QUEUED',
    });
    expect(submitted).toMatchObject({
      problemId: '__adhoc_code_run__',
      testcaseInput: '1 2',
      languageId: 'cpp20',
    });
    const polled = await app.inject({
      method: 'GET',
      url: '/api/code-runs/11111111-1111-4111-8111-111111111111',
    });
    expect(polled.statusCode).toBe(200);
    expect(polled.json()).toEqual({
      runId: '11111111-1111-4111-8111-111111111111',
      status: 'RUNNING',
    });
    expect(
      (await app.inject({ method: 'GET', url: '/api/submissions' })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('uses explicit ad-hoc linkage and no hidden testcase manifest', () => {
    const input = judgeInputForCodeRun('int main(){}', '1 2', 'request-1');
    expect(input).toMatchObject({
      problemId: '__adhoc_code_run__',
      testdataVersionRef: 'adhoc-v1',
      testcaseInput: '1 2',
    });
    expect(input).not.toHaveProperty('testcaseSet');
  });

  it('translates Judge terminal statuses', () => {
    expect(translateCodeRunStatus('QUEUED')).toBe('QUEUED');
    expect(translateCodeRunStatus('RUNNING')).toBe('RUNNING');
    expect(translateCodeRunStatus('CANCELLED')).toBe('CANCELLED');
    expect(translateCodeRunStatus('INFRA_FAILED')).toBe('INFRA_ERROR');
  });
});
