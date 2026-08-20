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
