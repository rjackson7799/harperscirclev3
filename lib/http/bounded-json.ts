/**
 * 7C C2 (OW-19, ADR-0028 D15 item 5): the upload routes' INGRESS cap. Both
 * legal bodies are two short JSON fields; 4 KiB is generous and everything
 * past it is refused BEFORE any parse or probe — the declared content-length
 * first (no bytes read), then the actual text as the backstop for a body
 * that lied or never declared.
 */
const UPLOAD_JSON_MAX = 4096;

/** The body's text, or null when it exceeds the ingress cap. */
export async function boundedJsonText(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > UPLOAD_JSON_MAX) return null;
  const text = await req.text();
  return text.length > UPLOAD_JSON_MAX ? null : text;
}
