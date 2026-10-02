import { NextResponse } from 'next/server';
import { authClient } from '@/lib/supabase/server';
import { appOrigin, safeReturnTo } from '@/lib/security';
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const client = await authClient();
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(safeReturnTo(url.searchParams.get('returnTo')), appOrigin()), 303);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }
  return NextResponse.redirect(new URL('/login?error=callback', appOrigin()), 303);
}
