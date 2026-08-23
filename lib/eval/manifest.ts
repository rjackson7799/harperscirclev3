import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CorpusItem, CorpusManifest, CorpusPartition } from '@/lib/eval/corpus';

/**
 * The G9 corpus MANIFEST — every item in both partitions (round-16 R6/F-2).
 *
 * This module exists because the fence needs something to fence. Before it,
 * `corpusManifest()` and `itemsIn()` were exported from `lib/eval/corpus`,
 * which nothing restricted — so `corpusManifest().items` handed any file in
 * the tree all 28 items with every label, and `lib/eval/blind.ts` was a
 * two-line wrapper over an unfenced call. The BLIND partition was a naming
 * convention, not a property of the tree, which is the opposite of what
 * ADR-0022 D1 claims and what Q5 ruled.
 *
 * §1.7 fences this module to `scripts/eval/**`, `tests/eval/**` and
 * `lib/eval/**` — the scored harness, the corpus suite, and the two
 * accessors that apply the split. Everyone else reads `lib/eval/corpus`
 * (development) and cannot name a partition at all.
 */
function locateCorpus(): string {
  // Every consumer (vitest, the harness scripts, the fixture server) runs
  // from the repo root; the walk up is belt-and-braces for a consumer that
  // does not, and it fails loudly rather than silently finding nothing.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'fixtures', 'g9');
    if (existsSync(path.join(candidate, 'corpus.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('g9 corpus: fixtures/g9/corpus.json not found from ' + process.cwd());
}

export const CORPUS_ROOT: string = locateCorpus();

let cached: CorpusManifest | undefined;

export function corpusManifest(): CorpusManifest {
  if (!cached) {
    cached = JSON.parse(
      readFileSync(path.join(CORPUS_ROOT, 'corpus.json'), 'utf8'),
    ) as CorpusManifest;
  }
  return cached;
}

/** Items in the partition named — the one place the split is applied, so
 *  neither accessor can drift from the other. */
export function itemsIn(partition: CorpusPartition): CorpusItem[] {
  return corpusManifest().items.filter((i) => i.partition === partition);
}
