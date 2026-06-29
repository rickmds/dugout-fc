alter table profiles
  add column if not exists notification_prefs jsonb not null default '{
    "rsvp_reminders": true,
    "announcements": true,
    "messages": true,
    "schedule_changes": true
  }'::jsonb;
