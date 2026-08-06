-- Staff certifications — coach submits, admin verifies
create table staff_certifications (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid references clubs(id) on delete cascade not null,
  profile_id    uuid references profiles(id) on delete cascade not null,
  cert_type     text not null check (cert_type in ('background_check','safesport','coaching_license','first_aid_cpr','custom')),
  license_level text,    -- for coaching_license: Grassroots, D, C, B, A
  custom_label  text,    -- for custom type
  expiry_date   date,
  doc_url       text,
  status        text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  submitted_at  timestamptz default now(),
  verified_by   uuid references profiles(id),
  verified_at   timestamptz,
  rejection_note text,
  created_at    timestamptz default now()
);

create index on staff_certifications(club_id);
create index on staff_certifications(profile_id);
create index on staff_certifications(expiry_date) where expiry_date is not null;
create index on staff_certifications(status);

-- Unique: one active submission per coach per cert type per club
-- (allows re-submission after rejection by deleting old rejected row)

alter table staff_certifications enable row level security;

-- Coaches: read/write their own
create policy "certs_own_read" on staff_certifications
  for select using (profile_id = auth.uid());

create policy "certs_own_insert" on staff_certifications
  for insert with check (
    profile_id = auth.uid()
    and club_id = (select club_id from profiles where id = auth.uid())
  );

-- Coaches can update only their pending or rejected certs (to re-submit)
create policy "certs_own_update" on staff_certifications
  for update using (
    profile_id = auth.uid()
    and status in ('pending', 'rejected')
  );

-- Admins: full access to their club's certs
create policy "certs_admin_all" on staff_certifications
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.club_id = staff_certifications.club_id
      and p.role in ('org_admin', 'app_admin')
    )
  );

-- Storage bucket for cert documents (run separately in Supabase dashboard if needed)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cert-docs', 'cert-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- Storage policies
create policy "cert_docs_read" on storage.objects
  for select using (
    bucket_id = 'cert-docs'
    and auth.role() = 'authenticated'
  );

create policy "cert_docs_insert" on storage.objects
  for insert with check (
    bucket_id = 'cert-docs'
    and auth.role() = 'authenticated'
  );
