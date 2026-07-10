-- Private notes that only app_admin can read/write — not visible to club owners
create table public.admin_club_notes (
  club_id    uuid primary key references public.clubs(id) on delete cascade,
  notes      text not null default '',
  updated_at timestamptz default now()
);

alter table public.admin_club_notes enable row level security;

create policy "admin_notes_app_admin_only" on public.admin_club_notes
  for all
  using  (public.current_user_role() = 'app_admin')
  with check (public.current_user_role() = 'app_admin');
