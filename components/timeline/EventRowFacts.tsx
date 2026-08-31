import { ProvenanceLine } from '@/components/ui/ProvenanceLine';
import { formatAppointment, formatDueDate, formatFloating, formatShortDate } from '@/lib/format/dates';
import type { EventRow, EventWhen } from '@/lib/hc/timeline';

/**
 * The facts a timeline row carries wherever it renders (the thread and the
 * detail): its date by its own temporal kind (§2.7, §8.6), its kind as a
 * WORD (never colour alone), and its provenance (AC-TL-2; design spec §7):
 * an AI-created event shows the arrival, the read, and the approver; a
 * manual event shows the person and the date.
 */

export const KIND_LABEL: Record<string, string> = {
  medical: 'Medical',
  care: 'Care',
  admin: 'Admin',
  memory: 'Memory',
};

/** §2.7's three temporal kinds, each by its own rule — never conflated. */
export function eventWhenText(when: EventWhen, long = false): string {
  if (when.kind === 'date') return long ? formatDueDate(when.on) : formatShortDate(when.on);
  if (when.kind === 'floating') return formatFloating(when.local_at);
  if (when.kind === 'appointment') {
    return formatAppointment({ localAt: when.local_at, ianaZone: when.iana_zone, instant: when.instant });
  }
  return 'Undated';
}

export function EventProvenance({ event, circle }: { event: EventRow; circle: string }) {
  const approved = `approved by ${event.approver_display_name} · ${formatShortDate(event.approved_at.slice(0, 10))}`;
  if (event.source.kind === 'manual') {
    return (
      <ProvenanceLine>
        Entered by {event.approver_display_name} on {formatShortDate(event.approved_at.slice(0, 10))}
      </ProvenanceLine>
    );
  }
  if (event.source.kind === 'arrival') {
    return (
      <ProvenanceLine>
        <a href={`/${circle}/inbox/${event.source.arrival_id}`}>
          From {event.source.label} · {formatShortDate(event.source.received_at.slice(0, 10))}
        </a>
        {event.extraction ? ' · read by AI' : ''} · {approved}
      </ProvenanceLine>
    );
  }
  if (event.source.kind === 'arrival_unseen') {
    return <ProvenanceLine>From an item in the Care Inbox · {approved}</ProvenanceLine>;
  }
  return (
    <ProvenanceLine>
      Approved by {event.approver_display_name} · {formatShortDate(event.approved_at.slice(0, 10))}
    </ProvenanceLine>
  );
}
