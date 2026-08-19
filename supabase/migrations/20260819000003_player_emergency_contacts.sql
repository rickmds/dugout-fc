-- Supports more than one emergency contact per player. Replaces the old
-- single-contact players.emergency_contact_* columns, which are backfilled
-- into this table below and then dropped — nothing else in the app reads
-- them (grepped both app/ and web/ to confirm before dropping).
create table if not exists public.player_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete cascade not null,
  name text not null,
  phone text,
  relationship text,
  created_at timestamptz default now()
);

alter table public.player_emergency_contacts enable row level security;

-- Same read audience as the rest of a player's emergency/medical info:
-- the player's own guardian(s) and any coach on the team. Never covered
-- by the roster contact-sharing toggle.
create policy "player_emergency_contacts_select" on public.player_emergency_contacts for select
  using (
    is_player_guardian(player_id)
    or exists (
      select 1 from public.players p
      where p.id = player_id and is_team_coach(p.team_id)
    )
  );

-- Write access is guardian-only — a parent manages their own child's
-- emergency contacts; coaches can view but not edit.
create policy "player_emergency_contacts_write" on public.player_emergency_contacts for all
  using (is_player_guardian(player_id))
  with check (is_player_guardian(player_id));

insert into public.player_emergency_contacts (player_id, name, phone, relationship, created_at)
select id, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, created_at
from public.players
where emergency_contact_name is not null or emergency_contact_phone is not null;

alter table public.players
  drop column if exists emergency_contact_name,
  drop column if exists emergency_contact_phone,
  drop column if exists emergency_contact_relationship;
