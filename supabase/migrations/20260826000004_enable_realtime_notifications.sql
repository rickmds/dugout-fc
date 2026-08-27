-- The Chat tab badge, Home bell badge, and Schedule guest badge all
-- subscribe to postgres_changes on these tables to clear instantly when a
-- notification/guest row is marked read — but the tables were never added
-- to the supabase_realtime publication, so Postgres never streamed those
-- changes and the badges only ever updated on app reload.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.event_guests;
exception when others then null; end $$;
