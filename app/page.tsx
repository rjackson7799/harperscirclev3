import { redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';

/**
 * The root routes by session: signed in → setup (which resumes to the
 * furthest step or into the circle — AC-AUTH-9); signed out → sign in.
 * The marketing surface is a later slice ((marketing), §1.7).
 */
export default async function Root() {
  const supabase = await asUser();
  const { data } = await supabase.auth.getClaims();
  redirect(data?.claims?.sub ? '/setup' : '/sign-in');
}
