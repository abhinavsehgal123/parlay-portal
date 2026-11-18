-- Week 11 (2026 Season): add the start time to Nav's pick, 2026-11-18.
-- The pick came from the FanDuel feed but was saved without its start time
-- (the browser's time format wasn't read; fixed in the same change). Start from
-- the feed's scheduled time (The Odds API commence_time 2026-11-22T21:05:00Z,
-- Jets @ Chargers, 4:05 PM ET). Only the start time is added; selection, odds,
-- status and revision are unchanged. Applies only while the pick has no start
-- time and the same date, so running it twice changes nothing.

UPDATE submissions SET details = json_set(details, '$.startTime', '16:05') WHERE id = '77cec591-9a52-4218-94aa-9b0876d1cbe1' AND season = '2026 Season' AND week = 11 AND json_extract(details, '$.eventDate') = '2026-11-22' AND json_extract(details, '$.startTime') IS NULL; -- Nav
