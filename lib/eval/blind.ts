import 'server-only';
import { itemsIn } from '@/lib/eval/manifest';
import { type CorpusItem } from '@/lib/eval/corpus';

/**
 * The G9 corpus's BLIND partition (slice-5 plan B1; TSD §6.10).
 *
 * Its own module for one reason: **the reported bands must not be measured
 * on their own development set.** The §1.7 import fence (eslint.config.mjs,
 * pinned by tests/lint/db-fence.test.ts) restricts this module to the
 * scored eval harness and its own test — the worker tests, the fixture
 * server and any prompt-iteration surface cannot reach it, so "blind" is a
 * property of the tree rather than of anyone's discipline.
 *
 * Nothing here is secret: the partition is checked in, reviewable, and
 * synthetic like the rest of the corpus. What the fence buys is that a
 * prompt cannot be tuned against it by accident, which is exactly the
 * failure mode Q5 rejected when it refused a second, unlabelled fixture
 * world.
 */
export function blindCorpus(): CorpusItem[] {
  return itemsIn('blind');
}
