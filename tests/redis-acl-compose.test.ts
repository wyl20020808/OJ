import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compose = readFileSync('compose.yaml', 'utf8');
const development = readFileSync('compose.dev.yaml', 'utf8');
const production = readFileSync('compose.prod.yaml', 'utf8');
const bootstrap = readFileSync('deploy/docker/bootstrap-redis-acl.sh', 'utf8');

const serviceBlock = (source: string, name: string) => {
  const match = source.match(
    new RegExp(
      `^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|^networks:|^volumes:|\\Z)`,
      'm',
    ),
  );
  return match?.[0] ?? '';
};

describe('Redis ACL Compose contract', () => {
  it('pins Redis 7.4.1 and gates startup on idempotent ACL bootstrap', () => {
    expect(serviceBlock(compose, 'redis-acl-bootstrap')).toContain(
      'image: redis:7.4.1-alpine',
    );
    const redis = serviceBlock(compose, 'redis');
    expect(redis).toContain('image: redis:7.4.1-alpine');
    expect(redis).toContain("'--aclfile'");
    expect(redis).toContain('condition: service_completed_successfully');
    expect(redis).toContain('REDISCLI_AUTH="$$REDIS_HEALTH_PASSWORD"');
  });

  it('disables default and grants separate least-privilege runtime users', () => {
    expect(bootstrap).toContain(
      'user default off resetkeys resetchannels -@all',
    );
    expect(bootstrap).toContain(
      'user $REDIS_ADMIN_USERNAME on #$admin_hash ~* &* +@all',
    );
    expect(bootstrap).toMatch(
      /user \$REDIS_JUDGE_USERNAME .*~\$JUDGE_REDIS_PREFIX:\*.*-@all.*\+ping.*\+publish/,
    );
    expect(bootstrap).toMatch(
      /user \$REDIS_WORKER_USERNAME .*~\$JUDGE_REDIS_PREFIX:workers:\*.*-@all \+ping \+set/,
    );
    expect(bootstrap).not.toMatch(
      /user \$REDIS_(?:PRODUCT|JUDGE|WORKER|HEALTH)_USERNAME[^\n]*\+@all/,
    );
    expect(bootstrap).not.toMatch(
      /user \$REDIS_(?:PRODUCT|JUDGE|WORKER|HEALTH)_USERNAME[^\n]*~\*/,
    );
  });

  it('uses distinct Product and Judge URLs without giving admin or Worker credentials to containers', () => {
    const api = serviceBlock(compose, 'api');
    const judge = serviceBlock(compose, 'judge-service');
    expect(api).toContain(
      'REDIS_URL: redis://${REDIS_PRODUCT_USERNAME:-oj-product}:${REDIS_PRODUCT_PASSWORD:-dev-only-redis-product}@redis:6379/0',
    );
    expect(judge).toContain(
      'JUDGE_REDIS_URL: redis://${REDIS_JUDGE_USERNAME:-oj-judge-service}:${REDIS_JUDGE_PASSWORD:-dev-only-redis-judge}@redis:6379/0',
    );
    for (const block of [api, judge]) {
      expect(block).not.toContain('REDIS_ADMIN_PASSWORD');
      expect(block).not.toContain('REDIS_WORKER_PASSWORD');
    }
  });

  it('keeps development Redis loopback-only and production Redis unpublished', () => {
    const devRedis = serviceBlock(development, 'redis');
    const prodRedis = serviceBlock(production, 'redis');
    expect(devRedis).toContain(
      "'127.0.0.1:${OJPLATFORM_REDIS_PORT:-56379}:6379'",
    );
    expect(devRedis).toContain('networks: [infrastructure, judge-host]');
    expect(prodRedis).not.toContain('ports:');
    expect(serviceBlock(production, 'web')).toContain('ports:');
  });

  it('requires externally supplied production credentials', () => {
    for (const variable of [
      'REDIS_ADMIN_PASSWORD',
      'REDIS_PRODUCT_PASSWORD',
      'REDIS_JUDGE_PASSWORD',
      'REDIS_WORKER_PASSWORD',
      'REDIS_HEALTH_PASSWORD',
    ]) {
      expect(production).toContain(`\${${variable}:?${variable}`);
    }
  });
});
