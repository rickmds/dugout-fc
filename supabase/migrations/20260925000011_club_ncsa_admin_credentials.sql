-- A club's own NCSA admin-level login (Administrative Area access — fines,
-- the club's full team/coach roster), distinct from ncsa_coach_credentials
-- (a personal, per-coach login used only for the on-demand opposing-coach
-- lookup). One admin login per club, connected once by an org_admin, used
-- server-side for club-wide scrapes rather than depending on any single
-- coach's personal account staying connected. Same Vault-pointer pattern
-- as ncsa_coach_credentials: the password itself is never stored here,
-- only a pointer to a Vault secret, decryptable only by the service-role
-- client inside an edge function.
create table public.club_ncsa_admin_credentials (
  id                       uuid primary key default gen_random_uuid(),
  club_id                  uuid references public.clubs(id) on delete cascade not null unique,
  ncsa_username            text not null,
  ncsa_password_secret_id  uuid not null,
  verified_at              timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

alter table public.club_ncsa_admin_credentials enable row level security;

-- Reuses is_club_admin(cid) (org_admin at home club, club_admins,
-- app_admin) rather than hand-rolling the same OR-logic again. Selecting
-- the row is safe even though it includes ncsa_password_secret_id —
-- that's a Vault reference, not the password itself; decrypting it
-- requires the service-role client edge functions use, not a client-side
-- query.
create policy "club_ncsa_admin_credentials_select" on public.club_ncsa_admin_credentials
  for select using (public.is_club_admin(club_id));
create policy "club_ncsa_admin_credentials_insert" on public.club_ncsa_admin_credentials
  for insert with check (public.is_club_admin(club_id));
create policy "club_ncsa_admin_credentials_update" on public.club_ncsa_admin_credentials
  for update using (public.is_club_admin(club_id));
create policy "club_ncsa_admin_credentials_delete" on public.club_ncsa_admin_credentials
  for delete using (public.is_club_admin(club_id));
