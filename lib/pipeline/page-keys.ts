/**
 * The rendered-page key shapes (5B B2; TSD §6.3, §6.4, §4.5).
 *
 * Pure string builders, deliberately in their own module: the storage plane
 * (`lib/storage/artifacts.ts`) is §1.7-fenced to the pipeline surfaces, and
 * these names are a CONTRACT the worker, the artifact route, slice 6's review
 * screen and the tests all need to agree on. Splitting the naming from the
 * byte-moving keeps the fence uniform — no test-shaped hole in it — without
 * duplicating a key shape in two files.
 *
 *   render/attempt/<circle>/<arrival>/<lease>/pNNN.<ext>
 *     One attempt's pages. Lease-scoped, so a superseded worker's output can
 *     never be mistaken for the winner's; unreachable from any user path;
 *     GC'd when the lease closes as anything but `advanced` (§4.5).
 *
 *   render/circle/<circle>/arrival/<arrival>/pNNN.<ext>
 *     PROMOTED on `advanced`: durable, write-once, per-arrival. The §6.4
 *     rendering slice 6's review screen shows and crops from, served only
 *     through the artifact route's discipline, deleted with the arrival by
 *     the DEL-01 cascade (named, not built here).
 *
 * THE SLICE-5 EXIT ASSERTION (so Q6's OCR deferral cannot force rework):
 * §6.9's machine-read text lands as a SIBLING sharing the page's stem —
 * `p003.png` gains `p003.txt`. Citation coordinates are normalised against
 * the page rather than against a rendering, so neither the stored
 * coordinates nor the promoted artifact changes when slice 6 arrives.
 */

export type PageExt = 'png' | 'jpg';

function pageStem(page: number): string {
  return `p${String(page).padStart(3, '0')}`;
}

export function renderStagingPrefix(
  circleId: string,
  arrivalId: string,
  leaseId: string,
): string {
  return `render/attempt/${circleId}/${arrivalId}/${leaseId}`;
}

export function renderStagingKey(
  circleId: string,
  arrivalId: string,
  leaseId: string,
  page: number,
  ext: PageExt = 'png',
): string {
  return `${renderStagingPrefix(circleId, arrivalId, leaseId)}/${pageStem(page)}.${ext}`;
}

export function promotedPagePrefix(circleId: string, arrivalId: string): string {
  return `render/circle/${circleId}/arrival/${arrivalId}`;
}

export function promotedPageKey(
  circleId: string,
  arrivalId: string,
  page: number,
  ext: PageExt = 'png',
): string {
  return `${promotedPagePrefix(circleId, arrivalId)}/${pageStem(page)}.${ext}`;
}

/** §6.9's seam, reserved here and built in slice 6. */
export function promotedPageTextKey(
  circleId: string,
  arrivalId: string,
  page: number,
): string {
  return `${promotedPagePrefix(circleId, arrivalId)}/${pageStem(page)}.txt`;
}

export function extFor(mime: string): PageExt {
  return mime === 'image/jpeg' ? 'jpg' : 'png';
}
