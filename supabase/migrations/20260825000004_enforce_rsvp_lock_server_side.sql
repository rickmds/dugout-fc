-- The RSVP lock (events.rsvp_lock_at) was only ever enforced by the mobile
-- UI hiding the RSVP button after the deadline — nothing in the database
-- stopped a direct insert/update after lock. Add the same check server-side:
-- a parent/self-response can't write past the lock, but a coach retains
-- their existing override (they can already insert/update/delete any RSVP
-- on their team regardless, per the existing coach branch — this doesn't
-- change that, it only closes the gap for the non-coach paths).
create or replace function public.rsvp_not_locked(p_event_id uuid) returns boolean
language sql stable security definer
as $function$
  select coalesce(
    (select rsvp_lock_at is null or now() < rsvp_lock_at from public.events where id = p_event_id),
    false
  );
$function$;

drop policy if exists rsvps_insert on public.event_rsvps;
create policy rsvps_insert on public.event_rsvps
  for insert
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_rsvps.event_id
        and (is_team_coach(e.team_id) or (is_team_member(e.team_id) and public.rsvp_not_locked(e.id)))
    )
  );

drop policy if exists rsvps_update on public.event_rsvps;
create policy rsvps_update on public.event_rsvps
  for update
  using (
    exists (select 1 from public.events e where e.id = event_rsvps.event_id and is_team_coach(e.team_id))
    or (
      (responded_by = auth.uid() or is_player_guardian(player_id))
      and public.rsvp_not_locked(event_id)
    )
  );
