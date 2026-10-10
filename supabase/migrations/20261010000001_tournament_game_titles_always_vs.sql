-- Tournament games are at a neutral venue — there's no "our home field" to
-- be away from, so every tournament game's title should read "vs Opponent"
-- regardless of which side of the bracket happens to be listed as the
-- nominal home team. Manually-created games already enforced this
-- (create-event.tsx), but the AI schedule-import prompt (parse-schedule)
-- never got the same rule, so AI-imported tournament games could come back
-- titled "@ Opponent" for an away-side draw. The prompt is fixed going
-- forward; this backfills the handful of existing rows that already have
-- "@ " baked into their title.
update public.events
set title = 'vs ' || substring(title from 3)
where tournament_id is not null
  and title like '@ %';
