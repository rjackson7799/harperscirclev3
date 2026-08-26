/**
 * The destructive-command guard.
 *
 * `db:reset`, `test:db`, `test:e2e` and `test:concurrency` are GLOBAL: two
 * Claude sessions share ONE working tree and ONE Supabase stack, and any of
 * these silently destroys a peer's in-flight run with no error on either side.
 * In round 19 the only surviving record of a RED 38-leg gate had to be rescued
 * to a scratchpad seventy seconds before a peer run wiped `test-results/`.
 *
 * No scanner can catch that after the fact, because by then the evidence is
 * gone. This is the one rule that has to be enforced BEFORE the command runs.
 *
 * Usage:
 *   node scripts/preflight.mjs --for e2e|db|concurrency|any [--force "reason"]
 *
 * Exit codes are distinct on purpose — "a peer is running" and "your ports are
 * hot" call for different actions, and one generic code produces one generic
 * message, which is how a founder learns to skim past it.
 *
 *   0  SAFE
 *   1  internal error
 *   3  BLOCKED — a peer session holds the stack lease
 *   4  BLOCKED — environment wrong (ports hot, stack down, stale fixture server)
 *   5  BLOCKED — HEAD moved, or peer-dirty files. Re-run to acknowledge.
 *
 * PROCESS TOOLS: always execFileSync, never through a shell. `tasklist /FI`
 * fails under Git Bash because MSYS rewrites `/FI` into a path, and PowerShell
 * `Get-CimInstance` costs ~1.6s — eight times a whole node start.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';

const STATE_DIR = '.gate';
const HEAD_FILE = `${STATE_DIR}/last-head`;
const LOCK_FILE = `${STATE_DIR}/stack.lock`;

const args = process.argv.slice(2);
const leg = args[args.indexOf('--for') + 1] ?? 'any';
const forceIdx = args.indexOf('--force');

// The override is a REASON, never a bare flag. A bare flag gets typed
// reflexively within a week; a reason has to be composed, and it is echoed
// into the run record. HC_PREFLIGHT_FORCE exists because npm `pre` scripts
// cannot forward argv — `HC_PREFLIGHT_FORCE="why" npm run test:e2e`.
const envReason = process.env.HC_PREFLIGHT_FORCE ?? '';
const force = forceIdx !== -1 || envReason !== '';
const forceReason = envReason || (forceIdx !== -1 ? (args[forceIdx + 1] ?? '') : '');

const findings = [];
const add = (level, check, detail) => findings.push({ level, check, detail });

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

/** 42ms for six ports. Free — use it rather than hunting processes. */
const portOpen = (port) =>
  new Promise((resolve) => {
    const sock = connect({ host: '127.0.0.1', port });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(400);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });

async function main() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

  const head = git('rev-parse', 'HEAD');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');

  // --- 1. the stack lease -------------------------------------------------
  // A lease read is 0ms and exact. Process scanning is ~282ms and ambiguous.
  if (existsSync(LOCK_FILE)) {
    let lock = null;
    try {
      lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
    } catch {
      /* a corrupt lease is a stale lease */
    }
    let live = false;
    if (lock?.pid && lock.pid !== process.pid) {
      try {
        process.kill(lock.pid, 0);
        live = true;
      } catch {
        live = false;
      }
    }
    if (live) {
      add('BLOCK:3', 'lease', `pid ${lock.pid} holds the stack for "${lock.leg}" since ${lock.startedAt}`);
    } else {
      add('OK', 'lease', 'a stale lease was present and is ignored');
    }
  } else {
    add('OK', 'lease', 'no stack lease held');
  }

  // --- 2. HEAD movement, self-disarming -----------------------------------
  // Denies exactly once per NEW head value, then records the acknowledgement.
  // A check that fires on every peer commit for six hours is a check you learn
  // to ignore; this one forces exactly one look.
  const lastHead = existsSync(HEAD_FILE) ? readFileSync(HEAD_FILE, 'utf8').trim() : null;
  if (lastHead && lastHead !== head) {
    let log = '';
    try {
      log = git('log', '--oneline', `${lastHead}..${head}`);
    } catch {
      log = '(cannot range-log; the old head may be gone)';
    }
    add('BLOCK:5', 'head', `MOVED ${lastHead.slice(0, 7)} -> ${head.slice(0, 7)}\n${log}`);
  } else {
    add('OK', 'head', `${head.slice(0, 7)} on ${branch}`);
  }
  writeFileSync(HEAD_FILE, head);

  // --- 3. peer-dirty tree -------------------------------------------------
  const dirty = git('status', '--porcelain')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3));
  if (dirty.length) {
    add('WARN', 'tree', `${dirty.length} modified/untracked — stage EXPLICIT paths, never \`git add -A\``);
  } else {
    add('OK', 'tree', 'clean');
  }

  // --- 4. ports -----------------------------------------------------------
  const [p3000, p8787, p54341, p54342, p54344, p3310] = await Promise.all(
    [3000, 8787, 54341, 54342, 54344, 3310].map(portOpen),
  );

  if (leg === 'e2e') {
    // playwright.config.ts sets reuseExistingServer:false on BOTH webServers,
    // so an occupied port fails the gate at startup. Catch it here instead.
    const hot = [p3000 && '3000 (dev server)', p8787 && '8787 (fixture server)'].filter(Boolean);
    if (hot.length) {
      add('BLOCK:4', 'ports', `${hot.join(' · ')} OPEN — reuseExistingServer:false needs them FREE`);
    } else {
      add('OK', 'ports', '3000 and 8787 free');
    }
    add(p3310 ? 'OK' : 'WARN', 'clamd', p3310 ? '3310 open' : '3310 closed — `docker start hc_clamd`');
  }

  if (leg === 'db' || leg === 'concurrency' || leg === 'e2e') {
    const down = [!p54341 && '54341', !p54342 && '54342', !p54344 && '54344'].filter(Boolean);
    if (down.length) {
      add('BLOCK:4', 'stack', `${down.join(' · ')} CLOSED — stack ports are 5434x, not 5432x`);
    } else {
      add('OK', 'stack', '54341/54342/54344 open');
    }
  }

  // --- 5. stale fixture server -------------------------------------------
  // An open 8787 that ANSWERS is a live orphan, not a coincidence.
  if (p8787) {
    add('WARN', 'fixture', '8787 is answering — identify it by start time before killing it');
  }

  // --- report -------------------------------------------------------------
  const stamp = new Date().toISOString();
  console.log(`PREFLIGHT  ${branch} @ ${head.slice(0, 7)}  for=${leg}  ${stamp}`);
  for (const f of findings) {
    const tag = f.level.startsWith('BLOCK') ? 'BLOCK' : f.level;
    console.log(`  ${tag.padEnd(6)} ${f.check.padEnd(8)} ${f.detail.replace(/\n/g, '\n' + ' '.repeat(18))}`);
  }

  const blocks = findings.filter((f) => f.level.startsWith('BLOCK'));
  if (!blocks.length) {
    console.log('\nVERDICT: SAFE');
    return 0;
  }

  const code = Math.max(...blocks.map((f) => Number(f.level.split(':')[1])));
  if (force) {
    if (!forceReason) {
      console.log('\nVERDICT: --force requires a reason. `--force "why this is safe"`.');
      return code;
    }
    console.log(`\nVERDICT: BLOCKED (${code}) — OVERRIDDEN: ${forceReason}`);
    return 0;
  }
  console.log(`\nVERDICT: BLOCKED (${code}) — re-run to acknowledge, or --force "reason".`);
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('preflight: internal error —', e?.message ?? e);
    process.exit(1);
  });
