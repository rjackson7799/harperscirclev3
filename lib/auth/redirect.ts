/**
 * Open-redirect refusal for next= targets (§5.5 posture: auth responses
 * carry no attacker-steerable destination). Only same-origin path
 * navigation survives: a single leading slash, no scheme, no authority.
 */
export function safeNext(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value === '') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.includes(':') || value.includes('\\')) return fallback;
  return value;
}

/**
 * 7D · R3/F-2. Add markers to a `next` WITHOUT colliding with the query it
 * already carries.
 *
 * `${next}?e=nomatch` is wrong for every caller whose next has its own
 * params — the member page's `?rs&rd&rl`, the document-share form's
 * `?share=<member>`, the assign page's `&path=share&document=<id>`. String
 * concatenation puts the marker INSIDE the last value: `rl` becomes
 * `view?e=nomatch`, the page's own set-validation drops it, and the marker
 * the page was supposed to READ never arrives as a param at all.
 *
 * `next` is a safeNext result — same-origin, path-only, no scheme and no
 * authority — so the dummy base is never reachable and never emitted: the
 * return is path + query only, which is what redirect303 wants (a relative
 * Location, deliberately).
 */
export function nextWithMarkers(next: string, markers: Record<string, string>): string {
  const url = new URL(next, 'http://relative.invalid');
  for (const [k, v] of Object.entries(markers)) url.searchParams.set(k, v);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The emailed-link destination rule (the reset flow's, hoisted at the
 * B9 fix so the signup path shares it verbatim): the link's landing
 * comes from CONFIGURATION, never the request — a forged Host must not
 * steer where an emailed token lands. Local dev falls back to its own
 * loopback origin; anywhere else without config the caller omits the
 * redirect entirely and GoTrue's site_url allowlist is the destination
 * — a neutered link, never a poisoned one.
 */
export function emailLinkOrigin(req: Request): string | undefined {
  const requestOrigin = new URL(req.url).origin;
  // `|| undefined`, not `??`: a BLANK env row (the .env.example default)
  // means unconfigured, and must fall through to the loopback rule.
  const configured = process.env.NEXT_PUBLIC_SITE_URL || undefined;
  return (
    configured ??
    (/^https?:\/\/(localhost|127\.)/.test(requestOrigin) ? requestOrigin : undefined)
  );
}
