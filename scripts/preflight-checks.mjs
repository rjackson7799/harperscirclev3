/**
 * The pure halves of scripts/preflight.mjs — the parts a vitest can drive
 * with no process, no port and no disk (tests/lint/preflight-checks.test.ts).
 * Nothing here spawns, probes or reads. The script hands in the text it read
 * and the probe it owns, and gets a finding back in `add()`'s own shape,
 * `{ level, check, detail }`.
 *
 * Slice 8, Q7 (SETTLED 2026-09-02): the two round-27 host traps are preflight
 * checks, not traps.md rows — docs/review/slice-8-plan.md, §"The two
 * round-27 host traps". A trap a human has to remember is a trap that is
 * paid for again; a check that names the offender is paid for once.
 */

/**
 * What Next 16.3.1 writes to `.next/dev/lock` — `serverInfo` in
 * node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js — as
 * far as this check reads it. `next build` locks `.next/lock` with no
 * content; that file is not this check's business.
 * @typedef {{ pid: number, port?: number, hostname?: string, appUrl?: string, startedAt?: number }} DevLockInfo
 */

/**
 * Parse the lock's text the way Next's own `parseDevServerInfo` does
 * (node_modules/next/dist/build/lockfile.js) plus the one thing it does not
 * check: a positive integer pid. Absent (undefined), empty, corrupt and
 * wrong-shaped are all `null` — ONE answer for "there is nothing here to
 * argue with", so the verdict cannot be talked into a BLOCK by a file that
 * merely exists.
 * @param {string | undefined} text
 * @returns {DevLockInfo | null}
 */
export function parseDevLock(text) {
  if (typeof text !== 'string' || text === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!Number.isInteger(parsed.pid) || parsed.pid <= 0) return null;
  return parsed;
}

/**
 * A live peer `next dev` refuses in the stack lease's shape and at its code
 * (BLOCK:3 — "a peer is running", not "your environment is wrong"), NAMING
 * the pid and the appUrl, because Next 16 refuses a second `next dev` in
 * this directory on ANY port: the ports check knows 3000, and a peer on 3100
 * killed the 7D gate at startup while preflight said SAFE. Anything that is
 * not a live peer — a dead pid, an absent file, corrupt JSON — is OK and
 * says `stale`: a false BLOCK on 8A's gate would be round 27 inverted.
 *
 * A live pid that is no longer a `next dev` — pid reuse behind a lock that
 * outlived its server, which is rare: Next unlinks the lock on exit, and in
 * this slice's own probe a `Stop-Process -Force` on the server released it too
 * — refuses once too often: this check BLOCKs on the reused pid exactly as it
 * would on the server. That is the acceptable side to err on. The message
 * names the pid and the appUrl, so `Get-Process -Id <pid>` settles it in one
 * look, and the cost of the false BLOCK is that look plus a deleted lock or a
 * reasoned override — where the false SAFE this check replaces cost round 27
 * four gate runs. Confirming the pid's identity would take a process-list
 * shell call, which traps §9 keeps out of this script; `isAlive` is signal 0
 * and is injected, never imported.
 * @param {DevLockInfo | null} info
 * @param {(pid: number) => boolean} isAlive
 * @returns {{ level: 'OK' | 'BLOCK:3', check: 'devlock', detail: string }}
 */
export function devLockVerdict(info, isAlive) {
  if (!info) {
    return { level: 'OK', check: 'devlock', detail: 'stale — no parseable .next/dev/lock, no peer next dev' };
  }
  if (!isAlive(info.pid)) {
    return { level: 'OK', check: 'devlock', detail: `stale — .next/dev/lock names pid ${info.pid}, which is dead` };
  }
  const since = Number.isFinite(info.startedAt) ? new Date(info.startedAt).toISOString() : '?';
  return {
    level: 'BLOCK:3',
    check: 'devlock',
    detail:
      `pid ${info.pid} holds .next/dev/lock for next dev at ${info.appUrl ?? '?'} since ${since} — ` +
      'Next 16 refuses a second next dev in this directory on ANY port; stop it (`Get-Process -Id` names it) or wait',
  };
}

/**
 * The floor that free physical memory is measured against on the e2e leg:
 * 1.2 GiB.
 *
 * Source: round 27, the 7D close-out gate (docs/review/slice-8-plan.md,
 * §"The two round-27 host traps", trap 2). The 58-leg gate finished only with
 * ~1.2 GB free — the owner closing VS Code, Chrome and ChatGPT first, with
 * NODE_OPTIONS=--max-old-space-size=1536 keeping `next dev` alive and
 * hc_clamd idle — and four runs below that died on a spawn UNKNOWN, a
 * WorkerError, a dev-server death and an auth 504, with ZERO product
 * assertions failing. The number is what was observed on this 7.7 GiB host,
 * not a derived budget; move it when a gate run moves it.
 *
 * What is measured: `os.freemem()`, passed in by the script. On win32 libuv
 * takes it from GlobalMemoryStatusEx as `ullAvailPhys` — physical memory
 * AVAILABLE for reuse, which is Task Manager's "Available" (free pages plus
 * the standby cache), not its smaller "Free". So the figure printed here is
 * the generous one, and a WARN against it is not a rounding artefact.
 *
 * A WARN and never a BLOCK, because the host's condition is the owner's call:
 * a hard floor would refuse a legitimate run the owner has already made room
 * for, and the round-27 evidence is about this host, not every host.
 */
export const GATE_FREE_MEMORY_FLOOR = Math.round(1.2 * 2 ** 30);

const gib = (bytes) => (bytes / 2 ** 30).toFixed(2);

/**
 * @param {number} freeBytes  `os.freemem()` — measured by the script, never here
 * @param {number} floor      GATE_FREE_MEMORY_FLOOR, or a test's own
 * @returns {{ level: 'OK' | 'WARN', check: 'memory', detail: string }}
 */
export function memoryVerdict(freeBytes, floor) {
  if (freeBytes < floor) {
    return {
      level: 'WARN',
      check: 'memory',
      detail:
        `${gib(freeBytes)} GiB free — BELOW the ${gib(floor)} GiB floor the 58-leg gate finished with (round 27); ` +
        'close VS Code / Chrome / ChatGPT first, or expect legs to die on spawn rather than on assertions',
    };
  }
  return { level: 'OK', check: 'memory', detail: `${gib(freeBytes)} GiB free (floor ${gib(floor)} GiB)` };
}

/**
 * Where the previous gate record goes before a run can overwrite it.
 * Playwright's JSON reporter writes `.gate/e2e-run.json` at the END of a run,
 * so a run that dies still replaces the last GOOD record — round 27 lost one
 * that way, and traps §6 says preserve evidence before any re-run. The runner
 * does the preserving: the archive sits beside the record, named by the
 * record's own mtime (the moment its run finished), colon-free because
 * Windows forbids colons in file names. `.gate/` is git-ignored and nothing
 * wipes it.
 * @param {string} recordPath  `.gate/e2e-run.json`
 * @param {number} mtimeMs     the record's mtime
 * @returns {string}
 */
export function archivedRecordName(recordPath, mtimeMs) {
  const stamp = new Date(mtimeMs)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
  return recordPath.replace(/\.json$/, `.${stamp}.json`);
}
