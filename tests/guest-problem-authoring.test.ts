import { describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';

const problem = (slug: string) => ({
  slug,
  title: `Guest ${slug}`,
  statement: 'Print the expected result.',
  inputDescription: 'Input.',
  outputDescription: 'Output.',
  examples: [],
  constraints: 'Bounded.',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  visibility: 'private',
  status: 'draft',
  testdataVersion: 'guest-testdata-v1',
});

const cookies = (response: { headers: Record<string, unknown> }) => {
  const value = response.headers['set-cookie'];
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map(String).map((item) => item.split(';', 1)[0] ?? '');
};

const csrf = (values: string[]) =>
  values
    .find((value) => value.startsWith('oj_csrf='))
    ?.slice('oj_csrf='.length);

const headers = (values: string[]) => ({
  cookie: values.join('; '),
  'x-csrf-token': csrf(values) ?? '',
});

describe('guest problem authoring', () => {
  it('binds Guest judge-data authoring to the server-side guest principal', async () => {
    const app = await buildApp({ logger: false });
    try {
      const g1Start = await app.inject({
        method: 'POST',
        url: '/api/auth/guest/continue',
        payload: {},
      });
      expect(g1Start.statusCode).toBe(200);
      const g1 = cookies(g1Start);
      expect(csrf(g1)).toBeTruthy();

      const created = await app.inject({
        method: 'POST',
        url: '/api/problems',
        headers: headers(g1),
        payload: problem('guest-owner'),
      });
      expect(created.statusCode).toBe(201);
      const problemId = created.json().id as string;
      expect(created.json().authorId).toBe(g1Start.json().id);

      const config = {
        timeLimitMs: 1000,
        memoryLimitBytes: 256 * 1024 * 1024,
        outputLimitBytes: 64 * 1024,
        checker: 'EXACT_BYTES',
        allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
      };
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/api/problems/${problemId}/judge-data/draft/config`,
            headers: headers(g1),
            payload: config,
          })
        ).statusCode,
      ).toBe(200);
      const pair = await app.inject({
        method: 'POST',
        url: `/api/problems/${problemId}/judge-data/draft/upload`,
        headers: headers(g1),
        payload: {
          inputBase64: Buffer.from('1\n').toString('base64'),
          outputBase64: Buffer.from('1\n').toString('base64'),
          inputFileName: '01.in',
          outputFileName: '01.out',
        },
      });
      expect(pair.statusCode).toBe(200);
      const testcaseId = pair.json().testcases[0].testcaseId as string;
      const override = await app.inject({
        method: 'PATCH',
        url: `/api/problems/${problemId}/judge-data/draft/testcases/${testcaseId}`,
        headers: headers(g1),
        payload: {
          timeLimitMsOverride: 2000,
          memoryLimitBytesOverride: 128 * 1024 * 1024,
          outputLimitBytesOverride: 128 * 1024,
        },
      });
      expect(override.statusCode).toBe(200);
      expect(override.json().testcases[0]).toMatchObject({
        effectiveTimeLimitMs: 2000,
        effectiveMemoryLimitBytes: 128 * 1024 * 1024,
        effectiveOutputLimitBytes: 128 * 1024,
      });
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/problems/${problemId}/judge-data/draft/validate`,
            headers: headers(g1),
            payload: {},
          })
        ).json().status,
      ).toBe('VALIDATED');
      const v1 = await app.inject({
        method: 'POST',
        url: `/api/problems/${problemId}/judge-data/publish`,
        headers: headers(g1),
        payload: {},
      });
      expect(v1.statusCode).toBe(200);

      const g2Start = await app.inject({
        method: 'POST',
        url: '/api/auth/guest/continue',
        payload: {},
      });
      const g2 = cookies(g2Start);
      for (const request of [
        {
          method: 'PATCH',
          url: `/api/problems/${problemId}`,
          payload: { title: 'No' },
        },
        { method: 'GET', url: `/api/problems/${problemId}/judge-data/draft` },
        { method: 'GET', url: `/api/admin/judge/summary` },
      ] as const) {
        const response = await app.inject({ ...request, headers: headers(g2) });
        expect(response.statusCode).toBe(403);
        expect(response.body).not.toContain('judge-data/problems');
        expect(response.body).not.toContain('1\\n');
      }

      const register = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'nonowner',
          email: 'nonowner@example.test',
          displayName: 'Non Owner',
          password: 'correct-horse-battery-staple',
        },
      });
      expect(register.statusCode).toBe(201);
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          identity: 'nonowner',
          password: 'correct-horse-battery-staple',
        },
      });
      const nonOwner = cookies(login);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/problems/${problemId}`,
            headers: headers(nonOwner),
            payload: { title: 'No' },
          })
        ).statusCode,
      ).toBe(403);

      const v1Detail = await app.inject({
        method: 'GET',
        url: `/api/problems/${problemId}/judge-data/versions/${v1.json().versionId}`,
        headers: headers(g1),
      });
      expect(v1Detail.statusCode).toBe(200);
      expect(v1Detail.json().testcases[0].input).not.toHaveProperty('key');
      expect(v1Detail.json()).not.toHaveProperty('storageCredentials');
    } finally {
      await app.close();
    }
  });
});
