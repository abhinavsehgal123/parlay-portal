import { isAdmin } from '@/lib/admin';
import { safeWrite } from '@/lib/portal-db';
import { refreshResults } from '@/lib/results';
import { scheduleToken } from '@/lib/schedule-auth';

// Called by the scheduled GitHub Action (bearer token) or from the admin tab.
export async function POST(request:Request) {
  if(!scheduleToken(request)&&!(isAdmin(request)&&safeWrite(request)))return Response.json({error:'Not authorized to check scores.'},{status:401});
  try{return Response.json(await refreshResults(),{headers:{'Cache-Control':'no-store'}});}
  catch{console.error('results_refresh_failed');return Response.json({error:'The score check could not finish. Picks are unchanged; it will run again on schedule.'},{status:503});}
}
