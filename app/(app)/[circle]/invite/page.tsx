import { asUser } from '@/lib/db/user';
import { INVITABLE_TIERS, TIERS } from '@/lib/permissions/tiers';
import { TierCeiling } from '@/lib/permissions/tier-ceiling';
import { gatePage } from '@/lib/auth/gate';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/**
 * The invite screen (PRD §4.1.5). The inviter chooses the address, the
 * tier, which subject(s) the invite covers, and an optional note — and
 * under each tier selector, its ceiling in plain words from THE one
 * module (AC-AUTH-8: this screen and the accept screen cannot drift).
 * Only a coordinator can invite and no invite leaves an unverified
 * account — both enforced in hc.create_invite, surfaced here as one
 * refusal shape.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { circle } = await params;
  const query = await searchParams;

  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
  const gate = await gatePage(supabase, `/${circle}/invite`);
  if (gate.kind === 'unavailable') {
    return (
      <>
        <PageHeader title="Invite someone" />
        <SessionUnavailable next={`/${circle}/invite`} />
      </>
    );
  }

  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, first_name')
    .eq('circle_id', circle)
    .order('created_at', { ascending: true });

  const subjectRows = subjects ?? [];
  const subjectNames = subjectRows.map((s: { first_name: string }) => s.first_name);

  return (
    <>
      <PageHeader
        title="Invite someone"
        context="The invite arrives as a link you hand them yourself — copy it on the next screen. It works once, for seven days, and only for the address you name here."
      />
      <div className="setup-card">

        {query.e === 'refused' && (
          <p className="notice">
            That invite couldn&apos;t be issued. Invites need a verified email, a
            coordinator&apos;s seat, and a record that isn&apos;t frozen — and the address and
            subjects have to be complete.
          </p>
        )}
        {query.resend === '1' && (
          <p className="notice">
            The expired invite was withdrawn. This sends a fresh link — the address and role
            are filled in; choose the records it covers.
          </p>
        )}

        <form method="post" action={`/${circle}/invite/submit`}>
          <Field label="Their email">
            <Input
              type="email"
              name="invited_email"
              autoComplete="off"
              required
              defaultValue={typeof query.email === 'string' ? query.email : undefined}
            />
          </Field>

          <span className="field-label">What they&apos;ll be able to see</span>
          <div className="choice-list">
            {INVITABLE_TIERS.map((tier) => (
              <label key={tier} style={{ alignItems: 'flex-start' }}>
                <input
                  type="radio"
                  name="tier"
                  value={tier}
                  required
                  defaultChecked={query.tier === tier || undefined}
                />
                <span>
                  <strong>{TIERS[tier].label}</strong>
                  <TierCeiling tier={tier} person="they" subjectNames={subjectNames} />
                </span>
              </label>
            ))}
          </div>

          <span className="field-label">For which record{subjectRows.length > 1 ? 's' : ''}</span>
          <div className="choice-list">
            {subjectRows.map((s: { id: string; first_name: string }) => (
              <label key={s.id}>
                <input type="checkbox" name="subject_ids" value={s.id} /> {s.first_name}
              </label>
            ))}
          </div>

          <label className="field">
            <span className="field-label">A note from you (optional)</span>
            <textarea name="note" rows={2} />
          </label>

          <Button type="submit">Create the invite link</Button>
        </form>
      </div>
    </>
  );
}
