/**
 * Content sniffing for the store stage (TSD §4.6; PRD §4.2.8,
 * AC-INBOX-14): a MIME type is validated against ACTUAL CONTENT, never
 * the declared type or the extension. The sniffed answer is what
 * hc.finalize_store records as mime_detected. Pure and zero-dep — the
 * §4.6 magic-byte set plus a bounded printable-text fallback; anything
 * unrecognised is honestly application/octet-stream (a renamed
 * executable is never its extension).
 */

function startsWith(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  if (bytes.byteLength < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

// The declared type is accepted and deliberately IGNORED — the signature
// documents the §4.6 rule at the call site (content, never declaration).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function sniffMime(bytes: Uint8Array, _declared?: string): string {
  if (bytes.byteLength === 0) return 'application/octet-stream';

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // %PDF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // GIF8
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00])) return 'image/tiff';
  if (startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return 'image/tiff';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'application/zip';
  if (startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return 'application/zip'; // empty archive

  // Printable-text fallback over a bounded window.
  const window = bytes.subarray(0, Math.min(bytes.byteLength, 2048));
  let printable = 0;
  for (const b of window) {
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b < 0x7f) || b >= 0x80) {
      printable++;
    }
  }
  if (printable === window.length) {
    const text = new TextDecoder().decode(window).trimStart();
    if (text.startsWith('{') || text.startsWith('[')) return 'application/json';
    return 'text/plain';
  }
  return 'application/octet-stream';
}
