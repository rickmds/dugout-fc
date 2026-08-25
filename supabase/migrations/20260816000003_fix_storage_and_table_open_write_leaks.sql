-- Broader vulnerability sweep beyond the RLS/API-route pass in the previous
-- two migrations. Two more variants of the same underlying mistake, found
-- in table policies and Storage policies this time:
--
--   (a) a role check with no ownership/club/team scoping ("is this role
--       allowed" instead of "is this role allowed for THIS resource") —
--       same class as 20260816000001/000002, just in Storage this time.
--   (b) a handful of `with check (true)` policies that were meant to allow
--       one specific public, unauthenticated action (a self-serve form
--       submission, an anonymous email-link click) but instead accept any
--       value at all, including ones that bypass a real business decision.

-- ── 1. waiver_signatures — consent forgery ──────────────────────────────────
-- INSERT had `with check (true)`: anyone, unauthenticated, could insert a
-- fake signature row for any waiver_id/player_id — including liability,
-- medical-consent, and photo/video-consent waivers for a child whose parent
-- never agreed to anything. The unique(waiver_id, player_id) constraint
-- means a forged row also permanently blocks the real parent from signing.
-- Only legitimate caller is web/app/portal/page.tsx, which only ever
-- inserts for the logged-in parent's own children — scope to that.
drop policy if exists "Anyone can insert a waiver signature" on public.waiver_signatures;

create policy "Guardians can sign waivers for their own players"
  on public.waiver_signatures for insert
  with check (public.is_player_guardian(player_id));

-- ── 2. tryout_assignments — self-declared roster decisions ─────────────────
-- INSERT had `with check (true)`. The only legitimate caller
-- (web/app/tryout-registration/page.tsx) always inserts status='Unassigned',
-- offer_status='NotSent' for a just-created player — anything else let a
-- submitter directly insert status='Accepted' or offer_status='Sent',
-- bypassing the club's actual tryout evaluation.
drop policy if exists "public insert tryout_assignments" on public.tryout_assignments;

create policy "public insert tryout_assignments"
  on public.tryout_assignments for insert
  with check (status = 'Unassigned' and offer_status = 'NotSent');

-- ── 3. Storage: club-logos / logos — cross-club overwrite ──────────────────
-- Both buckets' INSERT/UPDATE checked only current_user_role() in
-- (org_admin, app_admin) with no path/club check at all — any org_admin on
-- the platform could write to another club's logo path
-- ({club_id}/logo-....) directly via the Storage SDK, same bug class as
-- profiles_select_own. Scope to the caller's own club_id as the path's
-- first folder segment (matches web/app/(dashboard)/dashboard/settings/page.tsx's
-- `${club.id}/logo-${Date.now()}.${ext}` convention).
drop policy if exists "logos_upload" on storage.objects;
create policy "logos_upload" on storage.objects for insert
  with check (
    bucket_id = 'club-logos'
    and (
      public.current_user_role() = 'app_admin'
      or (storage.foldername(name))[1] = public.current_user_club_id()::text
    )
  );

drop policy if exists "logos_insert" on storage.objects;
create policy "logos_insert" on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and (
      public.current_user_role() = 'app_admin'
      or (
        public.current_user_role() = 'org_admin'
        and (storage.foldername(name))[1] = public.current_user_club_id()::text
      )
    )
  );

drop policy if exists "logos_update" on storage.objects;
create policy "logos_update" on storage.objects for update
  using (
    bucket_id = 'logos'
    and (
      public.current_user_role() = 'app_admin'
      or (
        public.current_user_role() = 'org_admin'
        and (storage.foldername(name))[1] = public.current_user_club_id()::text
      )
    )
  );

-- ── 4. Storage: cert-docs — cross-club staff certification exposure ────────
-- Both read and write only checked auth.role() = 'authenticated' — any
-- logged-in user at any club could read or overwrite another club's coach
-- certification documents. Path convention (from
-- app/(app)/[clubSlug]/settings.tsx) is `${club.id}/${profile.id}-....`.
drop policy if exists "cert_docs_insert" on storage.objects;
create policy "cert_docs_insert" on storage.objects for insert
  with check (
    bucket_id = 'cert-docs'
    and (storage.foldername(name))[1] = public.current_user_club_id()::text
  );

drop policy if exists "cert_docs_read" on storage.objects;
create policy "cert_docs_read" on storage.objects for select
  using (
    bucket_id = 'cert-docs'
    and (
      public.current_user_role() = 'app_admin'
      or (storage.foldername(name))[1] = public.current_user_club_id()::text
    )
  );

-- ── 5. Storage: photos — cross-team upload ──────────────────────────────────
-- INSERT only checked bucket_id — any authenticated user could upload into
-- another team's photo folder ({team_id}/....jpg per
-- app/(app)/[clubSlug]/gallery.tsx). The team_photos table insert is
-- already properly team-scoped; this closes the same gap at the storage
-- layer so an orphaned/overwriting object can't land there in the first
-- place. Reuses is_team_member(), already audited safe.
drop policy if exists "Authenticated users can upload photos" on storage.objects;
create policy "Authenticated users can upload photos" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and public.is_team_member((storage.foldername(name))[1]::uuid)
  );

-- ── 6. Storage: avatars/players/ — any user can overwrite any child's photo ─
-- INSERT/UPDATE only checked auth.uid() is not null — any authenticated
-- user, any club, could overwrite any player's photo since the path
-- (`players/{player_id}.jpg`, from
-- app/(app)/[clubSlug]/player/[playerId].tsx) is fully predictable and
-- upsert:true replaces it outright. Scope to the player's own guardian or
-- their team's coach/org_admin.
--
-- Routed through a security-definer helper (matching is_team_coach /
-- is_player_guardian / is_team_member elsewhere in this schema) rather than
-- an inline `exists (select ... from public.players ...)` — a raw subquery
-- here would itself be filtered by players_select's own RLS first, which
-- could silently deny a legitimate guardian who (e.g. a second guardian
-- added after the fact) has a player_guardians row but no team_members row,
-- since players_select doesn't check player_guardians at all.
create or replace function public.can_manage_player_photo(p_object_name text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.players p
    where p_object_name = 'players/' || p.id::text || '.jpg'
      and (public.is_player_guardian(p.id) or public.is_team_coach(p.team_id))
  );
$$;

drop policy if exists "player_photos_upload" on storage.objects;
create policy "player_photos_upload" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and starts_with(name, 'players/')
    and public.can_manage_player_photo(name)
  );

drop policy if exists "player_photos_update" on storage.objects;
create policy "player_photos_update" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and starts_with(name, 'players/')
    and public.can_manage_player_photo(name)
  );

-- ── 7. Storage: registration-docs — public, enumerable family documents ────
-- Bucket was `public = true` with SELECT/INSERT checking only bucket_id —
-- fully anonymous, fully listable. These are club-configured document
-- uploads on the public registration form (web/app/register/[token]/page.tsx)
-- and can include birth certificates, medical forms, proof-of-residency —
-- whatever a club's registration_forms.required_docs asks for, for a
-- family's minor child. Anyone could call storage.list() on this bucket and
-- enumerate + download every uploaded document across every club, no
-- guessing required (the client-side submission ID generator is also just
-- Math.random(), not cryptographically random, which wouldn't have mattered
-- anyway once listing is closed off).
--
-- Flipping the bucket private stops direct public-URL fetches; scoping
-- SELECT stops SDK-based listing/download to the submission's own club
-- staff. INSERT stays open — the legitimate submitter here has no account
-- to check against by design (public, pre-signup registration form) — see
-- migration comment for the accepted residual risk.
update storage.buckets set public = false where id = 'registration-docs';

-- Same reasoning as can_manage_player_photo() above: avoid an inline
-- subquery against registration_forms, which has its own RLS.
create or replace function public.owns_registration_form(p_form_id text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.registration_forms rf
    where rf.id::text = p_form_id
      and rf.club_id = public.current_user_club_id()
  );
$$;

drop policy if exists "anyone can read registration docs" on storage.objects;
create policy "club staff can read registration docs" on storage.objects for select
  using (
    bucket_id = 'registration-docs'
    and (
      public.current_user_role() = 'app_admin'
      or public.owns_registration_form((storage.foldername(name))[1])
    )
  );
