import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/submissions/route.ts', import.meta.url), 'utf8')
  .replace("import { env } from 'cloudflare:workers';", '')
  .replace("import { isAdmin } from '@/lib/admin';", '');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const db = new DatabaseSync(':memory:');
  let failInsert = false;
  let sheetCalls = 0;
  let sheetFails = false;
  const env = { PORTAL_SHEET_WEBHOOK_URL: 'https://example.invalid/sheet', PORTAL_SHEET_SECRET: 'test', DB: {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { if (failInsert && sql.startsWith('INSERT INTO submissions')) throw new Error('database unavailable'); return db.prepare(sql).run(...args); },
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(s => s.run())); },
  } };
  const exports = {};
  vm.runInNewContext(code, { exports, env, isAdmin: () => true, Response, Request, AbortSignal, crypto, console: { info() {}, error() {} }, fetch: async () => { sheetCalls++; if (sheetFails) throw new Error('network failure'); return Response.json({ ok: true }); } });
  const pick = { member: 'Drew', sport: 'College Football', selection: 'Test original pick', odds: -110, season: '2026 Season', week: 1 };
  const post = body => exports.POST(new Request('https://example.invalid/api/submissions', { method: 'POST', body: JSON.stringify(body) }));
  return { db, exports, pick, post, calls: () => sheetCalls, failSheet: () => { sheetFails = true; }, failDatabase: () => { failInsert = true; } };
}

test('removed member can submit a replacement; exact retries are idempotent', async () => {
  const f = fixture();
  const first = await f.post(f.pick);
  assert.equal(first.status, 201);
  const saved = await first.json();
  const deleted = await f.exports.DELETE(new Request('https://example.invalid/api/submissions', { method: 'DELETE', body: JSON.stringify({ id: saved.id }) }));
  assert.equal(deleted.status, 200);
  const replacement = { ...f.pick, selection: 'Test replacement pick' };
  assert.equal((await f.post(replacement)).status, 201);
  const calls = f.calls();
  assert.equal((await f.post(replacement)).status, 200);
  assert.equal(f.calls(), calls);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 1);
});
test('weekly limit is checked before changing the sheet', async () => {
  const f = fixture();
  assert.equal((await f.post(f.pick)).status, 201);
  const calls = f.calls();
  assert.equal((await f.post({ ...f.pick, selection: 'Another pick' })).status, 409);
  assert.equal(f.calls(), calls);
});
test('sheet failure is not mislabeled as already submitted and saves no portal row', async () => {
  const f = fixture(); f.failSheet();
  const response = await f.post(f.pick);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /not saved/);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 0);
});
test('database failure is recoverable rather than a false duplicate', async () => {
  const f = fixture(); f.failDatabase();
  const response = await f.post(f.pick);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /could not confirm/);
});
test('a stale week never silently files the pick under the new week', async () => {
  const f = fixture();
  assert.equal((await f.post({ ...f.pick, week: 0 })).status, 409);
  assert.equal(f.calls(), 0);
});
