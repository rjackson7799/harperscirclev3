/**
 * The removable chip (§8.4): white fill, tinted border, pill radius,
 * 6px 13px, ending in a × in faint at 14px glyph size — with a padded
 * hit area ≥44px (§8.7), kept visually compact by negative margins. The
 * dismiss is a real labelled button; the glyph itself is decorative.
 */
export function RemovableChip({
  label,
  onRemoveAction,
}: {
  label: string;
  /** Server action or client handler; the chip renders without one too. */
  onRemoveAction?: () => void;
}) {
  return (
    <span className="removable-chip">
      {label}
      <button
        type="button"
        className="chip-dismiss"
        aria-label={`Remove ${label}`}
        onClick={onRemoveAction}
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}
