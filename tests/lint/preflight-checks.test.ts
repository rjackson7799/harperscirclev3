import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  GATE_FREE_MEMORY_FLOOR,
  devLockVerdict,
  memoryVerdict,
  parseDevLock,
} from '@/scripts/preflight-checks.mjs';

// ============================================================================
// SLICE 8 · Q7 (SETTLED 2026-09-02) — THE TWO ROUND-27 HOST TRAPS ARE
// PREFLIGHT CHECKS, NOT traps.md ROWS.
//
// Round 27 lost the 7D gate before a leg ran: a peer `next dev` on port 3100
// held `.next/dev/lock`, Next 16 refuses a second dev server in the same
// directory on ANY port, and `scripts/preflight.mjs` reported SAFE because
// its port table knows 3000 and nothing else. The lock names the peer — pid
// and appUrl — so a check can do strictly more than a human-readable trap.
//
// The pure parts live in scripts/preflight-checks.mjs and are driven here
// with a FIXTURE lock: `.next/` is git-ignored, so the fixture lives in the
// test, never on disk. One negative control per branch (traps §9): a check
// that cannot be shown to stay quiet is a check that gets skimmed past.
//
// Test class: PURE (no DB, no browser, no process probe — `isAlive` is
// injected, and the module is pinned never to import child_process).
// ============================================================================

/** The exact shape Next 16.3.1 writes — setup-dev-bundler.js `serverInfo`. */
const liveLock = (pid: number, port = 3100) =>
  JSON.stringify({
    pid,
    port,
    hostname: 'localhost',
    appUrl: `http://localhost:${port}`,
    startedAt: 1_756_800_000_000,
  });

describe('parseDevLock — reading .next/dev/lock without trusting it', () => {
  it("parses Next 16.3.1's serverInfo JSON: pid, port, hostname, appUrl, startedAt", () => {
    const info = parseDevLock(liveLock(4242));
    expect(info).toMatchObject({ pid: 4242, port: 3100, appUrl: 'http://localhost:3100' });
  });

  it('an ABSENT file (undefined text) is null — there is no lock to argue with', () => {
    expect(parseDevLock(undefined)).toBeNull();
  });

  it('an EMPTY file is null', () => {
    expect(parseDevLock('')).toBeNull();
  });

  it('CORRUPT text (not JSON) is null, never a throw', () => {
    expect(() => parseDevLock('{ pid: 4242')).not.toThrow();
    expect(parseDevLock('{ pid: 4242')).toBeNull();
  });

  it('negative control: valid JSON without a numeric pid is null — the shape, not the syntax, is the contract', () => {
    expect(parseDevLock(JSON.stringify({ appUrl: 'http://localhost:3100' }))).toBeNull();
    expect(parseDevLock(JSON.stringify({ pid: '4242' }))).toBeNull();
    expect(parseDevLock('[4242]')).toBeNull();
    expect(parseDevLock('4242')).toBeNull();
  });
});

describe('devLockVerdict — a live peer refuses in the lease’s shape; anything stale is OK', () => {
  it('a LIVE pid is BLOCK:3 (the lease’s own code) and NAMES the pid and the appUrl', () => {
    const isAlive = vi.fn(() => true);
    const v = devLockVerdict(parseDevLock(liveLock(4242)), isAlive);
    expect(v.level).toBe('BLOCK:3');
    expect(v.check).toBe('devlock');
    expect(v.detail).toContain('pid 4242');
    expect(v.detail).toContain('http://localhost:3100');
    expect(isAlive).toHaveBeenCalledWith(4242);
  });

  it('negative control: the live verdict never reads as stale', () => {
    const v = devLockVerdict(parseDevLock(liveLock(4242)), () => true);
    expect(v.detail).not.toMatch(/stale/i);
  });

  it('a DEAD pid is OK and says stale — a crashed server’s leftover lock must never block a gate', () => {
    const isAlive = vi.fn(() => false);
    const v = devLockVerdict(parseDevLock(liveLock(4242)), isAlive);
    expect(v.level).toBe('OK');
    expect(v.check).toBe('devlock');
    expect(v.detail).toMatch(/stale/);
    expect(v.detail).toContain('4242');
    expect(isAlive).toHaveBeenCalledWith(4242);
  });

  it('negative control: a dead pid is not a BLOCK at any code', () => {
    const v = devLockVerdict(parseDevLock(liveLock(4242)), () => false);
    expect(v.level.startsWith('BLOCK')).toBe(false);
  });

  it('an ABSENT or CORRUPT lock (null info) is OK stale, and the process is never probed', () => {
    const isAlive = vi.fn(() => true);
    const v = devLockVerdict(null, isAlive);
    expect(v.level).toBe('OK');
    expect(v.detail).toMatch(/stale/);
    expect(isAlive).not.toHaveBeenCalled();
  });

  it('negative control: with null info, even an isAlive that would say "live" cannot produce a BLOCK', () => {
    const v = devLockVerdict(null, () => true);
    expect(v.level).toBe('OK');
  });
});

describe('memoryVerdict — free physical memory against a NAMED floor: a WARN, never a BLOCK', () => {
  const GiB = 2 ** 30;

  it('the floor is 1.2 GiB — what the 7D gate finished with, and what four runs died below', () => {
    expect(GATE_FREE_MEMORY_FLOOR / GiB).toBeCloseTo(1.2, 6);
  });

  it('free BELOW the floor is a WARN that prints the measured number and the floor', () => {
    const v = memoryVerdict(0.49 * GiB, GATE_FREE_MEMORY_FLOOR);
    expect(v.level).toBe('WARN');
    expect(v.check).toBe('memory');
    expect(v.detail).toContain('0.49 GiB');
    expect(v.detail).toContain('1.20 GiB');
  });

  it('negative control: below the floor is never a BLOCK — the host’s condition is the owner’s call', () => {
    const v = memoryVerdict(0.1 * GiB, GATE_FREE_MEMORY_FLOOR);
    expect(v.level.startsWith('BLOCK')).toBe(false);
    expect(v.level).not.toBe('OK');
  });

  it('free ABOVE the floor is OK, still with the number in the text', () => {
    const v = memoryVerdict(2.75 * GiB, GATE_FREE_MEMORY_FLOOR);
    expect(v.level).toBe('OK');
    expect(v.check).toBe('memory');
    expect(v.detail).toContain('2.75 GiB');
  });

  it('negative control: exactly AT the floor is OK — "below" is strict, so the floor itself never warns', () => {
    expect(memoryVerdict(GATE_FREE_MEMORY_FLOOR, GATE_FREE_MEMORY_FLOOR).level).toBe('OK');
    expect(memoryVerdict(GATE_FREE_MEMORY_FLOOR - 1, GATE_FREE_MEMORY_FLOOR).level).toBe('WARN');
  });
});

describe('the wiring — the script reads the dev lock through the module, and only the dev lock', () => {
  const checks = readFileSync('scripts/preflight-checks.mjs', 'utf8');
  const script = readFileSync('scripts/preflight.mjs', 'utf8');

  it('the checks module measures nothing itself: no node:os import — the script passes os.freemem() in', () => {
    expect(checks).not.toMatch(/from 'node:os'|from 'os'/);
  });

  it("the floor's comment cites its source and says what os.freemem() measures on win32", () => {
    const at = checks.indexOf('export const GATE_FREE_MEMORY_FLOOR');
    expect(at).toBeGreaterThan(0);
    const above = checks.slice(Math.max(0, at - 1600), at);
    expect(above).toMatch(/round 27|7D/);
    expect(above).toMatch(/os\.freemem\(\)/);
    expect(above).toMatch(/win32/);
  });

  it('scripts/preflight.mjs feeds os.freemem() to memoryVerdict against the named floor, on the e2e leg', () => {
    expect(script).toMatch(/memoryVerdict\(freemem\(\), GATE_FREE_MEMORY_FLOOR\)/);
    expect(script).toMatch(/needs\.memory/);
  });

  it('the checks module has no process-fact shell: no child_process import (traps §9 — alive() is signal 0, injected)', () => {
    expect(checks).not.toMatch(/child_process/);
  });

  it('scripts/preflight.mjs imports the checks module', () => {
    expect(script).toMatch(/from '\.\/preflight-checks\.mjs'/);
  });

  it('it reads `.next/dev/lock` (next dev) and leaves `.next/lock` (next build) alone', () => {
    expect(script).toMatch(/const DEV_LOCK = '\.next\/dev\/lock'/);
    // A SCANNER MATCHES ITS OWN COMMENTS (traps §9): the script may SAY that
    // `.next/lock` is not its business; it may not name it in code.
    const code = script
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/['"`]\.next\/lock['"`]/);
  });
});
