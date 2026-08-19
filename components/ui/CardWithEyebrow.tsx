import { ACCENT_TEXT_VAR, type PersonAccent } from '@/lib/design/accents';

/**
 * The standard summary card (§8.4): uppercase 10px accent eyebrow →
 * 22px serif headline → muted explanation. Three lines, that order, no
 * icon. Eyebrow words ride the Q2 text variant of the card's one accent
 * ('green' is the product's own voice and already clears AA).
 */
export function CardWithEyebrow({
  accent,
  eyebrow,
  headline,
  explanation,
}: {
  accent: PersonAccent | 'green';
  eyebrow: string;
  headline: string;
  explanation: string;
}) {
  const color =
    accent === 'green' ? 'var(--green)' : ACCENT_TEXT_VAR[accent];
  return (
    <div className="card">
      <div className="eyebrow" style={{ color }}>
        {eyebrow}
      </div>
      <h2>{headline}</h2>
      <p className="meta">{explanation}</p>
    </div>
  );
}
