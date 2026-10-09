import { env } from 'cloudflare:workers';

// Constant-time check of a request's bearer token against a configured secret.
function bearer(request: Request, expected = '') {
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length < 24 || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// The scheduled jobs' token (PORTAL_RESULTS_TOKEN, shared by the score check and weekly finalize).
export const scheduleToken = (request: Request) => bearer(request, env.PORTAL_RESULTS_TOKEN);

// The Claude grader's token (PORTAL_GRADER_TOKEN). It can only read pending picks and grade them.
export const graderToken = (request: Request) => bearer(request, env.PORTAL_GRADER_TOKEN);
