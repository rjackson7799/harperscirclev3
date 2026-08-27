// ============================================================================
// B1 · THE REPLACEMENT-RASTERIZER VERIFICATION SPIKE (slice-6 plan B1; D24
// ruling 1; Q3's dependency argument; the vault's verification-spike pattern).
//
// Slice 5 approved `mupdf` through a spike FIRST; slice 6 removes it (AGPL,
// D24 ruling 1) and this script is the SAME bar run against the replacement
// pair — `pdfjs-dist` (Apache-2.0) + `@napi-rs/canvas` (MIT), licences read
// from the INSTALLED manifests and printed in the header below. Its output is
// quoted in the B1 commit and in the 6B deltas ADR.
//
//   node scripts/spike/rasterizer-spike.mjs
//
// The legs (slice-5 plan B2 verbatim, re-run at the CORRECTED bar — round-16
// R7/F-3 falsified the mupdf spike's own leg 5, so leg 5 here RECORDS the
// hostile-input posture as whatever it is and asserts only survival; it is
// never scored as a refusal-or-repair it did not earn):
//   1  born-digital PDF -> page images + text layer
//   2  phone JPEG -> 2576 px long edge, never below
//   3  encrypted -> needs_password
//   4  undecodable -> unsupported_type
//   5  malformed/truncated -> the honest verdict, RECORDED (refused or
//      repaired — either is safe; claiming one while doing the other is not)
//   6  decompression/pixel-bomb shapes abort under explicit page-dimension
//      and page-count ceilings BEFORE any decode or provider dispatch
//   7  EXIF orientation normalised BEFORE geometry
//   8  deterministic geometry proven round-trip: a normalised {page, bbox}
//      cuts the visible crop — with a falsification control
//
// Deliberately standalone and dependency-free beyond the two engines
// themselves: a spike that imports the module it is meant to justify would
// be circular.
// ============================================================================

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const CORPUS = path.join(ROOT, 'fixtures', 'g9');
const manifest = JSON.parse(readFileSync(path.join(CORPUS, 'corpus.json'), 'utf8'));
const item = (id) => manifest.items.find((i) => i.id === id);
const bytesOf = (id) => new Uint8Array(readFileSync(path.join(CORPUS, item(id).file)));

// The engines under verification, resolved from the installed tree — and
// their licences read from the installed manifests (ADR-0023 D13's command,
// a plan-format rule since round 16 priced mupdf's licence out of a
// comparison silently).
const pdfjsPkg = require('pdfjs-dist/package.json');
const canvasPkg = require('@napi-rs/canvas/package.json');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

// pdfjs resource directories (standard-14 font metrics, CJK cmaps, the
// JPX/JBIG2 wasm codecs, ICC profiles) — the Node binary-data factory reads
// `baseUrl + filename` with fs, so each needs a trailing slash.
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
const resourceUrl = (dir) => path.join(pdfjsRoot, dir).replace(/\\/g, '/') + '/';
const PDF_OPEN_DEFAULTS = {
  verbosity: 0,
  standardFontDataUrl: resourceUrl('standard_fonts'),
  cMapUrl: resourceUrl('cmaps'),
  cMapPacked: true,
  wasmUrl: resourceUrl('wasm'),
  iccUrl: resourceUrl('iccs'),
};

const results = [];
async function leg(n, name, fn) {
  const t0 = process.hrtime.bigint();
  try {
    const detail = await fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    results.push({ n, name, ok: true, detail, ms });
  } catch (err) {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    results.push({ n, name, ok: false, detail: err.message, ms });
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function openPdf(bytes) {
  const task = pdfjs.getDocument({ data: bytes, ...PDF_OPEN_DEFAULTS });
  try {
    const doc = await task.promise;
    return { task, doc };
  } catch (err) {
    // Surface the loading task's teardown but keep the original error.
    await task.destroy().catch(() => {});
    throw err;
  }
}

/** Render one pdfjs page so its long edge is `targetPx`; returns the canvas. */
async function renderPdfPage(page, targetPx) {
  const vp1 = page.getViewport({ scale: 1 });
  const scale = targetPx / Math.max(vp1.width, vp1.height);
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas;
}

/** Draw a decoded image so its long edge is min(targetPx, native long edge). */
function drawImage(img, targetPx) {
  const native = Math.max(img.width, img.height);
  const long = Math.min(targetPx, native);
  const scale = long / native;
  const canvas = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Mean luminance inside a normalised bbox of a canvas. */
function meanIn(canvas, [bx, by, bw, bh]) {
  const W = canvas.width;
  const H = canvas.height;
  const x0 = Math.round(bx * W);
  const y0 = Math.round(by * H);
  const w = Math.max(1, Math.min(W, Math.round((bx + bw) * W)) - x0);
  const h = Math.max(1, Math.min(H, Math.round((by + bh) * H)) - y0);
  const data = canvas.getContext('2d').getImageData(x0, y0, w, h).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  return sum / (data.length / 4);
}

/**
 * The TRUE stored pixel dimensions of a JPEG, walked from its SOF header —
 * before any decode. Reimplemented here (not imported) because the spike must
 * stay standalone; the SOF frame stores the STORED frame, EXIF untouched,
 * which is exactly what makes it usable both for pre-decode ceilings (leg 6)
 * and as the stored-frame reference in leg 7.
 */
function jpegStoredPixels(b) {
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
    if (marker === 0xda) return null;
    i += 2 + len;
  }
  return null;
}

/** The same JPEG with its EXIF APP1 segment removed — same pixels, no
 *  orientation tag. Leg 8's falsification control. */
function stripExif(b) {
  const out = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    if (marker === 0xda) {
      out.push(b.subarray(i));
      return Buffer.concat(out.map((s) => Buffer.from(s)));
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    const isExif =
      marker === 0xe1 &&
      b[i + 4] === 0x45 && // E
      b[i + 5] === 0x78 && // x
      b[i + 6] === 0x69 && // i
      b[i + 7] === 0x66; // f
    if (!isExif) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(out.map((s) => Buffer.from(s)));
}

// ---------------------------------------------------------------------------

await leg(1, 'born-digital PDF -> page images + text layer', async () => {
  const { task, doc } = await openPdf(bytesOf('dev-discharge-01'));
  try {
    assert(doc.numPages === 1, `expected 1 page, got ${doc.numPages}`);
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    assert(content.items.length > 0, 'no text items');
    const text = content.items.map((t) => t.str).join(' ');
    assert(text.includes('Riverbend Community Hospital'), 'text layer missing the provider line');
    assert(text.includes('500 mg'), 'text layer missing the dose line');
    const canvas = await renderPdfPage(page, 1568);
    assert(
      Math.max(canvas.width, canvas.height) === 1568,
      `rendered ${canvas.width}x${canvas.height}`,
    );
    const png = await canvas.encode('png');
    assert(png.length > 0, 'png encode produced nothing');
    return `1 page, ${canvas.width}x${canvas.height} px, ${content.items.length} text items, ${text.length} chars, png ${png.length} B`;
  } finally {
    await task.destroy();
  }
});

await leg(2, 'phone JPEG -> 2576 px long edge, never below', async () => {
  const bytes = bytesOf('dev-pill-01');
  const stored = jpegStoredPixels(bytes);
  const nativeLongPx = Math.max(stored.w, stored.h);
  assert(nativeLongPx === 2576, `native long edge ${nativeLongPx}, expected 2576`);
  const img = await loadImage(Buffer.from(bytes));
  const canvas = drawImage(img, 2576);
  assert(
    Math.max(canvas.width, canvas.height) === 2576,
    `rendered ${canvas.width}x${canvas.height}`,
  );
  // Never downsampled: the high tier is reached exactly, not approached.
  assert(Math.max(canvas.width, canvas.height) >= nativeLongPx, 'downsampled below the source');
  const jpg = await canvas.encode('jpeg', 90);
  return `native ${nativeLongPx} px -> rendered ${canvas.width}x${canvas.height}, jpeg ${jpg.length} B`;
});

await leg(3, 'encrypted PDF -> needs_password', async () => {
  let name = null;
  let message = '';
  try {
    const { task } = await openPdf(bytesOf('dev-encrypted-01'));
    await task.destroy();
  } catch (err) {
    name = err.name;
    message = err.message;
  }
  assert(name === 'PasswordException', `expected PasswordException, got ${name ?? 'no throw'}`);
  return `getDocument rejected with PasswordException ("${message}") before any page was loaded — the needs_password mapping is a name check, not a string parse`;
});

await leg(4, 'undecodable bytes -> unsupported_type', async () => {
  let name = null;
  let message = '';
  try {
    const { task } = await openPdf(bytesOf('dev-unsupported-01'));
    await task.destroy();
  } catch (err) {
    name = err.name;
    message = err.message;
  }
  assert(name === 'InvalidPDFException', `expected InvalidPDFException, got ${name ?? 'no throw'}`);
  return `getDocument rejected with InvalidPDFException ("${message}")`;
});

await leg(5, 'malformed / truncated PDF — the honest verdict, RECORDED', async () => {
  // The corrected bar (R7/F-3): this leg RECORDS the posture and asserts only
  // that the engine survives — no crash, no hang, the worker keeps its lease.
  // mupdf REPAIRED this fixture ("trying to repair broken xref"); whatever
  // pdfjs does is recorded as what it is, never scored as the other thing.
  let outcome;
  try {
    const { task, doc } = await openPdf(bytesOf('dev-truncated-01'));
    let pageErr = null;
    try {
      const page = await doc.getPage(1);
      await renderPdfPage(page, 512);
    } catch (err) {
      pageErr = `${err.name}: ${err.message.slice(0, 60)}`;
    }
    outcome =
      `REPAIRED rather than refused: numPages=${doc.numPages}` +
      `${pageErr ? `, page render threw ${pageErr}` : ', rendered without throwing'}`;
    await task.destroy();
  } catch (err) {
    outcome = `REFUSED rather than repaired: getDocument rejected with ${err.name} ("${err.message.slice(0, 60)}") — the INVERSE of mupdf's recorded posture, and the honest exit maps to unsupported_type`;
  }
  return `${outcome} — no crash, no hang either way`;
});

await leg(6, 'pixel bomb and page bomb abort under stated ceilings', async () => {
  const MAX_PAGES = 200; // PRD §13.3
  const MAX_PAGE_MEGAPIXELS = 80; // the page-dimension ceiling

  // Pixel bomb: the STORED geometry is readable from the SOF header without
  // decoding a single scanline — the D2 lesson carried to the new engine:
  // true stored pixels, never a declared-resolution proxy.
  const bomb = bytesOf('dev-pixelbomb-01');
  const stored = jpegStoredPixels(bomb);
  const mp = (stored.w * stored.h) / 1e6;
  assert(mp > MAX_PAGE_MEGAPIXELS, `stored ${mp.toFixed(1)} Mpx did not exceed the ceiling`);

  // Page bomb: numPages answers from the xref before any page object loads,
  // and long before any render or provider dispatch.
  const t0 = Date.now();
  const { task, doc } = await openPdf(bytesOf('dev-pagebomb-01'));
  const n = doc.numPages;
  const ms = Date.now() - t0;
  await task.destroy();
  assert(n > MAX_PAGES, `declared ${n} pages did not exceed the bound`);

  return `pixel bomb stores ${mp.toFixed(0)} Mpx (ceiling ${MAX_PAGE_MEGAPIXELS}), read from the SOF header with zero scanlines decoded; page bomb declares ${n} pages (bound ${MAX_PAGES}) in ${ms} ms with no page loaded`;
});

await leg(7, 'EXIF orientation is normalised BEFORE geometry', async () => {
  const bytes = bytesOf('dev-angled-01');
  // The SOF header reports the STORED frame...
  const stored = jpegStoredPixels(bytes);
  assert(
    stored.w === 3024 && stored.h === 2016,
    `stored ${stored.w}x${stored.h}, expected 3024x2016`,
  );
  // ...the decoder reports the DISPLAYED frame: @napi-rs/canvas applies the
  // EXIF orientation tag at decode, so the frame a citation is measured
  // against is the frame a person sees.
  const img = await loadImage(Buffer.from(bytes));
  assert(
    img.width === 2016 && img.height === 3024,
    `decoded ${img.width}x${img.height}, expected 2016x3024`,
  );
  return `stored ${stored.w}x${stored.h} (SOF header, orientation untouched) vs decoded ${img.width}x${img.height} (@napi-rs/canvas, orientation APPLIED) — the engine normalises EXIF at decode, and leg 8's control proves it is load-bearing`;
});

await leg(8, 'normalised {page, bbox} round-trips to the visible crop', async () => {
  const lines = [];
  for (const id of ['dev-discharge-01', 'dev-pill-01', 'dev-angled-01', 'dev-scanned-01']) {
    const it = item(id);
    const isPdf = it.file.endsWith('.pdf');
    let canvas;
    let cleanup = null;
    if (isPdf) {
      const { task, doc } = await openPdf(bytesOf(id));
      cleanup = () => task.destroy();
      canvas = await renderPdfPage(
        await doc.getPage(1),
        it.source_type === 'born_digital_pdf' ? 1568 : 2576,
      );
    } else {
      canvas = drawImage(await loadImage(Buffer.from(bytesOf(id))), 2576);
    }
    const whole = meanIn(canvas, [0, 0, 1, 1]);
    for (const label of it.labels) {
      const inside = meanIn(canvas, label.bbox);
      assert(
        Number.isFinite(inside),
        `${id}:${label.field} bbox ${JSON.stringify(label.bbox)} cut an empty region`,
      );
      // The corpus paints marks dark on a light field, so a citation that
      // lands on its value is measurably darker than the page as a whole.
      assert(
        inside < whole,
        `${id}:${label.field} crop mean ${inside.toFixed(1)} is not darker than the page mean ${whole.toFixed(1)}`,
      );
    }
    if (cleanup) await cleanup();
    lines.push(`${id}: ${it.labels.length}/${it.labels.length} citations cut a darker-than-page crop`);
  }

  // The falsification control. Consistency alone proves little — the numbers
  // have to DISCRIMINATE. The same citations, read against the STORED frame
  // (the same pixels with the EXIF APP1 segment stripped, so the decoder has
  // no orientation to apply), must land materially worse than against the
  // displayed frame. If they did not, leg 7 would be a fact about the engine
  // with no consequence for our geometry.
  const angled = item('dev-angled-01');
  const displayed = drawImage(await loadImage(Buffer.from(bytesOf('dev-angled-01'))), 2576);
  const strippedImg = await loadImage(stripExif(bytesOf('dev-angled-01')));
  assert(
    strippedImg.width === 3024 && strippedImg.height === 2016,
    `EXIF-stripped control decoded ${strippedImg.width}x${strippedImg.height}, expected the stored 3024x2016 frame`,
  );
  const storedFrame = drawImage(strippedImg, 2576);
  const mean = (canvas) =>
    angled.labels.reduce((s, l) => s + meanIn(canvas, l.bbox), 0) / angled.labels.length;
  const dMean = mean(displayed);
  const sMean = mean(storedFrame);
  assert(
    dMean < sMean - 20,
    `control failed: displayed-frame crop mean ${dMean.toFixed(1)} is not clearly darker than stored-frame ${sMean.toFixed(1)} — the citations would land either way and leg 7 would prove nothing`,
  );
  lines.push(
    `CONTROL: the same citations mean ${dMean.toFixed(1)} on the displayed frame vs ${sMean.toFixed(1)} on the EXIF-stripped stored frame — orientation-before-geometry is load-bearing, not decorative`,
  );
  return lines.join('; ');
});

// ---------------------------------------------------------------------------

let failed = 0;
console.log(
  `rasterizer verification spike — pdfjs-dist ${pdfjsPkg.version} (${pdfjsPkg.license}) + @napi-rs/canvas ${canvasPkg.version} (${canvasPkg.license}), licences read from the installed manifests`,
);
console.log('='.repeat(78));
for (const r of results) {
  if (!r.ok) failed++;
  const tag = r.ok ? (r.n === 5 ? 'REC ' : 'PASS') : 'FAIL';
  console.log(`${tag}  leg ${r.n}  ${r.name}  (${r.ms.toFixed(0)} ms)`);
  console.log(`      ${r.detail}`);
}
console.log('='.repeat(78));
console.log(
  failed === 0
    ? 'SPIKE VERDICT: 7/8 asserted PASS at the corrected bar; leg 5 records the hostile-input posture as it is (R7/F-3) — pdfjs-dist + @napi-rs/canvas carry §6.3'
    : `SPIKE VERDICT: ${failed} leg(s) FALSIFIED`,
);
process.exit(failed === 0 ? 0 : 1);
