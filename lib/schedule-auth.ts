import { env } from 'cloudflare:workers';

// True when the request carries the scheduled jobs' bearer token
// (PORTAL_RESULTS_TOKEN, shared by the score check and weekly finalize).
export function scheduleToken(request: Request) {
  const expected = env.PORTAL_RESULTS_TOKEN || '', given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length < 24 || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
