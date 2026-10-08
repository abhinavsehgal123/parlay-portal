import { isAdmin } from '@/lib/admin';
import { safeWrite } from '@/lib/portal-db';
import { drainSync } from '@/lib/sheet-sync';
export async function POST(request:Request) {
  if(!isAdmin(request)||!safeWrite(request))return Response.json({error:'Admin access required.'},{status:403});
  try{await drainSync(true);return Response.json({ok:true});}catch{return Response.json({error:'Sync retry could not finish. Your portal records are saved.'},{status:503});}
}
