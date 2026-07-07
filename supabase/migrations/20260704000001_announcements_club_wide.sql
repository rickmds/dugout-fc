-- Allow club-wide announcements (team_id nullable, add club_id + is_club_wide flag)
alter table announcements
  alter column team_id drop not null,
  add column if not exists club_id uuid references clubs(id),
  add column if not exists is_club_wide boolean default false;

create index if not exists idx_announcements_club_wide
  on announcements(club_id) where is_club_wide = true;
