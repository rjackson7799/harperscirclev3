// D6 · §8.6 "dates are human", rendered per §2.7's three temporal kinds —
// conflating these is how an appointment moves an hour in November. Pure
// functions over the stored shapes; nothing here touches the system zone
// for STORED values (the viewer's zone enters only for relatives).

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** A date-only value as UTC noon — safe for Intl day/month/weekday reads
 *  with timeZone: 'UTC', immune to zone off-by-one. */
function dateOnlyToUtc(value: string): Date {
  const m = DATE_ONLY.exec(value);
  if (!m) {
    throw new Error(
      `a due date is a DATE (§2.7): got "${value}", expected YYYY-MM-DD — never a timestamp`,
    );
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

/**
 * Date-only (§2.7: a due date, a deadline, an expiration): "Sunday,
 * July 12". A due date has no time; a timestamp input is a bug, refused.
 */
export function formatDueDate(dueOn: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dateOnlyToUtc(dueOn));
}

/** "July 12" — the short human date (relatives fall back to this). */
export function formatShortDate(dueOn: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dateOnlyToUtc(dueOn));
}

function wallClock(localAt: string): {
  datePart: string;
  timePart: string;
} {
  const m = LOCAL_AT.exec(localAt);
  if (!m) {
    throw new Error(`not a local timestamp: "${localAt}" (expected YYYY-MM-DDTHH:mm)`);
  }
  const asUtc = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])),
  );
  return {
    datePart: new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(asUtc),
    timePart: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(asUtc),
  };
}

/**
 * Appointment (§2.7: all three columns): the INTENDED local time is
 * authoritative — rendered from `local_at` verbatim, with the zone's
 * abbreviation derived from `iana_zone` at the stored `instant` (so DST
 * labels stay honest). "Tuesday, January 20 · 3:00 PM MST".
 */
export function formatAppointment({
  localAt,
  ianaZone,
  instant,
}: {
  localAt: string;
  ianaZone: string;
  instant: string | Date;
}): string {
  const { datePart, timePart } = wallClock(localAt);
  const zoneName = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone,
    timeZoneName: 'short',
  })
    .formatToParts(typeof instant === 'string' ? new Date(instant) : instant)
    .find((p) => p.type === 'timeZoneName')?.value;
  return `${datePart} · ${timePart}${zoneName ? ` ${zoneName}` : ''}`;
}

/**
 * Floating (§2.7: a source giving a time but no place): explicitly says
 * so — never silently assigned a zone.
 */
export function formatFloating(localAt: string): string {
  const { datePart, timePart } = wallClock(localAt);
  return `${datePart} · ${timePart} (no time zone given)`;
}

/** §13.1/§4.11 (4B B6): is this arrival past the 4-hour queue-age bound?
 *  Lives here (not in render) so the page stays compiler-pure. */
export function pastQueueAgeBound(receivedAt: string, boundHours = 4): boolean {
  return Date.now() - new Date(receivedAt).getTime() > boundHours * 3600 * 1000;
}

/** §5.4 (4B B6): the 30-day held-mail expiry date, human ("Sep 13, 2026"). */
export function heldExpiryLabel(receivedAt: string): string {
  const expires = new Date(new Date(receivedAt).getTime() + 30 * 24 * 3600 * 1000);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(expires);
}

/** The calendar day/month for a date-only value (the §8.6 numeral). */
export function calendarParts(dueOn: string): { month: string; day: number } {
  const d = dateOnlyToUtc(dueOn);
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d),
    day: d.getUTCDate(),
  };
}

function dayKey(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Relatives (§8.6): "just now" · "N minutes ago" · "today" ·
 * "yesterday" · "this week" (the last seven days) · then the short
 * human date. Day boundaries are the VIEWER's (zone is required —
 * "today" in the wrong zone is an invented fact).
 */
export function formatRelative(instant: Date, now: Date, zone: string): string {
  const seconds = (now.getTime() - instant.getTime()) / 1000;
  if (seconds < 120) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;

  const today = dayKey(now, zone);
  const day = dayKey(instant, zone);
  if (day === today) return 'today';

  const yesterday = dayKey(new Date(now.getTime() - 24 * 3600 * 1000), zone);
  if (day === yesterday) return 'yesterday';

  for (let back = 2; back < 7; back++) {
    if (day === dayKey(new Date(now.getTime() - back * 24 * 3600 * 1000), zone)) {
      return 'this week';
    }
  }
  return formatShortDate(day);
}
