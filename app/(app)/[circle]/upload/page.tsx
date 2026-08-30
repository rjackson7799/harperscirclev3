import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { canIngestForSubject } from '@/lib/hc/upload';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { UploadForm } from './upload-form';

/**
 * The upload surface (slice-4 plan B3; §8.3 shell composition). The
 * subject list is filtered by the SERVER-side right-to-ingest probe —
 * a member below the bar sees the quiet empty sentence and no
 * processing affordance (the Q6 fail-closed posture); the mint route
 * refuses independently either way.
 */
export default async function UploadPage({
  params,
}: {
  params: Promise<{ circle: string }>;
}) {
  const { circle } = await params;
  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
  const gate = await gatePage(supabase, `/${circle}/upload`);
  if (gate.kind === 'unavailable') {
    return (
      <>
        <PageHeader title="Add a document" />
        <SessionUnavailable next={`/${circle}/upload`} />
      </>
    );
  }
  const claims = gate.claims;

  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, first_name')
    .eq('circle_id', circle)
    .is('deleted_at', null)
    .order('first_name');

  const eligible: { id: string; first_name: string }[] = [];
  for (const s of subjects ?? []) {
    if (await canIngestForSubject(claims, s.id)) eligible.push(s);
  }

  return (
    <>
      <PageHeader
        title="Add a document"
        context="Upload a file, or forward it by email — either way it lands in the inbox and nothing is filed without a person approving it."
      />
      {eligible.length === 0 ? (
        <EmptyState>Uploading is not available for you here.</EmptyState>
      ) : (
        <UploadForm circle={circle} subjects={eligible} />
      )}
    </>
  );
}
