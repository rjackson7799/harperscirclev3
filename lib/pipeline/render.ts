import 'server-only';
import * as mupdf from 'mupdf';

/**
 * §6.3 rendering, as rules-as-code (slice-5 plan B2; RND-01; TSD §6.3, §6.4,
 * §4.3's normalize row; PRD §13.3).
 *
 * Arrivals are normalised to **page images** before extraction, because a
 * citation must resolve to a region a person can see. The table is the rule,
 * not a global setting:
 *
 *   | Source                          | Rendered as              | Long edge |
 *   |---------------------------------|--------------------------|-----------|
 *   | born-digital PDF                | page images + text layer | 1568      |
 *   | scanned PDF, photo, pill bottle | page images only         | 2576      |
 *   | email body                      | text (no page images)    | —         |
 *
 * Resolution is a cost lever with a floor in both directions. Downsampling a
 * born-digital PDF is free — the text layer carries the characters — while
 * downsampling a phone photo of a pill bottle is exactly the wrong economy.
 * So `born_digital_pdf` is never rendered high, and `photo`/`scanned_pdf`
 * are never rendered below high.
 *
 * **The bounds are enforced before rendering, not after** (§6.3): 200
 * high-resolution pages is close to a million input tokens and must never be
 * dispatched by accident. The mupdf spike established that page count and
 * declared page geometry both answer from the header, before any decode —
 * which is what makes "abort BEFORE any provider dispatch" a property of
 * this code path rather than an ordering someone has to remember.
 *
 * **The orientation door is a choice.** `new mupdf.Image(bytes)` reports the
 * STORED frame with EXIF ignored; `Document.openDocument(bytes, magic)`
 * reports the DISPLAYED frame with orientation applied. §6.4's citation
 * space is the page as a person sees it, so this module only ever opens
 * documents. The spike measured the difference at 36.3 vs 220.4 mean sample
 * value over the same citations — load-bearing, not cosmetic.
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
  /** PRD §13.3. Checked from countPages(), before a single page loads. */
  maxPages: 200,
  /**
   * The page-dimension ceiling, in megapixels of DECLARED geometry. 80 Mpx
   * is ~5× a 16 Mpx phone photo and ~11× a 2576-long-edge render, so real
   * material clears it comfortably while a decompression bomb — 900 Mpx
   * declared behind a few hundred bytes — does not.
   */
  maxPageMegapixels: 80,
  /** The whole normalize step's wall clock, budgeted inside the stage's. */
  maxWallClockMs: 90_000,
  /** The accumulated rendered-output ceiling: the memory bound with a name. */
  maxRenderedBytes: 64 * 1024 * 1024,
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
};

/**
 * mupdf sizes an image page as `pixels x 72 / declared_resolution`, and falls
 * back to 96 dpi — a page point being 0.75 stored pixels — ONLY when the image
 * declares no resolution at all.
 *
 * That fallback is what this constant is. It is NOT a property of the image
 * path (round-16 R3/F-1): a scanner or a phone "Scan to JPEG" writes a density
 * tag, and at 300 dpi a 1928x2576 source reports 617x824 of "declared
 * geometry" — which would collapse `nativeLong` and render a photo 3.1x below
 * its own resolution, with no ceiling fired and nothing logged.
 *
 * So it is used only where it is right: as the points->pixels proxy for a PDF
 * page, whose points are real typographic points and which carries no stored
 * raster at all. For an image, `storedPixels()` reads the true dimensions out
 * of the header instead.
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
  if (mime === 'image/tiff') return 'image/tiff';
  return null;
}

function isTextual(mime: string): boolean {
  return mime === 'text/plain' || mime === 'text/html' || mime === 'message/rfc822';
}

/**
 * The TRUE stored pixel dimensions of a raster, read from its header — before
 * any decode, which is what makes the ceilings a property of the code path
 * rather than an ordering someone has to remember (the spike's legs 3/4/6).
 *
 * Deliberately parsed here rather than via `new mupdf.Image(bytes)`: that
 * constructor reports the STORED frame with EXIF ignored, and §6.4's citation
 * space is the page as a person SEES it. `render.ts` only ever opens
 * documents, and this keeps that true (round-16 R3/F-10 verified it holds).
 *
 * Returns null for a container this cannot read (TIFF, and anything else),
 * in which case the caller falls back to the declared-points proxy.
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
 * Long edge in pixels of a page's DECLARED geometry (orientation applied).
 *
 * For a raster this is the header's own pixel count, oriented to the frame the
 * document path displays — EXIF 5..8 swap the axes, and the page's own bounds
 * are the authority on which way round that landed. For a PDF page there is no
 * stored raster, so points at 96 dpi remain the honest proxy.
 */
function declaredPixels(page: mupdf.Page, stored: { w: number; h: number } | null): {
  w: number;
  h: number;
} {
  const [x0, y0, x1, y1] = page.getBounds();
  const wPt = x1 - x0;
  const hPt = y1 - y0;
  if (!stored || !(stored.w > 0) || !(stored.h > 0)) {
    return { w: wPt / PT_PER_PX, h: hPt / PT_PER_PX };
  }
  const displayedIsPortrait = hPt > wPt;
  const storedIsPortrait = stored.h > stored.w;
  return displayedIsPortrait === storedIsPortrait
    ? { w: stored.w, h: stored.h }
    : { w: stored.h, h: stored.w };
}

export function normalizeArrival(
  bytes: Uint8Array,
  mime: string,
  options: NormalizeOptions = {},
): NormalizeResult {
  const ceilings: RenderCeilings = { ...RENDER_CEILINGS, ...(options.ceilings ?? {}) };
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const outOfTime = () => now() - startedAt >= ceilings.maxWallClockMs;

  // §6.3 row 4: an email body is text first. No decoder is involved, so no
  // ceiling but the size of the body itself applies.
  if (isTextual(mime)) {
    if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
    return {
      outcome: 'rendered',
      sourceClass: 'email_text',
      pageCount: 1,
      pages: [],
      text: new TextDecoder().decode(bytes),
    };
  }

  const magic = magicFor(mime);
  if (!magic) return { outcome: 'unsupported_type' };

  let doc: mupdf.Document;
  try {
    doc = mupdf.Document.openDocument(bytes, magic);
  } catch {
    // §4.3: undecodable bytes are unsupported_type — an honest state, not a
    // failure. (mupdf repairs what it can; reaching here means it could not.)
    return { outcome: 'unsupported_type' };
  }

  // §4.3 normalize: encrypted → needs_password, decided before any page loads.
  try {
    if (doc.needsPassword()) return { outcome: 'needs_password' };
  } catch {
    return { outcome: 'unsupported_type' };
  }

  let pageCount: number;
  try {
    pageCount = doc.countPages();
  } catch {
    return { outcome: 'unsupported_type' };
  }
  // PRD §13.3, enforced BEFORE rendering.
  if (pageCount > ceilings.maxPages) return { outcome: 'refused', reason: 'page_bound' };
  if (pageCount < 1) return { outcome: 'unsupported_type' };

  const isPdf = magic === 'application/pdf';
  // Read once, from the header, before any page is loaded. Null for a PDF and
  // for any raster container this cannot parse; the caller falls back to the
  // declared-points proxy in that case.
  const stored = isPdf ? null : storedPixels(bytes, magic);

  // The text layer decides born-digital vs scanned, and it is sampled from
  // the first few pages so the decision costs a fixed amount on a long scan.
  let text: string | null = null;
  if (isPdf) {
    let sampled = '';
    const sampleTo = Math.min(pageCount, TEXT_LAYER_SAMPLE_PAGES);
    for (let i = 0; i < sampleTo; i++) {
      if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
      try {
        sampled += doc.loadPage(i).toStructuredText().asText();
      } catch {
        // A page whose text cannot be read contributes nothing; the render
        // below is still attempted, which is the §6.8 honest-limits posture.
      }
    }
    if (sampled.trim().length >= TEXT_LAYER_MIN_CHARS) {
      let whole = sampled;
      for (let i = sampleTo; i < pageCount; i++) {
        if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };
        try {
          whole += doc.loadPage(i).toStructuredText().asText();
        } catch {
          /* as above */
        }
      }
      text = whole;
    }
  }

  const sourceClass: SourceClass = isPdf
    ? text === null
      ? 'scanned_pdf'
      : 'born_digital_pdf'
    : 'photo';
  const tier = sourceClass === 'born_digital_pdf' ? STANDARD_LONG_EDGE : HIGH_LONG_EDGE;
  // PNG for born-digital pages (text and line art: lossless and small);
  // JPEG for continuous-tone sources, where PNG is pathological. Neither
  // choice touches geometry — the pixel dimensions are the same either way.
  const asPng = sourceClass === 'born_digital_pdf';

  const pages: RenderedPage[] = [];
  let renderedBytes = 0;

  for (let i = 0; i < pageCount; i++) {
    if (outOfTime()) return { outcome: 'refused', reason: 'wall_clock' };

    let page: mupdf.Page;
    try {
      page = doc.loadPage(i);
    } catch {
      return { outcome: 'unsupported_type' };
    }

    // The page-dimension ceiling, on DECLARED geometry — before the decoder
    // allocates anything (the spike's leg 6). For a raster that geometry is
    // the header's own pixel count, NOT points scaled by a resolution the
    // uploader chose: 80 Mpx must mean 80 Mpx whatever the file claims its
    // dpi is (round-16 R3/F-2).
    const declared = declaredPixels(page, isPdf ? null : stored);
    if ((declared.w * declared.h) / 1e6 > ceilings.maxPageMegapixels) {
      return { outcome: 'refused', reason: 'page_dimensions' };
    }
    if (!(declared.w > 0) || !(declared.h > 0)) return { outcome: 'unsupported_type' };

    // Never downsample a photo below its own resolution, and never upsample
    // it past the tier: the target is the tier, clamped by what is there.
    const nativeLong = Math.max(declared.w, declared.h);
    const targetLong = isPdf ? tier : Math.min(tier, Math.round(nativeLong));
    const [x0, y0, x1, y1] = page.getBounds();
    const scale = targetLong / Math.max(x1 - x0, y1 - y0);

    let encoded: Uint8Array;
    let width: number;
    let height: number;
    try {
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false,
      );
      width = pixmap.getWidth();
      height = pixmap.getHeight();
      encoded = new Uint8Array(asPng ? pixmap.asPNG() : pixmap.asJPEG(90));
    } catch {
      return { outcome: 'unsupported_type' };
    }

    renderedBytes += encoded.byteLength;
    if (renderedBytes > ceilings.maxRenderedBytes) {
      return { outcome: 'refused', reason: 'output_size' };
    }

    pages.push({
      page: i + 1,
      widthPx: width,
      heightPx: height,
      mime: asPng ? 'image/png' : 'image/jpeg',
      bytes: encoded,
    });
  }

  return { outcome: 'rendered', sourceClass, pageCount, pages, text };
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
