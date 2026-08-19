import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D5 · The §8.5 motion inventory (DS-05): the seven animations exactly —
// mfade · tin · hp/hpo/hpg · rdot · eqp · bdrop · kb — nothing longer
// than 250ms except the deliberate infinite loops, no easing more
// dramatic than ease (ease-out is the pulses' own spec), and ONE
// reduced-motion query that stills everything INCLUDING iteration count
// (§8.7 — the seed's gap, A11Y-02).
// ============================================================================

const repo = path.resolve(__dirname, '../..');
const sheet = readFileSync(path.join(repo, 'app/globals.css'), 'utf8');

const INVENTORY = ['mfade', 'tin', 'hp', 'hpo', 'hpg', 'rdot', 'eqp', 'bdrop', 'kb'];
// The deliberate infinite loops: the three pulses plus the ambient
// indicators (thinking, audio, photographic drift) — everything else is
// an entrance/transition and bounded at 250ms.
const INFINITE = new Set(['hp', 'hpo', 'hpg', 'rdot', 'eqp', 'kb']);
const EASINGS = new Set(['ease', 'ease-out', 'linear']);

describe('D5 · the §8.5 keyframe inventory, exactly', () => {
  it('declares exactly the seven §8.5 animations (nine keyframe names)', () => {
    const names = [...sheet.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names.sort()).toEqual([...INVENTORY].sort());
  });

  it('every animation shorthand: known name, ≤250ms unless a deliberate infinite loop, easing never past ease', () => {
    const seen: string[] = [];
    for (const m of sheet.matchAll(/animation:\s*([^;]+);/g)) {
      const value = m[1].trim();
      const parts = value.split(/\s+/);
      const name = parts[0];
      expect(INVENTORY, `animation name ${name}`).toContain(name);
      seen.push(name);
      const duration = parts.find((p) => /^[\d.]+m?s$/.test(p));
      expect(duration, `duration in "${value}"`).toBeDefined();
      const ms = duration!.endsWith('ms')
        ? parseFloat(duration!)
        : parseFloat(duration!) * 1000;
      const infinite = parts.includes('infinite');
      expect(infinite, `${name} infinite?`).toBe(INFINITE.has(name));
      if (!infinite) {
        expect(ms, `${name} duration ${duration}`).toBeLessThanOrEqual(250);
      }
      const easing = parts.find((p) => EASINGS.has(p) || p.includes('cubic-bezier') || p.includes('steps'));
      expect(easing, `easing in "${value}"`).toBeDefined();
      expect(EASINGS.has(easing!), `easing ${easing} within the ease bound`).toBe(true);
    }
    // every keyframe is actually wired to a class
    for (const name of INVENTORY) {
      expect(seen, `keyframe ${name} consumed by a utility class`).toContain(name);
    }
  });

  it('the pulses are the §8.5 spec verbatim: 2.2s ease-out infinite, amber/terracotta/green', () => {
    for (const [cls, keyframe, accent] of [
      ['pulse-amber', 'hp', '--amber'],
      ['pulse-terracotta', 'hpo', '--terracotta'],
      ['pulse-green', 'hpg', '--green'],
    ]) {
      const block = new RegExp(`\\.${cls}::after\\s*\\{([^}]*)\\}`).exec(sheet)?.[1] ?? '';
      expect(block, `.${cls}::after`).toContain(`animation: ${keyframe} 2.2s ease-out infinite`);
      const frames = new RegExp(`@keyframes ${keyframe}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(sheet)?.[1] ?? '';
      expect(frames, `${keyframe} ring colour`).toContain(`var(${accent})`);
    }
  });
});

describe('D5 · reduced motion — one query, opacity-only stillness (A11Y-02)', () => {
  it('exactly one prefers-reduced-motion query exists across first-party CSS', () => {
    let count = 0;
    for (const tree of ['app', 'components']) {
      const root = path.join(repo, tree);
      if (!existsSync(root)) continue;
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.css')) continue;
        const text = readFileSync(path.join(entry.parentPath, entry.name), 'utf8');
        count += (text.match(/prefers-reduced-motion/g) ?? []).length;
      }
    }
    expect(count).toBe(1);
  });

  it('the query stills duration AND iteration count AND transitions, all !important', () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(sheet)?.[1] ?? '';
    expect(block).toContain('animation-duration: 0.01ms !important');
    expect(block).toContain('animation-iteration-count: 1 !important');
    expect(block).toContain('transition-duration: 0.01ms !important');
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after/);
  });
});
