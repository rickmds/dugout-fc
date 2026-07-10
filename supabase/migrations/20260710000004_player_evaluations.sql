-- Player Evaluations: batch submissions + individual evaluations per player
-- Coaches complete ratings + 3 bullet answers → AI generates polished text
-- Org admin approves batch before parents see reports

-- Batch tracks a coach's full team submission for a given period
create table public.evaluation_batches (
  id                uuid primary key default gen_random_uuid(),
  club_id           uuid references public.clubs(id) not null,
  team_id           uuid references public.teams(id) not null,
  coach_id          uuid references public.profiles(id) not null,
  season_label      text not null,  -- e.g. "Spring 2025"
  period_label      text not null,  -- e.g. "Mid-Season" or "End of Season"
  status            text check (status in ('in_progress','submitted','approved')) default 'in_progress',
  total_players     int default 0,
  completed_count   int default 0,
  submitted_at      timestamptz,
  approved_by       uuid references public.profiles(id),
  approved_at       timestamptz,
  created_at        timestamptz default now()
);

-- Individual evaluation per player per batch
create table public.player_evaluations (
  id                  uuid primary key default gen_random_uuid(),
  batch_id            uuid references public.evaluation_batches(id) not null,
  club_id             uuid references public.clubs(id) not null,
  team_id             uuid references public.teams(id) not null,
  player_id           uuid references public.players(id) not null,
  coach_id            uuid references public.profiles(id) not null,
  season_label        text not null,
  period_label        text not null,

  -- Ratings 1-5
  rating_technical    int check (rating_technical between 1 and 5),
  rating_tactical     int check (rating_tactical between 1 and 5),
  rating_physical     int check (rating_physical between 1 and 5),
  rating_mental       int check (rating_mental between 1 and 5),

  -- 3 fixed coach bullet answers fed to AI
  q1_improvement      text,  -- "Biggest improvement this period"
  q2_focus            text,  -- "Main area to focus on next"
  q3_message          text,  -- "Personal message to player and family"

  -- AI generated + coach-edited final text
  ai_draft            text,
  final_text          text,

  -- Status flow
  status              text check (status in ('draft','submitted','approved','published')) default 'draft',
  submitted_at        timestamptz,
  approved_by         uuid references public.profiles(id),
  approved_at         timestamptz,
  published_at        timestamptz,
  created_at          timestamptz default now(),

  unique(batch_id, player_id)
);

-- Indexes
create index on public.evaluation_batches (team_id, status);
create index on public.evaluation_batches (club_id);
create index on public.player_evaluations (player_id);
create index on public.player_evaluations (batch_id);
create index on public.player_evaluations (team_id, status);

-- RLS
alter table public.evaluation_batches enable row level security;
alter table public.player_evaluations   enable row level security;

-- Helper: is the user a coach or above on this club?
create or replace function public.is_club_staff(cid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and club_id = cid
      and role in ('app_admin','org_admin','coach')
  );
$$;

-- evaluation_batches policies
create policy "club staff read batches"
  on public.evaluation_batches for select
  using (public.is_club_staff(club_id));

create policy "coaches insert own batches"
  on public.evaluation_batches for insert
  with check (
    coach_id = auth.uid()
    and public.is_club_staff(club_id)
  );

create policy "coaches update own in_progress batches"
  on public.evaluation_batches for update
  using (
    coach_id = auth.uid()
    and status = 'in_progress'
  );

create policy "org admin update batches"
  on public.evaluation_batches for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and club_id = evaluation_batches.club_id
        and role in ('app_admin','org_admin')
    )
  );

-- player_evaluations policies
create policy "club staff read evals"
  on public.player_evaluations for select
  using (public.is_club_staff(club_id));

-- Parents can read published evaluations for their child
create policy "parents read published evals"
  on public.player_evaluations for select
  using (
    status = 'published'
    and exists (
      select 1 from public.players p
      join public.profiles pr on pr.id = p.profile_id
      where p.id = player_evaluations.player_id
        and pr.id = auth.uid()
    )
  );

create policy "coaches insert evals"
  on public.player_evaluations for insert
  with check (
    coach_id = auth.uid()
    and public.is_club_staff(club_id)
  );

create policy "coaches update own draft evals"
  on public.player_evaluations for update
  using (
    coach_id = auth.uid()
    and status in ('draft','submitted')
  );

create policy "org admin update evals"
  on public.player_evaluations for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and club_id = player_evaluations.club_id
        and role in ('app_admin','org_admin')
    )
  );
