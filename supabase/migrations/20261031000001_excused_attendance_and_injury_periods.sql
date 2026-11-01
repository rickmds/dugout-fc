-- Excused attendance status + automatic injury-period tracking.
--
-- Today every missed event (vacation, illness, no-show — doesn't matter)
-- is treated identically by the attendance streak and every attendance %
-- display: it's either absorbed by the one-time streak "grace," or it
-- counts against the player. This adds a real "excused" status a coach
-- can set per event, plus automatic date-range tracking of injury periods
-- (derived from the existing players.is_injured toggle) so a multi-week
-- injury doesn't have to be excused one event at a time.

-- ─── 1. Widen event_attendance.status to allow 'excused' ──────────────────────
alter table public.event_attendance
  drop constraint event_attendance_status_check;
alter table public.event_attendance
  add constraint event_attendance_status_check
  check (status in ('present', 'absent', 'late', 'excused'));

-- ─── 2. Injury period history ──────────────────────────────────────────────────
-- players.is_injured is a live on/off flag with no memory of *when* it was
-- set — by the time a coach marks a player healed again, a plain boolean
-- would have already forgotten the window it covered. This table gives
-- that window a real record, written automatically by the trigger below,
-- so "injured for these two weeks" still works after a player is unmarked.
create table public.player_injury_periods (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  started_at  date not null default current_date,
  ended_at    date,
  created_at  timestamptz not null default now(),
  constraint player_injury_periods_ended_after_started
    check (ended_at is null or ended_at >= started_at)
);

create index player_injury_periods_player_idx on public.player_injury_periods(player_id);

alter table public.player_injury_periods enable row level security;

-- Writes go exclusively through the trigger below (security definer, so it
-- bypasses RLS on its own), never directly from the app — a direct insert
-- here would let a coach backdate an arbitrary injury window with no
-- record of who created it, unlike event_attendance's marked_by column.
create policy "team staff read injury periods" on public.player_injury_periods
  for select using (
    exists (
      select 1 from public.players p
      where p.id = player_injury_periods.player_id
        and public.is_team_coach(p.team_id)
    )
  );

create policy "guardians read injury periods" on public.player_injury_periods
  for select using (
    public.is_player_guardian(player_id)
  );

-- ─── 3. Trigger: open/close a period automatically when is_injured flips ──────
-- The coach keeps using the exact same "Mark injured" toggle that already
-- exists on the player profile — no new UI needed for this half of it.
create or replace function public.handle_player_injury_toggle()
returns trigger as $$
begin
  if new.is_injured = true and old.is_injured = false then
    insert into public.player_injury_periods (player_id, started_at)
    values (new.id, current_date);
  elsif new.is_injured = false and old.is_injured = true then
    update public.player_injury_periods
    set ended_at = current_date
    where player_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_player_injury_toggle
  after update of is_injured on public.players
  for each row
  when (new.is_injured is distinct from old.is_injured)
  execute function public.handle_player_injury_toggle();
