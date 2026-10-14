-- The small corner avatar (card_photo_url ?? photo_url, added in the prior
-- migration's commit) wasn't what the coach wanted — they want a big,
-- full-bleed hero photo like the player card, defaulting to the same card
-- photo but swappable per-report (a coach may want a different action shot
-- for a different season's report). Stored on player_evaluations, not
-- players, since it's a per-report override, not a profile-wide photo.
--
-- Path stability note: the upload path is players/{player_id}-eval-{batch_id}.png
-- (batch_id, not the evaluation row's own id) because a brand-new draft
-- has no player_evaluations row yet — (batch_id, player_id) is already
-- unique (player_evaluations_batch_id_player_id_key), so it's a stable,
-- predictable path the coach can upload to before the row is first saved.
alter table player_evaluations
  add column report_photo_url text,
  add column report_photo_offset_x real not null default 0 check (report_photo_offset_x between -1 and 1),
  add column report_photo_offset_y real not null default 0 check (report_photo_offset_y between -1 and 1);

-- Extend the existing can_manage_player_photo() storage guard (see
-- 20260930000002_player_card_photo.sql) to also permit the new
-- players/{id}-eval-{batch_id}.png path. Only a coach of the batch's own
-- team may write it — this photo is set from the coach-only evaluation
-- form, never by a guardian.
create or replace function public.can_manage_player_photo(p_object_name text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.players p
    where p_object_name in ('players/' || p.id::text || '.jpg', 'players/' || p.id::text || '-card.png')
      and (public.is_player_guardian(p.id) or public.is_team_coach(p.team_id))
  )
  or exists (
    select 1 from public.players p
    join public.evaluation_batches b on b.team_id = p.team_id
    where p_object_name = 'players/' || p.id::text || '-eval-' || b.id::text || '.png'
      and public.is_team_coach(p.team_id)
  );
$$;
