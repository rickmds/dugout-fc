-- Track when a coaches packet was last sent
alter table public.tryout_coaches
  add column if not exists packet_sent_at timestamptz;

-- Unique constraint so upsert works cleanly for assistant assignments
alter table public.tryout_coach_assignments
  drop constraint if exists tryout_coach_assignments_club_id_coach_id_team_role_key;

alter table public.tryout_coach_assignments
  add constraint tryout_coach_assignments_unique
  unique (club_id, coach_id, team, role);
