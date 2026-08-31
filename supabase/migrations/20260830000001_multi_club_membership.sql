-- Multi-club support, phase 1: lets a person be org_admin (or coach) of
-- more than one club from a single login — e.g. rick@mdssoccer.com running
-- both MDS Academy (home club) and Maroons Soccer Club as org_admin of
-- both, instead of needing a second account.
--
-- Coach-level cross-club access already works today with zero club
-- gating (team_members has no club_id column at all — see
-- 20260709000005_cross_club_coach_access.sql) via is_team_member/
-- is_team_coach's plain team_members branch. What's missing is the
-- org-admin-level equivalent: implicit access to EVERY team/resource in a
-- second club, the way a home-club org_admin already gets via
-- profiles.club_id. club_admins is that missing piece — purely additive,
-- independent of the existing profiles.club_id "home club" column, which
-- keeps its exact current meaning.
--
-- is_club_admin(cid) becomes the one canonical "does the caller have
-- org-admin-level rights over club cid" check (also fixing a pre-existing
-- bug where its own club_id-equality clause made app_admin fail it,
-- contrary to every other helper's documented always-true intent), reused
-- inside is_team_member/is_team_coach/is_club_staff/is_invite_manageable/
-- clubs_select/profiles_update_by_admin instead of five separate copies
-- of the same OR-logic.

-- ── 1. club_admins ──────────────────────────────────────────────────────
create table public.club_admins (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid references public.clubs(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(club_id, profile_id)
);
create index club_admins_profile_id_idx on public.club_admins(profile_id);
alter table public.club_admins enable row level security;

-- ── 2. is_club_admin: fix app_admin bug, add club_admins branch ────────
create or replace function public.is_club_admin(cid uuid)
returns boolean language sql security definer stable as $$
  select
    public.current_user_role() = 'app_admin'
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and club_id = cid and role = 'org_admin'
    )
    or exists (
      select 1 from public.club_admins
      where club_id = cid and profile_id = auth.uid()
    );
$$;

-- ── 3. is_club_staff: same app_admin fix, reuse is_club_admin, add a
-- cross-club coach branch via team_members (today purely profiles.role-
-- based, so a coach reaching a team at a non-home club via team_members —
-- already fully supported everywhere else — got NO evaluation access at
-- all; this brings it in line with is_team_coach).
create or replace function public.is_club_staff(cid uuid)
returns boolean language sql security definer stable as $$
  select
    public.is_club_admin(cid)
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and club_id = cid and role = 'coach'
    )
    or exists (
      select 1 from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.profile_id = auth.uid() and tm.role = 'coach' and t.club_id = cid
    );
$$;

-- ── 4. is_team_member / is_team_coach: replace the org_admin branch's
-- home-club-only check with is_club_admin(t.club_id) — this is the change
-- that actually makes a second club usable day to day, since these two
-- functions gate the large majority of team-scoped tables (players,
-- invites, events, rsvps, lineups, announcements, conversations,
-- messages, player_development_notes, waivers, guest requests, ...).
-- The standalone unconditional app_admin branch is left untouched (must
-- stay outside the suspended-club check — see 20260825000002).
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql stable security definer
as $function$
  select
    public.current_user_role() = 'app_admin'
    or (
      exists (
        select 1 from public.team_members
        where team_id = p_team_id and profile_id = auth.uid()
      )
      and exists (
        select 1 from public.teams t join public.clubs c on c.id = t.club_id
        where t.id = p_team_id and c.suspended_at is null
      )
    )
    or exists (
      select 1 from public.teams t join public.clubs c on c.id = t.club_id
      where t.id = p_team_id
        and public.is_club_admin(t.club_id)
        and c.suspended_at is null
    );
$function$;

create or replace function public.is_team_coach(p_team_id uuid)
returns boolean
language sql stable security definer
as $function$
  select
    public.current_user_role() = 'app_admin'
    or (
      exists (
        select 1 from public.team_members
        where team_id = p_team_id and profile_id = auth.uid() and role = 'coach'
      )
      and exists (
        select 1 from public.teams t join public.clubs c on c.id = t.club_id
        where t.id = p_team_id and c.suspended_at is null
      )
    )
    or exists (
      select 1 from public.teams t join public.clubs c on c.id = t.club_id
      where t.id = p_team_id
        and public.is_club_admin(t.club_id)
        and c.suspended_at is null
    );
$function$;

-- ── 5. is_invite_manageable: same club_admins coverage for club-wide
-- (team_id is null) org_admin/coach invites.
create or replace function public.is_invite_manageable(p_team_id uuid, p_club_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select case
    when p_team_id is not null then public.is_team_coach(p_team_id)
    else (p_club_id is not null and public.is_club_admin(p_club_id))
  end;
$$;

-- ── 6. club_admins RLS — same shape as team_members' own policies: self
-- can always see their own rows; an existing admin of that club (home-club
-- org_admin, app_admin, or another club_admins row) can see/grant/revoke.
create policy "club_admins_select" on public.club_admins for select
  using (profile_id = auth.uid() or public.is_club_admin(club_id));

create policy "club_admins_insert" on public.club_admins for insert
  with check (public.is_club_admin(club_id));

create policy "club_admins_delete" on public.club_admins for delete
  using (public.is_club_admin(club_id));

-- ── 7. clubs_select: add a club_admins branch — without this, a second-
-- club org_admin can't even read that club's own row (branding,
-- suspended_at), breaking mobile's useClub() and the web dashboard's club
-- fetch for any club reached only via club_admins with no team_members
-- row yet.
drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select" on public.clubs for select
  using (
    id = public.current_user_club_id()
    or public.current_user_role() = 'app_admin'
    or public.is_club_admin(id)
    or exists (
      select 1 from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where t.club_id = clubs.id and tm.profile_id = auth.uid()
    )
  );

-- ── 8. profiles_update_by_admin: let a club_admins-based org_admin
-- actually edit/remove staff on the Staff page for that club — today this
-- only matched profiles.club_id = current_user_club_id() (home club
-- only), which would leave Staff page edit/remove silently RLS-blocked
-- even after staff-list learns to show these rows.
drop policy if exists "profiles_update_by_admin" on public.profiles;
create policy "profiles_update_by_admin" on public.profiles for update
  using (
    current_user_role() = 'app_admin'
    or (current_user_role() = 'org_admin' and (club_id = current_user_club_id() or public.is_club_admin(club_id)))
  )
  with check (
    current_user_role() = 'app_admin'
    or (
      current_user_role() = 'org_admin'
      and (club_id = current_user_club_id() or club_id is null or public.is_club_admin(club_id))
      and role in ('org_admin', 'coach', 'player')
    )
  );

-- ── 9. evaluation_batches / player_evaluations "org admin update"
-- policies had the identical inline app_admin-club_id-equality bug,
-- outside is_club_staff entirely — fold onto is_club_admin too while
-- touching this migration's territory.
drop policy if exists "org admin update batches" on public.evaluation_batches;
create policy "org admin update batches"
  on public.evaluation_batches for update
  using (public.is_club_admin(club_id));

drop policy if exists "org admin update evals" on public.player_evaluations;
create policy "org admin update evals"
  on public.player_evaluations for update
  using (public.is_club_admin(club_id));

-- ── 10. accept_invite: redesign the club-conflict branch from "switch
-- with confirmation" to "always additive". profiles.club_id/role is only
-- ever written when the caller has no home club yet (v_current_club is
-- null) or is accepting another invite at their OWN existing home club
-- (v_current_club = v_club_id) — unchanged from today for both. Any other
-- club just gets team_members (coach, already club-independent) and/or
-- club_admins (org_admin) added on top, never touching the existing home
-- identity. This also fixes a live bug in the code it replaces: a plain
-- parent with a home club, invited as coach/org_admin at a DIFFERENT
-- club, previously fell through every guard (which only fired when their
-- CURRENT role was already coach/org_admin/app_admin) straight into the
-- unconditional UPDATE, silently overwriting their home club/role with no
-- warning at all. Removes p_confirm_switch/needs_confirmation entirely —
-- nothing is left to confirm. Also resolves a live PostgREST ambiguity:
-- the 1-arg and 2-arg overloads currently coexist, and any client calling
-- accept_invite with only p_token (mobile's find-team.tsx) gets a
-- PGRST203 "could not choose the best candidate function" error instead
-- of ever running.
drop function if exists public.accept_invite(text, boolean);
drop function if exists public.accept_invite(text);

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_invite_id      uuid;
  v_invite_email   text;
  v_team_id        uuid;
  v_team_ids       uuid[];
  v_player_id      uuid;
  v_club_id        uuid;
  v_club_slug      text;
  v_role           text;
  v_current_role   text;
  v_current_club   uuid;
  v_same_home      boolean;
begin
  select i.id, i.email, i.team_id, coalesce(i.team_ids, '{}'), i.player_id,
         coalesce(t.club_id, i.club_id), coalesce(tc.slug, ic.slug),
         coalesce(i.role, 'parent')
  into   v_invite_id, v_invite_email, v_team_id, v_team_ids, v_player_id,
         v_club_id, v_club_slug, v_role
  from   public.invites i
  left join public.teams t  on t.id = i.team_id
  left join public.clubs tc on tc.id = t.club_id
  left join public.clubs ic on ic.id = i.club_id
  where  i.token = p_token
    and  i.accepted_at is null;

  if not found or v_club_id is null then
    return jsonb_build_object('error', 'Invalid or already used invite');
  end if;

  if lower(coalesce(v_invite_email, '')) <> lower(coalesce(auth.email(), '')) then
    return jsonb_build_object('error', 'This invite was sent to a different email address. Sign in with that account, or ask your club for a new invite.');
  end if;

  select role, club_id into v_current_role, v_current_club from public.profiles where id = auth.uid();
  v_same_home := v_current_club is null or v_current_club = v_club_id;

  if v_team_id is not null then
    insert into public.team_members (team_id, profile_id, role)
    values (v_team_id, auth.uid(), case when v_role = 'coach' then 'coach' else 'parent' end)
    on conflict do nothing;
  elsif array_length(v_team_ids, 1) > 0 then
    insert into public.team_members (team_id, profile_id, role)
    select unnest(v_team_ids), auth.uid(), 'coach'
    on conflict do nothing;
  end if;

  if v_role = 'org_admin' and not v_same_home then
    insert into public.club_admins (club_id, profile_id)
    values (v_club_id, auth.uid())
    on conflict (club_id, profile_id) do nothing;
  end if;

  if v_player_id is not null then
    insert into public.player_guardians (player_id, profile_id)
    values (v_player_id, auth.uid())
    on conflict do nothing;
    update public.players set profile_id = auth.uid() where id = v_player_id and profile_id is null;
  end if;

  if v_same_home then
    update public.profiles
    set    role    = case
                        when v_role in ('coach', 'org_admin') then v_role
                        when v_current_role in ('coach', 'org_admin', 'app_admin') then v_current_role
                        else 'player'
                      end,
           club_id = v_club_id
    where  id = auth.uid();
  end if;

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug);
end;
$function$;

grant execute on function public.accept_invite(text) to authenticated;
