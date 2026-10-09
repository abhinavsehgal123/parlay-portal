import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const NOW=Date.parse('2026-10-12T03:00:00Z'); // Sunday 11 PM ET
const TOKEN='t'.repeat(32),KEY='odds-key-never-logged';
// Synthetic final scores.
const nfl=[
  {id:'g1',commence_time:'2026-10-11T17:00:00Z',completed:true,home_team:'New Orleans Saints',away_team:'Las Vegas Raiders',scores:[{name:'New Orleans Saints',score:'24'},{name:'Las Vegas Raiders',score:'20'}]},
  {id:'g2',commence_time:'2026-10-11T20:25:00Z',completed:true,home_team:'Kansas City Chiefs',away_team:'Indianapolis Colts',scores:[{name:'Kansas City Chiefs',score:'27'},{name:'Indianapolis Colts',score:'24'}]},
  {id:'g3',commence_time:'2026-10-12T00:20:00Z',completed:false,home_team:'Dallas Cowboys',away_team:'Philadelphia Eagles',scores:[{name:'Dallas Cowboys',score:'10'},{name:'Philadelphia Eagles',score:'14'}]},
  {id:'g4',commence_time:'2026-10-11T17:00:00Z',completed:true,home_team:'Chicago Bears',away_team:'Green Bay Packers',scores:[{name:'Chicago Bears',score:'17'},{name:'Green Bay Packers',score:'17'}]},
];
function fixture({remaining=400,fail=false}={}){
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+file,'utf8'));
  const urls=[],logs=[],cache=new Map();let admin=false,beforeGrade=null;
  const env={ODDS_API_KEY:KEY,PORTAL_RESULTS_TOKEN:TOKEN,DB:{
    prepare(query){let args=[];const s={bind(...a){args=a;return s;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},exec(){if(beforeGrade&&query.startsWith('UPDATE submissions SET status'))beforeGrade();const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return s.exec();}};return s;},
    async batch(items){sql.exec('BEGIN');try{const out=items.map(x=>x.exec());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}
  }};
  const fetch=async url=>{urls.push(String(url));if(fail)return new Response('down',{status:500});return Response.json(String(url).includes('americanfootball_nfl')?nfl:[],{headers:{'x-requests-remaining':String(remaining)}});};
  function load(file){file=resolve(root,file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const require=p=>p==='cloudflare:workers'?{env,waitUntil(){}}:p==='@/lib/admin'?{isAdmin:()=>admin}:load(p.startsWith('@/')?p.slice(2)+'.ts':resolve(dirname(file),p+'.ts'));
    vm.runInNewContext(code,{exports,require,Response,Request,AbortSignal,crypto,URL,URLSearchParams,Intl,JSON,console:{error:(...a)=>logs.push(JSON.stringify(a)),info(){}},fetch});return exports;
  }
  let n=0;
  const add=(member,sport,details,status='Pending',week=5)=>{const id=`p${++n}`;sql.prepare(`INSERT INTO submissions (id,season,week,member,sport,selection,odds,status,duplicate_key,created_at,updated_at,details,evidence,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'{}',0)`).run(id,'2026 Season',week,member,sport,`${member} pick`,-110,status,`k${n}`,'2026-10-08T12:00:00Z','2026-10-08T12:00:00Z',JSON.stringify(details));return id;};
  const status=id=>sql.prepare('SELECT status FROM submissions WHERE id=?').get(id).status;
  return {sql,urls,logs,add,status,admin(){admin=true;},onGrade(fn){beforeGrade=fn;},results:load('lib/results.ts'),route:load('app/api/results/route.ts')};
}
const game={eventDate:'2026-10-11'};
test('settles spreads, totals and moneylines from final scores',async()=>{
  const f=fixture();
  const cover=f.add('Nav','NFL',{...game,team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Spread',line:'-2.5'});
  const miss=f.add('Brooks','NFL',{...game,team:'Indianapolis Colts',opponent:'Kansas City Chiefs',market:'Spread',line:'+2.5'});
  const push=f.add('CJ','NFL',{...game,team:'Kansas City Chiefs',opponent:'Indianapolis Colts',market:'Spread',line:'-3'});
  const over=f.add('Drew','NFL',{...game,team:'Las Vegas Raiders',opponent:'New Orleans Saints',market:'Game total',line:'43.5',description:'Over'});
  const ml=f.add('Fab','NFL',{...game,team:'Saints',opponent:'Raiders',market:'Moneyline'});
  const run=await f.results.refreshResults(NOW);
  assert.equal(run.graded,5);
  assert.deepEqual([cover,miss,push,over,ml].map(f.status),['Hit','Miss','Push','Hit','Hit']);
  const ev=JSON.parse(f.sql.prepare('SELECT evidence FROM submissions WHERE id=?').get(cover).evidence);
  assert.match(ev.result,/Las Vegas Raiders 20, New Orleans Saints 24 \(final\)/);assert.match(ev.reason,/^Automatic: /);
  const change=f.sql.prepare("SELECT actor,action FROM pick_changes WHERE submission_id=?").get(cover);
  assert.equal(change.actor,f.results.ACTOR);assert.equal(change.action,'grade');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM sheet_outbox').get().n,5);
  assert.equal(f.urls.length,1);assert.match(f.urls[0],/\/sports\/americanfootball_nfl\/scores/);
});
test('anything unclear stays pending',async()=>{
  const f=fixture();
  const ids=[
    f.add('Seed','NFL',{...game,team:'Josh Allen',opponent:'Miami Dolphins',market:'Player prop',line:'1.5',description:'Over passing touchdowns'}),
    f.add('Shan','NFL',{eventDate:'2026-10-11',team:'Philadelphia Eagles',opponent:'Dallas Cowboys',market:'Moneyline'}),
    f.add('Kith','NFL',{...game,team:'Green Bay Packers',opponent:'Chicago Bears',market:'Moneyline'}),
    f.add('Griff','NFL',{eventDate:'2026-10-10',team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Moneyline'}),
    f.add('Rohan','NFL',{...game,team:'Saints',opponent:'Bears',market:'Moneyline'}),
    f.add('Ryser','NFL',{...game,team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Game total',line:'43.5'}),
    f.add('Jp','Other',{...game,team:'Someone',opponent:'Else',market:'Moneyline'}),
  ];
  await f.results.refreshResults(NOW);
  assert.deepEqual(ids.map(f.status),Array(ids.length).fill('Pending'));
});
test('props and old picks never spend credits',async()=>{
  const f=fixture();
  f.add('Seed','NFL',{...game,team:'Josh Allen',opponent:'Miami Dolphins',market:'Player prop',line:'1.5',description:'Over passing touchdowns'});
  f.add('Nav','NFL',{eventDate:'2026-10-01',team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Moneyline'});
  const r=await f.results.refreshResults(NOW);
  assert.equal(f.urls.length,0);assert.equal(r.credits,0);
});
test('weekly credit budget and provider failures leave picks pending',async()=>{
  const f=fixture();
  f.add('Nav','NFL',{...game,team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Moneyline'});
  f.sql.prepare("INSERT INTO results_runs (id,week_start,started_at,finished_at,credits,graded,note) VALUES ('old','2026-10-05',1,2,?,0,'')").run(f.results.RESULTS_WEEKLY_CREDITS);
  const r=await f.results.refreshResults(NOW);
  assert.equal(f.urls.length,0);assert.equal(r.graded,0);assert.match(r.note,/budget/);
  const down=fixture({fail:true});
  const id=down.add('Nav','NFL',{...game,team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Moneyline'});
  await down.results.refreshResults(NOW);
  assert.equal(down.status(id),'Pending');assert.ok(down.logs.every(l=>!l.includes(KEY)));
});
test('reserve floor stops checks when the account is nearly out of credits',async()=>{
  const f=fixture();
  f.add('Nav','NFL',{...game,team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Moneyline'});
  f.sql.prepare("INSERT INTO odds_usage (week_start,credits,remaining) VALUES ('2026-10-05',0,26)").run();
  await f.results.refreshResults(NOW);
  assert.equal(f.urls.length,0);
});
test('a pick edited during the check is not overwritten',async()=>{
  const f=fixture();
  const id=f.add('Nav','NFL',{...game,team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Moneyline'});
  // A member edits the pick between the check reading it and writing the result.
  f.onGrade(()=>f.sql.prepare("UPDATE submissions SET revision=revision+1, odds=-200 WHERE id=?").run(id));
  const r=await f.results.refreshResults(NOW);
  assert.equal(r.graded,0);assert.equal(f.status(id),'Pending');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM pick_changes').get().n,0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM sheet_outbox').get().n,0);
});
test('endpoint requires the schedule token or an admin session',async()=>{
  const f=fixture();
  const post=h=>f.route.POST(new Request('https://portal.invalid/api/results',{method:'POST',headers:h}));
  assert.equal((await post({})).status,401);
  assert.equal((await post({authorization:'Bearer wrong'})).status,401);
  const ok=await post({authorization:`Bearer ${TOKEN}`});
  assert.equal(ok.status,200);assert.equal((await ok.json()).ran,true);
  f.admin();assert.equal((await post({origin:'https://portal.invalid'})).status,200);
});
