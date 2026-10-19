-- Week 6 (2026 Season) correction requested by the commissioner, 2026-10-19.
-- Seed's Kansas Jayhawks +4.5 lost, and he re-upped on Houston Cougars -4.5 vs
-- Oklahoma State (Saturday 2026-10-17, 7:30 PM ET) without logging it on the site.
-- Odds -108 are FanDuel's listed price for that line (FanDuel research preview,
-- fanduel.com/research/houston-vs-oklahoma-state-college-football-odds-picks-best-bets-for-10-17-2026);
-- correct them if Seed's slip shows a different price.
-- Recorded the way a member replacement is: the same pick, edited in place, with a
-- 'replace' history entry that keeps the lost Kansas pick. The new pick starts
-- Pending; the automatic score check grades it. Each statement only applies while
-- the pick is exactly as recorded on 2026-10-19, so running this twice changes nothing.

INSERT INTO pick_changes (id, submission_id, season, week, member, actor, action, before_json, after_json, reason, created_at)
SELECT 'correction-2026-10-19-week6-seed', id, season, week, member, 'Commissioner', 'replace',
  json_object('id', id, 'season', season, 'week', week, 'member', member, 'sport', sport, 'selection', selection, 'odds', odds, 'status', status, 'createdAt', created_at, 'updatedAt', updated_at, 'revision', revision, 'details', json(details), 'evidence', json(evidence)),
  json_object('id', id, 'season', season, 'week', week, 'member', member, 'sport', 'College Football', 'selection', 'Houston Cougars -4.5 vs Oklahoma State Cowboys', 'odds', -108, 'status', 'Pending', 'createdAt', created_at, 'updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'revision', revision + 1,
    'details', json_object('team', 'Houston Cougars', 'opponent', 'Oklahoma State Cowboys', 'market', 'Spread', 'line', '-4.5', 'eventDate', '2026-10-17', 'description', ''),
    'evidence', json_object()),
  'Replaced Kansas Jayhawks +4.5 vs Kansas State Wildcats (-110) after it lost; re-upped on Houston Cougars -4.5 (-108, FanDuel listed price). Logged by the commissioner.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM submissions
WHERE id = '08e3b10d-dc4b-4eb8-88f1-6e4e1cce8311' AND revision = 1 AND selection = 'Kansas Jayhawks +4.5 vs Kansas State Wildcats' AND status = 'Miss';

UPDATE submissions SET
  sport = 'College Football', selection = 'Houston Cougars -4.5 vs Oklahoma State Cowboys', odds = -108, status = 'Pending',
  duplicate_key = '2026 Season|6|houston cougars -4.5 vs oklahoma state cowboys',
  details = json_object('team', 'Houston Cougars', 'opponent', 'Oklahoma State Cowboys', 'market', 'Spread', 'line', '-4.5', 'eventDate', '2026-10-17', 'description', ''),
  evidence = '{}',
  revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '08e3b10d-dc4b-4eb8-88f1-6e4e1cce8311' AND revision = 1 AND selection = 'Kansas Jayhawks +4.5 vs Kansas State Wildcats' AND status = 'Miss';
