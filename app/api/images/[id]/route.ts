import { admin, PHOTO_BUCKET } from '@/lib/club-server';
import { serviceClient } from '@/lib/supabase/service';
import { imageIsPublic, MAX_PHOTO_BYTES } from '@/lib/security';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return new Response('Not found',{status:404});
    const path='/api/images/'+id;
    const client=serviceClient();
    const {data:records,error}=await client.from('club_records').select('kind,data,deleted').eq('deleted',false).or(`data->>photo.eq.${path},data->>logo.eq.${path}`);
    if (error) throw error;
    if (!records?.some(imageIsPublic) && !await admin()) return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
    const {data:object,error:downloadError}=await client.storage.from(PHOTO_BUCKET).download(id);
    if (downloadError || !object) return new Response('Not found',{status:404});
    if (object.size>MAX_PHOTO_BYTES) return new Response('Photo exceeds supported size',{status:413});
    return new Response(object,{headers:{'Content-Type':object.type||'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  } catch { return new Response('Image unavailable',{status:503}); }
}
