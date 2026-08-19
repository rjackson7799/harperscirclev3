import type { InputHTMLAttributes } from 'react';

/**
 * The §8.4 input: the element styles live on the global input rules
 * (white fill, line border, 10px radius, faint placeholder, the 2px
 * green focus ring). Use inside <Field> so the label association is
 * structural; inside a `.composed-control` shell the border drops (the
 * zip-field pattern).
 */
export function Input({
  type = 'text',
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} {...rest} />;
}
