-- Same gap as notifications/event_guests (20260826000004): the super-admin
-- dashboard's live activity feed subscribes to postgres_changes on
-- `teams`, but the table was never added to the realtime publication, so
-- Postgres never streamed those changes and a newly created team never
-- appeared without a manual page reload.
do $$ begin
  alter publication supabase_realtime add table public.teams;
exception when others then null; end $$;
