-- Reverts the evaluation report photo feature (20261014000001,
-- 20261014000002) at the user's request — the player's photo on the
-- evaluation report is no longer wanted. Drops the now-unused column and
-- restores can_manage_player_photo() to its pre-feature definition (just
-- the roster photo and the Player Card photo, no eval-specific path).
-- The app code that read/wrote report_photo_url was reverted in the same
-- commit as this migration.
alter table player_evaluations
  drop column report_photo_url;

create or replace function public.can_manage_player_photo(p_object_name text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.players p
    where p_object_name in ('players/' || p.id::text || '.jpg', 'players/' || p.id::text || '-card.png')
      and (public.is_player_guardian(p.id) or public.is_team_coach(p.team_id))
  );
$$;
