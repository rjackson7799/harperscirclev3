import { RELATIONSHIPS, SLICES, StepIndicator } from '@/lib/setup/steps';
import { Button } from '@/components/ui/Button';

/**
 * Step 1 · About you (PRD §4.1.3). Writes nothing — the answers ride to
 * step 2 and land with the circle. The declared slice is not decoration:
 * AI-proposed tasks suggest an owner from it (Scope §4.4).
 */
export default async function Step1({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await searchParams;
  return (
    <main className="setup-card">
      <StepIndicator n={1} />
      <h1>About you</h1>
      <p>Two questions, so the product knows who it&apos;s talking to.</p>

      <form method="post" action="/setup/step/1/submit">
        <h2>Your relationship to the people you&apos;re looking after</h2>
        <div className="choice-list">
          {RELATIONSHIPS.map((r) => (
            <label key={r.value}>
              <input type="radio" name="relationship" value={r.value} required /> {r.label}
            </label>
          ))}
        </div>

        <h2>What you mostly handle</h2>
        <div className="choice-list">
          {SLICES.map((s) => (
            <label key={s.value}>
              <input type="radio" name="slice" value={s.value} required /> {s.label}
            </label>
          ))}
        </div>

        <Button type="submit">Continue</Button>
      </form>
    </main>
  );
}
