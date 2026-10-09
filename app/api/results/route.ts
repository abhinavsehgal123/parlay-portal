import { env } from 'cloudflare:workers';
import { isAdmin } from '@/lib/admin';
import { safeWrite } from '@/lib/portal-db';
import { refreshResults } from '@/lib/results';

// Called by the scheduled GitHub Action (bearer token) or from the admin tab.
function scheduleToken(request:Request) {
  const expected=env.PORTAL_RESULTS_TOKEN||'',given=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(expected.length<24||given.length!==expected.length)return false;
  let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^given.charCodeAt(i);
  return diff===0;
}
export async function POST(request:Request) {
  if(!scheduleToken(request)&&!(isAdmin(request)&&safeWrite(request)))return Response.json({error:'Not authorized to check scores.'},{status:401});
  try{return Response.json(await refreshResults(),{headers:{'Cache-Control':'no-store'}});}
  catch{console.error('results_refresh_failed');return Response.json({error:'The score check could not finish. Picks are unchanged; it will run again on schedule.'},{status:503});}
}
