import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
function fixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+file,'utf8'));
  let admin=false,sheetFails=false,dbFails=false,sheetCalls=0;
  const jobs=[],cache=new Map();
  const env={PORTAL_SHEET_WEBHOOK_URL:'https://sheet.invalid',PORTAL_SHEET_SECRET:'test',DB:{
    prepare(query){let args=[];const s={bind(...a){args=a;return s;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},exec(){if(dbFails&&query.includes('INSERT INTO submissions'))throw Error('database unavailable');const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return s.exec();}};return s;},
    async batch(items){sql.exec('BEGIN');try{const out=items.map(x=>x.exec());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}
  }};
  function load(file){file=resolve(root,file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const require=p=>p==='cloudflare:workers'?{env,waitUntil:p=>jobs.push(p)}:p==='@/lib/admin'?{isAdmin:()=>admin}:load(p.startsWith('@/')?p.slice(2)+'.ts':resolve(dirname(file),p+'.ts'));
    vm.runInNewContext(code,{exports,require,Response,Request,AbortSignal,crypto,URL,console:{error(){}},fetch:async()=>{sheetCalls++;if(sheetFails)throw Error('offline');return Response.json({ok:true});}});return exports;
  }
  const routes=load('app/api/submissions/route.ts'),settings=load('app/api/settings/route.ts'),sync=load('lib/sheet-sync.ts');
  const body={member:'Drew',sport:'NFL',odds:-110,season:'2026 Season',week:1,details:{team:'Saints',opponent:'Raiders',market:'Spread',line:'-2.5',eventDate:'2026-09-27'}};
  const call=(method,b,route=routes)=>route[method](new Request('https://portal.invalid/api/submissions',{method,headers:{origin:'https://portal.invalid'},...(method==='GET'?{}:{body:JSON.stringify(b)})}));
  return {sql,body,call,settings,sync,admin(v=true){admin=v;},failSheet(v=true){sheetFails=v;},failDb(){dbFails=true;},calls:()=>sheetCalls,async flush(){for(const p of jobs.splice(0))await p;}};
}
test('a failed sheet cannot prevent durable portal saves; retry recovers',async()=>{const f=fixture();f.failSheet();const r=await f.call('POST',f.body);assert.equal(r.status,201);await f.flush();assert.equal(f.sql.prepare('SELECT count(*) n FROM submissions').get().n,1);assert.equal(f.sql.prepare('SELECT attempts FROM sheet_outbox').get().attempts,1);f.failSheet(false);await f.sync.drainSync(true);assert.equal(f.sql.prepare('SELECT count(*) n FROM sheet_outbox').get().n,0);});
test('repeat submission is idempotent and weekly duplicate stays blocked',async()=>{const f=fixture();assert.equal((await f.call('POST',f.body)).status,201);await f.flush();assert.equal((await f.call('POST',f.body)).status,200);assert.equal((await f.call('POST',{...f.body,odds:-150})).status,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM submissions').get().n,1);});
test('member edits are audited; stale edits cannot overwrite new changes',async()=>{const f=fixture();const pick=await (await f.call('POST',f.body)).json();await f.flush();const edit={...f.body,id:pick.id,revision:0,confirmOwnPick:true,odds:-120};assert.equal((await f.call('PUT',edit)).status,200);await f.flush();assert.equal((await f.call('PUT',edit)).status,409);assert.equal(f.sql.prepare('SELECT odds FROM submissions').get().odds,-120);assert.equal(f.sql.prepare('SELECT count(*) n FROM pick_changes').get().n,2);});
test('unconfirmed members cannot edit; public grading and archived edits are denied',async()=>{const f=fixture();const pick=await (await f.call('POST',f.body)).json();await f.flush();assert.equal((await f.call('PUT',{...f.body,id:pick.id,revision:0})).status,403);assert.equal((await f.call('PATCH',{id:pick.id,revision:0,status:'Hit'})).status,403);f.sql.exec('UPDATE portal_settings SET active_week=2');assert.equal((await f.call('PUT',{...f.body,id:pick.id,revision:0,confirmOwnPick:true})).status,403);});
test('admin can grade archived picks with evidence without moving active week',async()=>{const f=fixture();const pick=await (await f.call('POST',f.body)).json();await f.flush();f.sql.exec('UPDATE portal_settings SET active_week=2');f.admin();assert.equal((await f.call('PATCH',{id:pick.id,revision:0,status:'Miss',result:'Raiders 35–27 Saints',reason:'Did not cover',source:'https://example.com/result'})).status,200);await f.flush();assert.equal(f.sql.prepare('SELECT active_week FROM portal_settings').get().active_week,2);assert.match(f.sql.prepare('SELECT evidence FROM submissions').get().evidence,/35/);});
test('pending picks block rollover; reviewed week advances exactly once',async()=>{const f=fixture();const pick=await (await f.call('POST',f.body)).json();await f.flush();f.admin();const b={action:'finalizeAndAdvance',season:'2026 Season',week:1,reviewedMissing:true,reviewedTicket:true,reviewVersion:0,reviewCount:1};assert.equal((await f.call('PATCH',b,f.settings)).status,400);await f.call('PATCH',{id:pick.id,revision:0,status:'Void',reason:'Event cancelled'});await f.flush();assert.equal((await f.call('PATCH',{...b,reviewVersion:1},f.settings)).status,200);assert.equal((await f.call('PATCH',{...b,reviewVersion:1},f.settings)).status,409);assert.equal(f.sql.prepare('SELECT active_week FROM portal_settings').get().active_week,2);assert.equal(f.sql.prepare('SELECT count(*) n FROM submissions').get().n,1);});
test('database failure rolls back pick, audit, and outbox',async()=>{const f=fixture();f.failDb();assert.equal((await f.call('POST',f.body)).status,503);assert.equal(f.sql.prepare('SELECT count(*) n FROM sheet_outbox').get().n,0);assert.equal(f.calls(),0);});
test('stale week does not file a submission into a different week',async()=>{const f=fixture();assert.equal((await f.call('POST',{...f.body,week:0})).status,409);assert.equal(f.calls(),0);});
test('removal preserves audit and permits a replacement',async()=>{const f=fixture();const p=await (await f.call('POST',f.body)).json();await f.flush();f.admin();assert.equal((await f.call('DELETE',{id:p.id,revision:0,reason:'Wrong pick'})).status,200);await f.flush();assert.equal((await f.call('POST',f.body)).status,201);await f.flush();assert.equal(f.sql.prepare("SELECT count(*) n FROM pick_changes WHERE action='remove'").get().n,1);});
