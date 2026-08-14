// Shared spike helper: pull connection details from `supabase status`.
// THROWAWAY — deleted with the rest of the Step 2 spike (ADR-0002).
import { execFileSync } from 'node:child_process';

export function supabaseEnv() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const out = execFileSync(npx, ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: process.platform === 'win32', // npx.cmd requires a shell on Windows
  });
  const env = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export function report(claim, name, pass, detail = '') {
  const status = pass === null ? 'INFO' : pass ? 'PASS' : 'FAIL';
  console.log(`[claim ${claim}] ${status} — ${name}${detail ? ` :: ${detail}` : ''}`);
  if (pass === false) process.exitCode = 1;
}
