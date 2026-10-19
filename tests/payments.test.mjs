import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const GRADER='g'.repeat(32);
// Sleeper: Brooks (BrooksyB26, roster 5) is the low scorer of fantasy week 5.
const sleeper={'matchups/5':[{roster_id:5,points:85.42},{roster_id:3,points:96.9}],rosters:[{roster_id:5,owner_id:'u5'},{roster_id:3,owner_id:'u3'}],users:[{user_id:'u5',display_name:'BrooksyB26'},{user_id:'u3',display_name:'kithdaddy'}]};
function fixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+file,'utf8'));
  sql.exec("UPDATE portal_settings SET active_week=6");
  sql.exec("INSERT INTO weekly_cycles (id,season,week,pick_count,finalized_at) VALUES ('2026 Season|5','2026 Season',5,12,'2026-10-13T16:19:38.496Z')");
  const cache=new Map(),urls=[];
  const env={PORTAL_GRADER_TOKEN:GRADER,DB:{
    prepare(query){let args=[];const s={bind(...a){args=a;return s;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},exec(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return s.exec();}};return s;},
    async batch(items){return items.map(x=>x.exec());}
  }};
  const fetch=async url=>{urls.push(String(url));const key=Object.keys(sleeper).find(k=>String(url).endsWith('/'+k));return key?Response.json(sleeper[key]):new Response('no',{status:404});};
  function load(file){file=resolve(root,file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const require=p=>p==='cloudflare:workers'?{env,waitUntil(){}}:p==='@/lib/admin'?{isAdmin:()=>false}:load(p.startsWith('@/')?p.slice(2)+'.ts':resolve(dirname(file),p+'.ts'));
    vm.runInNewContext(code,{exports,require,Response,Request,AbortSignal,crypto,URL,Intl,JSON,Date,console:{error(){}},fetch});return exports;
  }
  const send=(payments,token=GRADER)=>load('app/api/grade/payments/route.ts').POST(new Request('https://portal.invalid/api/grade/payments',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({payments})}));
  return {sql,send,urls,lib:load('lib/payments.ts')};
}
test('notes are read for the kind of payment and the week',()=>{
  const {lib}=fixture();
  assert.equal(lib.kindFromNote('Reup - f***!',10,false),'reup');assert.equal(lib.kindFromNote('Re',10,false),'reup');assert.equal(lib.kindFromNote('re-up',10,false),'reup');
  assert.equal(lib.kindFromNote('Juice',10,false),'boost');assert.equal(lib.kindFromNote('🧃',10,false),'boost');assert.equal(lib.kindFromNote('Juicd',5,false),'boost');assert.equal(lib.kindFromNote('Juice x2',50,false),'boost');assert.equal(lib.kindFromNote('Lay',10,true),'base');assert.equal(lib.kindFromNote('Re up',10,false),'reup');assert.equal(lib.kindFromNote('boost',20,false),'boost');
  assert.equal(lib.kindFromNote('Mega week 6',10,true),'base');assert.equal(lib.kindFromNote('Megalay week 4',10,false),'boost');assert.equal(lib.kindFromNote('bet',25,true),'boost');
  for(const note of ['Pizza','Drink','Seltzers','Sandwich','Cash','Rent','Uber to BUF','Lake beer','Gillespie gift card #2','Relay','Player'])assert.equal(lib.kindFromNote(note,10,true),null,note);
  assert.equal(lib.weekFromNote('Mega week 6'),6);assert.equal(lib.weekFromNote('wk5'),5);assert.equal(lib.weekFromNote('Juice'),null);
  assert.equal(lib.memberFrom('Brooks Baro'),'Brooks');assert.equal(lib.memberFrom('griffin  gillespie'),'Griff');assert.equal(lib.memberFrom('Pooya Nayebi'),'');
});
test('records league payments and FanDuel deposits, skips everything else, once only',async()=>{
  const f=fixture();
  const receipts=[
    {id:'92E155823A131892S',type:'received',paidAt:'2026-10-17T16:15:04Z',from:'Brooks Baro',amount:10,note:'Mega week 6'},
    {id:'2UF362423K4839204',type:'received',paidAt:'2026-10-14T12:07:43Z',from:'Chris J',amount:10,note:'Re'},
    {id:'74705177U5745014C',type:'received',paidAt:'2026-10-14T12:16:40Z',from:'Andrew Walker',amount:5,note:'Juice'},
    {id:'FD000000001',type:'fanduel',paidAt:'2026-10-17T20:03:59Z',amount:10},
    {id:'1A14D84CBC90C388',type:'received',paidAt:'2026-10-18T05:38:30Z',from:'Pooya Nayebi',amount:32,note:'Drink'},
    {id:'04W133670K893634B',type:'received',paidAt:'2026-10-14T09:14:33Z',from:'Nick Sedor',amount:35,note:'Seltzers'},
    {id:'bad id!',type:'received',paidAt:'2026-10-14T09:14:33Z',from:'Nick Sedor',amount:10,note:'reup'},
  ];
  assert.equal((await f.send(receipts,'nope')).status,401);
  const r=await (await f.send(receipts)).json();
  assert.deepEqual(r.recorded.map(x=>[x.member,x.kind,x.week,x.amount]),[['Brooks','base',6,10],['CJ','reup',6,10],['Drew','boost',6,5],['','deposit',6,10]]);
  assert.deepEqual(r.skipped.map(x=>x.reason),['not from a league member','note is not about the bet','missing or invalid Venmo transaction ID']);
  assert.ok(f.urls.some(u=>u.endsWith('/matchups/5')));
  const again=await (await f.send(receipts.slice(0,1))).json();
  assert.equal(again.recorded.length,0);assert.equal(again.skipped[0].reason,'already recorded');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM payments').get().n,4);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM payments WHERE note LIKE '%Drink%' OR note LIKE '%Seltzer%'").get().n,0);
});
test('payments before the week rolled over go to the week that was open',async()=>{
  const f=fixture();
  const r=await (await f.send([{id:'3JF88678EV840643T',type:'received',paidAt:'2026-10-08T23:23:03Z',from:'Nick Sedor',amount:10,note:'Bet'}])).json();
  assert.equal(r.recorded[0].week,5);
});
test('re-up money without a logged replacement is flagged; a boost toward a logged re-up is not',()=>{
  const {lib}=fixture();
  const pick=(member,status,eventDate='2026-10-17')=>({id:member,member,season:'2026 Season',week:6,status,details:{eventDate},evidence:{},revision:1,createdAt:'2026-10-15T00:00:00Z'});
  const pay=(member,paidAt)=>({id:member+paidAt,season:'2026 Season',week:6,member,kind:'reup',amount:10,note:'reup',paidAt,source:'venmo'});
  const board={historySubmissions:[pick('Seed','Miss'),pick('Griff','Pending'),pick('Kith','Miss')],changes:[{submissionId:'Griff',action:'replace',createdAt:'2026-10-17T20:00:00Z'},{submissionId:'Kith',action:'replace',createdAt:'2026-10-17T20:00:00Z'}],
    payments:[pay('Seed','2026-10-17T20:03:00Z'),pay('Griff','2026-10-17T21:00:00Z'),pay('Kith','2026-10-17T19:00:00Z')]};
  // Seed: lost, paid to re-up, nothing logged. Griff: re-up logged and pending. Kith: paid before the logged replacement, which then lost.
  assert.deepEqual([...lib.weekMoney(board,'2026 Season',6,'Brooks').unloggedReups],['Seed']);
});
