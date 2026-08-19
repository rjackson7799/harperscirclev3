import { OPENING_CONTEXT, StepIndicator } from '@/lib/setup/steps';
import { Button } from '@/components/ui/Button';

/**
 * Step 3 · What brought you here (PRD §4.1.3). Circle-level, about the
 * founder's moment. In Phase 1 it sets what Home leads with, and nothing
 * else; it is stored because Phase 2's checklist selection reads it —
 * a limit stated so nobody builds against a promise it does not make.
 */
export default async function Step3({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const circle = typeof params.circle === 'string' ? params.circle : '';
  const e = typeof params.e === 'string' ? params.e : '';

  return (
    <main className="setup-card">
      <StepIndicator n={3} />
      <h1>What brought you here</h1>
      <p>Pick anything that fits. This shapes what you see first — nothing else.</p>

      {e === 'circle' && (
        <p className="notice">
          That didn&apos;t save — this step isn&apos;t open for that circle. <a href="/setup">Head
          back to your setup</a> to continue from the right place.
        </p>
      )}

      <form method="post" action="/setup/step/3/submit">
        <input type="hidden" name="circle_id" value={circle} />
        <div className="choice-list">
          {OPENING_CONTEXT.map((o) => (
            <label key={o.value}>
              <input type="checkbox" name="context" value={o.value} /> {o.label}
            </label>
          ))}
        </div>
        <Button type="submit">Continue</Button>
      </form>
    </main>
  );
}
