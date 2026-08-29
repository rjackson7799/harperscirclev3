import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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
// B2 · §6.3 rendering, as rules-as-code (slice-5 plan B2; RND-01) — the same
// rules re-pinned across 6B B1's rasterizer swap (D24 ruling 1): `mupdf`
// (AGPL-3.0-or-later) out, `pdfjs-dist` (Apache-2.0) + `@napi-rs/canvas`
// (MIT) in, with this suite as the net the swap had to clear unchanged.
//
// The §6.3 table IS the test surface: born-digital PDFs go at the standard
// tier WITH their text layer; scans, phone photos, pill bottles and
// handwritten notes go at the HIGH tier and are never downsampled; email
// bodies are text first. The bounds are enforced BEFORE rendering, which is
// what makes "never dispatched by accident" true rather than hoped for.
//
// The rasterizer spike (scripts/spike/rasterizer-spike.mjs) established the
// replacement pair's facts, pinned here so they cannot regress silently:
//   · @napi-rs/canvas applies EXIF orientation AT DECODE, so the decoded
//     frame is the DISPLAYED frame — §6.4's citation space. The spike's
//     control (the same citations against the same pixels with the EXIF
//     segment stripped) proves the difference is load-bearing.
//   · pdfjs REFUSES a truncated PDF (InvalidPDFException) where mupdf
//     REPAIRED it — the inverse posture, recorded as it is (R7/F-3's
//     corrected bar), and either way never a crash.
//   · Skia carries no TIFF codec, so image/tiff exits unsupported_type — a
//     recorded delta from mupdf, which rendered TIFF.
// ============================================================================

function render(
  id: string,
  ceilings?: Partial<typeof RENDER_CEILINGS>,
): Promise<NormalizeResult> {
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
  it('born-digital PDF → page images PLUS the embedded text layer, standard tier', async () => {
    const result = await render('dev-discharge-01');
    expect(result.outcome).toBe('rendered');
    if (result.outcome !== 'rendered') return;
    expect(result.sourceClass).toBe('born_digital_pdf');
    expect(result.pages).toHaveLength(1);
    expect(longEdge(result.pages[0])).toBe(STANDARD_LONG_EDGE);
    // The text layer carries the characters; the image carries the geometry.
    expect(result.text).toContain('Riverbend Community Hospital');
    expect(result.text).toContain('500 mg');
  });

  it('scanned PDF → page images ONLY, high tier (no text layer to lean on)', async () => {
    const result = await render('dev-scanned-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(result.sourceClass).toBe('scanned_pdf');
    expect(longEdge(result.pages[0])).toBe(HIGH_LONG_EDGE);
    expect(result.text).toBeNull();
  });

  it('phone photo → high tier, and NEVER downsampled below the source', async () => {
    const result = await render('dev-eob-02');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(result.sourceClass).toBe('photo');
    expect(longEdge(result.pages[0])).toBe(HIGH_LONG_EDGE);
  });

  it('pill bottle and handwritten note → high, never downsampled', async () => {
    for (const id of ['dev-pill-01', 'dev-note-01']) {
      const result = await render(id);
      if (result.outcome !== 'rendered') throw new Error(`${id}: ${result.outcome}`);
      expect(longEdge(result.pages[0]), id).toBe(HIGH_LONG_EDGE);
      expect(longEdge(result.pages[0]), id).toBeGreaterThan(STANDARD_LONG_EDGE);
    }
  });

  it('email body → text first, WITH the rendered message as a second source (Q6)', async () => {
    // §6.3 row 4 AS WRITTEN: "Email body | Text, with the rendered message
    // as a second source." The as-built record truncated the row's second
    // half and the code matched the altered row — pages: [], so §6.4's crop
    // was unsatisfiable for the whole email class (ADR-0023 D12, R7/F-4).
    // Q6 SETTLED: RENDER the message.
    const result = await render('dev-email-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(result.sourceClass).toBe('email_text');
    expect(result.text).toContain('Northgate Medical Group');
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages[0].mime).toBe('image/png');
    expect(longEdge(result.pages[0])).toBe(STANDARD_LONG_EDGE);
    expect(result.pageCount).toBe(result.pages.length);
  });

  it('a born-digital page is never rendered at the high tier — resolution is a rule, not a setting', async () => {
    // §6.3: downsampling a born-digital PDF is free accuracy-wise because
    // the text layer carries the content; spending 3× the tokens on it is
    // exactly the wrong economy.
    const result = await render('dev-eob-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(longEdge(result.pages[0])).toBe(STANDARD_LONG_EDGE);
  });
});

describe('B2 · the honest normalize exits (§4.3)', () => {
  it('an encrypted PDF is needs_password, decided before any page loads', async () => {
    expect((await render('dev-encrypted-01')).outcome).toBe('needs_password');
  });

  it('undecodable bytes are unsupported_type', async () => {
    expect((await render('dev-unsupported-01')).outcome).toBe('unsupported_type');
  });

  it('a truncated PDF gets an honest verdict — refused or repaired, never a crash', async () => {
    // The engines answer this differently and the suite owns the posture
    // rather than inheriting it: mupdf REPAIRED this fixture; pdfjs REFUSES
    // it (InvalidPDFException → unsupported_type, the spike's leg 5). What
    // this pins is the §4.3 guarantee both satisfy: the worker survives and
    // the lease is never lost to a throw.
    const result = await render('dev-truncated-01');
    expect(['rendered', 'unsupported_type']).toContain(result.outcome);
  });

  it('TIFF is refused honestly — the replacement engine carries no TIFF codec', async () => {
    // A recorded delta from mupdf, which rendered TIFF (6B B1): sniffMime
    // still answers image/tiff, Skia has no codec for it, and the exit is
    // unsupported_type rather than a throw. The bytes below are a minimal
    // little-endian TIFF header — enough for the sniffer, nothing to decode.
    const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0, 0, 0]);
    expect((await normalizeArrival(tiff, 'image/tiff')).outcome).toBe('unsupported_type');
  });
});

describe('B2 · the ceilings abort BEFORE any provider dispatch', () => {
  it('page_count is bounded before rendering (PRD §13.3: 200 pages)', async () => {
    const result = await render('dev-pagebomb-01');
    expect(result).toEqual({ outcome: 'refused', reason: 'page_bound' });
  });

  it('a stored-geometry pixel bomb is refused on its header alone', async () => {
    const result = await render('dev-pixelbomb-01');
    expect(result).toEqual({ outcome: 'refused', reason: 'page_dimensions' });
  });

  it('the wall-clock ceiling is real — a zero budget refuses rather than runs', async () => {
    const result = await render('dev-pill-01', { maxWallClockMs: 0 });
    expect(result).toEqual({ outcome: 'refused', reason: 'wall_clock' });
  });

  it('the rendered-output ceiling is real — a one-byte budget refuses', async () => {
    const result = await render('dev-pill-01', { maxRenderedBytes: 1 });
    expect(result).toEqual({ outcome: 'refused', reason: 'output_size' });
  });

  it('the ceilings are stated as values, not buried as literals', () => {
    expect(RENDER_CEILINGS.maxPages).toBe(200);
    expect(RENDER_CEILINGS.maxPageMegapixels).toBeGreaterThan(0);
    expect(RENDER_CEILINGS.maxWallClockMs).toBeGreaterThan(0);
    expect(RENDER_CEILINGS.maxRenderedBytes).toBeGreaterThan(0);
  });

  it('the encoding is stated as values too, and the encode sites use them (R2/F-3)', async () => {
    // The names the identity hash covers…
    const { JPEG_CODEC, JPEG_QUALITY, PNG_CODEC } = await import('@/lib/pipeline/render');
    expect(JPEG_CODEC).toBe('jpeg');
    expect(JPEG_QUALITY).toBe(90);
    expect(PNG_CODEC).toBe('png');
    // …and no encode site carries its own literal beside them: a quality
    // edited at one site would otherwise leave the hash — and §6.10 — behind.
    const src = readFileSync(join(process.cwd(), 'lib/pipeline/render.ts'), 'utf8');
    expect(src).not.toMatch(/encode\(\s*'jpeg'\s*,\s*\d/);
    expect(src).not.toMatch(/encode\(\s*'png'\s*\)/);
    expect(src.match(/encode\(JPEG_CODEC, JPEG_QUALITY\)/g)?.length).toBe(2);
    expect(src.match(/encode\(PNG_CODEC\)/g)?.length).toBe(2);
  });
});

describe('B2 · EXIF orientation is normalised BEFORE geometry', () => {
  it('an angled phone photo renders in its DISPLAYED frame', async () => {
    // Stored 3024×2016 landscape, EXIF orientation 6. What a person sees —
    // and therefore what a citation is measured against — is 2016×3024.
    const result = await render('dev-angled-01');
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    const page = result.pages[0];
    expect(page.heightPx).toBeGreaterThan(page.widthPx);
    expect(longEdge(page)).toBe(HIGH_LONG_EDGE);
  });

  it("the corpus's displayed-frame citations land on their values", async () => {
    const item = corpusItem('dev-angled-01');
    const result = await render('dev-angled-01');
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

  it('rendering the same bytes twice produces the same page geometry', async () => {
    const a = await render('dev-pill-01');
    const b = await render('dev-pill-01');
    expect(pages(a).map((p) => [p.page, p.widthPx, p.heightPx])).toEqual(
      pages(b).map((p) => [p.page, p.widthPx, p.heightPx]),
    );
  });
});

describe('B2 · the rendered-page lifecycle and the slice-6 OCR seam', () => {
  it('attempt staging is lease-scoped and unreachable from a user path', () => {
    const key = renderStagingKey('c1', 'a1', 'lease-9', 3, 'png');
    expect(key).toContain('lease-9');
    expect(key.startsWith('render/attempt/')).toBe(true);
  });

  it('a promoted page is per-arrival, write-once, and its ext is REQUIRED — both extensions build, no default exists (R3/F-8)', () => {
    // 6B B2 (Q5): the old `'png'` default encoded the wrong answer for the
    // MAJORITY of arrivals — extFor returns 'jpg' for every photo and scan.
    // With `ext` required the wrong answer stops being expressible: the
    // extension comes from the 6A M4 manifest, a recorded fact.
    expect(promotedPageKey('c1', 'a1', 3, 'png')).toBe('render/circle/c1/arrival/a1/p003.png');
    expect(promotedPageKey('c1', 'a1', 3, 'jpg')).toBe('render/circle/c1/arrival/a1/p003.jpg');
    expect(promotedPageKey('c1', 'a1', 3, 'jpg')).not.toContain('lease');
  });

  it('slice 6 can add OCR text beside a promoted page without moving it', () => {
    // The slice-5 exit assertion (Q6's deferral must not force rework):
    // OCR text lands as a SIBLING of the page artifact, and citation
    // geometry is normalised against the page — so neither the stored
    // coordinates nor the promoted artifact changes when §6.9 arrives.
    const page = promotedPageKey('c1', 'a1', 3, 'png');
    const text = promotedPageTextKey('c1', 'a1', 3);
    expect(text).not.toBe(page);
    expect(text.startsWith(page.slice(0, page.lastIndexOf('.')))).toBe(true);
  });
});

// ============================================================================
// Round-16 R3/F-1 and R3/F-2 — the DECLARED-RESOLUTION trap, held closed
// across the engine swap.
//
// Under mupdf the trap was a fallback: the image handler sized a page as
// `pixels x 72 / declared_resolution`, so a density TAG changed the declared
// geometry — a 300-dpi scan reported 617x824 for a 1928x2576 source, rendered
// below the standard tier with outcome `rendered`, and the same number gated
// `page_dimensions` so a declared-600-dpi bomb walked through the ceiling.
// Under the replacement engine no resolution proxy exists for a raster AT
// ALL: the ceiling reads TRUE STORED pixels from the file's own header, and
// the tier reads the decoder's pixel dimensions. These cases hold the door
// shut whatever engine sits behind the module.
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

  it('the density-free fixture renders at the high tier (the property today)', async () => {
    const page = pages(await normalizeArrival(native, 'image/jpeg'))[0];
    expect(longEdge(page)).toBe(HIGH_LONG_EDGE);
  });

  it.each([72, 150, 300, 600])(
    'the SAME pixels tagged %i dpi still render at the high tier',
    async (dpi) => {
      const result = await normalizeArrival(withJfifDensity(native, dpi), 'image/jpeg');
      expect(result.outcome).toBe('rendered');
      const page = pages(result)[0];
      // §6.3: a photo is rendered at the high tier and NEVER downsampled.
      // The stored pixels are identical in every case; only the header moved.
      expect(longEdge(page)).toBe(HIGH_LONG_EDGE);
    },
  );
});

describe('R3/F-2 · the page_dimensions ceiling reads STORED pixels, not declared points', () => {
  const bomb = readCorpusFile(corpusItem('dev-pixelbomb-01'));

  it('refuses the density-free bomb (the property today)', async () => {
    const r = await normalizeArrival(bomb, 'image/jpeg');
    expect(r).toMatchObject({ outcome: 'refused', reason: 'page_dimensions' });
  });

  it.each([300, 600, 1200])('refuses the SAME bomb tagged %i dpi', async (dpi) => {
    const r = await normalizeArrival(withJfifDensity(bomb, dpi), 'image/jpeg');
    // 30000x30000 stored pixels is 900 Mpx however the header describes it.
    expect(r).toMatchObject({ outcome: 'refused', reason: 'page_dimensions' });
  });
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
// jumps past it: a sampler answers `rendered`, a deadline refuses. In-flight
// renders are additionally raced and CANCELLED at the deadline
// (lib/pipeline/render.ts renderPageWithDeadline), so a slow page cannot
// overrun the budget un-interrupted.
// ============================================================================
// ============================================================================
// B2 — the email rendition (Q6 SETTLED: RENDER the message, honouring §6.3
// row 4 as written). The live email-body arrival is the inbound webhook's
// JSON ENVELOPE — {subject, from, text_body, html_body, headers} staged as
// application/json — which until this unit dead-ended at unsupported_type
// (magicFor knew no JSON), so the product's primary intake channel had no
// rendering to cite AT ALL. The CHANNEL is the discriminator: an email-body
// envelope renders; a member-uploaded .json stays unsupported_type.
//
// THE SAFETY COST IS A UNIT, NOT A FOOTNOTE (PRD §4.2.8): the rendition is
// produced from a sanitised, resource-free document — no remote fetch of any
// kind (images, stylesheets, fonts, srcset, @import), no script execution,
// no redirect following, byte and page ceilings before any parse. A network
// call attempted during an email render is a TEST FAILURE, asserted below.
// ============================================================================
function envelope(over: Record<string, unknown> = {}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      subject: 'Discharge paperwork',
      from: 'frontdesk@cardiology-example.org',
      message_id: 'probe-1',
      text_body: 'Amoxicillin 500 mg twice daily.\nCall the front desk with questions.',
      html_body: '',
      headers: [],
      ...over,
    }),
  );
}

describe('B2 · the email rendition — sanitised, resource-free (Q6; PRD §4.2.8)', () => {
  it('the inbound JSON envelope renders on the email channel', async () => {
    const result = await normalizeArrival(envelope(), 'application/json', { channel: 'email' });
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(result.sourceClass).toBe('email_text');
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages[0].mime).toBe('image/png');
    expect(longEdge(result.pages[0])).toBe(STANDARD_LONG_EDGE);
    // The text source carries the message the rendition shows.
    expect(result.text).toContain('Amoxicillin 500 mg twice daily.');
    expect(result.text).toContain('Discharge paperwork');
  });

  it('the SAME bytes on the upload channel stay unsupported_type — a .json file is not an email', async () => {
    const result = await normalizeArrival(envelope(), 'application/json', { channel: 'upload' });
    expect(result.outcome).toBe('unsupported_type');
  });

  it('a network call attempted during an email render is a TEST FAILURE (PRD §4.2.8)', async () => {
    const http = (await import('node:http')).default;
    const https = (await import('node:https')).default;
    const spies = [
      vi.spyOn(globalThis, 'fetch'),
      vi.spyOn(http, 'request'),
      vi.spyOn(http, 'get'),
      vi.spyOn(https, 'request'),
      vi.spyOn(https, 'get'),
    ];
    try {
      const hostile = envelope({
        text_body: '',
        html_body:
          '<html><head><link rel="stylesheet" href="https://evil.example/x.css">' +
          "<style>@import url('https://evil.example/i.css'); " +
          "@font-face { font-family: e; src: url('https://evil.example/f.woff2'); }</style></head>" +
          '<body><script src="https://evil.example/s.js"></script>' +
          '<img src="https://evil.example/pixel.png" srcset="https://evil.example/2x.png 2x">' +
          '<p>Amoxicillin <b>500 mg</b> twice daily &amp; with food.</p>' +
          '<a href="https://evil.example/redirect">click here</a></body></html>',
      });
      const result = await normalizeArrival(hostile, 'application/json', { channel: 'email' });
      expect(result.outcome).toBe('rendered');
      if (result.outcome !== 'rendered') return;
      expect(result.pages.length).toBeGreaterThan(0);
      // Sanitised: the CONTENT survives with entities decoded…
      expect(result.text).toContain('Amoxicillin 500 mg twice daily & with food.');
      // …the link is INERT — its target shown as plain text, never resolved…
      expect(result.text).toContain('click here');
      // …and no markup, style or script machinery leaks into the rendition.
      expect(result.text).not.toMatch(/@import|font-face|<script|<style|<img|srcset/);
      // The whole point, asserted: NOTHING reached for the network.
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('the rendition carries the message as INK, not an empty page', async () => {
    const result = await normalizeArrival(envelope(), 'application/json', { channel: 'email' });
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    const { loadImage, createCanvas } = await import('@napi-rs/canvas');
    const img = await loadImage(Buffer.from(result.pages[0].bytes));
    const canvas = createCanvas(img.width, img.height);
    const cx = canvas.getContext('2d');
    cx.drawImage(img, 0, 0);
    // Measure the band the header and first body lines occupy — a short
    // message on a full page is overwhelmingly white, so the whole-page
    // mean cannot discriminate ink from blank.
    const data = cx.getImageData(0, 0, img.width, 400).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    const mean = sum / (data.length / 4);
    expect(mean).toBeLessThan(253); // ink present in the message band
    expect(mean).toBeGreaterThan(180); // …on a mostly-light page, not a black box
  });

  it('a long message paginates, and the pages number themselves 1..n', async () => {
    const body = Array.from({ length: 140 }, (_, i) => `Line ${i + 1} of the long message.`).join(
      '\n',
    );
    const result = await normalizeArrival(envelope({ text_body: body }), 'application/json', {
      channel: 'email',
    });
    if (result.outcome !== 'rendered') throw new Error(result.outcome);
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages.map((p) => p.page)).toEqual(result.pages.map((_, i) => i + 1));
    expect(result.pageCount).toBe(result.pages.length);
  });

  it('the body byte ceiling refuses BEFORE any parse — §4.6 carried to message rendering', async () => {
    const result = await normalizeArrival(
      envelope({ text_body: 'x'.repeat(700_000) }),
      'application/json',
      { channel: 'email' },
    );
    expect(result).toEqual({ outcome: 'refused', reason: 'page_bound' });
  });

  it('rendering the same envelope twice produces the same page geometry', async () => {
    const a = await normalizeArrival(envelope(), 'application/json', { channel: 'email' });
    const b = await normalizeArrival(envelope(), 'application/json', { channel: 'email' });
    expect(pages(a).map((p) => [p.page, p.widthPx, p.heightPx])).toEqual(
      pages(b).map((p) => [p.page, p.widthPx, p.heightPx]),
    );
  });
});

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
  it('a clock that expires after the last pre-render sample still refuses', async () => {
    // Scripted clock: within budget for the start stamp and the first
    // pre-render check, past the budget for every consultation after that.
    // The one-page photo is the hard case — after its single loop-top check
    // an interval sampler has nowhere left to look and answers `rendered`.
    let calls = 0;
    const budget = 90_000;
    const now = () => (++calls <= 2 ? 0 : budget + 1);
    const item = corpusItem('dev-pill-01');
    const result = await normalizeArrival(readCorpusFile(item), corpusMime(item), {
      ceilings: { maxWallClockMs: budget },
      now,
    });
    expect(result).toEqual({ outcome: 'refused', reason: 'wall_clock' });
  });
});
