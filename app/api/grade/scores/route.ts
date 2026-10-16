import { refreshResults } from '@/lib/results';
import { graderToken } from '@/lib/schedule-auth';

// Final-score check run at the start of each scheduled Claude routine
// (PORTAL_GRADER_TOKEN). Same check as /api/results.
export async function POST(request: Request) {
  if (!graderToken(request)) return Response.json({ error: 'Not authorized to check scores.' }, { status: 401 });
  try { return Response.json(await refreshResults(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { console.error('results_refresh_failed'); return Response.json({ error: 'The score check could not finish. Picks are unchanged; it will run again on schedule.' }, { status: 503 }); }
}
