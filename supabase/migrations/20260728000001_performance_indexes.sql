-- Composite indexes for the most-queried access patterns on the mobile app.
-- Each index targets a WHERE + ORDER BY that appears in home/schedule/roster fetches.

create index if not exists idx_events_team_date
  on events (team_id, event_date, cancelled_at);

create index if not exists idx_notifications_profile_read
  on notifications (profile_id, read);

create index if not exists idx_event_rsvps_event_player
  on event_rsvps (event_id, player_id);

create index if not exists idx_team_members_profile
  on team_members (profile_id);

create index if not exists idx_players_team_profile
  on players (team_id, profile_id);

create index if not exists idx_announcements_team_created
  on announcements (team_id, created_at desc);
