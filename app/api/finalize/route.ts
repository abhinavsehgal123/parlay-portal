import { isAdmin } from '@/lib/admin';
import { safeWrite } from '@/lib/portal-db';
import { refreshResults } from '@/lib/results';
import { autoFinalize } from '@/lib/finalize';
import { scheduleToken } from '@/lib/schedule-auth';

// Tuesday-morning rollover, called by the scheduled GitHub Action (bearer
// token) or an admin. Settles any finished games first, then finalizes.
export async function POST(request:Request) {
  if(!scheduleToken(request)&&!(isAdmin(request)&&safeWrite(request)))return Response.json({error:'Not authorized to finalize the week.'},{status:401});
  let scores:unknown=null;
  try{scores=await refreshResults();}catch{console.error('finalize_score_check_failed');}
  try{return Response.json({...await autoFinalize(),scores},{headers:{'Cache-Control':'no-store'}});}
  catch{console.error('auto_finalize_failed');return Response.json({error:'The week could not be finalized. Nothing changed; it will try again next run.'},{status:503});}
}
