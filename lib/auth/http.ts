/**
 * Shared response shape for the (auth) submit routes. Every mutation
 * answers 303 See Other (PRG) — form-friendly without JS, fetch-friendly
 * with it — and the byte-identity tests compare these responses whole, so
 * building them in ONE place keeps an accidental header from becoming an
 * oracle.
 */
export function redirect303(_req: Request, path: string): Response {
  // Relative Location on purpose: the server never asserts its own
  // origin (dev binds localhost while the browser may sit on 127.0.0.1,
  // and an absolute Location would hop origins and orphan the cookies).
  return new Response(null, {
    status: 303,
    headers: {
      location: path,
      'cache-control': 'no-store',
    },
  });
}

export async function formFields(req: Request): Promise<Record<string, string>> {
  const form = await req.formData();
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') fields[key] = value;
  }
  return fields;
}
