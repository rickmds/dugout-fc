-- Formalizes field_group/is_full_field, which already exist live in
-- production (added directly via the SQL editor at some point, never
-- captured in a migration) — schema-drift risk: a fresh `supabase db
-- reset` would silently drop the Game Scheduler's conflict-detection
-- columns. Safe/additive: matches the live defaults exactly.
alter table public.tryout_fields
  add column if not exists field_group text,
  add column if not exists is_full_field boolean not null default false;

-- The tryouts-only "Fields & Zones" editor is being folded into the main
-- Fields page, which already has its own surface column (surface_type) —
-- two separate free-text columns for the same concept. Backfill
-- surface_type from surface wherever surface_type was never set, so no
-- data is lost when the tryouts editor (the only writer of `surface`)
-- stops being used. `surface` itself is left in place, just no longer
-- written to going forward.
update public.tryout_fields
set surface_type = surface
where surface_type is null and surface is not null;
