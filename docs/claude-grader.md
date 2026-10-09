# Research grading by Claude

Final scores settle moneylines, spreads and totals automatically (`check-scores.yml`). Everything else is researched by a scheduled Claude Code routine on Abhinav's Claude plan, not the paid API:
- player props;
- "Other" bets;
- leagues the score feed doesn't cover;
- picks without a matchup.

## How it works

- **Schedule.** Four routines with the same instructions run after each game window (all ET):
  - Thursday, Friday and Saturday at 11:52 PM;
  - Sunday at 4:52 PM and 8:52 PM;
  - Monday at 12:52 AM, after Sunday night's game;
  - Tuesday at 8:52 AM, after Monday night's game, plus anything left over.

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

Both endpoints take only `PORTAL_GRADER_TOKEN`. That token can read pending picks and grade them, nothing else. It can't finalize weeks, change settings or edit picks.

## Setup (Abhinav)

1. **Make a token.** Create a random value of 32+ characters, for example from a password manager.
2. **GitHub.** Add the token as the repository secret `PORTAL_GRADER_TOKEN`. Then run **Deploy to Cloudflare** once so the site picks it up.
3. **Claude environment.** In the Claude Code cloud environment the routine runs in, add the same value as the environment variable `PORTAL_GRADER_TOKEN`. To get there, open the environment menu in a session's title bar and choose **Edit**.
4. **Network.** The environment's network access must allow `off-league-megalay.abhinavsehgal55.workers.dev`. It already does today.

Never paste the token into chat, commits or logs.
