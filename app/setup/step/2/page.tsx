import { SITUATIONS, StepIndicator } from '@/lib/setup/steps';

function SubjectBlock({ index, optional }: { index: 1 | 2; optional: boolean }) {
  return (
    <div className="subject-block">
      <h2>{optional ? 'A second person (optional)' : 'Who we’re looking after'}</h2>
      <label className="field">
        <span className="field-label">First name</span>
        <input type="text" name={`subject_name_${index}`} required={!optional} />
      </label>
      <span className="field-label">Where they are right now</span>
      <div className="choice-list">
        {SITUATIONS.map((s) => (
          <label key={s}>
            <input type="radio" name={`situation_${index}`} value={s} required={!optional} /> {s}
          </label>
        ))}
      </div>
      <label className="field">
        <span className="field-label">Their zip code</span>
        <input
          type="text"
          name={`zip_${index}`}
          inputMode="numeric"
          required={!optional}
          placeholder={optional ? 'Leave empty to use the same zip' : ''}
        />
      </label>
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
        <input type="hidden" name="timezone" id="hc-tz" defaultValue="America/New_York" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.getElementById('hc-tz').value = Intl.DateTimeFormat().resolvedOptions().timeZone;",
          }}
        />
        <SubjectBlock index={1} optional={false} />
        <SubjectBlock index={2} optional={true} />
        <button type="submit" className="button-primary">
          Create the circle
        </button>
      </form>
    </main>
  );
}
