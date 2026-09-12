// One-time local script: mints GOOGLE_DRIVE_REFRESH_TOKEN for the backup
// tool's Desktop-app OAuth client, and writes it straight into backend/.env
// (never printed to the terminal — a refresh token is a long-lived
// credential and this is the only place in the whole flow that ever sees
// its value).
//
// Two-step because only a human can grant Google consent in a browser:
//
//   1. `npm run backup:token`
//      Prints a consent URL. Open it, sign in with the Google account that
//      owns the Drive backup folder, and approve. Google redirects to
//      http://localhost/?code=...&scope=... — the browser will show a
//      connection error (nothing is listening on localhost), that's
//      expected. Copy the FULL URL from the address bar.
//
//   2. `npm run backup:token -- "<the pasted URL, or just the code=... value>"`
//      Exchanges the code for tokens and writes GOOGLE_DRIVE_REFRESH_TOKEN
//      into backend/.env.
//
// IMPORTANT (learned the hard way on a sibling project): the Cloud project's
// OAuth consent screen must be PUBLISHED ("In production"), not "Testing" —
// Testing-mode refresh tokens silently expire after 7 days, which would
// break scheduled backups without warning.

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = 'http://localhost';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

function extractCode(arg: string): string {
  const trimmed = arg.trim();
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code');
    if (code) return code;
  } catch {
    // not a URL — assume the raw code was pasted
  }
  return trimmed;
}

function upsertEnvVar(envPath: string, key: string, value: string): void {
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath, next, 'utf8');
}

async function main() {
  // Prefer an env var over argv: on Windows, npm's .cmd wrapper can mangle a
  // quoted argument containing `&` (the redirect URL has several) before it
  // ever reaches this process. An env var isn't subject to that re-parsing.
  const arg = process.env.OAUTH_REDIRECT_URL || process.argv[2];

  if (!env.GOOGLE_DRIVE_CLIENT_ID || !env.GOOGLE_DRIVE_CLIENT_SECRET) {
    console.error('GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET are not set in backend/.env.');
    process.exit(1);
  }

  if (!arg) {
    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', env.GOOGLE_DRIVE_CLIENT_ID);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPE);
    // Forces Google to issue a refresh token even if this account has
    // consented before (otherwise a repeat consent returns none).
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');

    console.log('Step 1 of 2 — open this URL, sign in, and approve access:\n');
    console.log(url.toString());
    console.log(
      '\nGoogle will redirect to http://localhost/?code=... — the page itself will fail to ' +
        'load (nothing is listening on localhost), that\'s expected. Copy the full URL from the ' +
        'address bar, then run (env var, not an argument — the URL\'s "&"s don\'t survive ' +
        "npm's Windows wrapper as a quoted arg):\n\n" +
        '  OAUTH_REDIRECT_URL="<pasted URL>" npx tsx scripts/generate-drive-refresh-token.ts\n'
    );
    return;
  }

  const code = extractCode(arg);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.refresh_token) {
    console.error(
      `Token exchange failed (HTTP ${res.status}): ${body.error ?? '?'} — ${body.error_description ?? '(no description)'}. ` +
        'The authorization code is single-use and expires within minutes — restart at step 1 for a fresh one.'
    );
    process.exit(1);
  }

  const envPath = path.join(__dirname, '..', '.env');
  upsertEnvVar(envPath, 'GOOGLE_DRIVE_REFRESH_TOKEN', body.refresh_token);

  console.log('Step 2 of 2 — done.');
  console.log('A refresh token was obtained and written to backend/.env (value not printed).');
  console.log(
    'Next: create the Drive backup folder, then set GOOGLE_DRIVE_BACKUP_FOLDER_ID in backend/.env.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
