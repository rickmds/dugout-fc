-- invites.role only allowed 'parent'/'coach' — inviteClubWide's org_admin
-- invites would have failed this check constraint on every real insert.
-- Caught by a live test insert before this shipped to an actual admin.
alter table public.invites drop constraint invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role = any (array['parent'::text, 'coach'::text, 'org_admin'::text]));
