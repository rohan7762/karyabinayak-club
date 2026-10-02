import 'server-only';
import { getGoogleUser, type ClubUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/service';
import { defaultSettings, today } from '@/lib/club-model';
export { sameOrigin } from '@/lib/security';
export const PHOTO_BUCKET = 'club-photos';
export const unpack = (r: any) => ({ ...r.data, id: r.id, version: r.version, attendanceVersion: r.attendance_version || 0, deleted: !!r.deleted });
export async function admin(knownUser?: ClubUser | null) {
  const user = knownUser === undefined ? await getGoogleUser() : knownUser;
  if (!user) return null;
  const owner = process.env.CLUB_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) throw new Error('CLUB_OWNER_EMAIL is missing.');
  if (user.email === owner) return { ...user, owner: true };
  const { data, error } = await serviceClient().from('club_admins').select('email').eq('email', user.email).eq('active', true).maybeSingle();
  if (error) throw error;
  return data ? { ...user, owner: false } : null;
}
export async function settings() {
  const { data, error } = await serviceClient().from('club_records').select('*').eq('id', 'settings').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Run supabase/schema.sql to initialize the club.');
  return unpack(data);
}
export async function approvedEmails() {
  const { data, error } = await serviceClient().from('club_admins').select('email').eq('active', true).order('email');
  if (error) throw error;
  return (data || []).map(r => r.email as string);
}
// Page explicitly: Supabase caps a single SELECT by default. History must not silently truncate.
export async function allRows(table: 'club_records' | 'club_attendance', publicOnly = false) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = serviceClient().from(table).select('*');
    if (table === 'club_records') {
      query = query.order('id');
      if (publicOnly) query = query.eq('deleted', false).in('kind', ['settings','members','meetings','notices','activities','gallery']);
    } else query = query.order('meeting_id').order('member_id');
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
export async function publicData() {
  const records = await allRows('club_records', true);
  const raw = records.find(r => r.kind === 'settings')?.data;
  const { adminEmails: _private, ...s } = raw || defaultSettings;
  const ofKind = (kind: string) => records.filter(r => r.kind === kind).map(unpack);
  return {
    settings: s,
    members: ofKind('members').filter(r => r.status === 'Active' && r.position !== 'Member').map(r => ({ id:r.id, name:r.name, position:r.position, photo:r.photo, sample:r.sample })),
    notices: ofKind('notices').filter(r=>r.public===true).sort((a,b)=>b.date.localeCompare(a.date)),
    activities: ofKind('activities').filter(r=>r.public===true),
    gallery: ofKind('gallery').filter(r=>r.public===true),
    meetings: ofKind('meetings').filter(r=>r.public===true&&r.status==='Upcoming'&&r.date>=today()).map(r=>({id:r.id,title:r.title,date:r.date,time:r.time,location:r.location,sample:r.sample})).sort((a,b)=>a.date.localeCompare(b.date)),
  };
}
