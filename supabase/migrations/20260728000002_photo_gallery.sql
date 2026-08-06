-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos', 'photos', true,
  10485760,  -- 10 MB per file
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

-- Storage policies
create policy "Authenticated users can upload photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'photos');

create policy "Public can view photos"
on storage.objects for select to public
using (bucket_id = 'photos');

create policy "Uploaders can delete their own photo files"
on storage.objects for delete to authenticated
using (bucket_id = 'photos' and owner = auth.uid());

-- Tables
create table if not exists team_photos (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid references teams(id) on delete cascade not null,
  event_id      uuid references events(id) on delete set null,
  uploaded_by   uuid references profiles(id) on delete set null,
  storage_path  text not null,
  caption       text,
  created_at    timestamptz default now()
);

create table if not exists team_photo_likes (
  photo_id    uuid references team_photos(id) on delete cascade not null,
  profile_id  uuid references profiles(id) on delete cascade not null,
  created_at  timestamptz default now(),
  primary key (photo_id, profile_id)
);

create index if not exists idx_team_photos_team_created on team_photos (team_id, created_at desc);
create index if not exists idx_team_photos_event       on team_photos (event_id);
create index if not exists idx_team_photo_likes_photo  on team_photo_likes (photo_id);

-- RLS
alter table team_photos enable row level security;
alter table team_photo_likes enable row level security;

-- team_photos SELECT — any team member or org_admin of the club
create policy "Team members can view photos" on team_photos for select to authenticated
using (
  team_id in (select team_id from team_members where profile_id = auth.uid())
  or team_id in (
    select t.id from teams t
    join profiles p on p.club_id = t.club_id
    where p.id = auth.uid() and p.role in ('org_admin','app_admin')
  )
);

-- team_photos INSERT — any team member (parents included)
create policy "Team members can upload photos" on team_photos for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    team_id in (select team_id from team_members where profile_id = auth.uid())
    or team_id in (
      select t.id from teams t
      join profiles p on p.club_id = t.club_id
      where p.id = auth.uid() and p.role in ('org_admin','app_admin')
    )
  )
);

-- team_photos DELETE — uploader can delete own; coaches can delete any in their team
create policy "Coaches and uploaders can delete photos" on team_photos for delete to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1 from team_members
    where team_id = team_photos.team_id
    and profile_id = auth.uid()
    and role = 'coach'
  )
  or exists (
    select 1 from profiles
    where id = auth.uid() and role in ('org_admin','app_admin')
  )
);

-- team_photo_likes — any team member can like/unlike
create policy "Team members can manage likes" on team_photo_likes
for all to authenticated
using (
  profile_id = auth.uid()
  and photo_id in (
    select id from team_photos
    where team_id in (select team_id from team_members where profile_id = auth.uid())
  )
)
with check (
  profile_id = auth.uid()
  and photo_id in (
    select id from team_photos
    where team_id in (select team_id from team_members where profile_id = auth.uid())
  )
);
