-- Evaluation periods: the club-wide round ("Fall 2026 Mid-Season Evals")
-- that an admin starts across several teams at once. A period fans out
-- into one evaluation_batches row per selected team (existing table,
-- unchanged shape) via the new nullable period_id — nullable so a batch
-- started the old way (or still started from the mobile app, which has no
-- period concept yet) keeps working exactly as before.
create table public.evaluation_periods (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references public.clubs(id) not null,
  season_label text not null,
  period_label text not null,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

alter table public.evaluation_periods enable row level security;

create policy "club staff read periods"
  on public.evaluation_periods for select
  using (public.is_club_staff(club_id));

create policy "org admin insert periods"
  on public.evaluation_periods for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and club_id = evaluation_periods.club_id
        and role in ('app_admin','org_admin')
    )
  );

create policy "org admin update periods"
  on public.evaluation_periods for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and club_id = evaluation_periods.club_id
        and role in ('app_admin','org_admin')
    )
  );

create policy "org admin delete periods"
  on public.evaluation_periods for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and club_id = evaluation_periods.club_id
        and role in ('app_admin','org_admin')
    )
  );

alter table public.evaluation_batches
  add column if not exists period_id uuid references public.evaluation_periods(id) on delete set null;

create index if not exists idx_evaluation_batches_period_id on public.evaluation_batches (period_id);
create index if not exists idx_evaluation_periods_club_id on public.evaluation_periods (club_id);

-- Scheduled release: an admin who's spot-checked and approved (status
-- already supports 'approved' as a distinct pre-publish state — just
-- never reachable per-player before now) can pick a future time instead
-- of publishing immediately. A cron (publish-scheduled-evaluations)
-- publishes anything due. null means "no schedule set" — publish is
-- either immediate (admin pressed Release Now) or not yet decided.
alter table public.player_evaluations
  add column if not exists scheduled_publish_at timestamptz;

create index if not exists idx_player_evaluations_scheduled_publish
  on public.player_evaluations (scheduled_publish_at)
  where scheduled_publish_at is not null and published_at is null;
