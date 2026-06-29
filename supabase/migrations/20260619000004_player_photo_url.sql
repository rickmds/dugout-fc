alter table players
  add column if not exists photo_url text;

-- Allow authenticated users (coaches) to upload player photos under players/ prefix
create policy "player_photos_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and starts_with(name, 'players/')
    and auth.uid() is not null
  );

create policy "player_photos_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and starts_with(name, 'players/')
    and auth.uid() is not null
  );
