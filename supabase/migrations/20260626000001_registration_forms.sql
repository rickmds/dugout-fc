-- Registration forms
create table if not exists registration_forms (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid references clubs(id) on delete cascade not null,
  team_id       uuid references teams(id) on delete set null,
  title         text not null,
  description   text,
  fields        jsonb not null default '[]',
  deadline      timestamptz,
  status        text check (status in ('open','closed','draft')) default 'draft',
  token         text unique not null default gen_random_uuid()::text,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now()
);

-- Registration submissions
create table if not exists registration_submissions (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid references registration_forms(id) on delete cascade not null,
  data          jsonb not null default '{}',
  submitted_at  timestamptz default now()
);

-- RLS
alter table registration_forms enable row level security;
alter table registration_submissions enable row level security;

-- Coaches and org_admins can read/write forms for their club
create policy "club members manage forms"
  on registration_forms
  for all
  using (
    club_id in (
      select club_id from profiles where id = auth.uid()
    )
  );

-- Anyone can read an open form by token (public registration page)
create policy "public can read open forms"
  on registration_forms
  for select
  using (status = 'open');

-- Anyone can submit to an open form
create policy "public can submit"
  on registration_submissions
  for insert
  with check (
    form_id in (
      select id from registration_forms where status = 'open'
    )
  );

-- Club members can read submissions for their forms
create policy "club members read submissions"
  on registration_submissions
  for select
  using (
    form_id in (
      select rf.id from registration_forms rf
      join profiles p on p.club_id = rf.club_id
      where p.id = auth.uid()
    )
  );
