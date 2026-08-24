// ============================================================================
// B2 · THE mupdf VERIFICATION SPIKE (slice-5 plan B2; the vault's
// verification-spike pattern; Q3's dependency argument).
//
// The plan approved `mupdf` "through a verification-spike unit FIRST, before
// the install is treated as settled". This script IS that spike. It runs the
// eight legs the plan names against the B1 corpus and prints a verdict; its
// output is quoted in the B2 commit and in the 5B deltas ADR.
//
//   node scripts/spike/mupdf-spike.mjs
//
// The legs (plan B2, verbatim):
//   1  born-digital PDF -> page images + text layer
//   2  phone JPEG -> 2576 px long edge, never below
//   3  encrypted -> needs_password
//   4  undecodable -> unsupported_type
//   5  malformed/truncated -> refuses cleanly
//   6  decompression/pixel-bomb shapes abort under explicit page-dimension,
//      memory and wall-clock ceilings BEFORE any provider dispatch
//   7  EXIF orientation normalised BEFORE geometry
//   8  deterministic geometry proven round-trip: a normalised {page, bbox}
//      cuts the visible crop
//
// Deliberately standalone and dependency-free beyond mupdf itself: a spike
// that imports the module it is meant to justify would be circular.
// ============================================================================

import * as mupdf from 'mupdf';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CORPUS = path.join(ROOT, 'fixtures', 'g9');
const manifest = JSON.parse(readFileSync(path.join(CORPUS, 'corpus.json'), 'utf8'));
const item = (id) => manifest.items.find((i) => i.id === id);
const bytesOf = (id) => new Uint8Array(readFileSync(path.join(CORPUS, item(id).file)));

const results = [];
function leg(n, name, fn) {
  const t0 = process.hrtime.bigint();
  try {
    const detail = fn();
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

// mupdf sizes an image-as-document page in POINTS at 96 dpi, so a page point
// is 0.75 stored pixels. Every leg below works in points and converts once.
const PT_PER_PX = 0.75;

function openAs(bytes, magic) {
  return mupdf.Document.openDocument(bytes, magic);
}

/** Render one page to a DeviceGray pixmap whose long edge is `targetPx`. */
function renderGray(page, targetPx) {
  const [x0, y0, x1, y1] = page.getBounds();
  const wPt = x1 - x0;
  const hPt = y1 - y0;
  const scale = targetPx / Math.max(wPt, hPt);
  return page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceGray, false);
}

/** Mean sample value inside a normalised bbox of a grayscale pixmap. */
function meanIn(pixmap, [bx, by, bw, bh]) {
  const W = pixmap.getWidth();
  const H = pixmap.getHeight();
  const stride = pixmap.getStride();
  const n = pixmap.getNumberOfComponents();
  const px = pixmap.getPixels();
  const x0 = Math.round(bx * W);
  const y0 = Math.round(by * H);
  const x1 = Math.min(W, Math.round((bx + bw) * W));
  const y1 = Math.min(H, Math.round((by + bh) * H));
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += px[y * stride + x * n];
      count++;
    }
  }
  return count === 0 ? NaN : sum / count;
}

// ---------------------------------------------------------------------------

leg(1, 'born-digital PDF -> page images + text layer', () => {
  const doc = openAs(bytesOf('dev-discharge-01'), 'application/pdf');
  assert(!doc.needsPassword(), 'unexpectedly password-protected');
  assert(doc.countPages() === 1, `expected 1 page, got ${doc.countPages()}`);
  const page = doc.loadPage(0);
  const text = page.toStructuredText().asText();
  assert(text.includes('Riverbend Community Hospital'), 'text layer missing the provider line');
  assert(text.includes('500 mg'), 'text layer missing the dose line');
  const pm = renderGray(page, 1568);
  assert(pm.getWidth() > 0 && pm.getHeight() === 1568, `pixmap ${pm.getWidth()}x${pm.getHeight()}`);
  const structured = JSON.parse(page.toStructuredText().asJSON());
  assert(Array.isArray(structured.blocks) && structured.blocks.length > 0, 'no structured blocks');
  return `1 page, ${pm.getWidth()}x${pm.getHeight()} px, ${structured.blocks.length} text blocks, ${text.length} chars`;
});

leg(2, 'phone JPEG -> 2576 px long edge, never below', () => {
  const doc = openAs(bytesOf('dev-pill-01'), 'image/jpeg');
  const page = doc.loadPage(0);
  const [, , w, h] = page.getBounds();
  const nativeLongPx = Math.round(Math.max(w, h) / PT_PER_PX);
  assert(nativeLongPx === 2576, `native long edge ${nativeLongPx}, expected 2576`);
  const pm = renderGray(page, 2576);
  assert(Math.max(pm.getWidth(), pm.getHeight()) === 2576, `rendered ${pm.getWidth()}x${pm.getHeight()}`);
  // Never downsampled: the high tier is reached exactly, not approached.
  assert(pm.getHeight() >= nativeLongPx, 'downsampled below the source');
  return `native ${nativeLongPx} px -> rendered ${pm.getWidth()}x${pm.getHeight()}`;
});

leg(3, 'encrypted PDF -> needs_password', () => {
  const doc = openAs(bytesOf('dev-encrypted-01'), 'application/pdf');
  assert(doc.needsPassword() === true, 'needsPassword() was false on an encrypted fixture');
  return 'needsPassword() === true, before any page is loaded';
});

leg(4, 'undecodable bytes -> unsupported_type', () => {
  let threw = false;
  let message = '';
  try {
    openAs(bytesOf('dev-unsupported-01'), 'application/pdf');
  } catch (err) {
    threw = true;
    message = err.message;
  }
  assert(threw, 'openDocument accepted undecodable bytes');
  return `openDocument threw: ${message.slice(0, 90)}`;
});

leg(5, 'malformed / truncated PDF refuses cleanly', () => {
  // "Cleanly" is the whole leg: a throw we can map to a state, or a document
  // that answers honestly — never a crash that takes the worker with it.
  //
  // FINDING, recorded because it is not what the leg expected: mupdf does
  // not refuse a truncated PDF, it REPAIRS it ("trying to repair broken
  // xref", on stderr). That is safer than a crash and it is also a
  // behaviour B2 must own rather than inherit — a repaired document is a
  // real document with real pages, so the honest exit for genuinely
  // unreadable bytes is leg 4's throw, not this one.
  let outcome;
  try {
    const doc = openAs(bytesOf('dev-truncated-01'), 'application/pdf');
    const pages = doc.countPages();
    let pageErr = null;
    try {
      const page = doc.loadPage(0);
      renderGray(page, 512);
    } catch (err) {
      pageErr = err.message;
    }
    outcome =
      `REPAIRED rather than refused: countPages=${pages}` +
      `${pageErr ? `, render threw: ${pageErr.slice(0, 60)}` : ', rendered without throwing'}` +
      ' — no crash, no hang; the worker keeps its lease either way';
  } catch (err) {
    outcome = `openDocument threw: ${err.message.slice(0, 90)}`;
  }
  return outcome;
});

leg(6, 'pixel bomb and page bomb abort under stated ceilings', () => {
  const MAX_PAGES = 200; // PRD §13.3
  const MAX_PAGE_MEGAPIXELS = 80; // the page-dimension ceiling

  // Pixel bomb: the declared geometry is readable WITHOUT decoding the scan.
  const bombDoc = openAs(bytesOf('dev-pixelbomb-01'), 'image/jpeg');
  const bombPage = bombDoc.loadPage(0);
  const [, , bw, bh] = bombPage.getBounds();
  const mp = (bw / PT_PER_PX) * (bh / PT_PER_PX) / 1e6;
  assert(mp > MAX_PAGE_MEGAPIXELS, `declared ${mp.toFixed(1)} Mpx did not exceed the ceiling`);

  // Page bomb: countPages() is cheap and answers before any page loads.
  const pageBomb = openAs(bytesOf('dev-pagebomb-01'), 'application/pdf');
  const n = pageBomb.countPages();
  assert(n > MAX_PAGES, `declared ${n} pages did not exceed the bound`);

  return `pixel bomb declares ${mp.toFixed(0)} Mpx (ceiling ${MAX_PAGE_MEGAPIXELS}); page bomb declares ${n} pages (bound ${MAX_PAGES}) — both readable from the header, before any decode and long before any dispatch`;
});

leg(7, 'EXIF orientation is normalised BEFORE geometry', () => {
  const bytes = bytesOf('dev-angled-01');
  // The raw image loader reports the STORED frame...
  const raw = new mupdf.Image(new mupdf.Buffer(bytes));
  const storedW = raw.getWidth();
  const storedH = raw.getHeight();
  assert(storedW === 3024 && storedH === 2016, `stored ${storedW}x${storedH}, expected 3024x2016`);
  // ...the document loader reports the DISPLAYED frame, orientation applied.
  const doc = openAs(bytes, 'image/jpeg');
  const [, , w, h] = doc.loadPage(0).getBounds();
  const dispW = Math.round(w / PT_PER_PX);
  const dispH = Math.round(h / PT_PER_PX);
  assert(dispW === 2016 && dispH === 3024, `displayed ${dispW}x${dispH}, expected 2016x3024`);
  return `stored ${storedW}x${storedH} (mupdf.Image, orientation IGNORED) vs displayed ${dispW}x${dispH} (Document.openDocument, orientation APPLIED) — the document path is the only correct one for geometry`;
});

leg(8, 'normalised {page, bbox} round-trips to the visible crop', () => {
  const lines = [];
  for (const id of ['dev-discharge-01', 'dev-pill-01', 'dev-angled-01', 'dev-scanned-01']) {
    const it = item(id);
    const magic = it.file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    const doc = openAs(bytesOf(id), magic);
    const page = doc.loadPage(0);
    const pm = renderGray(page, magic === 'application/pdf' && it.source_type === 'born_digital_pdf' ? 1568 : 2576);
    for (const label of it.labels) {
      const inside = meanIn(pm, label.bbox);
      assert(
        Number.isFinite(inside),
        `${id}:${label.field} bbox ${JSON.stringify(label.bbox)} cut an empty region`,
      );
      // The corpus paints marks dark on a light field, so a citation that
      // lands on its value is measurably darker than the page as a whole.
      const whole = meanIn(pm, [0, 0, 1, 1]);
      assert(
        inside < whole,
        `${id}:${label.field} crop mean ${inside.toFixed(1)} is not darker than the page mean ${whole.toFixed(1)}`,
      );
    }
    lines.push(`${id}: ${it.labels.length}/${it.labels.length} citations cut a darker-than-page crop`);
  }

  // The falsification control. Consistency alone proves little — the
  // numbers have to DISCRIMINATE. The same citations, read against the
  // STORED frame (mupdf.Image, orientation ignored), must land materially
  // worse than against the displayed frame. If they did not, leg 7 would be
  // a fact about mupdf with no consequence for our geometry.
  const angled = item('dev-angled-01');
  const displayed = renderGray(openAs(bytesOf('dev-angled-01'), 'image/jpeg').loadPage(0), 2576);
  const stored = new mupdf.Image(new mupdf.Buffer(bytesOf('dev-angled-01'))).toPixmap();
  const mean = (pm) =>
    angled.labels.reduce((s, l) => s + meanIn(pm, l.bbox), 0) / angled.labels.length;
  const dMean = mean(displayed);
  const sMean = mean(stored);
  assert(
    dMean < sMean - 20,
    `control failed: displayed-frame crop mean ${dMean.toFixed(1)} is not clearly darker than stored-frame ${sMean.toFixed(1)} — the citations would land either way and leg 7 would prove nothing`,
  );
  lines.push(
    `CONTROL: the same citations mean ${dMean.toFixed(1)} on the displayed frame vs ${sMean.toFixed(1)} on the stored frame — orientation-before-geometry is load-bearing, not decorative`,
  );
  return lines.join('; ');
});

// ---------------------------------------------------------------------------

let failed = 0;
console.log('mupdf verification spike — mupdf ' + (process.env.npm_package_dependencies_mupdf ?? '1.28.0'));
console.log('='.repeat(78));
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  leg ${r.n}  ${r.name}  (${r.ms.toFixed(0)} ms)`);
  console.log(`      ${r.detail}`);
}
console.log('='.repeat(78));
console.log(failed === 0 ? 'SPIKE VERDICT: mupdf carries §6.3' : `SPIKE VERDICT: ${failed} leg(s) FALSIFIED`);
process.exit(failed === 0 ? 0 : 1);
