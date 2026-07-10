-- contacted_at tracking per club (super-admin only)
alter table public.admin_club_notes
  add column if not exists contacted_at timestamptz;

-- Enable realtime on tables the super-admin activity feed subscribes to
do $$ begin
  alter publication supabase_realtime add table public.events;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.players;
exception when others then null; end $$;
