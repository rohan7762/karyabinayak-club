import { admin, allRows, approvedEmails, publicData, unpack, sameOrigin } from '@/lib/club-server';
import { serviceClient } from '@/lib/supabase/service';
import { schemas, kinds, incomeCategories, expenseCategories } from '@/lib/club-model';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (data: any, status=200) => Response.json(data, { status, headers: { 'Cache-Control':'private, no-store' } });
const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const versionSchema = z.number().int().nonnegative();
function handleError(e: any) {
  if (e instanceof z.ZodError) return json({ error:e.errors.map(i=>i.path.join('.')+': '+i.message).join('; ') },400);
  if (e instanceof SyntaxError) return json({error:'Invalid request.'},400);
  const message = String(e?.message || '');
  if (message.includes('CLUB_CONFLICT')) return json({error:'This record or attendance was changed by another administrator. Reload before saving.'},409);
  if (message.includes('CLUB_NOT_FOUND')) return json({error:'This record is no longer available.'},404);
  if (message.includes('CLUB_MEMBER_LIST')) return json({error:'The member list changed. Reload attendance before saving.'},409);
  if (message.includes('CLUB_DUPLICATE_MEMBER') || e?.code==='23505') return json({error:'That Member ID or record already exists. Please choose a unique ID.'},409);
  if (message.includes('CLUB_INVALID')) return json({error:'Please check the fields and try again.'},400);
  console.error('Club request failed', e?.code || e?.name || 'storage');
  return json({error:'Could not access club records. Your form is still here; please try again.'},503);
}
export async function GET(req: Request) {
  try {
    if (new URL(req.url).searchParams.get('public')==='1') return json(await publicData());
    const a = await admin();
    if (!a) return json({error:'Admin access required. Sign in with an approved Google account.'},403);
    const [records, attendance, emails] = await Promise.all([allRows('club_records'),allRows('club_attendance'),a.owner?approvedEmails():Promise.resolve([])]);
    const data: any = {};
    for (const kind of kinds) data[kind]=records.filter(r=>r.kind===kind).map(unpack);
    data.settings=data.settings[0];
    if (!data.settings) throw new Error('Database setup incomplete');
    delete data.settings.adminEmails;
    if (a.owner) data.settings.adminEmails=emails;
    return json({...data,attendance,user:{name:a.displayName,email:a.email,owner:a.owner}});
  } catch (e) { return handleError(e); }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({error:'Please save from the club website.'},403);
    const a = await admin();
    if (!a) return json({error:'Admin access required.'},403);
    if (!req.headers.get('content-type')?.includes('application/json')) return json({error:'Expected JSON.'},415);
    const bodyText=await req.text();
    if (new TextEncoder().encode(bodyText).length>250000) return json({error:'This entry is too large.'},413);
    const b=JSON.parse(bodyText);
    const client=serviceClient();
    if (b.action==='attendance') {
      const input=z.object({meetingId:idSchema,version:versionSchema,rows:z.array(z.object({memberId:idSchema,status:z.enum(['Present','Absent','Excused'])})).min(1).max(1000)}).parse(b);
      if (new Set(input.rows.map(r=>r.memberId)).size!==input.rows.length) return json({error:'Duplicate member in attendance.'},400);
      const {error}=await client.rpc('club_save_attendance',{p_meeting_id:input.meetingId,p_expected:input.version,p_rows:input.rows,p_actor:a.userId,p_actor_email:a.email});
      if (error) throw error;
      return json({ok:true});
    }
    const kind=z.enum(['members','meetings','notices','transactions','activities','gallery','settings']).parse(b.kind);
    const id=kind==='settings'?'settings':idSchema.parse(b.id);
    const version=versionSchema.parse(b.version);
    const action=z.enum(['save','delete','restore']).parse(b.action);
    let payload: any={};
    let emails: string[] | null=null;
    if (action==='save') {
      // Client-supplied role and Recorded By fields are ignored. Identity comes from Google.
      payload=schemas[kind].parse({...b.data,...(kind==='settings'?{adminEmails:a.owner?(b.data?.adminEmails||[]):[]}:{})});
      if (kind==='transactions' && !(payload.type==='Income'?incomeCategories:expenseCategories).includes(payload.category)) return json({error:'Choose a category matching the transaction type.'},400);
      if (kind==='settings') {
        if (a.owner) emails=[...new Set((payload.adminEmails as string[]).map(e=>e.trim().toLowerCase()))].filter(e=>e!==a.email);
        delete payload.adminEmails;
      }
    }
    const {data,error}=await client.rpc('club_write_record',{p_action:action,p_id:id,p_kind:kind,p_expected:version,p_data:payload,p_actor:a.userId,p_actor_email:a.email,p_admin_emails:emails});
    if (error) throw error;
    return json({ok:true,...data});
  } catch (e) { return handleError(e); }
}
