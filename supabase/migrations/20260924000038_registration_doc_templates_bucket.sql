-- New bucket for club-uploaded document TEMPLATES (e.g. a medical form a
-- club wants parents to download, fill in, and re-upload) — distinct from
-- registration-docs, which holds the family's own COMPLETED documents and
-- was deliberately made private in 20260816000003 (birth certificates,
-- medical forms, etc). A template is the opposite: non-sensitive, blank,
-- and needs to be downloadable by an anonymous parent on the public
-- registration form, so this bucket stays public — only the upload/manage
-- side is scoped to the owning club's staff.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registration-templates', 'registration-templates', true, 10485760,
  array['application/pdf','image/png','image/jpeg','image/heic',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "public can read registration templates" on storage.objects for select
  using (bucket_id = 'registration-templates');

create policy "club staff can manage registration templates" on storage.objects for insert
  with check (
    bucket_id = 'registration-templates'
    and (
      public.current_user_role() = 'app_admin'
      or (storage.foldername(name))[1] = public.current_user_club_id()::text
    )
  );

create policy "club staff can update registration templates" on storage.objects for update
  using (
    bucket_id = 'registration-templates'
    and (
      public.current_user_role() = 'app_admin'
      or (storage.foldername(name))[1] = public.current_user_club_id()::text
    )
  );

create policy "club staff can delete registration templates" on storage.objects for delete
  using (
    bucket_id = 'registration-templates'
    and (
      public.current_user_role() = 'app_admin'
      or (storage.foldername(name))[1] = public.current_user_club_id()::text
    )
  );
