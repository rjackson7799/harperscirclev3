import type { ButtonHTMLAttributes } from 'react';

/**
 * The §8.4 buttons, wrapping the seed classes — screens keep working
 * mid-migration because the classes ARE the contract. `type` defaults to
 * "button" so a stray in-form button never submits by accident.
 */
export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
}) {
  const base = `button-${variant}`;
  return (
    <button
      type={type}
      className={className ? `${base} ${className}` : base}
      {...rest}
    />
  );
}
