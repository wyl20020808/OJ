export type RuntimeConfig = {
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  s3Endpoint: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Bucket: string;
};

const url = (name: string, value: string): string => {
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535');
  return {
    port,
    host: env.HOST ?? '127.0.0.1',
    databaseUrl: url(
      'DATABASE_URL',
      env.DATABASE_URL ??
        'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform',
    ),
    redisUrl: url('REDIS_URL', env.REDIS_URL ?? 'redis://127.0.0.1:56379'),
    s3Endpoint: url('S3_ENDPOINT', env.S3_ENDPOINT ?? 'http://127.0.0.1:59000'),
    s3Region: env.S3_REGION ?? 'us-east-1',
    s3AccessKey: env.S3_ACCESS_KEY ?? 'ojplatform',
    s3SecretKey: env.S3_SECRET_KEY ?? 'ojplatform_dev_secret',
    s3Bucket: env.S3_BUCKET ?? 'ojplatform-dev',
  };
}
