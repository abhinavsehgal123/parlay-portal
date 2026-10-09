# Moving the portal to Cloudflare

The portal already runs on Cloudflare's stack (a Worker with a D1 database), so the move needs no application changes. After the move, every merge to `main` deploys automatically through GitHub Actions, so Abhinav, Codex and Claude all ship the same way.

Nothing here touches the current Sites deployment until the cutover. Rehearsed on 2026-10-09: all migrations applied to an empty D1 database through Wrangler, the live board was copied in, and the comparison found all 61 picks, 2 change-history entries and 5 finalized weeks identical. It also flagged a deliberately altered pick.

## 1. One-time setup (Abhinav)

1. **Cloudflare account.** Create a free account. Open **Workers & Pages** once and pick a `workers.dev` subdomain; the portal will be at `https://off-league-megalay.<subdomain>.workers.dev`.
2. **API token.** In **My Profile → API Tokens → Create Token**, start from the **Edit Cloudflare Workers** template and add **Account → D1 → Edit**. Limit it to your account.
3. **Account ID.** Shown on the Workers & Pages overview.
4. **GitHub secrets.** In the repo: **Settings → Secrets and variables → Actions**. Never paste these in chat.

   | Secret | Value |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | The token from step 2 |
   | `CLOUDFLARE_ACCOUNT_ID` | The ID from step 3 |
   | `ODDS_API_KEY` | The Odds API key |
   | `PORTAL_COMMISSIONER_CODE` | The admin code members never see (can be the current one) |
   | `PORTAL_COMMISSIONER_SESSION` | A new random value, 32+ characters |
   | `PORTAL_RESULTS_TOKEN` | Already set by Codex |
   | `PORTAL_SHEET_WEBHOOK_URL`, `PORTAL_SHEET_SECRET` | Optional; the Apps Script values. Without them the Google Sheet stops updating, and the portal still works. |

   `PORTAL_ADMIN_EMAIL` only works on Sites and isn't needed.
5. **Turn on deploys.** Add the repository variable `CLOUDFLARE_DEPLOY` = `true` (same page, **Variables** tab). Then run **Deploy to Cloudflare** from the Actions tab.
   - It tests, builds, creates the `off-league-megalay` D1 database, applies the migrations, deploys and syncs the secrets above.
   - The log ends with the `workers.dev` URL.
   - That site is empty until the cutover. Don't share it yet.

## 2. Cutover (done 2026-10-08, about 10:30 PM ET)

1. **Freeze the old site.** As commissioner on the old site:
   - In Admin, check the Google Sheet queue is empty (or press retry until it is).
   - Close submissions in League settings.
   - Tell the league to hold edits for half an hour.
2. **Import.** Run **Import portal records to Cloudflare** from the Actions tab, with the old URL (prefilled) and the new `workers.dev` URL. It:
   - refuses if the new database already has picks;
   - copies every record from the old board;
   - fails unless the new portal matches the old one field by field.
3. **Check and reopen.** Open the new site, sign in as commissioner, check this week, history and standings, then reopen submissions there.
4. **Score checks.** `check-scores.yml` now defaults to the new URL (`https://off-league-megalay.abhinavsehgal55.workers.dev`). Set the repository *variable* (not secret) `PORTAL_URL` only to override it. Run **Check final scores** once; its log should show `"ran":true`.
5. **Share the new link** with the league. When Codex is available, ask it to replace the old Sites deployment with a page that links to the new address, rather than leave a stale copy up.

## What isn't copied

- **Pending Google Sheet updates.** Let the queue drain first (step 2.1).
- **The odds cache and credit counters.** They rebuild themselves; the first odds load costs 3 credits.
- **Derived fields.** A few fields aren't on the public board and are derived on import: pick duplicate keys and stake, ticket and missed-submission IDs and timestamps. See `scripts/board-to-sql.mjs`.

## Rolling back

The old Sites deployment is untouched until it's replaced. To roll back:
1. Reopen submissions there and share the old link again.
2. Set `CLOUDFLARE_DEPLOY` to `false` to stop deploys.
3. Remove `PORTAL_URL` so score checks go back to the old site.

Picks made on the new site in the meantime would need re-entering on the old one.
