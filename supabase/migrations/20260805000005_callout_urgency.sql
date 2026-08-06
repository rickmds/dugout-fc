alter table public.team_callouts
  add column if not exists urgency text check (urgency in ('normal', 'urgent')) default 'normal' not null;
