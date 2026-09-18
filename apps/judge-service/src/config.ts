import { readFileSync } from 'node:fs';

export type JudgeServiceConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  redisPrefix: string;
  serviceToken: string;
  nodeToken: string;
  nodeUnhealthyTimeoutMs: number;
};

const validUrl = (name: string, value: string) => {
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
};

export function loadJudgeServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): JudgeServiceConfig {
  const port = Number(env.JUDGE_SERVICE_PORT ?? '3100');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(
      'JUDGE_SERVICE_PORT must be an integer between 1 and 65535',
    );
  const token = secret(env, 'JUDGE_SERVICE_TOKEN');
  if (!token || token.length < 16)
    throw new Error('JUDGE_SERVICE_TOKEN must be at least 16 characters');
  const nodeToken = secret(env, 'JUDGE_NODE_TOKEN');
  if (!nodeToken || nodeToken.length < 16)
    throw new Error('JUDGE_NODE_TOKEN must be at least 16 characters');
  if (nodeToken === token)
    throw new Error('JUDGE_NODE_TOKEN must differ from JUDGE_SERVICE_TOKEN');
  const nodeUnhealthyTimeoutMs = Number(
    env.JUDGE_NODE_UNHEALTHY_TIMEOUT_MS ?? '15000',
  );
  if (
    !Number.isInteger(nodeUnhealthyTimeoutMs) ||
    nodeUnhealthyTimeoutMs < 1000 ||
    nodeUnhealthyTimeoutMs > 300000
  )
    throw new Error('JUDGE_NODE_UNHEALTHY_TIMEOUT_MS must be 1000..300000');
  return {
    host: env.JUDGE_SERVICE_HOST ?? '127.0.0.1',
    port,
    databaseUrl: validUrl(
      'JUDGE_DATABASE_URL',
      requiredSecret(env, 'JUDGE_DATABASE_URL'),
    ),
    redisUrl: validUrl(
      'JUDGE_REDIS_URL',
      secret(env, 'JUDGE_REDIS_URL') ?? 'redis://127.0.0.1:56379',
    ),
    redisPrefix: env.JUDGE_REDIS_PREFIX ?? 'oj:judge-service',
    serviceToken: token,
    nodeToken,
    nodeUnhealthyTimeoutMs,
  };
}

function secret(env: NodeJS.ProcessEnv, name: string) {
  const file = env[`${name}_FILE`];
  const direct = env[name];
  if (file && direct)
    throw new Error(`${name} and ${name}_FILE must not both be set`);
  if (file) return readFileSync(file, 'utf8').trimEnd();
  return direct;
}

function requiredSecret(env: NodeJS.ProcessEnv, name: string) {
  const value = secret(env, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}
