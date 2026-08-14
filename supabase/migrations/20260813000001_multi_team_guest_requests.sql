-- Multi-team guest callouts: a single guest_requests "ask" can now target
-- several teams at once (e.g. U10 A asks both U10 B and U9 A for 3 shared
-- spots), with the cap enforced atomically across all of them so "request
-- 3, 6 accept" can't happen under concurrent volunteers.

-- ── 1. Target teams become a join table instead of one column ──────────────

create table if not exists public.guest_request_targets (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.guest_requests(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  unique(request_id, team_id)
);

create index if not exists idx_guest_request_targets_team_id on public.guest_request_targets(team_id);

insert into public.guest_request_targets (request_id, team_id)
select id, target_team_id from public.guest_requests
on conflict (request_id, team_id) do nothing;

-- Drops first — this policy's WITH CHECK reads guest_requests.target_team_id,
-- so it must go before the column does. It's superseded by claim_guest_spot()
-- below anyway (see section 4).
drop policy if exists "Parents can self-volunteer as guest player" on public.event_guests;

alter table public.guest_requests drop column target_team_id;

alter table public.guest_request_targets enable row level security;

-- Delegate to guest_requests' own SELECT policy — if you can see the parent
-- request, you can see who else it was sent to.
drop policy if exists "Club members can view guest request targets" on public.guest_request_targets;
create policy "Club members can view guest request targets"
  on public.guest_request_targets for select
  using (
    exists (select 1 from public.guest_requests gr where gr.id = guest_request_targets.request_id)
  );

-- Targets are only ever written by create_guest_request() below (SECURITY
-- INVOKER, so this policy still applies to it) — never inserted directly.
drop policy if exists "Club coaches can add guest request targets" on public.guest_request_targets;
create policy "Club coaches can add guest request targets"
  on public.guest_request_targets for insert
  with check (
    exists (
      select 1 from public.guest_requests gr
      where gr.id = guest_request_targets.request_id
        and public.is_team_coach(gr.requesting_team_id)
    )
  );

-- ── 2. guest_requests RLS was club_id-scoped, not team-membership-scoped —
-- same bug the cross-club coaching work already fixed on is_team_coach /
-- is_team_member elsewhere (see 20260812000002). A coach whose home club
-- differs from the requesting team's club (i.e. coaching a second club's
-- team) could not create or view guest requests for that team at all.

drop policy if exists "Club coaches can create guest requests" on public.guest_requests;
create policy "Club coaches can create guest requests"
  on public.guest_requests
  for insert
  with check (public.is_team_coach(requesting_team_id));

drop policy if exists "Club members can view guest requests" on public.guest_requests;
create policy "Club members can view guest requests"
  on public.guest_requests
  for select
  using (
    exists (
      select 1 from public.teams t
      join public.profiles p on p.club_id = t.club_id
      where t.id = guest_requests.requesting_team_id
        and p.id = auth.uid()
    )
    or public.is_team_member(requesting_team_id)
  );

-- ── 3. Atomic creation across all target teams ──────────────────────────────

create or replace function public.create_guest_request(
  p_event_id uuid,
  p_requesting_team_id uuid,
  p_target_team_ids uuid[],
  p_spots_needed int,
  p_note text
)
returns public.guest_requests
language plpgsql
as $$
declare
  v_row public.guest_requests%rowtype;
  v_target_id uuid;
begin
  if p_target_team_ids is null or array_length(p_target_team_ids, 1) is null then
    raise exception 'At least one target team is required';
  end if;

  insert into public.guest_requests (event_id, requesting_team_id, note, spots_needed, status, created_by)
  values (p_event_id, p_requesting_team_id, nullif(trim(p_note), ''), p_spots_needed, 'open', auth.uid())
  returning * into v_row;

  foreach v_target_id in array p_target_team_ids loop
    insert into public.guest_request_targets (request_id, team_id) values (v_row.id, v_target_id);
  end loop;

  return v_row;
end;
$$;

grant execute on function public.create_guest_request(uuid, uuid, uuid[], int, text) to authenticated;

-- ── 4. Atomic, race-safe accept — replaces the direct event_guests insert ──
--
-- Locks the parent request row for the duration of the capacity check, so
-- two parents tapping "volunteer" at the same instant can't both succeed
-- once the shared cap is reached. This also folds in the eligibility check
-- (is the player's team actually one of the targets?) that the old direct
-- INSERT policy left client-side / unenforced.

create or replace function public.claim_guest_spot(p_request_id uuid, p_player_id uuid)
returns public.event_guests
language plpgsql security definer
set search_path = public
as $$
declare
  v_request public.guest_requests%rowtype;
  v_team_id uuid;
  v_full_name text;
  v_filled  int;
  v_row     public.event_guests%rowtype;
begin
  select * into v_request from public.guest_requests where id = p_request_id for update;
  if v_request is null then
    raise exception 'Request not found';
  end if;
  if v_request.status <> 'open' then
    raise exception 'Request is not open';
  end if;

  select team_id, full_name into v_team_id, v_full_name
  from public.players where id = p_player_id and profile_id = auth.uid();
  if v_team_id is null then
    raise exception 'Player not found or not yours';
  end if;

  if not exists (
    select 1 from public.guest_request_targets
    where request_id = p_request_id and team_id = v_team_id
  ) then
    raise exception 'Your team is not eligible for this request';
  end if;

  if exists (
    select 1 from public.event_guests
    where event_id = v_request.event_id and player_id = p_player_id and status = 'confirmed'
  ) then
    raise exception 'Already confirmed for this event';
  end if;

  select count(*) into v_filled
  from public.event_guests eg
  join public.players pl on pl.id = eg.player_id
  join public.guest_request_targets grt on grt.team_id = pl.team_id and grt.request_id = p_request_id
  where eg.event_id = v_request.event_id and eg.status = 'confirmed';

  if v_filled >= v_request.spots_needed then
    raise exception 'Request is already full';
  end if;

  insert into public.event_guests (event_id, player_id, full_name, role, status, added_by, responded_at)
  values (v_request.event_id, p_player_id, v_full_name, 'player', 'confirmed', auth.uid(), now())
  returning * into v_row;

  insert into public.event_rsvps (event_id, player_id, responded_by, status)
  values (v_request.event_id, p_player_id, auth.uid(), 'attending')
  on conflict (event_id, player_id)
  do update set status = 'attending', responded_by = excluded.responded_by, updated_at = now();

  if v_filled + 1 >= v_request.spots_needed then
    update public.guest_requests set status = 'filled' where id = p_request_id;
  end if;

  return v_row;
end;
$$;

grant execute on function public.claim_guest_spot(uuid, uuid) to authenticated;

-- (the old direct-INSERT "Parents can self-volunteer" policy was already
-- dropped in section 1, ahead of the target_team_id column drop it depended
-- on — acceptance goes through claim_guest_spot only from here on)

-- ── 5. Shared fill-count view — replaces 3 duplicated N+1 client loops ─────
-- security_invoker keeps this scoped to the querying user's own RLS on the
-- underlying tables rather than the view owner's.

create or replace view public.guest_request_fill
with (security_invoker = true) as
select
  gr.id as request_id,
  gr.spots_needed,
  count(eg.id) filter (where eg.status = 'confirmed') as filled_count
from public.guest_requests gr
left join public.guest_request_targets grt on grt.request_id = gr.id
left join public.players pl on pl.team_id = grt.team_id
left join public.event_guests eg on eg.player_id = pl.id and eg.event_id = gr.event_id and eg.status = 'confirmed'
group by gr.id, gr.spots_needed;
