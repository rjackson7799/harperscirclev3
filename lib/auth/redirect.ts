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
