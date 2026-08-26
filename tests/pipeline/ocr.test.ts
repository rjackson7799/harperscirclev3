import { describe, expect, it } from 'vitest';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import {
  OCR_CONFIDENCE_FLOOR,
  OCR_WALL_CLOCK_MS,
  engineLocations,
  isImageOnlySource,
  ocrRenderedPages,
  realPathOr,
  OcrEngineUnavailable,
} from '@/lib/pipeline/ocr';
import type { RenderedPage } from '@/lib/pipeline/render';

// ============================================================================
// 6B B9 · §6.9's OCR — a reading aid, never a fact (slice-6 plan B9; OCR-01;
// A11Y-08's engine half; TSD §6.9).
//
// THE REAL ENGINE, deliberately: tesseract.js against pages this suite draws
// itself, because a mocked engine proves an interface and §6.9 promises a
// PERSON something ("a blind coordinator would otherwise have an inaccessible
// record"). The language data is the engine's own npm package resolved
// LOCALLY (`@tesseract.js-data/eng`) — no CDN, no network: the same
// no-remote-fetch posture the email renderer is pinned to.
//
// The contract:
//   · an image-only source's page yields its text — stored as the `pNNN.txt`
//     sibling the slice-5 exit assertion reserved (the worker half pins the
//     key; this file pins the reading);
//   · POOR CONFIDENCE IS SAID, not presented: below the floor the page's
//     text is EMPTY, and the screen renders the honest sentence — garbage is
//     never dressed as text (§6.9's third clause);
//   · the whole pass is BUDGETED: pages beyond the wall clock land empty
//     instead of holding the extract stage's lease open. The budget is
//     sampled between pages (tesseract.js exposes no mid-page interrupt),
//     which the module says of itself — unlike the render deadline, and
//     recorded as such.
//   · only image-only SOURCE CLASSES are OCR'd at all: a born-digital PDF
//     has a text layer and an email body IS text — machine-reading a
//     rendering of real text would manufacture errors §6.9 never asked for.
// ============================================================================

function pageOf(canvas: Canvas, page: number, bytes: Uint8Array): RenderedPage {
  return {
    page,
    widthPx: canvas.width,
    heightPx: canvas.height,
    mime: 'image/png',
    bytes,
  };
}

async function textPage(page: number, lines: string[]): Promise<RenderedPage> {
  const canvas: Canvas = createCanvas(1212, 800);
  const cx = canvas.getContext('2d');
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, 1212, 800);
  cx.fillStyle = '#000000';
  cx.font = '48px sans-serif';
  lines.forEach((line, i) => cx.fillText(line, 96, 160 + i * 96));
  return pageOf(canvas, page, new Uint8Array(await canvas.encode('png')));
}

async function noisePage(page: number): Promise<RenderedPage> {
  const canvas: Canvas = createCanvas(400, 400);
  const cx = canvas.getContext('2d');
  // Deterministic speckle — no Math.random, so a red run is reproducible.
  for (let y = 0; y < 400; y += 4) {
    for (let x = 0; x < 400; x += 4) {
      const v = (x * 7919 + y * 104729) % 255;
      cx.fillStyle = `rgb(${v}, ${(v * 3) % 255}, ${(v * 7) % 255})`;
      cx.fillRect(x, y, 4, 4);
    }
  }
  return pageOf(canvas, page, new Uint8Array(await canvas.encode('png')));
}

// ============================================================================
// 6B close-out · WHERE THE ENGINE LIVES IS THIS INSTALL'S FACT.
//
// `langPath` was resolved through createRequire from the start; `workerPath`
// was left to tesseract.js's own default, which computes it from ITS
// `__dirname` (src/worker/node/defaultOptions.js). Under vitest that is a
// real directory and every test here passed. Inside the Next server bundle
// it is rewritten, and the close-out gate watched the worker try to spawn
// `C:\ROOT\node_modules\tesseract.js\src\worker-script\node\index.js` — so
// §6.9's reading aid was simply ABSENT from the running app while this
// suite, running the real engine, stayed green.
//
// The axis that broke was never mocked-vs-real (B9 chose real, and was
// right to). It was plain-Node-vs-bundled-runtime, which only an e2e leg
// crosses. This case pins the resolution; e2e/review.spec.ts's A11Y-08 leg
// pins the WIRING, because it is the only place the bundle is real.
// ============================================================================
describe('6B · the engine’s parts are resolved, never guessed by a bundler', () => {
  it('both paths are absolute and exist in THIS install', () => {
    const { langPath, workerPath } = engineLocations();
    for (const [name, p] of Object.entries({ langPath, workerPath })) {
      expect(isAbsolute(p), `${name} is absolute`).toBe(true);
      expect(existsSync(p), `${name} exists: ${p}`).toBe(true);
    }
  });

  it('the worker script is the node build, not a CDN or a bundler’s guess', () => {
    const { workerPath } = engineLocations();
    expect(workerPath).toContain('tesseract.js');
    expect(workerPath.replace(/\\/g, '/')).toContain('worker-script/node');
    expect(workerPath).not.toContain('ROOT');
  });
});

describe('6B B9 · §6.9: the engine reads what a person wrote', () => {
  it(
    'a clear page yields its text, locally, with no network',
    { timeout: 180_000 },
    async () => {
      const out = await ocrRenderedPages([
        await textPage(1, ['Amoxicillin 500 mg twice daily.', 'Call the front desk with questions.']),
      ]);
      expect(out).toHaveLength(1);
      expect(out[0].page).toBe(1);
      expect(out[0].text).toMatch(/amoxicillin/i);
      expect(out[0].text).toMatch(/500\s*mg/i);
    },
  );

  it(
    'poor confidence is SAID, not presented: a noise page lands EMPTY, never garbage',
    { timeout: 180_000 },
    async () => {
      const out = await ocrRenderedPages([await noisePage(1)]);
      expect(out).toHaveLength(1);
      // Either the engine read nothing, or what it read fell below the
      // floor — both land the SAME empty shape the screen renders honestly.
      expect(out[0].text).toBe('');
    },
  );
});

describe('6B B9 · the pass is budgeted — a reading aid never holds the lease', () => {
  it(
    'pages beyond the wall clock land empty instead of running the stage out',
    { timeout: 180_000 },
    async () => {
      // A scripted clock: the first call anchors the deadline, every later
      // call is past it — so every page is beyond budget, lands empty, and
      // the engine never runs a page.
      let calls = 0;
      const out = await ocrRenderedPages(
        [await textPage(1, ['Amoxicillin 500 mg']), await textPage(2, ['Call the desk'])],
        { now: () => (calls++ === 0 ? 0 : OCR_WALL_CLOCK_MS + 1) },
      );
      expect(out).toEqual([
        { page: 1, text: '' },
        { page: 2, text: '' },
      ]);
    },
  );

  it('the floor and the budget are named constants, not magic', () => {
    expect(OCR_CONFIDENCE_FLOOR).toBeGreaterThan(0);
    expect(OCR_CONFIDENCE_FLOOR).toBeLessThan(100);
    expect(OCR_WALL_CLOCK_MS).toBeGreaterThan(0);
  });
});

describe('6B B9 · only image-only sources are OCR’d at all (§6.9’s letter)', () => {
  it('scanned PDFs and photos are image-only; born-digital and email are NOT', () => {
    expect(isImageOnlySource('scanned_pdf')).toBe(true);
    expect(isImageOnlySource('photo')).toBe(true);
    expect(isImageOnlySource('born_digital_pdf')).toBe(false);
    expect(isImageOnlySource('email_text')).toBe(false);
  });
});

// ============================================================================
// ROUND 18 · F-2 (MAJOR) — THE VALIDATION AND THE FALLBACK ARE THE WRONG WAY
// ROUND.
//
// realPathOr is:
//
//     try {
//       const resolved = resolve();
//       if (isAbsolute(resolved) && existsSync(resolved)) return resolved;
//     } catch { }
//     return join(process.cwd(), 'node_modules', ...fallbackSegments);
//
// existsSync appears EXACTLY ONCE in the module, on the resolve() result. The
// fallback is returned UNCHECKED. And by ADR-0026's own recorded evidence,
// inside the Next bundle require.resolve returns a MODULE ID rather than a
// path — before and after serverExternalPackages ("externalising changed WHICH
// id came back, not that it was an id"). So in the running app the guard fails
// BY DESIGN and the unchecked process.cwd() fallback is the branch that
// actually locates the engine. The module validates the branch that never
// runs.
//
// That fallback carries two assumptions, neither asserted anywhere: that
// process.cwd() is the project root, and that node_modules is flat beneath it.
// Both are true on this host. Neither is guaranteed under pnpm, npm
// workspaces, a monorepo, or a traced serverless bundle.
//
// AND WHEN THE ASSUMPTION BREAKS, NOTHING SAYS SO. bootWorker throws
// MODULE_NOT_FOUND, which propagates out of ocrRenderedPages, and the worker
// route absorbs it with a console.warn. That absorption is a CORRECT product
// decision — a reading aid must never fail the answer it aids — but combined
// with an unchecked fallback it reproduces D15 finding 3 exactly: §6.9's
// reading aid absent from the running app, the pipeline green, and a blind
// coordinator with an inaccessible record. Every test in the repo stays green.
//
// The existing two cases above pass on THIS install and would keep passing on
// a host where the fallback is wrong, because on this host the resolve branch
// and the fallback happen to agree. These drive the fallback directly.
// ============================================================================
describe('Round-18 F-2 · the branch the bundle actually takes is checked too', () => {
  const MISSING = ['@no-such-scope', 'no-such-package', 'index.js'];

  it('an unresolvable engine is a NAMED failure, not a path that does not exist', () => {
    let caught: unknown;
    try {
      realPathOr(() => {
        throw new Error('Cannot find module');
      }, ...MISSING);
    } catch (e) {
      caught = e;
    }
    // Named explicitly rather than via toThrow(Ctor): while the export does not
    // exist the constructor is `undefined`, and toThrow(undefined) degrades to
    // "it threw something" — which a TypeError satisfies. A case that passes for
    // the wrong reason is the F-5 class, in the file that argues against it.
    expect((caught as Error)?.name).toBe('OcrEngineUnavailable');
    expect(caught).toBeInstanceOf(OcrEngineUnavailable);
  });

  it('and the failure names BOTH candidates, so the next reader is not guessing', () => {
    let caught: unknown;
    try {
      realPathOr(() => 'tesseract.js/src/worker-script/node/index.js', ...MISSING);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OcrEngineUnavailable);
    const msg = (caught as Error).message;
    // what the resolve returned…
    expect(msg).toContain('tesseract.js/src/worker-script/node/index.js');
    // …and where the fallback looked.
    expect(msg).toContain('no-such-package');
  });

  it('CONTROL: a MODULE ID from the bundle still falls back — this is the branch that runs in the app', () => {
    // Not a path. isAbsolute() is false, so the guard declines it exactly as it
    // does inside Turbopack, and the fallback answers. This is the branch D15
    // finding 3 proved is the live one, and it must keep working.
    const p = realPathOr(
      () => '[project]/node_modules/tesseract.js/src/worker-script/node/index.js [app-rsc]',
      'tesseract.js',
      'src',
      'worker-script',
      'node',
      'index.js',
    );
    expect(isAbsolute(p)).toBe(true);
    expect(existsSync(p)).toBe(true);
  });

  it('CONTROL: a real absolute path is still preferred over the fallback', () => {
    const real = engineLocations().workerPath;
    expect(realPathOr(() => real, ...MISSING)).toBe(real);
  });

  it('THE CLASS: this module never hands back a path it has not checked', () => {
    // The whole finding in one line. Whichever branch answers, the answer has
    // been to the filesystem.
    for (const p of Object.values(engineLocations())) {
      expect(existsSync(p)).toBe(true);
    }
  });
});
