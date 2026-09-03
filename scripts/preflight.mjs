/**
 * The destructive-command guard — and the holder of the stack lease.
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
 *   node scripts/preflight.mjs --for e2e|db|concurrency|any [--force "reason"] [-- <command …>]
 *
 * With a command after `--`, this script is the RUNNER: it checks, takes the
 * stack lease for the run's whole lifetime, runs the command on the inherited
 * console, releases the lease, and exits with the command's own code. That is
 * how package.json wires the four stack scripts. Without a command it only
 * reports — a manual look before something no script wraps.
 *
 * Why a runner and not an npm `pre` hook (the shape this file had from
 * 116f80c until the retune refresh): a `pre` hook exits before the command
 * starts, so a lease it wrote would name a pid that is already dead and the
 * peer check could never fire — and nothing ever wrote one, so exit 3 was
 * unreachable. The lease lives in the OS temp dir keyed by the stack's DB
 * port, because the stack is HOST-scoped: two worktrees of this repo share
 * it, and a lease under either tree's `.gate/` is invisible to the other.
 *
 * Exit codes are distinct on purpose — "a peer is running" and "your ports are
 * hot" call for different actions, and one generic code produces one generic
 * message, which is how a founder learns to skim past it.
 *
 *   0  SAFE (report only), or the wrapped command's own exit code
 *   1  internal error
 *   3  BLOCKED — a peer session holds the stack lease, or a peer next dev holds .next/dev/lock
 *   4  BLOCKED — environment wrong (ports hot, stack down, stale fixture server)
 *   5  BLOCKED — HEAD moved, or peer-dirty files. Re-run to acknowledge.
 *
 * PROCESS TOOLS: always execFileSync, never through a shell. `tasklist /FI`
 * fails under Git Bash because MSYS rewrites `/FI` into a path, and PowerShell
 * `Get-CimInstance` costs ~1.6s — eight times a whole node start. The one
 * shell spawn here is the wrapped command itself, which npm ran through the
 * same shell before this script existed.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devLockVerdict, parseDevLock } from './preflight-checks.mjs';

// The stack's ports are 5434x, not the 5432x defaults (supabase/config.toml).
const PORT = { api: 54341, db: 54342, mailpit: 54344, dev: 3000, fixture: 8787, clamd: 3310 };

const STATE_DIR = '.gate';
const HEAD_FILE = `${STATE_DIR}/last-head`;
const LOCK_FILE = join(tmpdir(), `hc-stack-${PORT.db}.lock`);
// Next 16's dev lock (server/lib/router-utils/setup-dev-bundler.js): held per
// DIRECTORY, on any port, for as long as a `next dev` lives. `next build`
// locks `.next/lock` instead, and that one is not this script's business.
const DEV_LOCK = '.next/dev/lock';

// What each leg actually needs — measured, not assumed. `test:db` and
// `test:concurrency` talk to Postgres alone (scripts/concurrency/run.mjs dials
// 54342 directly), and CI's `supabase db start` brings up ONLY the database:
// demanding Kong and Mailpit for a pgTAP run — the round-19 shape — would have
// turned CI red on the branch's first push. The browser gate needs the API,
// Mailpit, a FREE 3000 and 8787 (reuseExistingServer:false on both webServers,
// so an occupied port fails the gate at startup), clamd — and `.next/dev/lock`
// unheld, because Next 16 refuses a second `next dev` in this directory on ANY
// port, which no port table can see (round 27; slice 8 Q7).
const NEEDS = {
  db: { open: [PORT.db], free: [], clamd: false, devlock: false },
  concurrency: { open: [PORT.db], free: [], clamd: false, devlock: false },
  e2e: { open: [PORT.api, PORT.db, PORT.mailpit], free: [PORT.dev, PORT.fixture], clamd: true, devlock: true },
  any: { open: [], free: [], clamd: false, devlock: false },
};

const argv = process.argv.slice(2);
const dashdash = argv.indexOf('--');
const args = dashdash === -1 ? argv : argv.slice(0, dashdash);
const command = dashdash === -1 ? [] : argv.slice(dashdash + 1);

const forIdx = args.indexOf('--for');
const leg = forIdx === -1 ? 'any' : (args[forIdx + 1] ?? 'any');
const forceIdx = args.indexOf('--force');

// The override is a REASON, never a bare flag. A bare flag gets typed
// reflexively within a week; a reason has to be composed, and it is echoed
// into the run record. HC_PREFLIGHT_FORCE exists because `npm run <script>`
// appends its extra arguments AFTER the wrapped command, where they belong to
// it — `HC_PREFLIGHT_FORCE="why" npm run test:e2e`.
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

/** Signal 0 probes without killing. EPERM means "exists, not yours" — live. */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
};

/** Quote for the shell only when the shell would otherwise split it. */
const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

async function main() {
  if (!(leg in NEEDS)) {
    console.error(`preflight: unknown leg "${leg}" — use e2e, db, concurrency or any`);
    return 1;
  }
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

  const head = git('rev-parse', 'HEAD');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const needs = NEEDS[leg];

  // --- 1. the stack lease -------------------------------------------------
  // A lease read is 0ms and exact. Process scanning is ~282ms and ambiguous.
  if (existsSync(LOCK_FILE)) {
    let lock = null;
    try {
      lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
    } catch {
      /* a corrupt lease is a stale lease */
    }
    const live = Boolean(lock?.pid) && lock.pid !== process.pid && alive(lock.pid);
    if (live) {
      add(
        'BLOCK:3',
        'lease',
        `pid ${lock.pid} in ${lock.cwd ?? '?'} holds the stack for "${lock.leg}" since ${lock.startedAt} (${LOCK_FILE})`,
      );
    } else {
      add('OK', 'lease', 'a stale lease was present and is ignored');
    }
  } else {
    add('OK', 'lease', 'no stack lease held');
  }

  // --- 2. HEAD movement, self-disarming -----------------------------------
  // Denies exactly once per NEW head value, then records the acknowledgement.
  // A check that fires on every peer commit for six hours is a check you learn
  // to ignore; this one forces exactly one look. Per working tree, because
  // HEAD is.
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
  const probe = [...new Set([...needs.open, ...needs.free, PORT.fixture, PORT.clamd])];
  const state = Object.fromEntries(
    (await Promise.all(probe.map(portOpen))).map((open, i) => [probe[i], open]),
  );

  if (needs.free.length) {
    const hot = needs.free.filter((p) => state[p]);
    if (hot.length) {
      add('BLOCK:4', 'ports', `${hot.join(' · ')} OPEN — reuseExistingServer:false needs them FREE`);
    } else {
      add('OK', 'ports', `${needs.free.join(' and ')} free`);
    }
  }
  if (needs.clamd) {
    add(state[PORT.clamd] ? 'OK' : 'WARN', 'clamd', state[PORT.clamd] ? '3310 open' : '3310 closed — `docker start hc_clamd`');
  }
  if (needs.open.length) {
    const down = needs.open.filter((p) => !state[p]);
    if (down.length) {
      add('BLOCK:4', 'stack', `${down.join(' · ')} CLOSED — stack ports are 5434x, not 5432x`);
    } else {
      add('OK', 'stack', `${needs.open.join('/')} open`);
    }
  }

  // --- 4b. the Next 16 dev lock (round 27; slice 8 Q7) ---------------------
  // The ports check knows 3000. Next 16.3.1 refuses a second `next dev` in
  // this DIRECTORY on any port, so a peer on 3100 killed the 7D gate at startup
  // while this script said SAFE. The lock is JSON that names the peer — pid
  // and appUrl — so the refusal names it too. Absent, unreadable, corrupt, or
  // naming a dead pid: stale, and OK. preflight-checks.mjs carries the verdict
  // and says why a live-but-reused pid still blocks.
  if (needs.devlock) {
    let lockText;
    try {
      lockText = readFileSync(DEV_LOCK, 'utf8');
    } catch {
      /* absent — nothing to argue with */
    }
    const v = devLockVerdict(parseDevLock(lockText), alive);
    add(v.level, v.check, v.detail);
  }

  // --- 5. stale fixture server -------------------------------------------
  // An open 8787 that ANSWERS is a live orphan, not a coincidence. For the e2e
  // leg it is already a BLOCK above; elsewhere it is worth a look.
  if (state[PORT.fixture] && !needs.free.includes(PORT.fixture)) {
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
  if (blocks.length) {
    const code = Math.max(...blocks.map((f) => Number(f.level.split(':')[1])));
    if (!force) {
      console.log(`\nVERDICT: BLOCKED (${code}) — re-run to acknowledge, or HC_PREFLIGHT_FORCE="reason".`);
      return code;
    }
    if (!forceReason) {
      console.log('\nVERDICT: the override requires a reason. `--force "why this is safe"`.');
      return code;
    }
    console.log(`\nVERDICT: BLOCKED (${code}) — OVERRIDDEN: ${forceReason}`);
  } else {
    console.log('\nVERDICT: SAFE');
  }

  if (!command.length) return 0;
  return run(head);
}

/**
 * Hold the lease for exactly as long as the command lives. The lease names
 * THIS pid, which outlives the child by construction; a peer's preflight
 * probes it with signal 0. Released on exit, on Ctrl+C, and on a spawn
 * failure; a hard kill leaves a lease whose pid is dead, which the next
 * preflight reads as stale.
 */
function run(head) {
  const lease = {
    pid: process.pid,
    leg,
    startedAt: new Date().toISOString(),
    head: head.slice(0, 7),
    cwd: process.cwd(),
    command: command.join(' '),
  };
  writeFileSync(LOCK_FILE, JSON.stringify(lease));
  const release = () => {
    try {
      if (JSON.parse(readFileSync(LOCK_FILE, 'utf8')).pid === process.pid) unlinkSync(LOCK_FILE);
    } catch {
      /* already gone, or not ours */
    }
  };
  const bail = (code) => {
    release();
    process.exit(code);
  };

  const line = command.map(quote).join(' ');
  console.log(`LEASE    ${LOCK_FILE} (pid ${process.pid})\nRUN      ${line}\n`);
  const child = spawn(line, { stdio: 'inherit', shell: true });
  process.on('SIGINT', () => bail(130));
  process.on('SIGTERM', () => bail(143));
  child.on('error', (e) => {
    console.error('preflight: could not start the command —', e?.message ?? e);
    bail(1);
  });
  child.on('exit', (code, signal) => bail(code ?? (signal ? 1 : 0)));
  return null; // the event loop stays alive for the child
}

main()
  .then((code) => {
    if (code !== null) process.exit(code);
  })
  .catch((e) => {
    console.error('preflight: internal error —', e?.message ?? e);
    process.exit(1);
  });
