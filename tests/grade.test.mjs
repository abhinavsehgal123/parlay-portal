import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const GRADER='g'.repeat(32),SCHEDULE='s'.repeat(32);
function fixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+file,'utf8'));
  const cache=new Map();let beforeGrade=null;
  const env={PORTAL_GRADER_TOKEN:GRADER,PORTAL_RESULTS_TOKEN:SCHEDULE,DB:{
    prepare(query){let args=[];const s={bind(...a){args=a;return s;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},exec(){if(beforeGrade&&query.startsWith('UPDATE submissions SET status'))beforeGrade();const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return s.exec();}};return s;},
    async batch(items){sql.exec('BEGIN');try{const out=items.map(x=>x.exec());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}
  }};
  function load(file){file=resolve(root,file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const require=p=>p==='cloudflare:workers'?{env,waitUntil(){}}:load(p.startsWith('@/')?p.slice(2)+'.ts':resolve(dirname(file),p+'.ts'));
    vm.runInNewContext(code,{exports,require,Response,Request,crypto,URL,Intl,JSON,Date,console:{error(){},info(){}}});return exports;
  }
  let n=0;
  const add=(member,details,status='Pending')=>{const id=`p${++n}`;sql.prepare(`INSERT INTO submissions (id,season,week,member,sport,selection,odds,status,duplicate_key,created_at,updated_at,details,evidence,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'{}',0)`).run(id,'2026 Season',5,member,'NFL',`${member} pick`,-110,status,`k${n}`,'2026-10-08T12:00:00Z','',JSON.stringify(details));return id;};
  const route=load('app/api/grade/route.ts');
  const call=(method,body,token=GRADER)=>route[method](new Request('https://portal.invalid/api/grade',{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  const row=id=>sql.prepare('SELECT status,revision,evidence FROM submissions WHERE id=?').get(id);
  return {sql,add,call,row,route,onGrade(fn){beforeGrade=fn;}};
}
const prop={team:'Jalon Daniels',opponent:'Dallas Cowboys',market:'Player prop',line:'44.5',description:'Over passing yards',eventDate:'2026-10-01'};
const grade=(id,extra={})=>({id,revision:0,status:'Hit',result:'Jalon Daniels: 251 passing yards (final)',source:'https://www.espn.com/nfl/boxscore/_/gameId/1',reason:'251 yards cleared the 44.5 line',...extra});
test('lists only pending picks whose game is not in the future',async()=>{
  const f=fixture();
  const past=f.add('CJ',prop);f.add('Nav',{...prop,eventDate:'2099-01-01'});f.add('Fab',prop,'Hit');const undated=f.add('Jp',{market:'Other'});
  const r=await (await f.call('GET')).json();
  assert.deepEqual(r.picks.map(p=>p.id).sort(),[past,undated].sort());
  assert.equal(r.picks[0].revision,0);assert.ok(!('evidence' in r.picks[0]));
});
test('records a grade with evidence and an audit entry',async()=>{
  const f=fixture();const id=f.add('CJ',prop);
  const res=await f.call('POST',grade(id));
  assert.equal(res.status,200);
  const row=f.row(id),ev=JSON.parse(row.evidence);
  assert.equal(row.status,'Hit');assert.equal(row.revision,1);
  assert.match(ev.result,/251 passing yards/);assert.match(ev.source,/^https:\/\/www\.espn\.com/);assert.match(ev.reason,/^Claude: /);
  const change=f.sql.prepare('SELECT actor,action FROM pick_changes WHERE submission_id=?').get(id);
  assert.equal(change.actor,f.route.ACTOR);assert.equal(change.action,'grade');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM sheet_outbox').get().n,1);
});
test('a void is recorded as Void, never a loss',async()=>{
  const f=fixture();const id=f.add('CJ',prop);
  assert.equal((await f.call('POST',grade(id,{status:'Void',result:'Did not play',reason:'Inactive; prop voided'}))).status,200);
  assert.equal(f.row(id).status,'Void');
});
test('refuses grades without evidence, with a bad status, or for future games',async()=>{
  const f=fixture();const id=f.add('CJ',prop),later=f.add('Nav',{...prop,eventDate:'2099-01-01'});
  for(const bad of [{source:''},{source:'espn.com'},{result:''},{reason:''},{status:'Pending'},{status:'Loss'},{revision:'x'}])assert.equal((await f.call('POST',grade(id,bad))).status,400,JSON.stringify(bad));
  assert.equal((await f.call('POST',grade(later))).status,409);
  assert.equal(f.row(id).status,'Pending');assert.equal(f.row(later).status,'Pending');
});
test('never overwrites a graded or edited pick',async()=>{
  const f=fixture();const graded=f.add('CJ',prop,'Miss'),edited=f.add('Nav',prop),racing=f.add('Fab',prop);
  assert.equal((await f.call('POST',grade(graded))).status,409);assert.equal(f.row(graded).status,'Miss');
  f.sql.exec(`UPDATE submissions SET revision=1 WHERE id='${edited}'`);
  assert.equal((await f.call('POST',grade(edited))).status,409);assert.equal(f.row(edited).status,'Pending');
  f.onGrade(()=>f.sql.exec(`UPDATE submissions SET revision=revision+1 WHERE id='${racing}'`));
  assert.equal((await f.call('POST',grade(racing))).status,409);assert.equal(f.row(racing).status,'Pending');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM pick_changes').get().n,0);
});
test('only the grader token works',async()=>{
  const f=fixture();const id=f.add('CJ',prop);
  assert.equal((await f.call('GET',null,SCHEDULE)).status,401);
  assert.equal((await f.call('POST',grade(id),SCHEDULE)).status,401);
  assert.equal((await f.call('GET',null,'nope')).status,401);
  assert.equal(f.row(id).status,'Pending');
});
