import type { ReactNode } from 'react';

/**
 * The §8.4 field wrapper: label association is STRUCTURAL — the control
 * nests inside its <label> (the pattern every 2B screen uses), so an
 * unassociated field is unwritable through this component. Help copy is
 * the seed's .field-help (muted-text, 11.5px).
 */
export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {help ? <span className="field-help">{help}</span> : null}
    </label>
  );
}
