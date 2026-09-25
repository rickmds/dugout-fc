create extension if not exists supabase_vault cascade;

-- A coach's own NCSA (ncsanj.com) login, connected once so the app can look
-- up an opposing coach's contact info on demand. The password itself is
-- never stored here — only a pointer to a Vault secret, decryptable only by
-- the service-role client inside an edge function, never by the mobile app
-- or by RLS-scoped client queries.
create table public.ncsa_coach_credentials (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid references public.profiles(id) on delete cascade not null unique,
  ncsa_username            text not null,
  ncsa_password_secret_id  uuid not null,
  verified_at              timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

alter table public.ncsa_coach_credentials enable row level security;

-- Own-row only. Selecting your own row is safe even though it includes
-- ncsa_password_secret_id — that's a Vault reference, not the password
-- itself, and decrypting it requires the service-role client that only
-- edge functions have.
create policy "ncsa_coach_credentials_select" on public.ncsa_coach_credentials
  for select using (profile_id = auth.uid());
create policy "ncsa_coach_credentials_insert" on public.ncsa_coach_credentials
  for insert with check (profile_id = auth.uid());
create policy "ncsa_coach_credentials_update" on public.ncsa_coach_credentials
  for update using (profile_id = auth.uid());
create policy "ncsa_coach_credentials_delete" on public.ncsa_coach_credentials
  for delete using (profile_id = auth.uid());

-- The full raw NCSA team name for a synced game's opponent (e.g.
-- "Clarkstown-B08A7-Aberasturi") — events.title only ever kept the
-- compressed club-name display form, which isn't enough to look up the
-- opponent's coach on NCSA's own site. Populated going forward by
-- sync-ncsa-schedule; null for older/manually-entered events, which is
-- fine — the opposing-coach lookup simply isn't offered for those.
alter table public.events add column if not exists opponent_raw_name text;
