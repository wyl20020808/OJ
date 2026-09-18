import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const required = {
  POSTGRES_PASSWORD: 'qualification-postgres-password',
  PRODUCT_RUNTIME_DB_PASSWORD: 'qualification-product-runtime-password',
  REDIS_ADMIN_USERNAME: 'qualification-admin',
  REDIS_ADMIN_PASSWORD: 'qualification-redis-admin-password',
  REDIS_PRODUCT_USERNAME: 'qualification-product',
  REDIS_PRODUCT_PASSWORD: 'qualification-redis-product-password',
  REDIS_JUDGE_USERNAME: 'qualification-judge',
  REDIS_JUDGE_PASSWORD: 'qualification-redis-judge-password',
  REDIS_WORKER_USERNAME: 'qualification-worker',
  REDIS_WORKER_PASSWORD: 'qualification-redis-worker-password',
  REDIS_HEALTH_USERNAME: 'qualification-health',
  REDIS_HEALTH_PASSWORD: 'qualification-redis-health-password',
  MINIO_ROOT_USER: 'qualification-minio',
  MINIO_ROOT_PASSWORD: 'qualification-minio-root-password',
  PRODUCT_MIGRATION_DATABASE_URL:
    'postgres://qualification_admin:qualification-postgres-password@postgres:5432/ojplatform',
  PRODUCT_RUNTIME_DATABASE_URL:
    'postgres://ojplatform_runtime:qualification-product-runtime-password@postgres:5432/ojplatform',
  S3_ACCESS_KEY: 'qualification-s3-access',
  S3_SECRET_KEY: 'qualification-s3-secret-password',
  S3_BUCKET: 'qualification-bucket',
  JUDGE_DATABASE_ADMIN_URL:
    'postgres://qualification_admin:qualification-postgres-password@postgres:5432/postgres',
  JUDGE_DATABASE_PASSWORD: 'qualification-judge-runtime-password',
  JUDGE_MIGRATION_DATABASE_URL:
    'postgres://qualification_admin:qualification-postgres-password@postgres:5432/ojplatform_judge',
  JUDGE_RUNTIME_DATABASE_URL:
    'postgres://ojplatform_judge_runtime:qualification-judge-runtime-password@postgres:5432/ojplatform_judge',
  JUDGE_SERVICE_TOKEN: 'qualification-service-token-1234',
  JUDGE_NODE_TOKEN: 'qualification-node-token-567890',
  OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT: '.',
};

const composeArguments = [
  'compose',
  '-f',
  'compose.yaml',
  '-f',
  'compose.prod.yaml',
  '--profile',
  'judge',
  'config',
  '--format',
  'json',
];

const render = (environment) => {
  if (process.platform !== 'win32')
    return spawnSync('docker', composeArguments, {
      cwd: process.cwd(),
      env: environment,
      encoding: 'utf8',
    });
  const windowsPath = resolve(process.cwd()).replaceAll('\\', '/');
  const match = /^([A-Za-z]):\/(.*)$/.exec(windowsPath);
  if (!match) throw new Error('cannot map repository path into WSL');
  const linuxPath = `/mnt/${match[1].toLowerCase()}/${match[2]}`;
  const inherited = new Set(
    (environment.WSLENV ?? '').split(':').filter(Boolean),
  );
  for (const name of Object.keys(required)) inherited.add(name);
  const wslEnvironment = { ...environment, WSLENV: [...inherited].join(':') };
  const command = `cd '${linuxPath.replaceAll("'", "'\\''")}' && docker ${composeArguments.join(' ')}`;
  return spawnSync(
    'wsl.exe',
    [
      '-d',
      environment.OJPLATFORM_WSL_DISTRO ?? 'Ubuntu-24.04',
      '--',
      'bash',
      '-lc',
      command,
    ],
    { env: wslEnvironment, encoding: 'utf8' },
  );
};

const environment = { ...process.env, ...required };
const rendered = render(environment);
if (rendered.status !== 0) {
  let diagnostic = rendered.stderr || 'unknown Compose error';
  for (const value of Object.values(required))
    if (value.length >= 8)
      diagnostic = diagnostic.replaceAll(value, '<redacted>');
  throw new Error(`production Compose render failed: ${diagnostic.trim()}`);
}
const config = JSON.parse(rendered.stdout);
const services = config.services ?? {};
const fail = (condition, message) => {
  if (!condition) throw new Error(message);
};
const ports = (name) => services[name]?.ports ?? [];
const env = (name) => services[name]?.environment ?? {};

fail(ports('web').length === 1, 'Web must be the only public ingress');
fail(
  ports('judge-service').length === 1 &&
    ports('judge-service')[0].host_ip === '127.0.0.1',
  'Judge Service must publish loopback only',
);
for (const name of ['api', 'postgres', 'redis', 'minio'])
  fail(ports(name).length === 0, `${name} must remain private`);
fail(
  config.networks?.infrastructure?.internal === true,
  'infrastructure network must be internal',
);

const judge = services['judge-service'];
fail(judge?.read_only === true, 'Judge Service rootfs must be read-only');
fail(judge?.privileged !== true, 'Judge Service must not be privileged');
fail(
  (judge?.cap_drop ?? []).includes('ALL'),
  'Judge Service must drop all capabilities',
);
fail(
  (judge?.security_opt ?? []).includes('no-new-privileges:true'),
  'Judge Service must set no-new-privileges',
);
fail(
  judge?.network_mode !== 'host' && judge?.pid !== 'host',
  'host namespace forbidden',
);
fail(
  !(judge?.volumes ?? []).some((volume) =>
    JSON.stringify(volume).includes('docker.sock'),
  ),
  'Docker socket mount forbidden',
);
for (const name of [
  'DATABASE_URL',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'MINIO_ROOT_PASSWORD',
])
  fail(
    !(name in env('judge-service')),
    `Judge Service received forbidden ${name}`,
  );
for (const name of ['JUDGE_DATABASE_URL', 'JUDGE_DATABASE_ADMIN_URL'])
  fail(!(name in env('api')), `Product API received forbidden ${name}`);

for (const name of [
  'postgres',
  'redis',
  'minio',
  'api',
  'web',
  'judge-service',
])
  fail(
    services[name]?.logging?.options?.['max-size'] === '10m',
    `${name} log rotation missing`,
  );

const missingEnvironment = { ...environment };
delete missingEnvironment.JUDGE_NODE_TOKEN;
const missing = render(missingEnvironment);
fail(missing.status !== 0, 'missing production secret did not fail closed');

console.log('PRODUCTION_JUDGE_CONFIG_QUALIFICATION=PASS');
