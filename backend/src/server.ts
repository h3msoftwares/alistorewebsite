import type { Server } from 'http';
import { buildApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';

const app = buildApp();

const server: Server = app.listen(env.PORT, env.HOST, () => {
  console.log(`[server] Ali's Store API listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
});

// Behind a reverse proxy (Nginx / Railway / Fly) the proxy keeps upstream
// sockets alive. If Node's keepAliveTimeout (default 5s) is shorter than the
// proxy's idle timeout, the proxy can reuse a socket Node just closed → the
// well-known sporadic 502. Set Node's above a typical 60s proxy idle, and
// headersTimeout above keepAliveTimeout. requestTimeout caps a slow client
// that opens a request and dribbles the body.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 30_000;

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}, shutting down`);

  // Stop accepting new connections; let in-flight requests finish, then close
  // the DB pool and exit cleanly.
  server.close(() => {
    prisma
      .$disconnect()
      .catch((err) => console.error('[server] prisma disconnect failed', err))
      .finally(() => process.exit(0));
  });

  // Don't hang forever if a request is stuck — matches systemd TimeoutStopSec.
  setTimeout(() => {
    console.error('[server] drain timed out after 20s, forcing exit');
    process.exit(1);
  }, 20_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// A promise rejection with no handler would otherwise crash the process on
// newer Node with no diagnostics. Log it; let the ops layer decide on a
// restart via health checks.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection', reason);
});

// An uncaught exception leaves the process in an undefined state — log it and
// shut down cleanly so the process manager restarts a fresh one.
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException', err);
  shutdown('uncaughtException');
});
