import 'server-only';
import { redirect } from 'next/navigation';
import { authClient } from '@/lib/supabase/server';
import { safeReturnTo } from '@/lib/security';
export type ClubUser = { userId: string; displayName: string; email: string; fullName: string | null };
export async function getGoogleUser(): Promise<ClubUser | null> {
  const supabase = await authClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    if (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) return null;
    throw new Error('Google sign-in verification is temporarily unavailable.');
  }
  if (!user?.email || !user.email_confirmed_at || user.app_metadata?.provider !== 'google') return null;
  const name = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;
  return { userId: user.id, displayName: name || user.email, email: user.email.toLowerCase(), fullName: name };
}
export async function requireGoogleUser(returnTo = '/admin') {
  const user = await getGoogleUser();
  if (!user) redirect('/login?returnTo=' + encodeURIComponent(safeReturnTo(returnTo)));
  return user;
}
