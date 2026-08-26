import { buildApp } from './app.js';

const portValue = process.env.PORT ?? '3000';
const port = Number(portValue);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const app = await buildApp();
const close = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
};
process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

try {
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
