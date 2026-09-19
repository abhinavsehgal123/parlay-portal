import { env } from 'cloudflare:workers';

const SESSION_COOKIE = 'megalay_commissioner';

export function isAdmin(request: Request) {
  const email = request.headers.get('oai-authenticated-user-email')?.toLowerCase();
  if (email && env.PORTAL_ADMIN_EMAIL && email === env.PORTAL_ADMIN_EMAIL.toLowerCase()) return true;
  const cookie = request.headers.get('cookie') ?? '';
  const session = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return Boolean(session && env.PORTAL_COMMISSIONER_SESSION && session === env.PORTAL_COMMISSIONER_SESSION);
}

export function commissionerCookie(value: string, maxAge = 60 * 60 * 24 * 30) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
