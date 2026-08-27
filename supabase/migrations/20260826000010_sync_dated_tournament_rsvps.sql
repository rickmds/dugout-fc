-- Dated (weekend/round-robin) tournaments centralize RSVP at the tournament
-- level (tournament_rsvps) instead of per-game — a parent answers once and
-- every linked game should reflect it. Undated (knockout) tournaments keep
-- independent per-game RSVP, since availability legitimately varies round to
-- round over a season.

-- A dated-tournament game's own rsvp_lock_at is no longer set or shown in the
-- UI, so it must never block the sync below (or any other write path) — the
-- tournament's own entry_rsvp_lock_at / tournament_rsvp_not_locked is the one
-- true gate for that whole class of event.
create or replace function public.rsvp_not_locked(p_event_id uuid) returns boolean
language sql stable security definer
as $function$
  select coalesce(
    (select
       (t.start_date is not null)
       or e.rsvp_lock_at is null or now() < e.rsvp_lock_at
     from public.events e
     left join public.tournaments t on t.id = e.tournament_id
     where e.id = p_event_id),
    false
  );
$function$;

-- Propagates a tournament_rsvps change to every already-linked event_rsvps
-- row for a dated tournament. Not security definer — runs as the calling
-- parent/coach, authorized the same way seed_event_rsvps_from_tournament
-- already is; the explicit team_id join filter (not RLS) is the cross-tenant
-- guard, same pattern as that existing trigger.
create or replace function public.sync_dated_tournament_rsvps() returns trigger
language plpgsql as $$
declare
  v_team_id uuid;
  v_start_date date;
  v_tournament_id uuid;
begin
  v_tournament_id := coalesce(new.tournament_id, old.tournament_id);
  select team_id, start_date into v_team_id, v_start_date
  from public.tournaments where id = v_tournament_id;

  if v_start_date is null then
    return coalesce(new, old);
  end if;

  if TG_OP = 'DELETE' then
    delete from public.event_rsvps er
    using public.events e
    where er.event_id = e.id
      and e.tournament_id = v_tournament_id
      and e.team_id = v_team_id
      and er.player_id = old.player_id;
    return old;
  end if;

  insert into public.event_rsvps (event_id, player_id, responded_by, status)
  select e.id, new.player_id, new.responded_by, new.status
  from public.events e
  where e.tournament_id = v_tournament_id and e.team_id = v_team_id
  on conflict (event_id, player_id) do update
    set status = excluded.status, responded_by = excluded.responded_by, updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_dated_tournament_rsvps_trigger on public.tournament_rsvps;
create trigger sync_dated_tournament_rsvps_trigger
  after insert or update or delete on public.tournament_rsvps
  for each row execute function public.sync_dated_tournament_rsvps();
