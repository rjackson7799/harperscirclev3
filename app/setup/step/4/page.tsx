import { StepIndicator } from '@/lib/setup/steps';

/**
 * Step 4 · First document (PRD §4.1.3). Optional and skippable in one
 * tap. The upload runs the real pipeline (§4.2) — which is the ingestion
 * slice's to switch on (RLY-01 keeps the operational pipeline
 * production-disabled through 2B, ADR-0008 M1), so the affordance is
 * present, disabled, with the reason in plain words. A failed or absent
 * first document never blocks completion.
 */
export default async function Step4({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const circle = typeof params.circle === 'string' ? params.circle : '';

  return (
    <main className="setup-card">
      <StepIndicator n={4} />
      <h1>First document</h1>
      <p>
        If something&apos;s in reach — a discharge summary, a bill, a letter — this is where
        it would go in. The product files it and shows you exactly what it read.
      </p>

      <div className="notice">
        Uploading switches on with the Care Inbox, which is arriving next. Nothing else waits
        on it — finish setup and the forwarding addresses are ready on the last screen.
      </div>

      <p>
        <a className="button-primary" href={`/setup/complete?circle=${encodeURIComponent(circle)}`}>
          Finish setup
        </a>
      </p>
    </main>
  );
}
