-- Coach-marked actual attendance (separate from player RSVP)
CREATE TABLE IF NOT EXISTS event_attendance (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references events(id) on delete cascade not null,
  player_id   uuid references players(id) on delete cascade not null,
  marked_by   uuid references profiles(id),
  status      text check (status in ('present','absent','late')) not null,
  marked_at   timestamptz default now(),
  unique(event_id, player_id)
);

ALTER TABLE event_attendance ENABLE ROW LEVEL SECURITY;

-- Club staff (coach/admin) can read and write attendance for their club's events
CREATE POLICY "club staff manage event_attendance" ON event_attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN teams t ON t.id = e.team_id
      JOIN profiles p ON p.club_id = t.club_id
      WHERE e.id = event_attendance.event_id
        AND p.id = auth.uid()
        AND p.role IN ('org_admin','coach','app_admin')
    )
  );

-- Players can read their own attendance records
CREATE POLICY "players read own attendance" ON event_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM players pl
      JOIN profiles p ON p.id = auth.uid()
      WHERE pl.id = event_attendance.player_id
        AND pl.profile_id = auth.uid()
    )
  );
