// Points the built Worker config (dist/server/wrangler.json) at the real
// Cloudflare D1 database and Worker name, and at the drizzle migrations.
// Usage: CLOUDFLARE_D1_DATABASE_ID=<id> node scripts/cloudflare-config.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'dist/server/wrangler.json';
const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
const name = process.env.WORKER_NAME || 'off-league-megalay';
const database = process.env.D1_NAME || name;
if (!id) throw new Error('Set CLOUDFLARE_D1_DATABASE_ID.');

const config = JSON.parse(readFileSync(file, 'utf8'));
const db = config.d1_databases?.find(d => d.binding === 'DB');
if (!db) throw new Error(`${file} has no D1 binding named DB.`);
config.name = name;
config.topLevelName = name;
Object.assign(db, { database_id: id, database_name: database, migrations_dir: '../../drizzle' });
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Configured Worker ${name} with D1 ${database}.`);
