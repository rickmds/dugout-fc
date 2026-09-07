-- Team Chat image attachments (camera or library) — a message can now be
-- text-only, image-only, or both, matching normal chat-app conventions.

alter table public.messages
  alter column body drop not null,
  add column if not exists image_url text;

alter table public.messages
  add constraint messages_body_or_image_check
  check (body is not null or image_url is not null);

-- Dedicated bucket rather than reusing `photos` (the team-gallery feature,
-- with its own team_photos table, captions, curation) — chat attachments
-- are a different, more ephemeral concept and get their own lifecycle.
-- Mirrors `photos`' exact RLS shape: any authenticated user can upload
-- (real scoping happens at messages_insert's conversation-membership
-- check, same as how team_photos scopes `photos` uploads today), public
-- read, delete only by the uploader.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "chat_images_insert" on storage.objects for insert
  with check (bucket_id = 'chat-images' and auth.role() = 'authenticated');

create policy "chat_images_select" on storage.objects for select
  using (bucket_id = 'chat-images');

create policy "chat_images_delete" on storage.objects for delete
  using (bucket_id = 'chat-images' and owner = auth.uid());
