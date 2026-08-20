import { describe, expect, it } from 'vitest';
import { sniffMime } from '@/lib/pipeline/mime';

// ============================================================================
// B4 · MIME is validated against ACTUAL CONTENT, never the declared type
// or the extension (TSD §4.6; PRD §4.2.8, AC-INBOX-14). The sniffed type
// is what hc.finalize_store records as mime_detected.
// Test class: UNIT (pure).
// ============================================================================

function bytes(...parts: (string | number[])[]): Uint8Array {
  const arrays = parts.map((p) =>
    typeof p === 'string' ? new TextEncoder().encode(p) : new Uint8Array(p),
  );
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

describe('B4 · magic bytes beat declarations', () => {
  it('recognises the §4.6 set from content alone', () => {
    expect(sniffMime(bytes('%PDF-1.7 …'), 'image/png')).toBe('application/pdf');
    expect(sniffMime(bytes([0xff, 0xd8, 0xff, 0xe0]), 'application/pdf')).toBe('image/jpeg');
    expect(sniffMime(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), '')).toBe(
      'image/png',
    );
    expect(sniffMime(bytes('GIF89a'), '')).toBe('image/gif');
    expect(sniffMime(bytes([0x49, 0x49, 0x2a, 0x00]), '')).toBe('image/tiff');
    expect(sniffMime(bytes([0x4d, 0x4d, 0x00, 0x2a]), '')).toBe('image/tiff');
    expect(sniffMime(bytes([0x50, 0x4b, 0x03, 0x04]), 'application/pdf')).toBe('application/zip');
  });

  it('a renamed executable is NOT its extension: unknown binary ⇒ octet-stream, whatever was declared', () => {
    expect(sniffMime(bytes([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]), 'application/pdf')).toBe(
      'application/octet-stream',
    );
  });

  it('printable text sniffs as text/plain; JSON-looking text as application/json', () => {
    expect(sniffMime(bytes('Dear family,\nThe visit went well.\n'), 'application/pdf')).toBe(
      'text/plain',
    );
    expect(sniffMime(bytes('{"subject":"Discharge"}'), '')).toBe('application/json');
  });

  it('empty input is octet-stream, never a throw', () => {
    expect(sniffMime(new Uint8Array(0), 'text/plain')).toBe('application/octet-stream');
  });
});
