export type JudgeServiceConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  redisPrefix: string;
  serviceToken: string;
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
  const token = env.JUDGE_SERVICE_TOKEN;
  if (!token || token.length < 16)
    throw new Error('JUDGE_SERVICE_TOKEN must be at least 16 characters');
  return {
    host: env.JUDGE_SERVICE_HOST ?? '127.0.0.1',
    port,
    databaseUrl: validUrl(
      'JUDGE_DATABASE_URL',
      required(env, 'JUDGE_DATABASE_URL'),
    ),
    redisUrl: validUrl(
      'JUDGE_REDIS_URL',
      env.JUDGE_REDIS_URL ?? 'redis://127.0.0.1:56379',
    ),
    redisPrefix: env.JUDGE_REDIS_PREFIX ?? 'oj:judge-service',
    serviceToken: token,
  };
}

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
