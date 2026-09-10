// Launch the compiled backend as a child process for load testing, pinned to a
// single CPU to approximate a 1 vCPU VPS (Windows: ProcessorAffinity; Linux:
// taskset if available). Keeps running until killed; writes pid + log under
// loadtest/results/.
//
//   node loadtest/start-api.mjs --db "postgresql://alistore:alistore@127.0.0.1:5544/alistore?schema=public"
//   node loadtest/start-api.mjs --env loadtest/emulation/backend.env --affinity 1 --cpus 1
//
// --affinity <mask>  CPU affinity bitmask (default 1 => CPU0 only). --affinity 0 disables pinning.

import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BACKEND = resolve(ROOT, 'backend');

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }

const envFile = resolve(ROOT, arg('env', 'loadtest/emulation/backend.env'));
const dbUrl = arg('db', process.env.DATABASE_URL || 'postgresql://alistore:alistore@127.0.0.1:5544/alistore?schema=public');
const affinity = arg('affinity', '1');

// parse the dotenv-style file (KEY=VALUE, # comments, no interpolation)
const fileEnv = {};
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  fileEnv[m[1]] = v;
}
fileEnv.DATABASE_URL = dbUrl; // native cluster overrides the compose hostname

mkdirSync(resolve(ROOT, 'loadtest/results'), { recursive: true });
const logPath = resolve(ROOT, 'loadtest/results/api.log');
const pidPath = resolve(ROOT, 'loadtest/results/api.pid');
const log = createWriteStream(logPath, { flags: 'w' });

const child = spawn(process.execPath, ['dist/src/server.js'], {
  cwd: BACKEND,
  env: { ...process.env, ...fileEnv },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(log);
child.stderr.pipe(log);
writeFileSync(pidPath, String(child.pid));
console.log(`[start-api] pid ${child.pid}  env ${envFile}  db ${dbUrl.replace(/:[^:@/]+@/, ':***@')}`);
console.log(`[start-api] log -> ${logPath}`);

// pin to one core
if (affinity !== '0') {
  try {
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -Command "(Get-Process -Id ${child.pid}).ProcessorAffinity = ${Number(affinity)}"`, { stdio: 'ignore' });
      console.log(`[start-api] ProcessorAffinity = ${affinity} (CPU pinning active)`);
    } else {
      execSync(`taskset -p ${affinity.toString?.(16) || affinity} ${child.pid}`, { stdio: 'ignore' });
      console.log(`[start-api] taskset mask ${affinity}`);
    }
  } catch (e) {
    console.warn(`[start-api] could not set CPU affinity: ${e.message}`);
  }
}

const stop = () => { try { child.kill('SIGTERM'); } catch {} };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, sig) => { console.log(`[start-api] backend exited code=${code} sig=${sig}`); process.exit(code ?? 0); });
