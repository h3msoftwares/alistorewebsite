import { buildApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';

const app = buildApp();

const server = app.listen(env.PORT, () => {
  console.log(`[server] Ali's Store API listening on :${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  console.log(`[server] received ${signal}, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
