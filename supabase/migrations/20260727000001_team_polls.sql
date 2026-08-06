-- Team Polls

create table public.team_polls (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid references public.teams(id) on delete cascade not null,
  event_id           uuid references public.events(id) on delete set null,
  created_by         uuid references public.profiles(id),
  question           text not null,
  closes_at          timestamptz,
  is_anonymous       boolean default false not null,
  is_multiple_choice boolean default false not null,
  result_visibility  text check (result_visibility in ('always','after_vote','after_close')) default 'always' not null,
  rsvp_gated         boolean default false not null,
  created_at         timestamptz default now()
);

create table public.team_poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid references public.team_polls(id) on delete cascade not null,
  label      text not null,
  sort_order int default 0 not null
);

create table public.team_poll_votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid references public.team_polls(id) on delete cascade not null,
  option_id  uuid references public.team_poll_options(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) not null,
  created_at timestamptz default now(),
  unique(poll_id, option_id, profile_id)
);

create index on public.team_polls(team_id);
create index on public.team_polls(event_id);
create index on public.team_poll_options(poll_id);
create index on public.team_poll_votes(poll_id);
create index on public.team_poll_votes(profile_id);

-- RLS
alter table public.team_polls        enable row level security;
alter table public.team_poll_options enable row level security;
alter table public.team_poll_votes   enable row level security;

-- team_polls
create policy "team members view polls"
  on public.team_polls for select
  using (team_id in (select team_id from public.team_members where profile_id = auth.uid()));

create policy "coaches manage polls"
  on public.team_polls for all
  using (team_id in (
    select team_id from public.team_members
    where profile_id = auth.uid() and role in ('coach','org_admin')
  ));

-- team_poll_options
create policy "team members view options"
  on public.team_poll_options for select
  using (poll_id in (
    select id from public.team_polls
    where team_id in (select team_id from public.team_members where profile_id = auth.uid())
  ));

create policy "coaches manage options"
  on public.team_poll_options for all
  using (poll_id in (
    select id from public.team_polls
    where team_id in (
      select team_id from public.team_members
      where profile_id = auth.uid() and role in ('coach','org_admin')
    )
  ));

-- team_poll_votes
create policy "team members view votes"
  on public.team_poll_votes for select
  using (poll_id in (
    select id from public.team_polls
    where team_id in (select team_id from public.team_members where profile_id = auth.uid())
  ));

create policy "team members insert own votes"
  on public.team_poll_votes for insert
  with check (
    profile_id = auth.uid() and
    poll_id in (
      select id from public.team_polls
      where team_id in (select team_id from public.team_members where profile_id = auth.uid())
    )
  );

create policy "users delete own votes"
  on public.team_poll_votes for delete
  using (profile_id = auth.uid());
