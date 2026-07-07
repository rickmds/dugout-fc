-- Update subscriptions plan check constraint to reflect final tier names
alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('free','team_pro','starter','club','academy'));

-- Set default plan to free
alter table public.subscriptions
  alter column plan set default 'free';

-- Ensure every club has a subscriptions row (backfill)
insert into public.subscriptions (club_id, status, plan)
select c.id, 'trialing', 'free'
from public.clubs c
where not exists (
  select 1 from public.subscriptions s where s.club_id = c.id
);
