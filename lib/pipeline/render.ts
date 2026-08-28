import 'server-only';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas, loadImage, type Canvas, type Image } from '@napi-rs/canvas';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/**
 * §6.3 rendering, as rules-as-code (slice-5 plan B2; RND-01; TSD §6.3, §6.4,
 * §4.3's normalize row; PRD §13.3) — migrated off `mupdf` (AGPL-3.0-or-later)
 * to `pdfjs-dist` (Apache-2.0) + `@napi-rs/canvas` (MIT) at 6B B1, per D24
 * ruling 1. The rules are unchanged; the engine under them is not, and every
 * behavioural delta is recorded in the spike
 * (scripts/spike/rasterizer-spike.mjs) and pinned in the suite.
 *
 * Arrivals are normalised to **page images** before extraction, because a
 * citation must resolve to a region a person can see. The table is the rule,
 * not a global setting:
 *
 *   | Source                          | Rendered as              | Long edge |
 *   |---------------------------------|--------------------------|-----------|
 *   | born-digital PDF                | page images + text layer | 1568      |
 *   | scanned PDF, photo, pill bottle | page images only         | 2576      |
 *   | email body                      | text, with the rendered  | 1568      |
 *   |                                 | message as a 2nd source  |           |
 *
 * Resolution is a cost lever with a floor in both directions. Downsampling a
 * born-digital PDF is free — the text layer carries the characters — while
 * downsampling a phone photo of a pill bottle is exactly the wrong economy.
 * So `born_digital_pdf` is never rendered high, and `photo`/`scanned_pdf`
 * are never rendered below high.
 *
 * **The bounds are enforced before rendering, not after** (§6.3): 200
 * high-resolution pages is close to a million input tokens and must never be
 * dispatched by accident. A PDF's page count answers from the xref before a
 * single page object loads; a raster's true stored geometry answers from its
 * own header (`storedPixels`) before a single scanline is decoded — which is
 * what makes "abort BEFORE any provider dispatch" a property of this code
 * path rather than an ordering someone has to remember.
 *
 * **The orientation door stays shut** (round-16 D2; the spike's legs 7–8).
 * §6.4's citation space is the page as a person SEES it. `@napi-rs/canvas`
 * applies the EXIF orientation tag at decode, so the decoded frame IS the
 * displayed frame; the spike's control (the same citations against the same
 * pixels with the EXIF segment stripped: mean 37.0 vs 220.0) proves that is
 * load-bearing, and the dev-angled-01 cases in tests/pipeline/render.test.ts
 * pin it against regression.
 *
 * **The memory bound counts what actually grows** (round-16 R3/F-4, re-priced
 * for this engine). Per page, the allocations are the source decode — refused
 * BEFORE decode by `maxPageMegapixels` — and the canvas raster, capped by the
 * tier at ≤ 2576² × 4 bytes and freed with the canvas. What accumulates
 * page-over-page is the ENCODED output held for dispatch, and
 * `maxRenderedBytes` bounds exactly that — derived below from the provider
 * request the pages ride in (R2/F-8), so our ceiling and the API's can no
 * longer disagree. Teardown is deterministic: the loading task is destroyed
 * in a `finally`, and each page is cleaned up after its encode.
 *
 * Nothing here touches storage. The worker owns the attempt-staging,
 * GC-on-non-advance and promote-on-advance lifecycle (lib/storage/artifacts),
 * so this module stays a pure function of bytes → outcome and is testable
 * without a bucket.
 */

export type SourceClass = 'born_digital_pdf' | 'scanned_pdf' | 'photo' | 'email_text';

/** §6.3's two tiers, in pixels on the long edge. */
export const STANDARD_LONG_EDGE = 1568;
export const HIGH_LONG_EDGE = 2576;

/**
 * R2/F-8 — the output ceiling is DERIVED from the request that consumes it,
 * not asserted beside it. Rendered pages ride ONE Messages request as inline
 * base64 (§6.2 forbids the Files API), the API accepts 32 MB per request,
 * and base64 inflates every byte by 4/3 — so a 64 MiB output ceiling was
 * accepting renders the provider was guaranteed to refuse, which the retry
 * machinery then mislabelled (R2/F-5). The reserve leaves room for what else
 * rides the same request: the text layer, the prompts, the schema and the
 * JSON framing.
 */
export const API_REQUEST_LIMIT_BYTES = 32 * 1024 * 1024;
export const BASE64_INFLATION = 4 / 3;
export const REQUEST_OVERHEAD_RESERVE_BYTES = 4 * 1024 * 1024;

/**
 * The explicit ceilings. Stated as values so a reviewer can read the budget
 * without reading the loop, and so a caller can tighten them (the eval
 * harness and the p95 bench both do).
 */
export type RenderCeilings = {
  maxPages: number;
  maxPageMegapixels: number;
  maxWallClockMs: number;
  maxRenderedBytes: number;
};

export const RENDER_CEILINGS: RenderCeilings = {
  /** PRD §13.3. Checked from the document's own page count, before a single
   *  page object loads. */
  maxPages: 200,
  /**
   * The page-dimension ceiling, in megapixels of TRUE STORED geometry. 80 Mpx
   * is ~5× a 16 Mpx phone photo and ~11× a 2576-long-edge render, so real
   * material clears it comfortably while a decompression bomb — 900 Mpx
   * declared behind a few hundred bytes — does not.
   */
  maxPageMegapixels: 80,
  /** The whole normalize step's wall clock, budgeted inside the stage's —
   *  a DEADLINE, not a sample (R3/F-5): checked before each page, raced
   *  against the in-flight render, and consulted after the final page. */
  maxWallClockMs: 90_000,
  /** The accumulated encoded-output ceiling, derived from the provider
   *  request limit above (R2/F-8): 21 MiB, which base64-inflates to exactly
   *  the 28 MiB the reserve leaves inside the API's 32 MB. */
  maxRenderedBytes: Math.floor(
    (API_REQUEST_LIMIT_BYTES - REQUEST_OVERHEAD_RESERVE_BYTES) / BASE64_INFLATION,
  ),
};

export type RenderedPage = {
  /** 1-indexed, matching §6.4's `{page, bbox}` citation geometry. */
  page: number;
  widthPx: number;
  heightPx: number;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
};

export type RefusalReason = 'page_bound' | 'page_dimensions' | 'wall_clock' | 'output_size';

export type NormalizeResult =
  | {
      outcome: 'rendered';
      sourceClass: SourceClass;
      pageCount: number;
      pages: RenderedPage[];
      /** The embedded text layer, or null when there is none to lean on. */
      text: string | null;
    }
  | { outcome: 'needs_password' }
  | { outcome: 'unsupported_type' }
  | { outcome: 'refused'; reason: RefusalReason };

export type NormalizeOptions = {
  ceilings?: Partial<RenderCeilings>;
  /** Injectable clock, so the wall-clock ceiling is testable without waiting. */
  now?: () => number;
  /**
   * The arrival's channel (6B B2, Q6). The inbound webhook stages an email
   * BODY as a JSON envelope under application/json, and CONTENT cannot tell
   * that envelope from a member-uploaded .json file — the channel can. Only
   * `email` unlocks the envelope path; everything else keeps §4.6's honest
   * unsupported_type for JSON bytes.
   */
  channel?: 'email' | 'upload' | null;
};

/**
 * A PDF page's points → pixels at 96 dpi. This proxy is used ONLY for PDF
 * pages, whose points are real typographic points and which carry no stored
 * raster at all. A raster NEVER goes through it: its true stored dimensions
 * are read from its own header (`storedPixels`) before any decode, and its
 * displayed frame comes from the decoder — the round-16 R3/F-1 lesson (a
 * 300-dpi scan must never report 617×824 of "declared geometry" and render
 * below its own resolution) holds by construction, not by fallback.
 */
const PT_PER_PX = 0.75;

/**
 * How much text makes a PDF "born-digital". A scanned page has none; a
 * born-digital page has hundreds of characters. The threshold is deliberately
 * low and sampled over the first few pages: a cover sheet with a stamped
 * header must not make a 60-page scan look born-digital, and a mostly-image
 * report with real text must not be starved of its text layer.
 */
const TEXT_LAYER_MIN_CHARS = 40;
const TEXT_LAYER_SAMPLE_PAGES = 3;

function magicFor(mime: string): string | null {
  if (mime === 'application/pdf') return 'application/pdf';
  if (mime === 'image/jpeg') return 'image/jpeg';
  if (mime === 'image/png') return 'image/png';
  if (mime === 'image/gif') return 'image/gif';
  // image/tiff stays sniffable upstream, but Skia carries no TIFF codec, so
  // the decode below refuses it and the honest exit is unsupported_type — a
  // recorded delta from mupdf, which rendered TIFF (pinned in the suite).
  if (mime === 'image/tiff') return 'image/tiff';
  return null;
}

function isTextual(mime: string): boolean {
  return mime === 'text/plain' || mime === 'text/html' || mime === 'message/rfc822';
}

/**
 * The TRUE stored pixel dimensions of a raster, read from its header — before
 * any decode, which is what makes the ceilings a property of the code path
 * rather than an ordering someone has to remember (the spike's legs 2/6/7).
 *
 * The header reports the STORED frame with EXIF untouched — the right frame
 * for a pre-decode ceiling, because orientation swaps the axes and cannot
 * change the pixel product. The DISPLAYED frame (§6.4's citation space) comes
 * from the decoder, which applies the orientation tag.
 *
 * Returns null for a container this cannot read (TIFF, and anything else),
 * in which case the decoder's own answer is checked instead, still before
 * any drawing.
 */
function storedPixels(bytes: Uint8Array, mime: string): { w: number; h: number } | null {
  const b = bytes;
  if (mime === 'image/png') {
    // IHDR is fixed at offset 16: width, height, big-endian u32.
    if (b.length < 24) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (mime === 'image/gif') {
    // Logical screen descriptor at offset 6: width, height, little-endian u16.
    if (b.length < 10) return null;
    return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  }
  if (mime !== 'image/jpeg') return null;
  // Walk the segment table to the frame header. SOF0..SOF15 carry the real
  // dimensions; C4 (DHT), C8 (JPG) and CC (DAC) share the range and do not.
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    if (marker === 0xda) return null; // scan data: no frame header found
    i += 2 + len;
  }
  return null;
}

/**
 * pdfjs-dist, loaded lazily and once. The legacy build is the library's own
 * supported entry for Node (the modern build warns and defers to it); it
 * auto-wires `@napi-rs/canvas` as its canvas factory. Resource directories
 * (standard-14 font metrics, CJK cmaps, the JPX/JBIG2 wasm codecs, ICC
 * profiles) are resolved from the installed package so a document that needs
 * them renders the same here, in the worker and in the eval harness.
 */
type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsLoad: Promise<PdfjsModule> | null = null;
function pdfjs(): Promise<PdfjsModule> {
  pdfjsLoad ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsLoad;
}

const nodeRequire = createRequire(import.meta.url);
let openDefaultsCache: Record<string, unknown> | null = null;
function pdfOpenDefaults(): Record<string, unknown> {
  if (!openDefaultsCache) {
    const root = path.dirname(nodeRequire.resolve('pdfjs-dist/package.json'));
    // The Node binary-data factory reads `baseUrl + filename` with fs, so
    // each base needs its trailing slash.
    const dir = (name: string) => path.join(root, name).replace(/\\/g, '/') + '/';
    openDefaultsCache = {
      verbosity: 0,
      standardFontDataUrl: dir('standard_fonts'),
      cMapUrl: dir('cmaps'),
      cMapPacked: true,
      wasmUrl: dir('wasm'),
      iccUrl: dir('iccs'),
    };
  }
  return openDefaultsCache;
}

/**
 * One page rendered under a real deadline (R3/F-5). The render is raced
 * against the time remaining and CANCELLED when it loses — an in-flight
 * page can no longer overrun the budget un-interrupted, which is what
 * distinguishes a deadline from a sample.
 */
async function renderPageWithDeadline(
  page: PDFPageProxy,
  scale: number,
  remainingMs: number,
): Promise<{ canvas: Canvas } | 'timeout' | 'failed'> {
  if (remainingMs <= 0) return 'timeout';
  const viewport = page.getViewport({ scale });
  const canvas: Canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const renderTask = page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const winner = await Promise.race([
      renderTask.promise.then(() => 'done' as const),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), remainingMs);
      }),
    ]);
    if (winner === 'timeout') {
      renderTask.cancel();
      await renderTask.promise.catch(() => {});
      return 'timeout';
    }
    return { canvas };
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

export async function normalizeArrival(
  bytes: Uint8Array,
  mime: string,
  options: NormalizeOptions = {},
): Promise<NormalizeResult> {
  const ceilings: RenderCeilings = { ...RENDER_CEILINGS, ...(options.ceilings ?? {}) };
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const outOfTime = () => now() - startedAt >= ceilings.maxWallClockMs;
  const remaining = () => ceilings.maxWallClockMs - (now() - startedAt);

  // §6.3 row 4 AS WRITTEN (Q6 SETTLED at 6B): "Email body | Text, with the
  // rendered message as a SECOND SOURCE." Text stays first; the sanitised,
  // resource-free rendition gives §6.4's crop something to resolve to for
  // the product's primary intake channel. The §4.6 bounded posture carries
  // over: the body byte ceiling refuses BEFORE any parse.
  if (isTextual(mime)) {
    if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
    if (bytes.byteLength > EMAIL_BODY_MAX_BYTES) {
      return { outcome: 'refused', reason: 'page_bound' };
    }
    const text = new TextDecoder().decode(bytes);
    return renderEmailMessage(text, ceilings, outOfTime);
  }

  // The email-body ENVELOPE — {subject, from, text_body, html_body} staged
  // by the inbound webhook as application/json. Channel-gated (see
  // NormalizeOptions.channel): a member-uploaded .json is not an email.
  if (mime === 'application/json' && options.channel === 'email') {
    if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
    if (bytes.byteLength > EMAIL_BODY_MAX_BYTES) {
      return { outcome: 'refused', reason: 'page_bound' };
    }
    const envelope = parseEmailEnvelope(bytes);
    if (!envelope) return { outcome: 'unsupported_type' };
    return renderEmailMessage(envelope, ceilings, outOfTime);
  }

  const magic = magicFor(mime);
  if (!magic) return { outcome: 'unsupported_type' };
  if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };

  if (magic !== 'application/pdf') {
    return normalizeImage(bytes, magic, ceilings, outOfTime);
  }

  const lib = await pdfjs();
  let task: PDFDocumentLoadingTask;
  let doc: PDFDocumentProxy;
  try {
    // The bytes are copied because getDocument takes ownership of the buffer
    // it is handed; the caller's copy must stay intact for sniffing and
    // staging.
    task = lib.getDocument({ data: new Uint8Array(bytes), ...pdfOpenDefaults() });
    doc = await task.promise;
  } catch (err) {
    // §4.3 normalize: encrypted → needs_password, decided before any page
    // loads — pdfjs refuses at open with a NAMED exception, not a string.
    if ((err as Error).name === 'PasswordException') return { outcome: 'needs_password' };
    // §4.3: undecodable bytes are unsupported_type — an honest state, not a
    // failure. pdfjs REFUSES malformed input it cannot parse (the spike's
    // leg 5: the inverse of mupdf's repair posture, recorded as it is).
    return { outcome: 'unsupported_type' };
  }

  try {
    const pageCount = doc.numPages;
    // PRD §13.3, enforced BEFORE any page object loads.
    if (pageCount > ceilings.maxPages) return { outcome: 'refused', reason: 'page_bound' };
    if (pageCount < 1) return { outcome: 'unsupported_type' };

    // The text layer decides born-digital vs scanned, and it is sampled from
    // the first few pages so the decision costs a fixed amount on a long scan.
    let text: string | null = null;
    {
      let sampled = '';
      const sampleTo = Math.min(pageCount, TEXT_LAYER_SAMPLE_PAGES);
      for (let i = 0; i < sampleTo; i++) {
        if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
        sampled += await pageText(doc, i + 1);
      }
      if (sampled.trim().length >= TEXT_LAYER_MIN_CHARS) {
        let whole = sampled;
        for (let i = sampleTo; i < pageCount; i++) {
          if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
          whole += await pageText(doc, i + 1);
        }
        text = whole;
      }
    }

    const sourceClass: SourceClass = text === null ? 'scanned_pdf' : 'born_digital_pdf';
    const tier = sourceClass === 'born_digital_pdf' ? STANDARD_LONG_EDGE : HIGH_LONG_EDGE;
    // PNG for born-digital pages (text and line art: lossless and small);
    // JPEG for continuous-tone sources, where PNG is pathological. Neither
    // choice touches geometry — the pixel dimensions are the same either way.
    const asPng = sourceClass === 'born_digital_pdf';

    const pages: RenderedPage[] = [];
    let renderedBytes = 0;

    for (let i = 0; i < pageCount; i++) {
      if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };

      let page: PDFPageProxy;
      try {
        page = await doc.getPage(i + 1);
      } catch {
        return { outcome: 'unsupported_type' };
      }

      // The page-dimension ceiling, on the page's own geometry — before the
      // renderer allocates anything. A PDF page has no stored raster, so
      // points at 96 dpi remain the honest proxy.
      const vp = page.getViewport({ scale: 1 });
      const declaredW = vp.width / PT_PER_PX;
      const declaredH = vp.height / PT_PER_PX;
      if ((declaredW * declaredH) / 1e6 > ceilings.maxPageMegapixels) {
        return { outcome: 'refused', reason: 'page_dimensions' };
      }
      if (!(declaredW > 0) || !(declaredH > 0)) return { outcome: 'unsupported_type' };

      const scale = tier / Math.max(vp.width, vp.height);
      const rendered = await renderPageWithDeadline(page, scale, remaining());
      if (rendered === 'timeout') return { outcome: 'refused', reason: 'wall_clock' };
      if (rendered === 'failed') return { outcome: 'unsupported_type' };

      const { canvas } = rendered;
      let encoded: Uint8Array;
      try {
        encoded = new Uint8Array(
          asPng ? await canvas.encode('png') : await canvas.encode('jpeg', 90),
        );
      } catch {
        return { outcome: 'unsupported_type' };
      }
      page.cleanup();

      renderedBytes += encoded.byteLength;
      if (renderedBytes > ceilings.maxRenderedBytes) {
        return { outcome: 'refused', reason: 'output_size' };
      }
      // The deadline is consulted AFTER each page too, the last included —
      // a clock that expires mid-render refuses instead of shipping (R3/F-5).
      if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };

      pages.push({
        page: i + 1,
        widthPx: canvas.width,
        heightPx: canvas.height,
        mime: asPng ? 'image/png' : 'image/jpeg',
        bytes: encoded,
      });
    }

    return { outcome: 'rendered', sourceClass, pageCount, pages, text };
  } finally {
    // Deterministic teardown (R3/F-4): the task owns the document, the fake
    // worker and every page cache; destroying it frees them whatever path
    // returned above.
    await task.destroy().catch(() => {});
  }
}

/** One page's embedded text, joined so words keep their spacing and lines
 *  their breaks. A page whose text cannot be read contributes nothing; the
 *  render is still attempted, which is the §6.8 honest-limits posture. */
async function pageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  try {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    let out = '';
    for (const item of content.items) {
      if ('str' in item) out += item.str + (item.hasEOL ? '\n' : ' ');
    }
    return out;
  } catch {
    return '';
  }
}

// ----------------------------------------------------------------------------
// The email rendition (6B B2; Q6 SETTLED: RENDER, honouring §6.3 row 4 as
// written; PRD §4.2.8's inert-links rule carried to rendering).
//
// SANITISED AND RESOURCE-FREE BY CONSTRUCTION: the message is reduced to
// TEXT — scripts, styles and comments deleted; tags stripped; entities
// decoded AFTER stripping so nothing re-parses; an anchor keeps its text
// with its target shown inert in parentheses, never fetched, never resolved
// for a title — and the text is drawn as glyphs onto a canvas. There is no
// HTML engine, no resource loader and no code path that can reach the
// network; tests/pipeline/render.test.ts asserts an attempted network call
// as a FAILURE rather than trusting this comment.
//
// The page is the standard tier in portrait-letter proportions (1212×1568 —
// the same frame a born-digital PDF page renders at), PNG like every other
// text page, paginated under the SAME named ceilings as documents: the body
// byte ceiling before any parse (§4.6), maxPages on the wrapped line count
// before any drawing, maxRenderedBytes on the encoded output, the wall
// clock consulted between and after pages.
// ----------------------------------------------------------------------------

/** The §4.6 bounded posture for message bodies: refused before any parse.
 *  512 KiB of TEXT is ~150 rendered pages — far beyond any real mail body
 *  and comfortably under the page bound's own arithmetic. */
export const EMAIL_BODY_MAX_BYTES = 512 * 1024;

const EMAIL_PAGE_W = 1212;
const EMAIL_PAGE_H = 1568;
const EMAIL_MARGIN = 96;
const EMAIL_FONT_PX = 28;
const EMAIL_LINE_H = 40;

/**
 * The email rendition's LAYOUT, exported (round 21; ADR-0023 D26).
 *
 * §6.4's citation space is the rendered page, so a label that claims a region
 * of an email rendition is claiming something about THESE numbers. Until this
 * export existed the G9 corpus carried its own guess at them — line-fraction
 * boxes over a notional page that WAS the text block — and the guess was
 * wrong on every one of the twenty-three email labels: a perfect reader landed
 * none of them, which put `provider`, `appointment_date` and
 * `appointment_time` under `CITATION_FLOOR` by arithmetic alone.
 *
 * The corpus builder cannot import this module (it is plain ESM, this is TS
 * behind `server-only`), so it necessarily restates the arithmetic. What makes
 * that safe is that `tests/eval/corpus.test.ts` computes the true bands FROM
 * HERE and fails if a label disagrees — the convention can drift from the
 * renderer only by turning a leg red.
 */
export const EMAIL_LAYOUT = {
  pageW: EMAIL_PAGE_W,
  pageH: EMAIL_PAGE_H,
  margin: EMAIL_MARGIN,
  lineH: EMAIL_LINE_H,
  fontPx: EMAIL_FONT_PX,
} as const;

/** The normalised §6.4 band a given rendered line occupies — the full content
 *  width of that line, which is what a crop of "the value is on this line"
 *  shows a person. `line` is 0-indexed WITHIN its page. */
export function emailLineBand(line: number): [number, number, number, number] {
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
  return [
    round4(EMAIL_MARGIN / EMAIL_PAGE_W),
    round4((EMAIL_MARGIN + line * EMAIL_LINE_H) / EMAIL_PAGE_H),
    round4((EMAIL_PAGE_W - 2 * EMAIL_MARGIN) / EMAIL_PAGE_W),
    round4(EMAIL_LINE_H / EMAIL_PAGE_H),
  ];
}

/** How the rendition wraps a body into lines — exported so the corpus suite
 *  can locate a labelled value's true line rather than assume the source
 *  line survives unwrapped. */
export function emailWrappedLines(text: string): string[] {
  const measureCtx = createCanvas(1, 1).getContext('2d');
  measureCtx.font = `${EMAIL_FONT_PX}px sans-serif`;
  return wrapLines((s) => measureCtx.measureText(s).width, text, EMAIL_PAGE_W - 2 * EMAIL_MARGIN);
}

/** Lines per rendered page — the pagination the bands are indexed within. */
export const EMAIL_LINES_PER_PAGE = Math.floor(
  (EMAIL_PAGE_H - 2 * EMAIL_MARGIN) / EMAIL_LINE_H,
);

type EmailMessage = { subject: string; from: string; body: string };

/** The inbound webhook's envelope, read defensively: a JSON blob without the
 *  envelope's body keys is not an email body, however it arrived. */
function parseEmailEnvelope(bytes: Uint8Array): EmailMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (!('text_body' in o) && !('html_body' in o)) return null;
  const textBody = typeof o.text_body === 'string' ? o.text_body : '';
  const htmlBody = typeof o.html_body === 'string' ? o.html_body : '';
  return {
    subject: typeof o.subject === 'string' ? o.subject : '',
    from: typeof o.from === 'string' ? o.from : '',
    body: textBody.trim() !== '' ? textBody : htmlToText(htmlBody),
  };
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) return ' ';
  try {
    return String.fromCodePoint(code);
  } catch {
    return ' ';
  }
}

/**
 * HTML reduced to text — never rendered as HTML. Order matters: executable
 * and stylistic machinery is DELETED first (its content must not survive as
 * text), anchors keep their text with the target inert in parentheses,
 * block boundaries become newlines, every remaining tag is stripped, and
 * entities decode LAST so a decoded `<` can never re-enter parsing.
 */
function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ');
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ');
  s = s.replace(/<head\b[\s\S]*?<\/head\s*>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_m, dq: string | undefined, sq: string | undefined, bare: string | undefined, inner: string) => {
      const href = (dq ?? sq ?? bare ?? '').trim().slice(0, 80);
      const text = inner.replace(/<[^>]+>/g, '').trim();
      return href ? `${text} (${href})` : text;
    },
  );
  s = s.replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/blockquote|\/pre)\b[^>]*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&');
  s = s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Greedy word wrap by MEASURED width — an overlong unbroken run is split
 *  hard so no line can escape the page. */
function wrapLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line === '') {
      out.push('');
      continue;
    }
    let current = '';
    for (const word of line.split(' ')) {
      let w = word;
      // Hard-split a single run wider than the page.
      while (measure(w) > maxWidth) {
        let cut = Math.max(1, Math.floor((maxWidth / measure(w)) * w.length));
        while (cut > 1 && measure(w.slice(0, cut)) > maxWidth) cut--;
        const head = w.slice(0, cut);
        if (current !== '') {
          out.push(current);
          current = '';
        }
        out.push(head);
        w = w.slice(cut);
      }
      if (w === '') continue;
      const candidate = current === '' ? w : `${current} ${w}`;
      if (measure(candidate) > maxWidth && current !== '') {
        out.push(current);
        current = w;
      } else {
        current = candidate;
      }
    }
    out.push(current);
  }
  return out;
}

async function renderEmailMessage(
  message: EmailMessage | string,
  ceilings: RenderCeilings,
  outOfTime: () => boolean,
): Promise<NormalizeResult> {
  const composed =
    typeof message === 'string'
      ? message
      : [
          message.from ? `From: ${message.from}` : null,
          message.subject ? `Subject: ${message.subject}` : null,
          '',
          message.body,
        ]
          .filter((line): line is string => line !== null)
          .join('\n');

  const measureCtx = createCanvas(1, 1).getContext('2d');
  measureCtx.font = `${EMAIL_FONT_PX}px sans-serif`;
  const measure = (s: string) => measureCtx.measureText(s).width;

  const contentW = EMAIL_PAGE_W - 2 * EMAIL_MARGIN;
  const linesPerPage = Math.floor((EMAIL_PAGE_H - 2 * EMAIL_MARGIN) / EMAIL_LINE_H);
  const lines = wrapLines(measure, composed, contentW);
  const totalPages = Math.max(1, Math.ceil(lines.length / linesPerPage));
  // The page bound holds for messages exactly as for documents, decided on
  // the wrapped line count BEFORE any drawing.
  if (totalPages > ceilings.maxPages) return { outcome: 'refused', reason: 'page_bound' };

  const pages: RenderedPage[] = [];
  let renderedBytes = 0;
  for (let p = 0; p < totalPages; p++) {
    if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
    const canvas: Canvas = createCanvas(EMAIL_PAGE_W, EMAIL_PAGE_H);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, EMAIL_PAGE_W, EMAIL_PAGE_H);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `${EMAIL_FONT_PX}px sans-serif`;
    ctx.textBaseline = 'top';
    const slice = lines.slice(p * linesPerPage, (p + 1) * linesPerPage);
    for (let i = 0; i < slice.length; i++) {
      if (slice[i] !== '') ctx.fillText(slice[i], EMAIL_MARGIN, EMAIL_MARGIN + i * EMAIL_LINE_H);
    }
    let encoded: Uint8Array;
    try {
      encoded = new Uint8Array(await canvas.encode('png'));
    } catch {
      return { outcome: 'unsupported_type' };
    }
    renderedBytes += encoded.byteLength;
    if (renderedBytes > ceilings.maxRenderedBytes) {
      return { outcome: 'refused', reason: 'output_size' };
    }
    if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
    pages.push({
      page: p + 1,
      widthPx: EMAIL_PAGE_W,
      heightPx: EMAIL_PAGE_H,
      mime: 'image/png',
      bytes: encoded,
    });
  }

  return {
    outcome: 'rendered',
    sourceClass: 'email_text',
    pageCount: pages.length,
    pages,
    text: composed,
  };
}

/**
 * The raster path: decode via `@napi-rs/canvas` (EXIF orientation applied at
 * decode — the displayed frame, §6.4's citation space), draw at the §6.3
 * tier, and never below the source's own resolution.
 */
async function normalizeImage(
  bytes: Uint8Array,
  magic: string,
  ceilings: RenderCeilings,
  outOfTime: () => boolean,
): Promise<NormalizeResult> {
  // TRUE stored pixels from the header, before any decode (the D2 rule).
  // Orientation swaps axes and cannot change the product, so the stored
  // frame is the right frame for the ceiling.
  const stored = storedPixels(bytes, magic);
  if (stored) {
    if ((stored.w * stored.h) / 1e6 > ceilings.maxPageMegapixels) {
      return { outcome: 'refused', reason: 'page_dimensions' };
    }
    if (!(stored.w > 0) || !(stored.h > 0)) return { outcome: 'unsupported_type' };
  }
  if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };

  let img: Image;
  try {
    img = await loadImage(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    // Undecodable bytes — and every container Skia carries no codec for
    // (TIFF among them, a recorded delta from mupdf) — exit honestly.
    return { outcome: 'unsupported_type' };
  }
  // Backstop for a container the header walk could not read: the decoder's
  // own answer, still before any drawing.
  if ((img.width * img.height) / 1e6 > ceilings.maxPageMegapixels) {
    return { outcome: 'refused', reason: 'page_dimensions' };
  }
  if (!(img.width > 0) || !(img.height > 0)) return { outcome: 'unsupported_type' };

  // Never downsample a photo below its own resolution, and never upsample
  // it past the tier: the target is the tier, clamped by what is there.
  const nativeLong = Math.max(img.width, img.height);
  const targetLong = Math.min(HIGH_LONG_EDGE, Math.round(nativeLong));
  const scale = targetLong / nativeLong;
  if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };

  let encoded: Uint8Array;
  let width: number;
  let height: number;
  try {
    const canvas: Canvas = createCanvas(
      Math.round(img.width * scale),
      Math.round(img.height * scale),
    );
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    width = canvas.width;
    height = canvas.height;
    encoded = new Uint8Array(await canvas.encode('jpeg', 90));
  } catch {
    return { outcome: 'unsupported_type' };
  }

  if (encoded.byteLength > ceilings.maxRenderedBytes) {
    return { outcome: 'refused', reason: 'output_size' };
  }
  // The final deadline consultation (R3/F-5): a clock that expired during
  // the decode, draw or encode refuses rather than ships.
  if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };

  return {
    outcome: 'rendered',
    sourceClass: 'photo',
    pageCount: 1,
    pages: [{ page: 1, widthPx: width, heightPx: height, mime: 'image/jpeg', bytes: encoded }],
    text: null,
  };
}

/**
 * A normalised `{page, bbox}` → the pixel rectangle of THIS rendering.
 *
 * The coordinates are a fraction of the page, never pixels of one particular
 * render, which is what lets a stored citation survive a re-render, a
 * provider swap and slice 6's review screen (§6.4, §1.6). The result is
 * clamped inside the page so a bad bbox can never read past the buffer.
 */
export function cropRect(
  page: Pick<RenderedPage, 'widthPx' | 'heightPx'>,
  bbox: readonly [number, number, number, number],
): { x: number; y: number; w: number; h: number } {
  const [bx, by, bw, bh] = bbox;
  const x = Math.max(0, Math.min(page.widthPx, Math.round(bx * page.widthPx)));
  const y = Math.max(0, Math.min(page.heightPx, Math.round(by * page.heightPx)));
  const w = Math.max(0, Math.min(page.widthPx - x, Math.round(bw * page.widthPx)));
  const h = Math.max(0, Math.min(page.heightPx - y, Math.round(bh * page.heightPx)));
  return { x, y, w, h };
}
