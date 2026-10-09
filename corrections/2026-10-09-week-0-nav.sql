-- Week 0 (2026 Season) correction requested by the commissioner, 2026-10-09.
-- Nav's "GT moneyline" was submitted without a matchup. The commissioner
-- confirmed GT means Georgia Tech. Georgia Tech's next game after the pick was
-- submitted (2026-09-03 16:55 UTC) was that night: Colorado 14, Georgia Tech 13.
-- The selection text is kept as submitted; the matchup is filled in and the pick
-- is graded a loss with evidence. Each statement only applies while the pick is
-- exactly as recorded on 2026-10-09, so running this file twice changes nothing.

INSERT INTO pick_changes (id, submission_id, season, week, member, actor, action, before_json, after_json, reason, created_at)
SELECT 'correction-2026-10-09-week0-nav', id, season, week, member, 'Commissioner', 'grade',
  json_object('id', id, 'season', season, 'week', week, 'member', member, 'sport', sport, 'selection', selection, 'odds', odds, 'status', status, 'createdAt', created_at, 'updatedAt', updated_at, 'revision', revision, 'details', json(details), 'evidence', json(evidence)),
  json_object('id', id, 'season', season, 'week', week, 'member', member, 'sport', sport, 'selection', selection, 'odds', odds, 'status', 'Miss', 'createdAt', created_at, 'updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'revision', revision + 1,
    'details', json_object('team', 'Georgia Tech Yellow Jackets', 'opponent', 'Colorado Buffaloes', 'market', 'Moneyline', 'eventDate', '2026-09-03'),
    'evidence', json_object('result', 'Colorado 14, Georgia Tech 13 (final, Sep 3 2026)', 'source', 'https://deadspin.com/julian-lewis-late-td-pass-lifts-colorado-over-georgia-tech/', 'reason', 'Commissioner confirmed GT is Georgia Tech, which lost to Colorado.', 'gradedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))),
  'GT is Georgia Tech (confirmed by the commissioner); Georgia Tech lost 14-13 to Colorado on Sep 3.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM submissions
WHERE id = '7e2ce51c-cf82-44fc-9ffe-5a5c8ec789a6' AND revision = 0 AND selection = 'GT moneyline' AND status = 'Pending';

UPDATE submissions SET
  status = 'Miss',
  details = json_object('team', 'Georgia Tech Yellow Jackets', 'opponent', 'Colorado Buffaloes', 'market', 'Moneyline', 'eventDate', '2026-09-03'),
  evidence = json_object('result', 'Colorado 14, Georgia Tech 13 (final, Sep 3 2026)', 'source', 'https://deadspin.com/julian-lewis-late-td-pass-lifts-colorado-over-georgia-tech/', 'reason', 'Commissioner confirmed GT is Georgia Tech, which lost to Colorado.', 'gradedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '7e2ce51c-cf82-44fc-9ffe-5a5c8ec789a6' AND revision = 0 AND selection = 'GT moneyline' AND status = 'Pending';
