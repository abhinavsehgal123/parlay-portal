# Production baseline and contributor handoff

Checkpoint: 2026-10-08. OpenAI Sites version 26 was deployed successfully.

- Site: https://off-league-parlay-portal.abhinavsehgal55.chatgpt.site
- Sites project: `appgprj_6a95ffe625bc8191a8f106a38f03f859`
- Sites source commit: `5f7c1276d259d1ba8deaf1ae8f3605fe6ce15f54`
- Sites source tree: `ca530a7c6cfd38edbe320d388cc44d5bd588d49c`
- GitHub starting commit: `869fa7caa02128d354cba8679677f7211f76ca1d`

The Sites repository and GitHub repository have separate histories. This sync copies production source into the GitHub history; it does not import the original Sites commit object. Application source, dependencies, configuration, migrations, and tests match that production checkpoint. GitHub retains its README and stronger .gitignore; the generated tsconfig.tsbuildinfo cache is intentionally omitted. This handoff is additional documentation.

No uncommitted or in-progress implementation exists beyond the production commit at this checkpoint. This repository sync does not deploy or modify production data.

## Validation

The production checkpoint passed TypeScript checks, the production build, and all 9 integration tests. The 9 tests were rerun successfully during this sync. Browser/mobile visual testing is not represented by those results. Lint was not validated during this sync.

Commands after npm ci:

```
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Tests use node:sqlite. Confirm your Node version supports the API used by the test runner. The sync rerun used the available Codex runtime.

## Product constraints

Keep the existing honor-system member selection. Do not add member identity/accounts, automatic deadline enforcement, ticket locking, a personal home view, or draft recovery. Thursday 12:30 PM Eastern is advisory; manual admin opening/closing remains. Preserve existing production picks, historical records, odds, corrections, and grading evidence.

Version 26 includes portal-first D1 writes, a durable sheet outbox with retries during portal activity, revision-checked edits, audit history, structured picks, history corrections, clearer standings, and guarded weekly rollover. Sheet retries are not an independent cron service.

## Coordination

Use GitHub for shared development. Fetch the latest main before work; record the base commit and use a task branch/PR. Do not overlap changes to the same files without coordinating. Preserve unfamiliar/uncommitted changes. Codex handles Sites publication when Claude lacks those tools. Only one contributor should perform production operations at a time.

Every handoff must state the branch/commit, changes, actual validation, migrations/configuration needs, remaining issues, and whether production was modified. Before deployment, reconcile GitHub changes with the latest Sites source; preserve GitHub-only contribution documentation when importing source. Record both the GitHub revision and resulting Sites revision when their commit IDs differ. Do not assume an automatic GitHub-to-Sites deployment or sync exists.

Never commit secrets or production-data exports. Use synthetic local test data and ignored local environment files. Runtime secrets must be configured separately through authorized tooling.

## Migration caution

Do not rewrite existing migrations or metadata. The older manually applied 0005_weekly_tickets.sql was absent from the old Drizzle journal; 0006_portal_usability.sql reconciles that history. Inspect it before generating future migrations; do not renumber files casually.

## Odds API server configuration — 2026-10-08

`ODDS_API_KEY` is configured as a secret in the existing production Sites project. Version 26 was redeployed successfully with environment revision 7 on 2026-10-08 to activate it. The value is intentionally not stored in GitHub, this handoff, or application source.

Server-only usage: import `env` from `cloudflare:workers` and read `env.ODDS_API_KEY`. Add `ODDS_API_KEY?: string` to `Cloudflare.Env` in `db/env.d.ts` as part of the consuming implementation, checking for any concurrent declaration first. Treat a missing key as a configuration error without returning or logging its value. Do not expose it through client bundles, public environment prefixes, API responses, or logged request URLs.

For local development, use an independently provided key in an ignored `.dev.vars` file; production secrets are not automatically transferred to Claude's environment. This configuration change does not implement the Odds API integration or validate the provider key/quota. Claude may proceed with the server integration knowing the production variable exists. No application code or production picks changed during this configuration update.

## FanDuel odds browser — 2026-10-09 (Claude)

The submit and edit dialogs include a "Find it on FanDuel" browser. Tapping a game line fills in the pick's market, team, opponent, line, event date, and odds; members can still edit everything, and manual entry is unchanged. Game lines only (moneyline, spread, total, plus the draw price for soccer). Player props are not fetched.

- Server: `lib/odds.ts` and `GET /api/odds?sport=<key>`. Sports: NFL, College Football, NBA, College Basketball, MLB, NHL, Premier League, Champions League (both soccer leagues save as the portal's `Soccer` sport).
- Free-plan budget: one sport refresh costs 3 credits. Lines are cached per sport for 2 hours and fetched only when someone browses that sport. Refreshes stop at 15 credits per Eastern day or when the provider reports fewer than 25 credits left, after which the last lines are shown with a "paused" note. A failed refresh is not retried for 10 minutes. Tune the constants at the top of `lib/odds.ts`.
- The key is read only on the server and is never logged or returned; the request URL carrying it is never logged.
- Migration `0007_odds_cache.sql` adds the `odds_cache` and `odds_usage` tables (additive). drizzle-kit names new files by journal index, so it proposed `0006_…`; it was renamed to `0007` with a matching journal tag. Its snapshot is `meta/0006_snapshot.json`, following the index-based snapshot naming.
- Picks filled from the browser store `details.feedAt` (when the odds were fetched). Any manual edit to the filled fields clears it. Pick cards show "Line filled from FanDuel feed, <time>".
