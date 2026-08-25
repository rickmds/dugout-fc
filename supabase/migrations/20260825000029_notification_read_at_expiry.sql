-- Notifications previously had no way to expire — everything a user had
-- ever been sent stayed in their list forever unless they deleted each one
-- individually. This adds read_at (set automatically by a trigger the
-- moment `read` flips true, so none of the ~5 call sites across the app
-- that mark a notification read need to change) and a daily cron
-- (cleanup-notifications) deletes anything read more than 30 days ago.
-- Unread notifications are left alone — only read+old ones expire.
alter table public.notifications
  add column if not exists read_at timestamptz;

create or replace function public.set_notification_read_at()
returns trigger
language plpgsql
as $function$
begin
  if new.read = true and (old.read is distinct from true) then
    new.read_at := now();
  elsif new.read = false then
    new.read_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notifications_read_at on public.notifications;
create trigger trg_notifications_read_at
  before update on public.notifications
  for each row
  execute function public.set_notification_read_at();

-- Backfill: treat already-read rows as read now, rather than leaving
-- read_at null indefinitely (which the cleanup query below would only
-- ever run into once, right after this migration, and then never delete).
update public.notifications set read_at = now() where read = true and read_at is null;
