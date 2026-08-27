alter table public.tournaments
  add column cancelled_at timestamptz,
  add column cancellation_reason text;

-- Deleting a tournament already cascade-deletes tournament_rsvps and
-- ungroups its games (tournament_id set null) via existing FKs — but by the
-- time the cascade-deleted tournament_rsvps rows fire the existing
-- sync_dated_tournament_rsvps trigger, the parent tournaments row is already
-- gone, so its start_date lookup returns null and it no-ops, leaving stale
-- event_rsvps behind on the (still-existing, now ungrouped) games. This
-- BEFORE DELETE trigger runs while old.start_date and events.tournament_id
-- are still intact, so it can clean those rows up correctly. Scoped to dated
-- tournaments only (undated/knockout games have independently-meaningful
-- per-game RSVPs that must survive the container's deletion), and to
-- unplayed games only (a played game's "who actually responded" history
-- should survive a delete, same as it survives a cancel).
create or replace function public.cleanup_dated_tournament_rsvps_on_delete() returns trigger
language plpgsql as $$
begin
  if old.start_date is not null then
    delete from public.event_rsvps er
    using public.events e
    where er.event_id = e.id
      and e.tournament_id = old.id
      and e.team_id = old.team_id
      and e.score_home is null
      and e.score_away is null;
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_dated_tournament_rsvps_on_delete_trigger on public.tournaments;
create trigger cleanup_dated_tournament_rsvps_on_delete_trigger
  before delete on public.tournaments
  for each row execute function public.cleanup_dated_tournament_rsvps_on_delete();
