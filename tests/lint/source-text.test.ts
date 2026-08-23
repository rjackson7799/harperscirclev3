import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ============================================================================
// Round-16 R2/F-19 and R7/F-7 — tracked source must be TEXT to git.
//
// `lib/ai/client.ts` carried a raw NUL byte as a cache-key separator. Git
// classifies any blob containing a NUL as binary, and the consequences land
// on exactly the review controls this slice's central claim rests on:
//
//   · `git diff` / `gh pr diff` / the GitHub review UI render it as
//     "Binary files differ" — the commit that introduced the entire provider
//     adapter has NO diff, and no future change to it can be reviewed;
//   · ripgrep SKIPS it silently (exit 1, no output), so a reviewer grepping
//     for `maxRetries` or `fallbacks` in lib/ai gets nothing;
//   · CI's secret scan is `gitleaks detect -s /repo`, i.e. git-history mode
//     over `git log -p` patches. A binary blob yields no patch content, so
//     the one file that reads ANTHROPIC_API_KEY is the one file the repo's
//     only credential scanner cannot read.
//
// The fix was one character (`\u0000` as an escape rather than a raw byte),
// so the runtime separator is unchanged. This test is what keeps it fixed:
// it asserts the property for EVERY tracked source file, not just that one.
// ============================================================================
describe('R2/F-19 · no tracked source file is binary to git', () => {
  const tracked = execFileSync(
    'git',
    ['ls-files', '-z', '*.ts', '*.tsx', '*.mjs', '*.js', '*.sql', '*.json', '*.md', '*.css'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
    .split('\0')
    .filter(Boolean);

  it('finds a non-trivial set of tracked source files to check', () => {
    expect(tracked.length).toBeGreaterThan(100);
  });

  it('no tracked source file contains a NUL byte', () => {
    const offenders = tracked.filter((f) => readFileSync(f).includes(0));
    expect(offenders).toEqual([]);
  });

  it('the provider adapter in particular is diffable and greppable', () => {
    // Named explicitly: it is the file that builds every provider request,
    // holds the credential, and pins maxRetries: 0 — the one a reviewer is
    // most often told to read, and the one that was invisible.
    const src = readFileSync('lib/ai/client.ts');
    expect(src.includes(0)).toBe(false);
    expect(src.toString('utf8')).toContain('maxRetries: 0');
  });
});
