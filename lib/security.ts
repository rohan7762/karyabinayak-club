export function safeReturnTo(value: string | null, fallback = '/admin') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://club.invalid');
    if (url.origin !== 'https://club.invalid' || url.pathname.startsWith('/auth/')) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
export function appOrigin() {
  const raw = process.env.APP_URL;
  if (!raw) throw new Error('APP_URL must be set to your Vercel or local development URL.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('APP_URL must use HTTPS outside local development.');
  return url.origin;
}
export function sameOrigin(req: Request) {
  return req.headers.get('origin') === appOrigin() && req.headers.get('sec-fetch-site') !== 'cross-site';
}
export function imageIsPublic(row: any) {
  if (row.deleted) return false;
  const d = row.data;
  return row.kind === 'settings' ||
    (row.kind === 'members' && d.status === 'Active' && d.position !== 'Member') ||
    (['gallery', 'activities'].includes(row.kind) && d.public === true);
}
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // Below Vercel's 4.5 MB request/response payload limit.
export function validPhoto(bytes: Uint8Array, type: string) {
  return (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (type === 'image/png' && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) ||
    (type === 'image/webp' && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP');
}
