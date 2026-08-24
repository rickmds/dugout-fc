-- player_reflections and player_shoutouts were added after the sweep in
-- 20260815000001_fix_profile_delete_fk_blocks.sql, so they still have the
-- old NO ACTION (blocking) behavior on their profiles FK — a coach who has
-- ever sent a shoutout, or a parent who has ever submitted a reflection,
-- would hit a foreign key violation and fail account deletion entirely.
-- Same fix, same pattern: SET NULL to preserve the record and anonymize
-- the actor (coach_id needs NOT NULL dropped first, matching how
-- evaluation_batches/player_evaluations were handled).

alter table player_reflections drop constraint player_reflections_submitted_by_fkey;
alter table player_reflections add constraint player_reflections_submitted_by_fkey foreign key (submitted_by) references profiles(id) on delete set null;

alter table player_shoutouts alter column coach_id drop not null;
alter table player_shoutouts drop constraint player_shoutouts_coach_id_fkey;
alter table player_shoutouts add constraint player_shoutouts_coach_id_fkey foreign key (coach_id) references profiles(id) on delete set null;
