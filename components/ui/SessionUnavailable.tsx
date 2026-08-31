/**
 * The page gate's THIRD outcome, rendered (7B B1 — GTE-01, OW-11; ADR-0028
 * D8 item 2). "We could not read your session" is not "you are not signed
 * in": a page that reaches this has a person in front of it whose session
 * may be perfectly live, and the only thing it can honestly say is to try
 * again. The words are the same ones the 503 answer carries
 * (lib/http/session-unavailable.ts), so the two shapes cannot drift apart.
 *
 * `role="alert"` because it replaces the content the person asked for;
 * `next` is the page's own path, so "try again" is exactly one tap.
 */
import {
  SESSION_UNAVAILABLE_BODY,
  SESSION_UNAVAILABLE_HEADLINE,
} from '@/lib/http/session-unavailable';

export function SessionUnavailable({ next }: { next: string }) {
  return (
    <p className="field-help" role="alert">
      {SESSION_UNAVAILABLE_HEADLINE} {SESSION_UNAVAILABLE_BODY}{' '}
      <a href={next}>Try again</a>
    </p>
  );
}
