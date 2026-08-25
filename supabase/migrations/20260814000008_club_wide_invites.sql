-- Org admins (and multi-team/no-team coaches) previously got an auth
-- account + profiles row created instantly on invite, with a "recovery"
-- link mailed to them — unlike parents and single-team coaches, who only
-- get an `invites` row and don't get an account until they actually set a
-- password via /join. That mismatch is what let a club-admin invite land
-- someone on /login (or /dashboard mid-session-race) with no password ever
-- set and no profile completed. This migration lets a club-wide invite
-- (no single team) be represented in `invites` too, so it can go through
-- the exact same invite-first / accept-invite flow as everyone else.

alter table public.invites
  alter column team_id drop not null;

alter table public.invites
  add column club_id uuid references public.clubs(id),
  add column team_ids uuid[] not null default '{}';

-- Backfill club_id for all existing rows from their team, so staff-list
-- can query invites by club_id alone going forward instead of joining
-- through teams.
update public.invites i
set club_id = t.club_id
from public.teams t
where i.team_id = t.id
  and i.club_id is null;

-- is_team_coach(team_id) can't answer for a club-wide invite (team_id is
-- null) — it needs a club_id-based check instead. This wraps both cases
-- behind one function so the RLS policies stay simple.
create or replace function public.is_invite_manageable(p_team_id uuid, p_club_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select case
    when p_team_id is not null then public.is_team_coach(p_team_id)
    else (
      public.current_user_role() = 'app_admin'
      or (public.current_user_role() = 'org_admin' and p_club_id is not null and p_club_id = public.current_user_club_id())
    )
  end;
$$;

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select
  using (is_invite_manageable(team_id, club_id) or is_player_guardian(player_id));

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert
  with check (is_invite_manageable(team_id, club_id) or (coalesce(role, 'parent') = 'parent' and is_player_guardian(player_id)));

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete
  using (is_invite_manageable(team_id, club_id) or is_player_guardian(player_id));

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update
  using (is_invite_manageable(team_id, club_id));
