# Scheduled jobs: the Claude routines

All scheduled work runs from Claude Code routines on Abhinav's Claude plan, not the paid API. GitHub's scheduler delayed or dropped about half its runs, so its workflows (`check-scores.yml`, `finalize-week.yml`) are now manual backups only. Each routine run:

1. **Checks final scores** (`POST /api/grade/scores`). This is the same free score check that settles moneylines, spreads and totals.
2. **Researches what's left**:
   - player props;
   - "Other" bets;
   - leagues the score feed doesn't cover;
   - picks without a matchup.
3. **Finalizes the week (Tuesday morning run only)** (`POST /api/grade/finalize`). This rolls over to the next week.

## How it works

- **Schedule.** Four routines with the same instructions run after each game window (all ET):
  - Thursday, Friday and Saturday at 11:52 PM;
  - Sunday at 4:52 PM and 8:52 PM;
  - Monday at 12:52 AM, after Sunday night's game;
  - Tuesday at 8:52 AM, after Monday night's game, plus anything left over. This run then finalizes the week and opens the next one.

  Games dated today are graded only once a source shows them final.
- **Reading picks.** Each run reads `GET /api/grade`: pending picks whose game date isn't in the future.
- **Researching.** For each pick, it finds the official result or box score and posts a grade to `POST /api/grade`. Each grade includes:
  - the stat or score it relied on;
  - a source link;
  - a reason.
- **Saving.** The portal saves the grade with the same guarded write as a commissioner grade:
  - it records evidence on the pick;
  - it adds a change-history entry by "Automatic result (Claude, web research)";
  - it refuses a pick that was edited or already graded.
- **Anything unclear stays Pending.** That includes a player who didn't play, unclear overtime rules, and a game it can't pin down. The routine lists those in its summary for the commissioner.
- **Finalizing.** The Tuesday run finalizes even if legs are still pending, and records no-shows without a penalty. The finalize refuses while any game in the week is today or later, and it never finalizes a week twice.

All of these endpoints (`/api/grade`, `/api/grade/scores`, `/api/grade/finalize`) take only `PORTAL_GRADER_TOKEN`. That token can do three things:
- read pending picks and grade them;
- run the score check;
- run the weekly rollover.

It can't edit or remove picks, or change settings or tickets.

## Setup (Abhinav)

1. **Make a token.** Create a random value of 32+ characters, for example from a password manager.
2. **GitHub.** Add the token as the repository secret `PORTAL_GRADER_TOKEN`. Then run **Deploy to Cloudflare** once so the site picks it up.
3. **Claude environment.** Add a **network secret** to the Claude Code cloud environment the routines run in. To get there on claude.ai/code, open the environment menu in a session's title bar and choose **Edit**. Fill it in as:
   - **Name:** `PORTAL_GRADER_TOKEN`.
   - **Secret type:** Bearer.
   - **Allowed website:** `off-league-megalay.abhinavsehgal55.workers.dev`.
   - **Path prefix:** `/api/grade`.
   - **Header:** `Authorization`, prefix `Bearer`, value the same token.

   Claude never sees the value. It's attached only to requests under `/api/grade`, which covers all three endpoints, so the routines send no Authorization header themselves.

Never paste the token into chat, commits or logs.
