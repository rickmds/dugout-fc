-- First-run welcome tour + profile completion + team contact sharing.
--
-- Part 1: multi-guardian fix. accept_invite() has always set
-- players.profile_id = auth.uid() unconditionally for a player-linked
-- invite — a second guardian accepting silently clobbers the first
-- guardian's link, breaking their own access (every RLS policy in this
-- schema that checks "is this my kid" tests players.profile_id = auth.uid()
-- directly). player_guardians is additive: the legacy single column stays
-- as the first/primary guardian slot for existing joins, and every
-- ownership check below is extended to also accept membership in this
-- table via a new is_player_guardian() helper, mirroring the existing
-- is_team_coach()/is_club_teammate() SECURITY DEFINER pattern used
-- throughout this schema to avoid RLS recursion.

create table if not exists public.player_guardians (
  player_id  uuid references public.players(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (player_id, profile_id)
);
alter table public.player_guardians enable row level security;

create policy "player_guardians_select" on public.player_guardians for select
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.players p where p.id = player_id and public.is_team_coach(p.team_id))
  );

create or replace function public.is_player_guardian(p_player_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_player_id is not null and exists (
    select 1 from public.players
    where id = p_player_id
      and (profile_id = auth.uid() or exists (
        select 1 from public.player_guardians where player_id = p_player_id and profile_id = auth.uid()
      ))
  );
$$;

-- ── accept_invite: additive guardian linking ────────────────────────────────
create or replace function public.accept_invite(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_invite_id    uuid;
  v_team_id      uuid;
  v_player_id    uuid;
  v_club_id      uuid;
  v_club_slug    text;
  v_role         text;
  v_current_role text;
begin
  select i.id, i.team_id, i.player_id, c.id, c.slug, coalesce(i.role, 'parent')
  into   v_invite_id, v_team_id, v_player_id, v_club_id, v_club_slug, v_role
  from   public.invites i
  join   public.teams   t on t.id = i.team_id
  join   public.clubs   c on c.id = t.club_id
  where  i.token = p_token
    and  i.accepted_at is null;

  if not found then
    return jsonb_build_object('error', 'Invalid or already used invite');
  end if;

  insert into public.team_members (team_id, profile_id, role)
  values (v_team_id, auth.uid(), case when v_role = 'coach' then 'coach' else 'parent' end)
  on conflict do nothing;

  if v_player_id is not null then
    insert into public.player_guardians (player_id, profile_id)
    values (v_player_id, auth.uid())
    on conflict do nothing;
    -- Only the first guardian claims the legacy single-column slot —
    -- later guardians never overwrite an already-linked player.
    update public.players set profile_id = auth.uid() where id = v_player_id and profile_id is null;
  end if;

  select role into v_current_role from public.profiles where id = auth.uid();

  update public.profiles
  set    role    = case
                      when v_role = 'coach' then 'coach'
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then v_current_role
                      else 'player'
                    end,
         club_id = case
                      when v_role = 'coach' then v_club_id
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then club_id
                      else v_club_id
                    end
  where  id = auth.uid();

  update public.invites set accepted_at = now() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug);
end;
$$;

-- ── OR-extend every existing "is this my kid" RLS check ─────────────────────
drop policy if exists "rsvps_update" on public.event_rsvps;
create policy "rsvps_update" on public.event_rsvps for update
  using (
    responded_by = auth.uid()
    or public.is_player_guardian(player_id)
    or exists (select 1 from public.events e where e.id = event_rsvps.event_id and public.is_team_coach(e.team_id))
  );

drop policy if exists "rsvps_delete" on public.event_rsvps;
create policy "rsvps_delete" on public.event_rsvps for delete
  using (
    responded_by = auth.uid()
    or public.is_player_guardian(player_id)
    or exists (select 1 from public.events e where e.id = event_rsvps.event_id and public.is_team_coach(e.team_id))
  );

drop policy if exists "parents read published evals" on public.player_evaluations;
create policy "parents read published evals" on public.player_evaluations for select
  using (status = 'published' and public.is_player_guardian(player_id));

drop policy if exists "Guests can read their own invite" on public.event_guests;
create policy "Guests can read their own invite" on public.event_guests for select
  using (profile_id = auth.uid() or public.is_player_guardian(player_id));

drop policy if exists "Guests can confirm or decline their own invite" on public.event_guests;
create policy "Guests can confirm or decline their own invite" on public.event_guests for update
  using (profile_id = auth.uid() or public.is_player_guardian(player_id));

drop policy if exists "Event guests can read their event" on public.events;
create policy "Event guests can read their event" on public.events for select
  using (exists (
    select 1 from public.event_guests eg
    where eg.event_id = events.id and (eg.profile_id = auth.uid() or public.is_player_guardian(eg.player_id))
  ));

drop policy if exists "players read own fees" on public.player_fees;
create policy "players read own fees" on public.player_fees for select
  using (public.is_player_guardian(player_id));

drop policy if exists "players_update_own" on public.players;
create policy "players_update_own" on public.players for update
  using (public.is_player_guardian(id))
  with check (public.is_player_guardian(id));

-- claim_fee_payment (20260813000009): same ownership check, now guardian-aware.
create or replace function public.claim_fee_payment(
  p_fee_id uuid,
  p_amount numeric,
  p_method text,
  p_note text default null
)
returns public.player_fees
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.player_fees%rowtype;
begin
  select * into v_row from public.player_fees where id = p_fee_id;
  if not found then
    raise exception 'Fee not found';
  end if;
  if not public.is_player_guardian(v_row.player_id) then
    raise exception 'Not permitted';
  end if;
  if v_row.payee_type <> 'coach' then
    raise exception 'This fee is not coach-collected';
  end if;
  if v_row.status in ('paid', 'waived') then
    raise exception 'This fee is already settled';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  update public.player_fees
  set claim_status = 'pending', claim_amount = p_amount, claim_method = p_method,
      claim_note = p_note, claimed_by = auth.uid(), claimed_at = now()
  where id = p_fee_id
  returning * into v_row;

  return v_row;
end;
$$;

-- A guardian can now also invite a second guardian for their own kid —
-- previously invite creation was coach/org_admin only.
drop policy if exists "invites_insert" on public.invites;
create policy "invites_insert" on public.invites for insert
  with check (
    public.is_team_coach(team_id)
    or (coalesce(role, 'parent') = 'parent' and public.is_player_guardian(player_id))
  );

-- ── New columns ──────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists onboarded_at timestamptz,
  add column if not exists share_contact_with_team boolean not null default true,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text;

alter table public.players
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists medical_notes text;

-- ── Team contacts (parent-visible, opt-out) ─────────────────────────────────
-- Coaches always see phone numbers. Parents see other parents' phone only
-- when that parent has share_contact_with_team = true — filtered server
-- side since RLS can't hide a single column on an otherwise-visible row.
create or replace function public.get_team_contacts(p_team_id uuid)
returns table (
  player_id uuid,
  player_name text,
  guardian_name text,
  guardian_phone text,
  is_coach_viewer boolean
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_is_coach boolean;
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'Not permitted';
  end if;
  v_is_coach := public.is_team_coach(p_team_id);

  return query
  select
    p.id,
    p.full_name,
    pr.full_name,
    case when v_is_coach or pr.share_contact_with_team then pr.phone else null end,
    v_is_coach
  from public.players p
  left join public.profiles pr on pr.id = p.profile_id
  where p.team_id = p_team_id;
end;
$$;

grant execute on function public.get_team_contacts(uuid) to authenticated;

-- ── My guarded players (for the profile-completion emergency-info step) ────
create or replace function public.get_my_guarded_players()
returns setof public.players
language sql stable security definer
set search_path = public
as $$
  select * from public.players
  where profile_id = auth.uid()
     or id in (select player_id from public.player_guardians where profile_id = auth.uid());
$$;

grant execute on function public.get_my_guarded_players() to authenticated;
