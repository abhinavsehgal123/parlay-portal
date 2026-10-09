-- Week 4 (2026 Season) corrections requested by the commissioner, 2026-10-08.
-- The placed ticket won: Rohan's losing leg was left off it, and Chris (CJ)
-- and Shan swapped picks after their originals lost. Standings follow the bets
-- that were on the ticket; every change is recorded in the change history.
-- Each statement only applies while the pick is exactly as recorded on
-- 2026-10-08, so running this file twice changes nothing the second time.

-- 1. Shan: Steelers ML (lost) -> USA ML vs Mexico, +180, Saturday 2026-10-03 (won).
INSERT INTO pick_changes (id, submission_id, season, week, member, actor, action, before_json, after_json, reason, created_at)
SELECT 'correction-2026-10-08-week4-shan', id, season, week, member, 'Commissioner', 'edit',
  json_object('id', id, 'season', season, 'week', week, 'member', member, 'sport', sport, 'selection', selection, 'odds', odds, 'status', status, 'createdAt', created_at, 'updatedAt', updated_at, 'revision', revision, 'details', json(details), 'evidence', json(evidence)),
  json_object('id', id, 'season', season, 'week', week, 'member', member, 'sport', 'Soccer', 'selection', 'USA ML vs Mexico', 'odds', 180, 'status', 'Hit', 'createdAt', created_at, 'updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'revision', revision + 1,
    'details', json_object('team', 'USA', 'opponent', 'Mexico', 'market', 'Moneyline', 'eventDate', '2026-10-03'),
    'evidence', json_object('reason', 'Won (recorded by the commissioner)', 'gradedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))),
  'Swapped after Steelers ML lost; USA ML vs Mexico (+180) was the bet on the ticket and won.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM submissions
WHERE id = 'e9f61e92-3bc9-4988-90a4-ba4646763db2' AND revision = 0 AND selection = 'Steelers ML' AND status = 'Miss';

UPDATE submissions SET
  sport = 'Soccer', selection = 'USA ML vs Mexico', odds = 180, status = 'Hit',
  duplicate_key = '2026 Season|4|usa ml vs mexico',
  details = json_object('team', 'USA', 'opponent', 'Mexico', 'market', 'Moneyline', 'eventDate', '2026-10-03'),
  evidence = json_object('reason', 'Won (recorded by the commissioner)', 'gradedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'e9f61e92-3bc9-4988-90a4-ba4646763db2' AND revision = 0 AND selection = 'Steelers ML' AND status = 'Miss';

-- 2. Chris (CJ): already shows Atlanta Falcons +2.5 (won). Record the swap
--    from Michigan ML, which was never logged. The pick itself is unchanged.
INSERT OR IGNORE INTO pick_changes (id, submission_id, season, week, member, actor, action, before_json, after_json, reason, created_at)
SELECT 'correction-2026-10-08-week4-cj', id, season, week, member, 'Commissioner', 'edit',
  json_object('selection', 'Michigan ML', 'status', 'Miss'),
  json_object('id', id, 'season', season, 'week', week, 'member', member, 'sport', sport, 'selection', selection, 'odds', odds, 'status', status, 'createdAt', created_at, 'updatedAt', updated_at, 'revision', revision, 'details', json(details), 'evidence', json(evidence)),
  'Swapped after Michigan ML lost; Atlanta Falcons +2.5 was the bet on the ticket. Recorded after the fact.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM submissions
WHERE id = '059d244c-2080-481f-8687-1b86518ebb10' AND selection = 'Atlanta Falcons +2.5';

-- 3. Rohan: Notre Dame -21 stays a loss. Note on his pick that it was left off
--    the placed ticket, and record the ticket's official result.
INSERT OR IGNORE INTO pick_changes (id, submission_id, season, week, member, actor, action, before_json, after_json, reason, created_at)
SELECT 'correction-2026-10-08-week4-rohan', id, season, week, member, 'Commissioner', 'note', '{}', '{}',
  'Left off the placed ticket, which won without this leg. The pick still counts as a loss.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM submissions
WHERE id = '5a4eef12-e504-4e39-a85e-bf5933e031c3' AND status = 'Miss';

INSERT INTO weekly_tickets (id, season, week, combined_odds, wager, potential_payout, updated_at, result, result_note)
VALUES ('2026 Season|4', '2026 Season', 4, NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Won', 'placed without Rohan''s leg')
ON CONFLICT(season, week) DO UPDATE SET result = excluded.result, result_note = excluded.result_note, updated_at = excluded.updated_at;
