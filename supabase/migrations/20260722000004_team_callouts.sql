-- Team callouts: coach posts a request for help, parents respond or dismiss

create table if not exists team_callouts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid references teams(id) on delete cascade not null,
  title       text not null,
  body        text,
  created_by  uuid references profiles(id),
  expires_at  timestamptz,
  created_at  timestamptz default now()
);

create table if not exists team_callout_responses (
  id          uuid primary key default gen_random_uuid(),
  callout_id  uuid references team_callouts(id) on delete cascade not null,
  profile_id  uuid references profiles(id) not null,
  response    text check (response in ('helping', 'dismissed')) not null,
  created_at  timestamptz default now(),
  unique(callout_id, profile_id)
);

alter table team_callouts enable row level security;
alter table team_callout_responses enable row level security;

-- Callouts: team members can read, coaches can write
create policy "team members can read callouts"
  on team_callouts for select
  using (
    exists (
      select 1 from team_members tm
      where tm.team_id = team_callouts.team_id
        and tm.profile_id = auth.uid()
    )
  );

create policy "coaches can manage callouts"
  on team_callouts for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('coach', 'org_admin', 'app_admin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('coach', 'org_admin', 'app_admin')
    )
  );

-- Responses: own user can read/write their own; coaches can read all for their team
create policy "users can manage own callout responses"
  on team_callout_responses for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "coaches can read callout responses"
  on team_callout_responses for select
  using (
    exists (
      select 1 from team_callouts c
      join profiles p on p.id = auth.uid()
      where c.id = team_callout_responses.callout_id
        and p.role in ('coach', 'org_admin', 'app_admin')
    )
  );

create index if not exists team_callouts_team_id_idx on team_callouts(team_id);
create index if not exists team_callout_responses_callout_id_idx on team_callout_responses(callout_id);
