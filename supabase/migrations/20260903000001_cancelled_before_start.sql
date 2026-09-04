-- Whether a cancelled event was called off before or after its own
-- scheduled start time. Computed and stored once here (a trigger, not
-- client-side JS) rather than re-derived in every reader — there are
-- three separate write paths (mobile edit-event, web schedule page, the
-- field-closure API route) and duplicating "is cancelled_at before
-- event_date+event_time in the club's own timezone" three times over would
-- have meant three chances to get the timezone conversion wrong (the web
-- dashboard's own zonedTimeToUtc is already only safe to call from a real
-- server context, not the browser). Postgres's AT TIME ZONE has full IANA
-- database support, so this is the single, correct, always-in-sync source
-- of truth every reader checks instead.
--
-- null on a never-cancelled event, or on an event cancelled before this
-- migration existed (left alone deliberately, so already-cancelled history
-- isn't silently rewritten) — treated the same as "cancelled after start"
-- (i.e. still counted) by every reader, since that matches today's
-- existing behavior for that already-cancelled history.

alter table public.events
  add column if not exists cancelled_before_start boolean;

create or replace function public.compute_cancelled_before_start()
returns trigger language plpgsql as $$
declare
  club_tz text;
  scheduled_start timestamptz;
begin
  if new.cancelled_at is null then
    new.cancelled_before_start := null;
    return new;
  end if;

  select c.timezone into club_tz
  from public.teams t join public.clubs c on c.id = t.club_id
  where t.id = new.team_id;
  club_tz := coalesce(club_tz, 'America/New_York');

  if new.event_time is not null then
    scheduled_start := (new.event_date::text || ' ' || new.event_time::text)::timestamp at time zone club_tz;
  else
    -- No time set on the event — treat the whole calendar day as "the
    -- session," so cancelling any time on or before that date counts as
    -- before-start; only cancelling after the date has fully passed
    -- counts as after-start.
    scheduled_start := ((new.event_date + 1)::text || ' 00:00:00')::timestamp at time zone club_tz;
  end if;

  new.cancelled_before_start := new.cancelled_at < scheduled_start;
  return new;
end;
$$;

drop trigger if exists events_compute_cancelled_before_start on public.events;
create trigger events_compute_cancelled_before_start
  before insert or update on public.events
  for each row execute function public.compute_cancelled_before_start();
