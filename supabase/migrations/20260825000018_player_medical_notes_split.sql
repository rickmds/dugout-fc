-- Pre-scale security audit finding: players_select grants full-row SELECT
-- (including medical_notes) to any team_members row on that team, and
-- team_members.role includes 'parent' — so any parent on a team could read
-- every other kid's medical notes, not just their own child's. RLS is
-- row-level, not column-level, so the fix is the same one already used for
-- emergency contacts (20260819000003_player_emergency_contacts.sql): split
-- the sensitive column into its own guardian/coach-scoped table.
create table if not exists public.player_medical_notes (
  player_id uuid primary key references public.players(id) on delete cascade,
  notes text,
  updated_at timestamptz default now()
);

alter table public.player_medical_notes enable row level security;

-- Same read audience as player_emergency_contacts: the player's own
-- guardian(s) and any coach on the team. Never covered by the roster
-- contact-sharing toggle.
create policy "player_medical_notes_select" on public.player_medical_notes for select
  using (
    is_player_guardian(player_id)
    or exists (
      select 1 from public.players p
      where p.id = player_id and is_team_coach(p.team_id)
    )
  );

-- Write access is guardian-only, matching how medical notes are actually
-- entered today (during guardian profile completion) and matching
-- player_emergency_contacts' write policy.
create policy "player_medical_notes_write" on public.player_medical_notes for all
  using (is_player_guardian(player_id))
  with check (is_player_guardian(player_id));

insert into public.player_medical_notes (player_id, notes, updated_at)
select id, medical_notes, now()
from public.players
where medical_notes is not null and medical_notes <> ''
on conflict (player_id) do nothing;

alter table public.players drop column if exists medical_notes;
