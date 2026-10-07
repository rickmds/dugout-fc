-- Free's team/player cap was never real: plans.max_teams/max_players were
-- null (unlimited) for Free despite its own label promising "1 team, up to
-- 12 players", and critically nothing anywhere in the app ever checked
-- either number on ANY plan. Decision (confirmed with Rick): grandfather
-- every club's current team/player counts exactly as they are today, and
-- only block adding a NEW team or player once a club is at or over its
-- plan's limit — never remove or hide anything that already exists.
--
-- Fixing the data alone wouldn't do anything (nothing reads it), and
-- scattering a count-check into every one of the ~10 real call sites
-- across web + mobile (manual add, AI import, season rollover, club-wide
-- import, onboarding) is exactly the kind of thing that silently drifts
-- the moment one call site is missed or a new one is added later. A
-- trigger on the tables themselves is correct by construction regardless
-- of which code path performs the insert — same reasoning already used
-- for player_team_history elsewhere in this app.
--
-- A distinct custom SQLSTATE per limit (PLN01/PLN02, picked from
-- Postgres's unreserved custom-code space) lets client code detect
-- "blocked by plan limit" precisely and swap in an upgrade prompt instead
-- of showing the raw exception text — see web/lib/planLimitError.ts and
-- lib/planLimitError.ts (mobile).

update public.plans set max_teams = 1, max_players = 12 where id = 'free';

create or replace function public.check_team_plan_limit() returns trigger as $$
declare
  v_plan_id text;
  v_max_teams integer;
  v_count integer;
begin
  select coalesce(
    (select plan from public.subscriptions where club_id = new.club_id order by created_at desc limit 1),
    'free'
  ) into v_plan_id;

  select max_teams into v_max_teams from public.plans where id = v_plan_id;

  if v_max_teams is not null then
    select count(*) into v_count from public.teams where club_id = new.club_id;
    if v_count >= v_max_teams then
      raise exception 'plan_limit_teams: % plan allows up to % team(s)', v_plan_id, v_max_teams
        using errcode = 'PLN01';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists teams_plan_limit on public.teams;
create trigger teams_plan_limit
  before insert on public.teams
  for each row execute function public.check_team_plan_limit();

create or replace function public.check_player_plan_limit() returns trigger as $$
declare
  v_club_id uuid;
  v_plan_id text;
  v_max_players integer;
  v_count integer;
begin
  select club_id into v_club_id from public.teams where id = new.team_id;
  if v_club_id is null then
    return new; -- teams.id is a not-null FK on players.team_id; this is defensive, not expected
  end if;

  select coalesce(
    (select plan from public.subscriptions where club_id = v_club_id order by created_at desc limit 1),
    'free'
  ) into v_plan_id;

  select max_players into v_max_players from public.plans where id = v_plan_id;

  if v_max_players is not null then
    select count(*) into v_count
      from public.players p
      join public.teams t on t.id = p.team_id
      where t.club_id = v_club_id;
    if v_count >= v_max_players then
      raise exception 'plan_limit_players: % plan allows up to % player(s)', v_plan_id, v_max_players
        using errcode = 'PLN02';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists players_plan_limit on public.players;
create trigger players_plan_limit
  before insert on public.players
  for each row execute function public.check_player_plan_limit();
