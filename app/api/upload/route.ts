import { admin, sameOrigin, PHOTO_BUCKET } from '@/lib/club-server';
import { serviceClient } from '@/lib/supabase/service';
import { MAX_PHOTO_BYTES, validPhoto } from '@/lib/security';
export const runtime='nodejs';
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req) || !await admin()) return Response.json({error:'Admin access required.'},{status:403});
    if (Number(req.headers.get('content-length') || 0)>MAX_PHOTO_BYTES+65536) return Response.json({error:'Choose a photo under 3 MB.'},{status:413});
    const form=await req.formData();
    const file=form.get('file');
    if (!(file instanceof File) || file.size===0 || file.size>MAX_PHOTO_BYTES || !['image/jpeg','image/png','image/webp'].includes(file.type)) return Response.json({error:'Choose a JPG, PNG or WebP photo under 3 MB.'},{status:400});
    const bytes=new Uint8Array(await file.arrayBuffer());
    if (!validPhoto(bytes,file.type)) return Response.json({error:'This is not a supported photo.'},{status:400});
    const id=crypto.randomUUID();
    const {error}=await serviceClient().storage.from(PHOTO_BUCKET).upload(id,bytes,{contentType:file.type,cacheControl:'0',upsert:false});
    if (error) throw error;
    return Response.json({url:'/api/images/'+id},{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'Photo upload failed. Check the private storage bucket and try again.'},{status:503}); }
}
