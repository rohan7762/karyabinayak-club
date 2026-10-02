import { NextResponse } from 'next/server';
import { authClient } from '@/lib/supabase/server';
import { appOrigin, sameOrigin, safeReturnTo } from '@/lib/security';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  try {
    const form = await req.formData();
    const returnTo = safeReturnTo(String(form.get('returnTo') || '/admin'));
    const client = await authClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${appOrigin()}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`, queryParams: { prompt: 'select_account' } },
    });
    if (error || !data.url) throw new Error('OAuth start failed');
    return NextResponse.redirect(data.url, 303);
  } catch {
    return NextResponse.redirect(new URL('/login?error=signin', appOrigin()), 303);
  }
}
