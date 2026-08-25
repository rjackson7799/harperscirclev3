import { describe, expect, it } from 'vitest';
import {
  HIGH_LONG_EDGE,
  RENDER_CEILINGS,
  STANDARD_LONG_EDGE,
  cropRect,
  normalizeArrival,
  type NormalizeResult,
  type RenderedPage,
} from '@/lib/pipeline/render';
import { corpusItem, corpusMime, readCorpusFile } from '@/lib/eval/corpus';
import {
  promotedPageKey,
  promotedPageTextKey,
  renderStagingKey,
} from '@/lib/pipeline/page-keys';

// ============================================================================
// B2 · §6.3 rendering, as rules-as-code (slice-5 plan B2; RND-01).
//
// The §6.3 table IS the test surface: born-digital PDFs go at the standard
// tier WITH their text layer; scans, phone photos, pill bottles and
// handwritten notes go at the HIGH tier and are never downsampled; email
// bodies are text first. The bounds are enforced BEFORE rendering, which is
// what makes "never dispatched by accident" true rather than hoped for.
//
// The mupdf spike (scripts/spike/mupdf-spike.mjs) established two facts this
// suite pins so they cannot regress silently:
//   · Document.openDocument applies EXIF orientation; new mupdf.Image does
//     not. §6.4's citation space is the page AS DISPLAYED, so only the
//     document path is correct — and the difference is load-bearing.
//   · mupdf REPAIRS a truncated PDF rather than refusing it. That is a
//     behaviour we own, not one we inherit by accident.
// ============================================================================

function render(id: string, ceilings?: Partial<typeof RENDER_CEILINGS>): NormalizeResult {
  const item = corpusItem(id);
  return normalizeArrival(readCorpusFile(item), corpusMime(item), { ceilings });
}

function pages(result: NormalizeResult): RenderedPage[] {
  if (result.outcome !== 'rendered') throw new Error(`expected rendered, got ${result.outcome}`);
  return result.pages;
}

function longEdge(page: RenderedPage): number {
  return Math.max(page.widthPx, page.heightPx);
}

describe('B2 · the §6.3 table, row by row', () => {
  it('born-digital PDF → page images PLUS the embedded text layer, standard tier', () => {
    const result = render('dev-discharge-01');
    expect(result.outcome).toBe('rendered');
    if (result.outcome !== 'rendered') return;
    expect(result.sourceClass).toBe('born_digital_pdf');
    expect(result.pages).toHaveLength(1);
    expect(longEdge(result.pages[0])).toBe(STANDARD_LONG_EDGE);
    // The text layer carries the characters; the image carries the geometry.
    expect(result.text).toContain('Riverbend Community Hospital');
    expect(result.text).toContain('500 mg');
  });

  it('scanned PDF → page images ONLY, high tier (no text layer to lean on)', () => {
    const result = render('dev-scanned-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(result.sourceClass).toBe('scanned_pdf');
    expect(longEdge(result.pages[0])).toBe(HIGH_LONG_EDGE);
    expect(result.text).toBeNull();
  });

  it('phone photo → high tier, and NEVER downsampled below the source', () => {
    const result = render('dev-eob-02');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(result.sourceClass).toBe('photo');
    expect(longEdge(result.pages[0])).toBe(HIGH_LONG_EDGE);
  });

  it('pill bottle and handwritten note → high, never downsampled', () => {
    for (const id of ['dev-pill-01', 'dev-note-01']) {
      const result = render(id);
      if (result.outcome !== 'rendered') throw new Error(`${id}: ${result.outcome}`);
      expect(longEdge(result.pages[0]), id).toBe(HIGH_LONG_EDGE);
      expect(longEdge(result.pages[0]), id).toBeGreaterThan(STANDARD_LONG_EDGE);
    }
  });

  it('email body → text first, no page images', () => {
    const result = render('dev-email-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(result.sourceClass).toBe('email_text');
    expect(result.pages).toEqual([]);
    expect(result.text).toContain('Northgate Medical Group');
  });

  it('a born-digital page is never rendered at the high tier — resolution is a rule, not a setting', () => {
    // §6.3: downsampling a born-digital PDF is free accuracy-wise because
    // the text layer carries the content; spending 3× the tokens on it is
    // exactly the wrong economy.
    const result = render('dev-eob-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(longEdge(result.pages[0])).toBe(STANDARD_LONG_EDGE);
  });
});

describe('B2 · the honest normalize exits (§4.3)', () => {
  it('an encrypted PDF is needs_password, decided before any page loads', () => {
    expect(render('dev-encrypted-01').outcome).toBe('needs_password');
  });

  it('undecodable bytes are unsupported_type', () => {
    expect(render('dev-unsupported-01').outcome).toBe('unsupported_type');
  });

  it('a truncated PDF is REPAIRED by mupdf and processed — never a crash', () => {
    // The spike's finding, owned rather than inherited: what we guarantee is
    // that the worker survives and the lease is never lost to a throw.
    const result = render('dev-truncated-01');
    expect(['rendered', 'unsupported_type']).toContain(result.outcome);
  });
});

describe('B2 · the ceilings abort BEFORE any provider dispatch', () => {
  it('page_count is bounded before rendering (PRD §13.3: 200 pages)', () => {
    const result = render('dev-pagebomb-01');
    expect(result).toEqual({ outcome: 'refused', reason: 'page_bound' });
  });

  it('a declared-geometry pixel bomb is refused on its header alone', () => {
    const result = render('dev-pixelbomb-01');
    expect(result).toEqual({ outcome: 'refused', reason: 'page_dimensions' });
  });

  it('the wall-clock ceiling is real — a zero budget refuses rather than runs', () => {
    const result = render('dev-pill-01', { maxWallClockMs: 0 });
    expect(result).toEqual({ outcome: 'refused', reason: 'wall_clock' });
  });

  it('the rendered-output ceiling is real — a one-byte budget refuses', () => {
    const result = render('dev-pill-01', { maxRenderedBytes: 1 });
    expect(result).toEqual({ outcome: 'refused', reason: 'output_size' });
  });

  it('the ceilings are stated as values, not buried as literals', () => {
    expect(RENDER_CEILINGS.maxPages).toBe(200);
    expect(RENDER_CEILINGS.maxPageMegapixels).toBeGreaterThan(0);
    expect(RENDER_CEILINGS.maxWallClockMs).toBeGreaterThan(0);
    expect(RENDER_CEILINGS.maxRenderedBytes).toBeGreaterThan(0);
  });
});

describe('B2 · EXIF orientation is normalised BEFORE geometry', () => {
  it('an angled phone photo renders in its DISPLAYED frame', () => {
    // Stored 3024×2016 landscape, EXIF orientation 6. What a person sees —
    // and therefore what a citation is measured against — is 2016×3024.
    const result = render('dev-angled-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    const page = result.pages[0];
    expect(page.heightPx).toBeGreaterThan(page.widthPx);
    expect(longEdge(page)).toBe(HIGH_LONG_EDGE);
  });

  it("the corpus's displayed-frame citations land on their values", () => {
    const item = corpusItem('dev-angled-01');
    const result = render('dev-angled-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    for (const label of item.labels) {
      const rect = cropRect(result.pages[0], label.bbox);
      expect(rect.w, `${label.field} width`).toBeGreaterThan(0);
      expect(rect.h, `${label.field} height`).toBeGreaterThan(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(result.pages[0].widthPx);
      expect(rect.y + rect.h).toBeLessThanOrEqual(result.pages[0].heightPx);
    }
  });
});

describe('B2 · geometry is deterministic and resolution-independent', () => {
  const fake = (w: number, h: number): RenderedPage => ({
    page: 1,
    widthPx: w,
    heightPx: h,
    mime: 'image/png',
    bytes: new Uint8Array(0),
  });

  it('a normalised bbox names the same FRACTION of the page at any resolution', () => {
    // This is what makes a stored citation survive a re-render, a provider
    // swap, and slice 6's review screen: the coordinates are a fraction of
    // the page, never pixels of one particular rendering (§6.4).
    const item = corpusItem('dev-discharge-01');
    for (const label of item.labels) {
      const small = cropRect(fake(800, 1000), label.bbox);
      const large = cropRect(fake(3200, 4000), label.bbox);
      expect(Math.abs(small.x / 800 - large.x / 3200), `${label.field} x`).toBeLessThan(0.002);
      expect(Math.abs(small.y / 1000 - large.y / 4000), `${label.field} y`).toBeLessThan(0.002);
      expect(Math.abs(small.w / 800 - large.w / 3200), `${label.field} w`).toBeLessThan(0.002);
    }
  });

  it('a crop is clamped inside the page — a bad bbox never reads past the buffer', () => {
    const rect = cropRect(fake(100, 100), [0.9, 0.9, 0.5, 0.5]);
    expect(rect.x + rect.w).toBeLessThanOrEqual(100);
    expect(rect.y + rect.h).toBeLessThanOrEqual(100);
  });

  it('rendering the same bytes twice produces the same page geometry', () => {
    const a = render('dev-pill-01');
    const b = render('dev-pill-01');
    expect(pages(a).map((p) => [p.page, p.widthPx, p.heightPx])).toEqual(
      pages(b).map((p) => [p.page, p.widthPx, p.heightPx]),
    );
  });
});

describe('B2 · the rendered-page lifecycle and the slice-6 OCR seam', () => {
  it('attempt staging is lease-scoped and unreachable from a user path', () => {
    const key = renderStagingKey('c1', 'a1', 'lease-9', 3);
    expect(key).toContain('lease-9');
    expect(key.startsWith('render/attempt/')).toBe(true);
  });

  it('a promoted page is per-arrival and write-once — no lease in the key', () => {
    const key = promotedPageKey('c1', 'a1', 3);
    expect(key).not.toContain('lease');
    expect(promotedPageKey('c1', 'a1', 3)).toBe(key);
  });

  it('slice 6 can add OCR text beside a promoted page without moving it', () => {
    // The slice-5 exit assertion (Q6's deferral must not force rework):
    // OCR text lands as a SIBLING of the page artifact, and citation
    // geometry is normalised against the page — so neither the stored
    // coordinates nor the promoted artifact changes when §6.9 arrives.
    const page = promotedPageKey('c1', 'a1', 3);
    const text = promotedPageTextKey('c1', 'a1', 3);
    expect(text).not.toBe(page);
    expect(text.startsWith(page.slice(0, page.lastIndexOf('.')))).toBe(true);
  });
});

// ============================================================================
// Round-16 R3/F-1 and R3/F-2 — the DECLARED-RESOLUTION trap.
//
// mupdf's image handler sizes a page as `pixels x 72 / declared_resolution`,
// and falls back to 96 dpi ONLY when the image declares no resolution at all.
// Every fixture in fixtures/g9 is density-free, so PT_PER_PX = 0.75 looked
// like a law of the image path. It is the fallback.
//
// Two consequences, both invisible to a density-free corpus:
//   1 · a 300-dpi scan reports 617x824 of "declared geometry" for a 1928x2576
//       source, so `nativeLong` collapses and the page renders BELOW the
//       standard tier - outcome `rendered`, no ceiling fired, nothing logged.
//       §6.3 says a photo is never downsampled; this downsamples it 3.1x.
//   2 · the same number gates `page_dimensions`, so the effective ceiling
//       scales as 80 Mpx x (dpi/96)^2 and a declared-600-dpi pixel bomb walks
//       through a guard built to refuse it.
//
// These fixtures are built HERE rather than added to fixtures/g9, because the
// corpus is generated from a spec table and its manifest is asserted to BE the
// corpus (tests/eval/corpus.test.ts). A density header spliced onto corpus
// bytes at test time keeps that invariant intact.
// ============================================================================
function withJfifDensity(bytes: Uint8Array, dpi: number): Uint8Array {
  // A JFIF APP0 declaring `dpi` in both axes, spliced directly after SOI.
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write('JFIF\0', 4, 'latin1');
  app0[9] = 1; // major
  app0[10] = 2; // minor
  app0[11] = 1; // units = dots per inch
  app0.writeUInt16BE(dpi, 12);
  app0.writeUInt16BE(dpi, 14);
  return Buffer.concat([Buffer.from(bytes.subarray(0, 2)), app0, Buffer.from(bytes.subarray(2))]);
}

describe('R3/F-1 · a declared resolution must not change the rendered tier', () => {
  const item = corpusItem('dev-pill-01');
  const native = readCorpusFile(item);

  it('the density-free fixture renders at the high tier (the property today)', () => {
    const page = pages(normalizeArrival(native, 'image/jpeg'))[0];
    expect(longEdge(page)).toBe(HIGH_LONG_EDGE);
  });

  it.each([72, 150, 300, 600])(
    'the SAME pixels tagged %i dpi still render at the high tier',
    (dpi) => {
      const result = normalizeArrival(withJfifDensity(native, dpi), 'image/jpeg');
      expect(result.outcome).toBe('rendered');
      const page = pages(result)[0];
      // §6.3: a photo is rendered at the high tier and NEVER downsampled.
      // The stored pixels are identical in every case; only the header moved.
      expect(longEdge(page)).toBe(HIGH_LONG_EDGE);
    },
  );
});

// ============================================================================
// B1 — the rasterizer swap rides two owed findings whose home is the swap
// because the swap is where they are cheap (slice-6 plan B1).
//
// R2/F-8 · the output ceiling and the provider's request ceiling were never
// in the same argument: `maxRenderedBytes` was 64 MiB while the Messages API
// accepts 32 MB per request and inline base64 inflates every byte by 4/3 —
// so a render between ~24 MB and 64 MB passed OUR ceiling and died at the
// provider's, where it was then mislabelled by the retry machinery (R2/F-5).
// The bound is DERIVED here, not asserted: encoded output × 4/3, plus a
// reserve for the text layer, prompts, schema and JSON framing, must fit the
// request the pages actually ride in.
//
// R3/F-5 · `wall_clock` was a SAMPLE, not a deadline: consulted between
// pages, never after the last one, so a clock that crossed the budget during
// the final page's render still returned `rendered` — and the only test
// passed `maxWallClockMs: 0`, which trips the very first sample and cannot
// tell a deadline from a sample. The scripted clock below stays inside the
// budget until the last pre-render check an interval sampler would make, then
// jumps past it: a sampler answers `rendered`, a deadline refuses.
// ============================================================================
describe('R2/F-8 · maxRenderedBytes is derived from the provider request limit', () => {
  it('base64-inflated pages plus the request overhead reserve fit inside 32 MiB', () => {
    const API_REQUEST_LIMIT_BYTES = 32 * 1024 * 1024;
    const REQUEST_OVERHEAD_RESERVE_BYTES = 4 * 1024 * 1024;
    expect(Math.ceil((RENDER_CEILINGS.maxRenderedBytes * 4) / 3)).toBeLessThanOrEqual(
      API_REQUEST_LIMIT_BYTES - REQUEST_OVERHEAD_RESERVE_BYTES,
    );
  });
});

describe('R3/F-5 · wall_clock is a DEADLINE, not a sample', () => {
  it('a clock that expires after the last pre-render sample still refuses', () => {
    // Scripted clock: within budget for the start stamp and the first
    // pre-render check, past the budget for every consultation after that.
    // The one-page photo is the hard case — after its single loop-top check
    // an interval sampler has nowhere left to look and answers `rendered`.
    let calls = 0;
    const budget = 90_000;
    const now = () => (++calls <= 2 ? 0 : budget + 1);
    const item = corpusItem('dev-pill-01');
    const result = normalizeArrival(readCorpusFile(item), corpusMime(item), {
      ceilings: { maxWallClockMs: budget },
      now,
    });
    expect(result).toEqual({ outcome: 'refused', reason: 'wall_clock' });
  });
});

describe('R3/F-2 · the page_dimensions ceiling reads STORED pixels, not declared points', () => {
  const bomb = readCorpusFile(corpusItem('dev-pixelbomb-01'));

  it('refuses the density-free bomb (the property today)', () => {
    const r = normalizeArrival(bomb, 'image/jpeg');
    expect(r).toMatchObject({ outcome: 'refused', reason: 'page_dimensions' });
  });

  it.each([300, 600, 1200])('refuses the SAME bomb tagged %i dpi', (dpi) => {
    const r = normalizeArrival(withJfifDensity(bomb, dpi), 'image/jpeg');
    // 30000x30000 stored pixels is 900 Mpx however the header describes it.
    expect(r).toMatchObject({ outcome: 'refused', reason: 'page_dimensions' });
  });
});
