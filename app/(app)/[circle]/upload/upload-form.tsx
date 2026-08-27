'use client';

import { useRef, useState } from 'react';
import { Upload } from 'tus-js-client';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

/**
 * The §2.12 resumable upload (tus-js-client — the one Q4-approved
 * runtime dependency; PRD §13.4: an interrupted upload in a hospital
 * corridor resumes). The flow:
 *
 *   1. POST /api/upload/token — the server checks the right to ingest
 *      and mints a subject-scoped, expiring HMAC grant for ONE staging
 *      key.
 *   2. tus upload through the SAME-ORIGIN proxy (/api/upload/tus): the
 *      grant rides x-hc-grant / x-hc-key on every hop, the server
 *      forwards to storage on a credential the browser never holds, and
 *      the rewritten Location is a server-signed continuation target —
 *      no storage URL or credential ever reaches this browser. The tus
 *      fingerprint is KEPT on success of each chunk, so a dropped
 *      connection resumes where it stopped (§13.4).
 *   3. POST /api/upload/complete — the server verifies that signed
 *      target, measures the staged bytes, creates the arrival, and the
 *      pipeline takes over. The item appears in the inbox with its
 *      honest state from that moment (§4.4).
 */

type SubjectOption = { id: string; first_name: string };

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; pct: number }
  | { kind: 'finishing' }
  | { kind: 'done'; fileName: string }
  | { kind: 'failed'; message: string };

const CHUNK_SIZE = 6 * 1024 * 1024; // the storage resumable contract

export function UploadForm({
  circle,
  subjects,
}: {
  circle: string;
  subjects: SubjectOption[];
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);

  async function start() {
    const file = fileRef.current?.files?.[0];
    if (!file || !subjectId) return;

    setPhase({ kind: 'uploading', pct: 0 });
    try {
      const minted = await fetch('/api/upload/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId }),
      });
      if (!minted.ok) {
        // ROUND-19 F-2: an OUTAGE is not a REFUSAL, and the two sentences say
        // opposite things about what to do next. "Not available for this
        // person" is about permission and the honest response to it is to stop
        // trying; r2's founder read it during an auth-server fault that lasted
        // seconds. 503 is the server saying it could not read the session —
        // nothing about the subject, and worth trying again.
        setPhase({
          kind: 'failed',
          message:
            minted.status === 503
              ? 'We couldn’t reach your account just now. Try again in a moment.'
              : 'Uploading is not available for this person.',
        });
        return;
      }
      const { upload } = (await minted.json()) as {
        upload: { key: string; grant: string; endpoint: string };
      };

      let signedTarget: string | null = null;
      await new Promise<void>((resolve, reject) => {
        const tusUpload = new Upload(file, {
          // The SAME-ORIGIN proxy (B9): the expiring server-minted grant
          // gates every hop; no storage URL or credential ever reaches
          // this browser, and no cross-origin request exists to break.
          endpoint: upload.endpoint,
          chunkSize: CHUNK_SIZE,
          retryDelays: [0, 1000, 3000, 5000],
          removeFingerprintOnSuccess: true,
          headers: {
            'x-hc-grant': upload.grant,
            'x-hc-key': upload.key,
          },
          metadata: {
            bucketName: 'artifacts',
            objectName: upload.key,
            contentType: file.type || 'application/octet-stream',
            cacheControl: '3600',
          },
          onError: reject,
          onProgress: (sent, total) => {
            setPhase({ kind: 'uploading', pct: total ? Math.round((sent / total) * 100) : 0 });
          },
          onSuccess: () => {
            // The final upload URL carries our server-signed continuation
            // target — on a resumed attempt it is the ORIGINAL upload's,
            // which is exactly what completion must reconcile against.
            signedTarget = tusUpload.url
              ? new URL(tusUpload.url, window.location.origin).pathname.split('/').pop() ?? null
              : null;
            resolve();
          },
        });
        // Resume an interrupted attempt for the same file when one exists.
        tusUpload.findPreviousUploads().then((previous) => {
          if (previous.length > 0) tusUpload.resumeFromPreviousUpload(previous[0]);
          tusUpload.start();
        }, reject);
      });

      setPhase({ kind: 'finishing' });
      if (!signedTarget) {
        setPhase({ kind: 'failed', message: 'The upload could not be finished. Try again.' });
        return;
      }
      const completed = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, token: signedTarget }),
      });
      if (!completed.ok) {
        // F-2, and here the distinction is load-bearing: the BYTES ARE ALREADY
        // STAGED. "Try again" is right either way, but a 503 must not read as
        // though the upload itself failed — choosing the same file resumes it.
        setPhase({
          kind: 'failed',
          message:
            completed.status === 503
              ? 'We couldn’t reach your account just now. Choose the same file to finish it.'
              : 'The upload could not be finished. Try again.',
        });
        return;
      }
      setPhase({ kind: 'done', fileName: file.name });
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setPhase({
        kind: 'failed',
        message: 'The upload was interrupted. Choose the same file to resume where it stopped.',
      });
    }
  }

  const busy = phase.kind === 'uploading' || phase.kind === 'finishing';

  return (
    <div className="choice-list">
      {subjects.length > 1 ? (
        <Field label="Who is this about?">
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={busy}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field
        label="Document"
        help="Up to 50 MB per file. An interrupted upload resumes when you choose the same file again."
      >
        <input ref={fileRef} type="file" disabled={busy} />
      </Field>

      <Button onClick={start} disabled={busy}>
        {phase.kind === 'uploading'
          ? `Uploading — ${phase.pct}%`
          : phase.kind === 'finishing'
            ? 'Finishing…'
            : 'Upload'}
      </Button>

      <p role="status" className="field-help">
        {phase.kind === 'done'
          ? `${phase.fileName} is in. It will show in the inbox with its progress.`
          : phase.kind === 'failed'
            ? phase.message
            : ''}
      </p>
      <p className="field-help">
        Prefer email? Anything sent to {circle ? 'this circle' : 'the circle'}&apos;s forwarding
        address arrives the same way.
      </p>
    </div>
  );
}
