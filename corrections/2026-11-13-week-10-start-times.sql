-- Week 10 (2026 Season) start times, requested by the commissioner, 2026-11-13.
-- Picks now carry the game's Eastern start time ("HH:MM", 24-hour) next to its
-- date. Picks made before that change have none, so this fills in this week's
-- from the FanDuel feed's scheduled start (The Odds API commence_time, fetched
-- 2026-11-13), matched on team, opponent and the pick's recorded event date.
-- Only the start time is added: selection, odds, status and revision are left
-- as they are, so no one's open edit is invalidated. Each statement applies only
-- while the pick has no start time and the same event date, so running this
-- twice changes nothing.

UPDATE submissions SET details = json_set(details, '$.startTime', '13:00') WHERE id = '5c5e7575-696d-4e14-9950-1499982688b2' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-15' AND json_extract(details, '$.startTime') IS NULL; -- Nav
UPDATE submissions SET details = json_set(details, '$.startTime', '18:15') WHERE id = 'a1cb4f38-72a7-4ef5-b070-f80690d97e3c' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-14' AND json_extract(details, '$.startTime') IS NULL; -- Drew
UPDATE submissions SET details = json_set(details, '$.startTime', '19:30') WHERE id = 'af5fb3d9-fb46-4ed2-a472-d09340a28e4b' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-14' AND json_extract(details, '$.startTime') IS NULL; -- Brooks
UPDATE submissions SET details = json_set(details, '$.startTime', '15:00') WHERE id = '1cace9f9-a1b6-4735-9835-b042c42a78a3' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-14' AND json_extract(details, '$.startTime') IS NULL; -- Fab
UPDATE submissions SET details = json_set(details, '$.startTime', '13:00') WHERE id = '8f44ae2f-5d44-44d8-9607-db1bb72d4286' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-15' AND json_extract(details, '$.startTime') IS NULL; -- Jp
UPDATE submissions SET details = json_set(details, '$.startTime', '16:25') WHERE id = 'e08ac2e2-501d-418e-abce-51e2a1cfc4d7' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-15' AND json_extract(details, '$.startTime') IS NULL; -- Kith
UPDATE submissions SET details = json_set(details, '$.startTime', '15:30') WHERE id = '4d7120b1-0426-425b-9836-0404190e3905' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-14' AND json_extract(details, '$.startTime') IS NULL; -- Shan
UPDATE submissions SET details = json_set(details, '$.startTime', '19:10') WHERE id = 'e0e718cd-fcfa-4809-8ec1-684ad2804acb' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-13' AND json_extract(details, '$.startTime') IS NULL; -- Rohan
UPDATE submissions SET details = json_set(details, '$.startTime', '16:15') WHERE id = '1db6761a-0150-4db5-9564-61ea760181ac' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-14' AND json_extract(details, '$.startTime') IS NULL; -- Seed
UPDATE submissions SET details = json_set(details, '$.startTime', '20:20') WHERE id = '68611257-97b9-4005-a825-23788413db9d' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-15' AND json_extract(details, '$.startTime') IS NULL; -- CJ
UPDATE submissions SET details = json_set(details, '$.startTime', '15:30') WHERE id = '7e9210ae-ab86-4e8f-8eed-479347acaae7' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-14' AND json_extract(details, '$.startTime') IS NULL; -- Griff
UPDATE submissions SET details = json_set(details, '$.startTime', '21:00') WHERE id = '788f3196-3237-4df6-a386-f1aafb5d08d4' AND season = '2026 Season' AND week = 10 AND json_extract(details, '$.eventDate') = '2026-11-13' AND json_extract(details, '$.startTime') IS NULL; -- Ryser
