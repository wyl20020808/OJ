import { describe, expect, it } from 'vitest';
import { loadConfig } from '../apps/api/src/config.js';

describe('runtime configuration', () => {
  it('rejects malformed infrastructure URLs', () => {
    expect(() => loadConfig({ DATABASE_URL: 'not a url' })).toThrow(
      'DATABASE_URL',
    );
    expect(() => loadConfig({ REDIS_URL: 'not a url' })).toThrow('REDIS_URL');
    expect(() => loadConfig({ S3_ENDPOINT: 'not a url' })).toThrow(
      'S3_ENDPOINT',
    );
  });

  it('uses documented local-only defaults', () => {
    const config = loadConfig({});
    expect(config.databaseUrl).toContain('127.0.0.1');
    expect(config.s3SecretKey).toBeDefined();
    expect(config.corsOrigins).toEqual([]);
  });

  it('accepts only explicit CORS origins', () => {
    expect(
      loadConfig({
        OJPLATFORM_CORS_ORIGINS:
          'http://127.0.0.1:5173, https://web.example.test',
      }).corsOrigins,
    ).toEqual(['http://127.0.0.1:5173', 'https://web.example.test']);
    expect(() => loadConfig({ OJPLATFORM_CORS_ORIGINS: '*' })).toThrow(
      'OJPLATFORM_CORS_ORIGINS',
    );
    expect(() =>
      loadConfig({ OJPLATFORM_CORS_ORIGINS: 'https://web.example.test/path' }),
    ).toThrow('must be origins');
  });
});
