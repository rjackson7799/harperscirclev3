import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { RenderedPage, SourceClass } from './render';

/**
 * §6.9's OCR — a reading aid, never a fact (6B B9; OCR-01; A11Y-08).
 *
 * A scanned discharge summary has no text layer, so a blind coordinator
 * would otherwise have an inaccessible record. This module reads the SAME
 * rendered pages the review screen shows — so what the machine read is what
 * the person sees, page for page — and its output lands as the `pNNN.txt`
 * siblings the slice-5 exit assertion reserved. It is stored on the
 * artifact, never in `extractions`, never provenance; the citation still
 * resolves to a region of the image (§6.9's letter).
 *
 * THE ENGINE IS LOCAL (Q3, slice-6 plan): tesseract.js 7.0.0 (Apache-2.0),
 * WASM, no native build — the model-produced-transcripts design was
 * REJECTED at the slice-5 gate and stays rejected, so no provider surface
 * opens here. The language data is the engine's own npm package
 * (`@tesseract.js-data/eng` — the identical bytes its CDN default serves),
 * resolved locally through the same createRequire technique the pdfjs
 * resource directories use: no render, test or worker ever fetches
 * remotely.
 *
 * ONLY IMAGE-ONLY SOURCES ARE READ (`isImageOnlySource`): a born-digital
 * PDF has a text layer and an email body IS text — machine-reading a
 * rendering of real text would manufacture the errors §6.9's label warns
 * about, where the truth was already in hand.
 *
 * POOR CONFIDENCE IS SAID, NOT PRESENTED: below `OCR_CONFIDENCE_FLOOR` a
 * page's text is EMPTY, and the screen renders the honest sentence —
 * garbage never dresses as text.
 *
 * THE PASS IS BUDGETED, and honestly described: `OCR_WALL_CLOCK_MS` is
 * checked BETWEEN pages — tesseract.js exposes no mid-page interrupt, so
 * unlike the render deadline (R3/F-5) this is a sample, not a race, and one
 * pathological page can overrun by its own cost. Pages beyond the budget
 * land empty instead of holding the extract stage's lease open; an aid
 * never becomes the pipeline's spine.
 */

/** Below this per-page confidence (tesseract's 0–100), the transcript is
 *  withheld and the page lands EMPTY — the §6.9 "says so" shape. */
export const OCR_CONFIDENCE_FLOOR = 40;

/** The whole pass's budget, well inside the 300 s extract stage beside the
 *  90 s render ceiling and the provider call. */
export const OCR_WALL_CLOCK_MS = 60_000;

export function isImageOnlySource(sourceClass: SourceClass): boolean {
  return sourceClass === 'scanned_pdf' || sourceClass === 'photo';
}

export type OcrPageText = {
  /** 1-indexed, matching the page it is a sibling of. */
  page: number;
  /** The transcript; EMPTY when confidence fell below the floor, the page
   *  was beyond the wall clock, or the page genuinely holds no text. */
  text: string;
};

type TesseractWorker = {
  recognize: (image: Buffer) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

async function bootWorker(): Promise<TesseractWorker> {
  const { createWorker, OEM } = await import('tesseract.js');
  const require = createRequire(import.meta.url);
  // The engine's own data package, resolved locally — the `4.0.0_best_int`
  // build is exactly what the library's lstmOnly CDN default names.
  const langPath = join(
    dirname(require.resolve('@tesseract.js-data/eng/package.json')),
    '4.0.0_best_int',
  );
  return (await createWorker('eng', OEM.LSTM_ONLY, {
    langPath,
    gzip: true,
    // No cache reads or writes: the resolved package IS the source, and a
    // worker must not scatter traineddata copies into its working directory.
    cacheMethod: 'none',
  })) as unknown as TesseractWorker;
}

/**
 * Read every page, one worker for the whole pass (the library's own
 * guidance), each page bounded by the shared wall clock. Every page in
 * `pages` gets an entry — an out-of-budget or unconfident page is an EMPTY
 * entry, never a missing one, so the sibling set the worker stages always
 * matches the page set and the screen can answer for every page.
 */
export async function ocrRenderedPages(
  pages: RenderedPage[],
  opts: { now?: () => number } = {},
): Promise<OcrPageText[]> {
  const now = opts.now ?? Date.now;
  const deadline = now() + OCR_WALL_CLOCK_MS;
  const out: OcrPageText[] = [];
  let worker: TesseractWorker | null = null;
  try {
    for (const page of pages) {
      if (now() >= deadline) {
        out.push({ page: page.page, text: '' });
        continue;
      }
      worker ??= await bootWorker();
      const { data } = await worker.recognize(Buffer.from(page.bytes));
      const text = data.confidence >= OCR_CONFIDENCE_FLOOR ? data.text.trim() : '';
      out.push({ page: page.page, text });
    }
  } finally {
    if (worker) await worker.terminate();
  }
  return out;
}
