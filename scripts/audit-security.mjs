#!/usr/bin/env node
// Runs the dependency and static-configuration security audit:
//
//   1. `npm audit` against production dependencies only (dev tooling
//      vulnerabilities never ship in the packaged app and are tracked
//      separately).
//   2. An Electronegativity scan of the main and preload source trees,
//      catching Electron misconfigurations such as disabled sandboxing
//      or context isolation.
import { spawnSync } from 'node:child_process';

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return result.status ?? 1;
}

const npmAuditStatus = run('npm', ['audit', '--omit=dev', '--audit-level=high']);
const electronegativityStatus = run('npx', [
  'electronegativity',
  '-i',
  'src',
  '-s',
  'high',
]);

const exitCode = npmAuditStatus === 0 && electronegativityStatus === 0 ? 0 : 1;
process.exit(exitCode);
