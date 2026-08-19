import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D6 · §8.6 data display (DS-06): the three §2.7 temporal kinds rendered
// honestly — a due date is a date, an appointment is a local time WITH
// its zone, a floating time says so; relatives; the calendar numeral;
// one-sentence empty states; the provenance line (the interface half of
// N2). And the AC-PPL-6 structural guarantee: no chart, progress or
// percentage primitive EXISTS to import.
// ============================================================================

const repo = path.resolve(__dirname, '../..');
const sheet = readFileSync(path.join(repo, 'app/globals.css'), 'utf8');

function block(selector: string): string {
  const re = new RegExp(
    `(^|\\n)[^{}]*${selector.replace(/[.[\]]/g, (c) => `\\${c}`)}[^{}]*\\{([^}]*)\\}`,
  );
  const m = re.exec(sheet);
  if (!m) throw new Error(`no CSS block for ${selector}`);
  return m[2];
}

describe('D6 · the three temporal kinds (§2.7, §8.6)', () => {
  it('a due date is a date: "Sunday, July 12" — and a timestamp is refused', async () => {
    const { formatDueDate } = await import('@/lib/format/dates');
    expect(formatDueDate('2020-07-12')).toBe('Sunday, July 12');
    expect(formatDueDate('2026-02-03')).toBe('Tuesday, February 3');
    expect(() => formatDueDate('2020-07-12T10:00:00Z')).toThrow();
    expect(() => formatDueDate('July 12')).toThrow();
  });

  it('an appointment is the intended LOCAL time with its zone, · separated', async () => {
    const { formatAppointment } = await import('@/lib/format/dates');
    const line = formatAppointment({
      localAt: '2026-01-20T15:00',
      ianaZone: 'America/Denver',
      instant: '2026-01-20T22:00:00Z',
    });
    expect(line).toContain('Tuesday, January 20');
    expect(line).toContain('3:00 PM');
    expect(line).toContain('MST');
    expect(line).toContain('·');
  });

  it('a floating time says so — never silently assigned a zone', async () => {
    const { formatFloating } = await import('@/lib/format/dates');
    const line = formatFloating('2026-01-20T15:00');
    expect(line).toContain('3:00 PM');
    expect(line.toLowerCase()).toContain('no time zone');
  });

  it('relatives are honest tiers: just now → minutes → today → yesterday → this week → the date', async () => {
    const { formatRelative } = await import('@/lib/format/dates');
    const now = new Date('2026-07-15T18:00:00Z'); // Wednesday
    const zone = 'America/Denver';
    expect(formatRelative(new Date('2026-07-15T17:59:20Z'), now, zone)).toBe('just now');
    expect(formatRelative(new Date('2026-07-15T17:35:00Z'), now, zone)).toBe('25 minutes ago');
    expect(formatRelative(new Date('2026-07-15T13:00:00Z'), now, zone)).toBe('today');
    expect(formatRelative(new Date('2026-07-14T20:00:00Z'), now, zone)).toBe('yesterday');
    expect(formatRelative(new Date('2026-07-13T00:30:00Z'), now, zone)).toBe('this week');
    expect(formatRelative(new Date('2026-06-02T12:00:00Z'), now, zone)).toBe('June 2');
  });
});

describe('D6 · CalendarNumeral (§8.6)', () => {
  it('uppercase month over serif day in a 38px fixed column; 10px resolves the 9.5 range at the §8.2 floor', async () => {
    const { CalendarNumeral } = await import('@/components/ui/CalendarNumeral');
    const html = renderToStaticMarkup(<CalendarNumeral date="2026-07-12" />);
    expect(html).toContain('calendar-numeral');
    expect(html).toMatch(/calendar-numeral-month[^>]*>Jul</);
    expect(html).toMatch(/calendar-numeral-day[^>]*>12</);
    const col = block('.calendar-numeral');
    expect(col).toContain('width: 38px');
    const month = block('.calendar-numeral-month');
    expect(month).toContain('font-size: 10px');
    expect(month).toContain('text-transform: uppercase');
    const day = block('.calendar-numeral-day');
    expect(day).toContain('font-size: 18px');
    expect(day).toContain('var(--font-serif)');
  });
});

describe('D6 · EmptyState — one sentence, nothing else (§8.6)', () => {
  it('renders the sentence with no illustration and no CTA', async () => {
    const { EmptyState } = await import('@/components/ui/EmptyState');
    const html = renderToStaticMarkup(
      <EmptyState>Nothing on the books for this month.</EmptyState>,
    );
    expect(html).toContain('empty-state');
    expect(html).toContain('Nothing on the books for this month.');
    expect(html).not.toMatch(/<svg|<img|<button|<a /);
  });

  it('12.5px, on the AA-holding muted-text variant (the ADR-0016 recorded deviation from §8.6’s faint: an empty-state sentence is the ONLY content, so §8.7’s redundancy exemption cannot cover it)', () => {
    const css = block('.empty-state');
    expect(css).toContain('font-size: 12.5px');
    expect(css).toContain('color: var(--muted-text)');
  });
});

describe('D6 · ProvenanceLine — the interface half of N2 (§8.6)', () => {
  it('renders the source in a muted 11–12px line', async () => {
    const { ProvenanceLine } = await import('@/components/ui/ProvenanceLine');
    const html = renderToStaticMarkup(
      <ProvenanceLine>Discharge summary · page 2</ProvenanceLine>,
    );
    expect(html).toContain('provenance');
    expect(html).toContain('Discharge summary · page 2');
    const css = block('.provenance');
    expect(css).toContain('font-size: 11.5px');
    expect(css).toContain('color: var(--muted-text)');
  });
});

describe('D6 · AC-PPL-6, structurally: no chart primitive exists to import', () => {
  it('no component file or CSS class smells of charts, progress or percentages', () => {
    const FORBIDDEN = /chart|progress|percent|gauge|meter|spark|donut|graph/i;
    const offenders: string[] = [];
    for (const entry of readdirSync(path.join(repo, 'components'), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (entry.isFile() && FORBIDDEN.test(entry.name)) {
        offenders.push(entry.name);
      }
    }
    for (const m of sheet.matchAll(/\.([\w-]+)\s*[,{]/g)) {
      if (FORBIDDEN.test(m[1])) offenders.push(`.${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });
});
