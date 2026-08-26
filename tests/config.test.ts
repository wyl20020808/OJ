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
  });
});
