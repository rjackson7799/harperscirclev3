/**
 * Shared response shape for the (auth) submit routes. Every mutation
 * answers 303 See Other (PRG) — form-friendly without JS, fetch-friendly
 * with it — and the byte-identity tests compare these responses whole, so
 * building them in ONE place keeps an accidental header from becoming an
 * oracle.
 */
export function redirect303(req: Request, path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(path, req.url).toString(),
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
