import { env, waitUntil } from 'cloudflare:workers';
import { db } from './portal-db';

// A durable outbox is committed alongside each portal change. Sheet availability
// never determines whether a portal write succeeds. A global lease keeps older
// deliveries from overwriting newer ones at the existing Apps Script endpoint.
export function queueStatement(id: string, payload: unknown, version: string, auditId: string) {
  return db().prepare(`INSERT INTO sheet_outbox (id,payload,version,created_at)
    SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM pick_changes WHERE id = ?)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=excluded.version,attempts=0,next_attempt=0,error=''`)
    .bind(id, JSON.stringify(payload), version, new Date().toISOString(), auditId);
}
export function kickSync() {
  if (env.PORTAL_SHEET_WEBHOOK_URL && env.PORTAL_SHEET_SECRET) waitUntil(drainSync().catch(() => console.error('sheet_sync_deferred')));
}
export async function drainSync(force = false) {
  if (!env.PORTAL_SHEET_WEBHOOK_URL || !env.PORTAL_SHEET_SECRET) return;
  const token = crypto.randomUUID(), now = Date.now();
  const lease = await db().prepare(`INSERT INTO sync_lease (id,token,expires) VALUES (1,?,?)
    ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE sync_lease.expires < ?`)
    .bind(token, now + 60000, now).run();
  if (!lease.meta.changes) return;
  try {
    const job = await db().prepare(`SELECT * FROM sheet_outbox WHERE next_attempt <= ? ORDER BY created_at LIMIT 1`).bind(force ? Number.MAX_SAFE_INTEGER : now).first<Record<string, unknown>>();
    if (!job) return;
    const p = JSON.parse(String(job.payload));
    async function deliver(body: unknown) {
      const response = await fetch(env.PORTAL_SHEET_WEBHOOK_URL!, {method:'POST', headers:{'content-type':'text/plain;charset=utf-8'}, body:JSON.stringify({secret:env.PORTAL_SHEET_SECRET,...body as object}), signal:AbortSignal.timeout(6000)});
      if (!response.ok) throw new Error(`Sheet HTTP ${response.status}`);
      let result: {ok?:boolean;error?:string};
      try { result = await response.json(); } catch { throw new Error('Sheet returned an invalid response'); }
      if (!result.ok && !(p.action === 'deleteSubmission' && result.error === 'Submission not found')) throw new Error(result.error === 'Unauthorized' ? 'Sheet authorization needs attention' : 'Sheet did not confirm the update');
    }
    try {
      if (p.action === 'deleteSubmission') await deliver(p);
      else {
        // Creation is idempotent by ID in the existing receiver. It also repairs
        // missing rows left by previous Sheet-first failures.
        await deliver({...p, action:undefined, stake:p.stake ?? 1, event:[p.details?.opponent,p.details?.eventDate].filter(Boolean).join(' · '), market:p.details?.market||'', notes:`${p.season} · Megalay Portal`});
        await deliver({action:'updateSubmission',id:p.id,sport:p.sport,selection:p.selection,odds:p.odds});
        await deliver({action:'updateStatus',id:p.id,status:p.status === 'Hit' ? 'Win' : p.status === 'Miss' ? 'Loss' : p.status});
      }
      await db().prepare('DELETE FROM sheet_outbox WHERE id=? AND version=?').bind(job.id,job.version).run();
    } catch (error) {
      const attempts = Number(job.attempts) + 1;
      await db().prepare('UPDATE sheet_outbox SET attempts=?,next_attempt=?,error=? WHERE id=? AND version=?')
        .bind(attempts,Date.now()+Math.min(3600000,30000*2**Math.min(attempts,7)),error instanceof Error ? error.message.slice(0,180) : 'Sheet temporarily unavailable',job.id,job.version).run();
    }
  } finally { await db().prepare('DELETE FROM sync_lease WHERE id=1 AND token=?').bind(token).run(); }
}
