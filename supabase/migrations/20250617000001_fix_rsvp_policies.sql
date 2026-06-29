-- Fix rsvps_update: responded_by can be null (demo data) and parents
-- should be able to update RSVPs for their own linked player
drop policy if exists "rsvps_update" on public.event_rsvps;

create policy "rsvps_update" on public.event_rsvps for update
  using (
    -- person who originally submitted it
    responded_by = auth.uid()
    -- parent/guardian whose player this belongs to
    or exists (
      select 1 from public.players p
      where p.id = player_id and p.profile_id = auth.uid()
    )
    -- coach of the team
    or exists (
      select 1 from public.events e
      where e.id = event_id and public.is_team_coach(e.team_id)
    )
  );

-- Add missing delete policy (needed for RSVP toggle-off)
drop policy if exists "rsvps_delete" on public.event_rsvps;

create policy "rsvps_delete" on public.event_rsvps for delete
  using (
    responded_by = auth.uid()
    or exists (
      select 1 from public.players p
      where p.id = player_id and p.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.events e
      where e.id = event_id and public.is_team_coach(e.team_id)
    )
  );
