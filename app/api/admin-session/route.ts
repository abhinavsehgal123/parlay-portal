import { env } from 'cloudflare:workers';
import { commissionerCookie } from '@/lib/admin';

export async function POST(request: Request) {
  const body = await request.json() as { code?: string };
  const code = String(body.code ?? '').trim();
  if (!env.PORTAL_COMMISSIONER_CODE || !env.PORTAL_COMMISSIONER_SESSION || code !== env.PORTAL_COMMISSIONER_CODE) {
    return Response.json({ error: 'Incorrect Admin code.' }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': commissionerCookie(env.PORTAL_COMMISSIONER_SESSION) } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': commissionerCookie('', 0) } });
}
