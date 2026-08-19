import { ACCENT_VAR, type Accent } from '@/lib/design/accents';

/**
 * The §8.4 legend — the required companion of every colour-coded view:
 * a 7px dot in the accent + 11px muted label, flex row at 14px gaps,
 * below a hairline rule. Half of how "meaning is never carried by colour
 * alone" is satisfied; the other half is the word beside the colour.
 */
export function Legend({
  items,
}: {
  items: Array<{ accent: Accent | 'green'; label: string }>;
}) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.label} className="legend-item">
          <span
            className="legend-dot"
            style={{
              background:
                item.accent === 'green' ? 'var(--green)' : ACCENT_VAR[item.accent],
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
