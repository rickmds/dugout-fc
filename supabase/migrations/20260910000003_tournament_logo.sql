-- Tournament logo, shown in place of the generic trophy icon on the
-- schedule tab's tournament card and the tournament detail header once set.
alter table public.tournaments add column if not exists logo_url text;

-- Dedicated bucket, same shape as chat-images/photos: any authenticated
-- user can upload — the real gate is tournaments_update itself (coach-only,
-- via is_team_coach), since a logo only ever lands on a tournament row
-- through that update. Public read, delete only by the uploader.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-logos', 'tournament-logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "tournament_logos_insert" on storage.objects for insert
  with check (bucket_id = 'tournament-logos' and auth.role() = 'authenticated');

create policy "tournament_logos_select" on storage.objects for select
  using (bucket_id = 'tournament-logos');

create policy "tournament_logos_delete" on storage.objects for delete
  using (bucket_id = 'tournament-logos' and owner = auth.uid());
