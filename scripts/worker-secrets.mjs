// Writes the Worker's runtime secrets from the environment to a JSON file for
// `wrangler secret bulk`, skipping any that are unset. Values are never printed.
// Usage: node scripts/worker-secrets.mjs <output file>
import { writeFileSync } from 'node:fs';

const names = ['ODDS_API_KEY', 'PORTAL_RESULTS_TOKEN', 'PORTAL_GRADER_TOKEN', 'PORTAL_COMMISSIONER_CODE', 'PORTAL_COMMISSIONER_SESSION', 'PORTAL_SHEET_WEBHOOK_URL', 'PORTAL_SHEET_SECRET', 'PORTAL_ADMIN_EMAIL'];
const file = process.argv[2];
if (!file) throw new Error('Pass the output file.');
const secrets = Object.fromEntries(names.filter(n => process.env[n]).map(n => [n, process.env[n]]));
writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
console.log(`Prepared ${Object.keys(secrets).length} secret(s): ${Object.keys(secrets).join(', ') || 'none'}.`);
