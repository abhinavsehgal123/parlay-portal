import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const NOW=Date.parse('2026-10-08T14:00:00Z'),HOUR=3600000;
const KEY='test-key-never-logged';
// Synthetic provider response: one FanDuel game, one game from another book, one outside the 7-day window.
const sample=()=>[
  {id:'e1',commence_time:'2026-10-11T17:00:00Z',home_team:'New Orleans Saints',away_team:'Las Vegas Raiders',bookmakers:[{key:'fanduel',markets:[
    {key:'h2h',outcomes:[{name:'New Orleans Saints',price:-142},{name:'Las Vegas Raiders',price:120}]},
    {key:'spreads',outcomes:[{name:'New Orleans Saints',price:-110,point:-2.5},{name:'Las Vegas Raiders',price:-110,point:2.5},{name:'Las Vegas Raiders',price:-110,point:null}]},
    {key:'totals',outcomes:[{name:'Over',price:-108,point:44.5},{name:'Under',price:-112,point:44.5},{name:'Junk',price:5}]}]}]},
  {id:'e2',commence_time:'2026-10-11T20:25:00Z',home_team:'Kansas City Chiefs',away_team:'Indianapolis Colts',bookmakers:[{key:'draftkings',markets:[{key:'h2h',outcomes:[{name:'Kansas City Chiefs',price:-178}]}]}]},
  {id:'e3',commence_time:'2026-10-30T17:00:00Z',home_team:'A',away_team:'B',bookmakers:[{key:'fanduel',markets:[{key:'h2h',outcomes:[{name:'A',price:-110}]}]}]},
];
function fixture({key=KEY,remaining=400,fail=false}={}){
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+file,'utf8'));
  const urls=[],logs=[],cache=new Map();
  const env={ODDS_API_KEY:key,DB:{
    prepare(query){let args=[];const s={bind(...a){args=a;return s;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},exec(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return s.exec();}};return s;},
    async batch(items){return items.map(x=>x.exec());}
  }};
  const fetch=async url=>{urls.push(String(url));if(fail)return new Response('nope',{status:500});return Response.json(sample(),{headers:{'x-requests-remaining':String(remaining),'x-requests-last':'3'}});};
  function load(file){file=resolve(root,file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const require=p=>p==='cloudflare:workers'?{env,waitUntil(){}}:p==='@/lib/admin'?{isAdmin:()=>false}:load(p.startsWith('@/')?p.slice(2)+'.ts':resolve(dirname(file),p+'.ts'));
    vm.runInNewContext(code,{exports,require,Response,Request,AbortSignal,crypto,URL,URLSearchParams,Intl,JSON,console:{error:(...a)=>logs.push(JSON.stringify(a)),info(){}},fetch});return exports;
  }
  return {sql,urls,logs,odds:load('lib/odds.ts'),route:load('app/api/odds/route.ts'),submissions:load('app/api/submissions/route.ts')};
}
test('keeps only valid FanDuel lines inside the next 7 days',()=>{
  const f=fixture();const events=f.odds.normalize(sample(),NOW);
  assert.deepEqual([...events.map(e=>e.id)],['e1']);
  assert.deepEqual([...events[0].totals.map(o=>o.name)],['Over','Under']);
  assert.equal(events[0].spreads.find(o=>o.name==='Las Vegas Raiders').point,2.5);assert.equal(events[0].spreads.filter(o=>o.name==='Las Vegas Raiders').length,1);
});
test('lines are cached per sport for four hours, then refreshed',async()=>{
  const f=fixture();
  const first=await f.odds.getOdds('americanfootball_nfl',NOW);
  assert.equal(first.events.length,1);assert.equal(first.paused,false);assert.equal(f.urls.length,1);
  assert.match(f.urls[0],/bookmakers=fanduel/);assert.match(f.urls[0],/markets=h2h%2Cspreads%2Ctotals/);
  await f.odds.getOdds('americanfootball_nfl',NOW+3*HOUR);assert.equal(f.urls.length,1);
  await f.odds.getOdds('americanfootball_nfl',NOW+5*HOUR);assert.equal(f.urls.length,2);
  assert.equal(f.sql.prepare('SELECT credits FROM odds_usage').get().credits,6);
});
test('weekly credit budget pauses refreshes, serves the last lines, and resets on Monday',async()=>{
  const f=fixture({remaining:5000}),sports=[...f.odds.oddsSports].map(x=>x.key),step=f.odds.ODDS_TTL_MS+1000;
  let last;
  for(let i=0;i<40;i++)last=await f.odds.getOdds(sports[i%sports.length],NOW+Math.floor(i/sports.length)*step);
  assert.equal(f.urls.length,Math.floor(f.odds.ODDS_WEEKLY_CREDITS/3));
  assert.equal(last.paused,true);assert.ok(last.fetchedAt);
  assert.ok(f.sql.prepare('SELECT credits FROM odds_usage').get().credits<=f.odds.ODDS_WEEKLY_CREDITS);
  // Thursday 2026-10-08 belongs to the week starting Monday 2026-10-05; the next Monday starts a new budget.
  assert.equal(f.odds.easternWeekStart(NOW),'2026-10-05');
  const monday=Date.parse('2026-10-12T14:00:00Z');assert.equal(f.odds.easternWeekStart(monday),'2026-10-12');
  assert.equal(f.odds.easternWeekStart(Date.parse('2026-10-12T03:00:00Z')),'2026-10-05');
  const fresh=await f.odds.getOdds('americanfootball_nfl',monday);
  assert.equal(fresh.paused,false);assert.equal(f.urls.length,Math.floor(f.odds.ODDS_WEEKLY_CREDITS/3)+1);
});
test('reserve floor stops refreshes when the account is nearly out of credits',async()=>{
  const f=fixture({remaining:20});
  await f.odds.getOdds('americanfootball_nfl',NOW);assert.equal(f.urls.length,1);
  const r=await f.odds.getOdds('basketball_nba',NOW);
  assert.equal(r.paused,true);assert.equal(f.urls.length,1);
});
test('missing key or provider failure falls back without leaking the key',async()=>{
  const none=fixture({key:''});
  const r=await none.odds.getOdds('americanfootball_nfl',NOW);
  assert.equal(r.unavailable,true);assert.equal(none.urls.length,0);
  const down=fixture({fail:true});
  const d=await down.odds.getOdds('americanfootball_nfl',NOW);
  assert.equal(d.unavailable,true);assert.equal(down.urls.length,1);
  assert.ok(down.logs.length>0);assert.ok(down.logs.every(l=>!l.includes(KEY)));
  await down.odds.getOdds('americanfootball_nfl',NOW+60000);assert.equal(down.urls.length,1);
});
test('odds route rejects unknown sports and never returns the key',async()=>{
  const f=fixture();
  assert.equal((await f.route.GET(new Request('https://portal.invalid/api/odds?sport=darts'))).status,404);
  const ok=await f.route.GET(new Request('https://portal.invalid/api/odds?sport=americanfootball_nfl'));
  assert.equal(ok.status,200);assert.ok(!(await ok.text()).includes(KEY));
});
test('picks keep a valid feed timestamp and drop malformed ones',async()=>{
  const f=fixture();
  const post=b=>f.submissions.POST(new Request('https://portal.invalid/api/submissions',{method:'POST',headers:{origin:'https://portal.invalid'},body:JSON.stringify(b)}));
  const base={season:'2026 Season',week:1,sport:'NFL',odds:-110,details:{team:'New Orleans Saints',opponent:'Las Vegas Raiders',market:'Spread',line:'-2.5',eventDate:'2026-10-11'}};
  assert.equal((await post({...base,member:'Drew',details:{...base.details,feedAt:'2026-10-08T13:42:00.000Z'}})).status,201);
  assert.equal((await post({...base,member:'Nav',odds:120,details:{...base.details,market:'Moneyline',line:'',feedAt:'<script>'}})).status,201);
  const rows=f.sql.prepare('SELECT member,details FROM submissions ORDER BY member').all().map(r=>[r.member,JSON.parse(r.details).feedAt]);
  assert.deepEqual(rows,[['Drew','2026-10-08T13:42:00.000Z'],['Nav',undefined]]);
});
