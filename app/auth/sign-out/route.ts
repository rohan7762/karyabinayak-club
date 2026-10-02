import { NextResponse } from 'next/server';
import { authClient } from '@/lib/supabase/server';
import { appOrigin, sameOrigin } from '@/lib/security';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const client = await authClient();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) return new Response('Could not sign out. Please try again.', { status: 503 });
  return NextResponse.redirect(new URL('/login', appOrigin()), 303);
}
