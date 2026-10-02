import 'server-only';
import { createClient } from '@supabase/supabase-js';

// This client is deliberately separate from the user's cookie-backed auth client.
// Never import it into client components or pass it a caller's Authorization header.
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
