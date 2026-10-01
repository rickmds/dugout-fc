-- Player documents — real file uploads (medical clearance, birth
-- certificate, photo consent, etc.), coach/org_admin-uploaded. Modeled
-- directly on staff_certifications' table shape and the cert-docs /
-- registration-docs private-bucket pattern (see
-- 20260816000003_fix_storage_and_table_open_write_leaks.sql) — both
-- already-proven shapes for "sensitive per-person document storage",
-- rather than inventing a new one.

create table player_documents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade not null,
  team_id uuid references teams(id) on delete cascade not null,
  uploaded_by uuid references profiles(id) not null,
  doc_type text not null default 'other' check (doc_type in ('medical_clearance', 'birth_certificate', 'photo_consent', 'other')),
  file_name text not null,
  -- Path within the private `player-docs` bucket, not a public URL — the
  -- bucket has no public read, so a signed URL is minted per-view instead.
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create index player_documents_player_idx on player_documents (player_id);

alter table player_documents enable row level security;

-- Read: same audience as the rest of the profile's sensitive tabs
-- (emergency contacts, medical notes). Write: coach/org_admin only, per the
-- "DOC/admin collects this paperwork" framing this feature was built for —
-- unlike emergency contacts/medical notes, this isn't family-authored data.
create policy player_documents_select on player_documents
  for select using (is_player_guardian(player_id) or is_team_coach(team_id));

create policy player_documents_insert on player_documents
  for insert with check (uploaded_by = auth.uid() and is_team_coach(team_id));

create policy player_documents_delete on player_documents
  for delete using (is_team_coach(team_id));

-- Storage bucket — private, size-capped, PDF/image only, same limits as
-- cert-docs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-docs', 'player-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- Object path convention: {player_id}/{timestamp}-{filename} — so the
-- player_id is always the first path segment, same shape
-- can_manage_player_photo() already parses for the avatars bucket.
create or replace function public.can_access_player_document(p_object_name text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.players p
    where p_object_name like p.id::text || '/%'
      and (public.is_player_guardian(p.id) or public.is_team_coach(p.team_id))
  );
$$;

create or replace function public.can_manage_player_document(p_object_name text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.players p
    where p_object_name like p.id::text || '/%'
      and public.is_team_coach(p.team_id)
  );
$$;

create policy "player_docs_read" on storage.objects for select
  using (bucket_id = 'player-docs' and public.can_access_player_document(name));

create policy "player_docs_insert" on storage.objects for insert
  with check (bucket_id = 'player-docs' and public.can_manage_player_document(name));

create policy "player_docs_delete" on storage.objects for delete
  using (bucket_id = 'player-docs' and public.can_manage_player_document(name));
