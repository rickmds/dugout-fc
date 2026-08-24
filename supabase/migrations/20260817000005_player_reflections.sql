-- Post-game player self-reflection: a 1-5 face rating plus two optional
-- free-text boxes ("what went well" / "what needs improvement"), one per
-- player per game. Raw entries are private to the player's own
-- guardian(s) — coaches never get direct table access. Coaches instead
-- see only aggregated numeric trends via get_team_reflection_trends()
-- below, which never returns the free-text fields.
create table player_reflections (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid references events(id) on delete cascade not null,
  player_id         uuid references players(id) on delete cascade not null,
  team_id           uuid references teams(id) not null,
  submitted_by      uuid references profiles(id),
  rating            smallint not null check (rating between 1 and 5),
  went_well         text,
  needs_improvement text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (event_id, player_id)
);

create index player_reflections_team_idx   on player_reflections(team_id);
create index player_reflections_player_idx on player_reflections(player_id, created_at desc);

create or replace function update_player_reflections_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_player_reflections_updated_at
  before update on player_reflections
  for each row execute function update_player_reflections_updated_at();

alter table player_reflections enable row level security;

-- Only the player's own guardian(s) can read or write the raw entry —
-- deliberately no coach/org_admin policy here. app_admin keeps the same
-- platform-wide visibility it already has on every other table.
create policy "guardians manage own player reflections" on player_reflections for all using (
  player_id in (
    select id from players where profile_id = auth.uid()
    union
    select player_id from player_guardians where profile_id = auth.uid()
  )
  or current_user_role() = 'app_admin'
);

-- Coach-safe aggregate view — numeric trend only, never the free-text
-- fields. Mirrors the get_team_contacts() pattern: a SECURITY DEFINER
-- function is the only way a coach's query ever touches this data, so
-- "coaches can't see raw reflections" is enforced by Postgres, not just
-- left up to the UI to hide it.
create or replace function get_team_reflection_trends(p_team_id uuid)
returns table (
  player_id          uuid,
  player_name        text,
  reflection_count   bigint,
  avg_rating         numeric,
  recent_avg_rating  numeric,
  trend              text,
  last_rating        smallint,
  last_reflected_at  timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not is_team_coach(p_team_id) then
    raise exception 'Not permitted';
  end if;

  return query
  with ranked as (
    select
      pr.player_id, pr.rating, pr.created_at,
      row_number() over (partition by pr.player_id order by pr.created_at desc) as rn
    from player_reflections pr
    where pr.team_id = p_team_id
  ),
  agg as (
    select
      r.player_id,
      count(*) as reflection_count,
      avg(r.rating) as avg_rating,
      avg(r.rating) filter (where r.rn <= 3)                 as recent_avg_rating,
      avg(r.rating) filter (where r.rn > 3 and r.rn <= 6)     as prior_avg_rating,
      max(r.created_at) as last_reflected_at,
      (array_agg(r.rating order by r.created_at desc))[1] as last_rating
    from ranked r
    group by r.player_id
  )
  select
    p.id,
    p.full_name,
    coalesce(a.reflection_count, 0),
    round(a.avg_rating, 1),
    round(a.recent_avg_rating, 1),
    case
      when a.reflection_count is null or a.prior_avg_rating is null then 'new'
      when a.recent_avg_rating > a.prior_avg_rating + 0.4 then 'up'
      when a.recent_avg_rating < a.prior_avg_rating - 0.4 then 'down'
      else 'flat'
    end,
    a.last_rating,
    a.last_reflected_at
  from players p
  left join agg a on a.player_id = p.id
  where p.team_id = p_team_id
  order by a.last_reflected_at desc nulls last;
end;
$$;

grant execute on function get_team_reflection_trends(uuid) to authenticated;

-- Idempotency marker for the reflection-prompt cron — set the first (and
-- only) time a prompt notification is sent for a game, so a cron re-run
-- or overlapping invocation never double-notifies.
alter table events add column reflection_prompt_sent_at timestamptz;
