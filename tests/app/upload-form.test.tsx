// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// ============================================================================
// ROUND-19 F-2 · the SENTENCE. Naming the state on the wire is half a fix; the
// other half is what the person standing in a hospital corridor reads.
//
// r2's founder got `401` from /api/upload/token during an auth-server fault,
// and this form rendered "Uploading is not available for this person." That is
// a sentence about PERMISSION — it says the upload will never work for this
// subject, so the honest response to it is to stop trying. The upload was
// fine; the session read was not.
// ============================================================================

vi.mock('tus-js-client', () => ({ Upload: class {} }));

import { UploadForm } from '@/app/(app)/[circle]/upload/upload-form';

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const SUBJECT = '22222222-0000-4000-8000-000000000002';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UploadForm circle={CIRCLE} subjects={[{ id: SUBJECT, first_name: 'Harper' }]} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Put a file on the input the way a person would, then press Upload. */
async function upload(): Promise<void> {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: [new File([new Uint8Array([1, 2, 3])], 'discharge.pdf', { type: 'application/pdf' })],
    configurable: true,
  });
  const button = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Upload'),
  ) as HTMLButtonElement;
  await act(async () => {
    button.click();
  });
}

function said(): string {
  return container.querySelector('[role="status"]')?.textContent ?? '';
}

describe('F-2 · the upload form separates a refusal from an outage', () => {
  it('503 session_unavailable says TRY AGAIN — never that uploading is unavailable for this person', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'session_unavailable' }, { status: 503 })),
    );
    await upload();
    // The old sentence is a statement about the SUBJECT's permissions and it
    // tells a person to give up. This one is about the moment.
    expect(said()).not.toMatch(/not available for this person/i);
    expect(said()).toMatch(/again/i);
  });

  it('a real refusal keeps its own sentence — the fix separates two facts, it does not merge them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await upload();
    expect(said()).toMatch(/not available for this person/i);
  });
});
