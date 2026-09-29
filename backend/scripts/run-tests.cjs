const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

// Windows can suspend a long suite between a hook starting and its timeout.
// Scope the power request to this run; do not change the machine's power plan.
const args = process.argv.slice(2);
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'powershell.exe' : process.execPath,
  windows
    ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(__dirname, 'run-tests-windows.ps1')]
    : [join(__dirname, '../node_modules/vitest/vitest.mjs'), ...args],
  {
    stdio: 'inherit',
    env: windows
      ? { ...process.env, ALISTORE_TEST_NODE: process.execPath, ALISTORE_TEST_ARGS: JSON.stringify(args) }
      : process.env,
  });
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
