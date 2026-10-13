-- evaluation_batches.coach_id has always been set to whoever clicked
-- "New Batch"/"New Evaluation Period" in the web dashboard — an org/app
-- admin, not the team's actual coach — so every admin-created batch
-- showed the admin's own name as "the coach" throughout the Evaluations
-- UI. Backfill to the team's real assigned coach (team_members where
-- role='coach'; earliest-assigned one if a team has more than one) for
-- every batch currently attributed to a non-coach profile. Batches with
-- no real coach on the team are left as-is — nothing to backfill to.
update public.evaluation_batches eb
set coach_id = tm.profile_id
from (
  select distinct on (team_id) team_id, profile_id
  from public.team_members
  where role = 'coach'
  order by team_id, created_at asc
) tm
where eb.team_id = tm.team_id
  and exists (
    select 1 from public.profiles p
    where p.id = eb.coach_id and p.role in ('org_admin', 'app_admin')
  );
