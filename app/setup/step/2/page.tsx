import { SITUATIONS, StepIndicator } from '@/lib/setup/steps';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

function SubjectBlock({ index, optional }: { index: 1 | 2; optional: boolean }) {
  return (
    <div className="subject-block">
      <h2>{optional ? 'A second person (optional)' : 'Who we’re looking after'}</h2>
      <Field label="First name">
        <Input name={`subject_name_${index}`} required={!optional} />
      </Field>
      <span className="field-label">Where they are right now</span>
      <div className="choice-list">
        {SITUATIONS.map((s) => (
          <label key={s}>
            <input type="radio" name={`situation_${index}`} value={s} required={!optional} /> {s}
          </label>
        ))}
      </div>
      <Field label="Their zip code">
        <Input
          name={`zip_${index}`}
          inputMode="numeric"
          required={!optional}
          placeholder={optional ? 'Leave empty to use the same zip' : ''}
        />
      </Field>
    </div>
  );
}

/**
 * Step 2 · Who we're looking after (PRD §4.1.3, the per-subject fix):
 * situation and location are properties of a SUBJECT, not a household —
 * two parents can be in different places on the same day, and that is
 * the case the product exists for. This submit creates the circle.
 */
export default async function Step2({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const slice = typeof params.slice === 'string' ? params.slice : '';
  const relationship = typeof params.relationship === 'string' ? params.relationship : '';
  const e = typeof params.e === 'string' ? params.e : '';

  return (
    <main className="setup-card">
      <StepIndicator n={2} />
      <h1>Who we&apos;re looking after</h1>
      <p>One or two people. Each gets their own answers — and their own forwarding address.</p>

      {e && (
        <p className="notice">
          Each person needs a first name, one of the listed situations, and a zip code.
        </p>
      )}

      <form method="post" action="/setup/step/2/submit">
        <input type="hidden" name="slice" value={slice} />
        {/* Held until this submit creates the circle (PRD §4.1.3); its
            durable slot is the ADR-0015 queued column. */}
        <input type="hidden" name="relationship" value={relationship} />
        <input type="hidden" name="timezone" id="hc-tz" defaultValue="America/New_York" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.getElementById('hc-tz').value = Intl.DateTimeFormat().resolvedOptions().timeZone;",
          }}
        />
        <SubjectBlock index={1} optional={false} />
        <SubjectBlock index={2} optional={true} />
        <Button type="submit">Create the circle</Button>
      </form>
    </main>
  );
}
