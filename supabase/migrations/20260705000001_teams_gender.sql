-- Add gender to teams
alter table public.teams
  add column if not exists gender text check (gender in ('boys','girls','mixed'));
