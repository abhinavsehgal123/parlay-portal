// Confirms two portals hold the same records by comparing their public boards.
// Usage: node scripts/compare-boards.mjs <old portal URL> <new portal URL>
// Exits non-zero and lists the differences if anything differs.
const [a, b] = process.argv.slice(2);
if (!a || !b) throw new Error('Pass the old and new portal URLs.');
const load = async url => (await fetch(new URL('/api/submissions', url), { headers: { 'cache-control': 'no-store' } })).json();
const [left, right] = await Promise.all([load(a), load(b)]);

const byKey = (list, key) => Object.fromEntries((list ?? []).map(x => [key(x), x]));
const sets = {
  settings: [{ ...left.settings, submissionsOpen: Boolean(left.settings.submissionsOpen) }, { ...right.settings, submissionsOpen: Boolean(right.settings.submissionsOpen) }],
  picks: [byKey(left.historySubmissions, p => p.id), byKey(right.historySubmissions, p => p.id)],
  changes: [byKey(left.changes, c => c.id), byKey(right.changes, c => c.id)],
  finalizations: [byKey(left.finalizations, f => `${f.season}|${f.week}`), byKey(right.finalizations, f => `${f.season}|${f.week}`)],
  tickets: [byKey(left.tickets, t => `${t.season}|${t.week}`), byKey(right.tickets, t => `${t.season}|${t.week}`)],
  missed: [byKey(left.missedSubmissions, m => `${m.season}|${m.week}|${m.member}`), byKey(right.missedSubmissions, m => `${m.season}|${m.week}|${m.member}`)],
};
// Sorts object keys so field order never counts as a difference.
const canon = v => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([k1], [k2]) => k1.localeCompare(k2))) : x);
const diffs = [];
for (const [name, [l, r]] of Object.entries(sets)) {
  if (name === 'settings') { if (canon(l) !== canon(r)) diffs.push(`settings: ${canon(l)} vs ${canon(r)}`); continue; }
  for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (!(key in l)) diffs.push(`${name} ${key}: only in new`);
    else if (!(key in r)) diffs.push(`${name} ${key}: missing from new`);
    else if (canon(l[key]) !== canon(r[key])) diffs.push(`${name} ${key}: differs`);
  }
}
const counts = Object.entries(sets).filter(([n]) => n !== 'settings').map(([n, [l, r]]) => `${n} ${Object.keys(l).length}/${Object.keys(r).length}`).join(', ');
console.log(`Compared (old/new): ${counts}.`);
if (diffs.length) { console.log(`${diffs.length} difference(s):\n${diffs.slice(0, 50).join('\n')}`); process.exit(1); }
console.log('The new portal matches the old one.');
