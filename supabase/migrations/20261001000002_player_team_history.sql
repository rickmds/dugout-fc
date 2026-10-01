-- Team history — a trigger-maintained log of which teams a player has been
-- on over time. `players.team_id` is overwritten in place on every move
-- (web's EditDetailsModal, roster/page.tsx's own form, AI roster import,
-- mobile), and relying on each of those call sites to remember to log a
-- history row would drift the moment any one of them forgets. A trigger on
-- `players` itself logs correctly regardless of which code path moved the
-- player.

create table player_team_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade not null,
  team_id uuid references teams(id) on delete cascade not null,
  started_at timestamptz not null default now(),
  -- null = this is the player's current team
  ended_at timestamptz
);

create index player_team_history_player_idx on player_team_history (player_id, started_at desc);

alter table player_team_history enable row level security;

-- Same read audience as the players row itself.
create policy player_team_history_select on player_team_history
  for select using (is_player_guardian(player_id) or is_team_coach(team_id));

create or replace function public.log_player_team_history()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into player_team_history (player_id, team_id, started_at)
    values (new.id, new.team_id, now());
    return new;
  end if;

  -- tg_op = 'UPDATE', fired only when team_id actually changed (see
  -- trigger definition below) — close out the open row and start a new one.
  if old.team_id is distinct from new.team_id then
    update player_team_history
    set ended_at = now()
    where player_id = new.id and ended_at is null;

    insert into player_team_history (player_id, team_id, started_at)
    values (new.id, new.team_id, now());
  end if;
  return new;
end;
$function$;

create trigger player_team_history_on_insert
  after insert on players
  for each row execute function log_player_team_history();

create trigger player_team_history_on_team_change
  after update of team_id on players
  for each row execute function log_player_team_history();

-- Backfill: every existing player gets one open history row for their
-- current team, so the feature isn't empty for the whole existing roster —
-- real history only starts accumulating from here, but "on this team since
-- [today]" is a true statement for the backfilled row.
insert into player_team_history (player_id, team_id, started_at)
select id, team_id, created_at from players;
