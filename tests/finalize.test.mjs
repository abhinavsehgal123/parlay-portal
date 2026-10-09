import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const TUESDAY=Date.parse('2026-10-13T10:30:00Z'); // 6:30 AM ET
const TOKEN='t'.repeat(32);
function fixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+file,'utf8'));
  sql.exec("UPDATE portal_settings SET active_week=5");
  const cache=new Map();let beforeCycle=null;
  const env={PORTAL_RESULTS_TOKEN:TOKEN,DB:{
    prepare(query){let args=[];const s={bind(...a){args=a;return s;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},exec(){if(beforeCycle&&query.includes('INSERT INTO weekly_cycles'))beforeCycle();const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return s.exec();}};return s;},
    async batch(items){sql.exec('BEGIN');try{const out=items.map(x=>x.exec());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}
  }};
  function load(file){file=resolve(root,file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const require=p=>p==='cloudflare:workers'?{env,waitUntil(){}}:p==='@/lib/admin'?{isAdmin:()=>false}:load(p.startsWith('@/')?p.slice(2)+'.ts':resolve(dirname(file),p+'.ts'));
    vm.runInNewContext(code,{exports,require,Response,Request,AbortSignal,crypto,URL,URLSearchParams,Intl,JSON,console:{error(){},info(){}},fetch:async()=>Response.json([])});return exports;
  }
  let n=0;
  const add=(member,status,eventDate,week=5)=>{sql.prepare(`INSERT INTO submissions (id,season,week,member,sport,selection,odds,status,duplicate_key,created_at,updated_at,details,evidence,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'{}',0)`).run(`p${++n}`,'2026 Season',week,member,'NFL',`${member} pick`,-110,status,`k${n}`,'2026-10-08T12:00:00Z','',JSON.stringify(eventDate?{eventDate}:{}));};
  const settings=()=>sql.prepare('SELECT active_week AS week, submissions_open AS open FROM portal_settings').get();
  return {sql,add,settings,onCycle(fn){beforeCycle=fn;},finalize:load('lib/finalize.ts'),route:load('app/api/finalize/route.ts')};
}
test('finalizes with pending legs, records missing members without penalty, and opens the next week',async()=>{
  const f=fixture();
  f.add('Nav','Hit','2026-10-11');f.add('CJ','Pending','2026-10-08');f.add('Fab','Miss','2026-10-12');f.add('Jp','Pending');
  f.sql.exec('UPDATE portal_settings SET submissions_open=0');
  const r=await f.finalize.autoFinalize(TUESDAY);
  assert.equal(r.finalized,true);assert.equal(r.week,5);assert.equal(r.nextWeek,6);assert.equal(r.pending,2);
  assert.equal(r.missing.length,8);
  assert.deepEqual({...f.settings()},{week:6,open:1});
  assert.equal(f.sql.prepare("SELECT pick_count FROM weekly_cycles WHERE id='2026 Season|5'").get().pick_count,4);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM missed_submissions').get().n,0);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM submissions WHERE status='Pending'").get().n,2);
});
test('does not finalize while a game in the week is today or later',async()=>{
  const f=fixture();
  f.add('Nav','Hit','2026-10-11');f.add('Fab','Pending','2026-10-13');
  const r=await f.finalize.autoFinalize(TUESDAY);
  assert.equal(r.finalized,false);assert.match(r.note,/today or later/);
  assert.equal(f.settings().week,5);assert.equal(f.sql.prepare('SELECT count(*) n FROM weekly_cycles').get().n,0);
});
test('advances exactly one week: a second run does nothing',async()=>{
  const f=fixture();
  f.add('Nav','Hit','2026-10-11');
  assert.equal((await f.finalize.autoFinalize(TUESDAY)).finalized,true);
  const again=await f.finalize.autoFinalize(TUESDAY+60000);
  assert.equal(again.finalized,false);assert.match(again.note,/no picks/);
  assert.equal(f.settings().week,6);assert.equal(f.sql.prepare('SELECT count(*) n FROM weekly_cycles').get().n,1);
});
test('a pick changed while finalizing stops the rollover',async()=>{
  const f=fixture();
  f.add('Nav','Pending','2026-10-11');
  f.onCycle(()=>f.sql.exec("UPDATE submissions SET revision=revision+1, status='Hit'"));
  const r=await f.finalize.autoFinalize(TUESDAY);
  assert.equal(r.finalized,false);assert.equal(f.settings().week,5);
});
test('an already finalized week is never finalized again',async()=>{
  const f=fixture();
  f.add('Nav','Hit','2026-10-11');
  f.sql.exec("INSERT INTO weekly_cycles (id,season,week,pick_count,finalized_at) VALUES ('2026 Season|5','2026 Season',5,1,'2026-10-12T00:00:00Z')");
  const r=await f.finalize.autoFinalize(TUESDAY);
  assert.equal(r.finalized,false);assert.equal(f.settings().week,5);
});
test('endpoint requires the schedule token',async()=>{
  const f=fixture();f.add('Nav','Hit','2026-10-01');
  const post=h=>f.route.POST(new Request('https://portal.invalid/api/finalize',{method:'POST',headers:h}));
  assert.equal((await post({})).status,401);
  const ok=await post({authorization:`Bearer ${TOKEN}`});
  assert.equal(ok.status,200);assert.equal((await ok.json()).finalized,true);
});
