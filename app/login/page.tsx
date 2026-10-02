import { admin } from '@/lib/club-server';
import { getGoogleUser } from '@/lib/auth';
import { safeReturnTo } from '@/lib/security';
import { redirect } from 'next/navigation';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const params = await searchParams;
  let user = null, authorized = null, failed = false;
  try { user = await getGoogleUser(); if (user) authorized = await admin(user); } catch { failed = true; }
  if (authorized) redirect('/admin');
  return <main className="login-page"><a href="/" className="back-link"><ArrowLeft size={18}/> Back to the club website</a><section className="login-card"><span className="login-icon"><ShieldCheck size={32}/></span><div className="eyebrow">CLUB ADMINISTRATION</div><h1>Welcome back.</h1><p>कार्यबिनायक संस्कृति युवा क्लब</p><p className="muted">Sign in with an approved Google account to manage club records.</p>{failed ? <p role="alert">Sign-in verification is temporarily unavailable. Please try again.</p> : user ? <><p className="error-text">This Google account has not been approved. Ask the club owner to add your email in Website Settings.</p><form action="/auth/sign-out" method="post"><button className="btn">Use another account</button></form></> : <><form action="/auth/sign-in" method="post"><input type="hidden" name="returnTo" value={safeReturnTo(params.returnTo || null)}/><button className="btn">Continue with Google <ShieldCheck size={18}/></button></form>{params.error && <p role="alert" className="error-text">Google sign-in did not complete. Please try again. If it continues, check the Google provider and callback URLs.</p>}</>}<small>Only the owner and approved administrators can access private club records.</small></section></main>;
}
