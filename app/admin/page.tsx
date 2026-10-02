import { requireGoogleUser } from '@/lib/auth';
import { admin } from '@/lib/club-server';
import { redirect } from 'next/navigation';
import ClubAdmin from './club-admin';
export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  const user = await requireGoogleUser('/admin');
  let a;
  try { a = await admin(user); }
  catch { return <main className="load-error"><h1>Club records are temporarily unavailable</h1><p>Check the database setup, then try again.</p><a href="/admin" className="btn">Try again</a></main>; }
  if (!a) redirect('/login');
  return <ClubAdmin/>;
}
