-- Enhance registration_forms with capacity, confirmation settings
alter table registration_forms
  add column if not exists max_spots int,
  add column if not exists confirmation_message text,
  add column if not exists send_confirmation_email boolean default true;

-- Add status tracking to submissions
alter table registration_submissions
  add column if not exists status text check (status in ('pending','approved','waitlisted','declined')) default 'pending',
  add column if not exists notes text,
  add column if not exists reviewer_id uuid references profiles(id);

-- Storage policy: anyone can upload to registration-docs (public form)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('registration-docs', 'registration-docs', true, 10485760,
    array['image/jpeg','image/png','image/webp','application/pdf'])
  on conflict (id) do nothing;

create policy "anyone can upload registration docs"
  on storage.objects for insert
  with check (bucket_id = 'registration-docs');

create policy "anyone can read registration docs"
  on storage.objects for select
  using (bucket_id = 'registration-docs');
