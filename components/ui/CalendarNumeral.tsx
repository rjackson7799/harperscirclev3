import { calendarParts } from '@/lib/format/dates';

/**
 * The §8.6 calendar numeral: a 9.5px→10px uppercase month (the §8.2
 * floor resolves the spec's 9.5 from below, as with the category badge)
 * over an 18px serif day, in a 38px fixed-width column.
 */
export function CalendarNumeral({ date }: { date: string }) {
  const { month, day } = calendarParts(date);
  return (
    <div className="calendar-numeral">
      <span className="calendar-numeral-month">{month}</span>
      <span className="calendar-numeral-day">{day}</span>
    </div>
  );
}
