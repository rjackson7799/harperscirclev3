// pdfjs-dist ships no `exports` map and no declaration beside its legacy
// build (the library's own supported entry for Node — the modern build warns
// and defers to it), so the subpath is declared here as re-exporting the
// package's public types. Value resolution happens at runtime via the real
// file; this only tells TypeScript the two share a surface.
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}
