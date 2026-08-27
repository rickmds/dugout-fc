-- Weekend tournaments (unlike State Cup) usually have known dates up front,
-- and a coach needs to know BEFORE the bracket is even published whether
-- enough players can commit to that weekend at all — an entry/commitment
-- decision, not a "come to this specific game" decision. Per-game RSVP
-- can't serve that since it requires an event to already exist.
alter table public.tournaments
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists entry_rsvp_lock_at timestamptz;

create table public.tournament_rsvps (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  player_id uuid references public.players(id) on delete cascade not null,
  responded_by uuid references public.profiles(id) on delete set null,
  status text check (status in ('attending','not_attending')) not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tournament_id, player_id)
);

alter table public.tournament_rsvps enable row level security;

-- Mirrors rsvp_not_locked(event_id) exactly, scoped to the tournament's own deadline.
create or replace function public.tournament_rsvp_not_locked(p_tournament_id uuid) returns boolean
language sql stable security definer
as $function$
  select coalesce(
    (select entry_rsvp_lock_at is null or now() < entry_rsvp_lock_at from public.tournaments where id = p_tournament_id),
    false
  );
$function$;

create policy "tournament_rsvps_select" on public.tournament_rsvps for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and public.is_team_member(t.team_id)));

create policy "tournament_rsvps_insert" on public.tournament_rsvps for insert
  with check (exists (
    select 1 from public.tournaments t where t.id = tournament_id
      and (public.is_team_coach(t.team_id) or (public.is_team_member(t.team_id) and public.tournament_rsvp_not_locked(tournament_id)))
  ));

create policy "tournament_rsvps_update" on public.tournament_rsvps for update
  using (
    exists (select 1 from public.tournaments t where t.id = tournament_rsvps.tournament_id and public.is_team_coach(t.team_id))
    or ((responded_by = auth.uid() or public.is_player_guardian(player_id)) and public.tournament_rsvp_not_locked(tournament_id))
  );

create policy "tournament_rsvps_delete" on public.tournament_rsvps for delete
  using (
    responded_by = auth.uid()
    or public.is_player_guardian(player_id)
    or exists (select 1 from public.tournaments t where t.id = tournament_rsvps.tournament_id and public.is_team_coach(t.team_id))
  );

create trigger tournament_rsvps_updated_at before update on public.tournament_rsvps
  for each row execute function public.set_updated_at();

-- Propagation: both event-creation paths (create-event.tsx, schedule-upload.tsx)
-- set tournament_id at INSERT time only — it's never reassigned via UPDATE, by
-- design (edit-event.tsx keeps it read-only). No security definer: the invoking
-- session is already a coach of the event's own team (events_insert requires
-- is_team_coach), which already satisfies both tournament_rsvps' select policy
-- and event_rsvps' coach insert branch — running as the calling user (not the
-- owning role) means a cross-team tournament_id (bug, or a direct API call
-- bypassing the UI) reads zero foreign rows instead of leaking another team's
-- players into this event's RSVPs. The explicit team_id match below is a
-- second, RLS-independent guard for the same case.
create or replace function public.seed_event_rsvps_from_tournament() returns trigger
language plpgsql as $$
begin
  if new.tournament_id is not null then
    insert into public.event_rsvps (event_id, player_id, responded_by, status)
    select new.id, tr.player_id, tr.responded_by, tr.status
    from public.tournament_rsvps tr
    join public.tournaments t on t.id = tr.tournament_id
    where tr.tournament_id = new.tournament_id
      and t.team_id = new.team_id
    on conflict (event_id, player_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger seed_event_rsvps_from_tournament_trigger
  after insert on public.events
  for each row execute function public.seed_event_rsvps_from_tournament();
