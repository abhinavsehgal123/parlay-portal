import { refreshResults } from '@/lib/results';
import { autoFinalize } from '@/lib/finalize';
import { graderToken } from '@/lib/schedule-auth';

// Tuesday-morning rollover by the scheduled Claude routine (PORTAL_GRADER_TOKEN),
// after it has graded what it can. Same rollover as /api/finalize: it refuses
// on any day but Tuesday while a game in the week is today or later, and never finalizes a week twice.
export async function POST(request: Request) {
  if (!graderToken(request)) return Response.json({ error: 'Not authorized to finalize the week.' }, { status: 401 });
  let scores: unknown = null;
  try { scores = await refreshResults(); } catch { console.error('finalize_score_check_failed'); }
  try { return Response.json({ ...await autoFinalize(), scores }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { console.error('auto_finalize_failed'); return Response.json({ error: 'The week could not be finalized. Nothing changed; it will try again next run.' }, { status: 503 }); }
}
