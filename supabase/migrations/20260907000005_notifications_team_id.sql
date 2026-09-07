-- notifications has no team_id, so every "unread chat" badge (bottom tab
-- bar, Chats/Announcements sub-tab dots) can only count *all* of a
-- profile's unread notifications regardless of which team they belong to
-- — a multi-team parent/coach sees Team B's new message light up Team A's
-- chat badge while Team A is active. Add team_id so every badge query can
-- simply filter on it, and backfill existing rows so today's already-
-- wrong badges self-correct immediately rather than only for new
-- notifications going forward. Resolution mirrors
-- lib/resolveNotificationTeamId.ts's per-type logic, done in bulk here.

alter table public.notifications add column if not exists team_id uuid references public.teams(id);

create index if not exists notifications_team_id_idx on public.notifications(team_id);

update public.notifications n
set team_id = (n.data->>'team_id')::uuid
where n.team_id is null and n.data ? 'team_id';

update public.notifications n
set team_id = e.team_id
from public.events e
where n.team_id is null and n.data ? 'event_id' and (n.data->>'event_id')::uuid = e.id;

update public.notifications n
set team_id = c.team_id
from public.conversations c
where n.team_id is null and n.data ? 'conversation_id' and (n.data->>'conversation_id')::uuid = c.id;

update public.notifications n
set team_id = pf.team_id
from public.player_fees pf
where n.team_id is null and n.data ? 'player_fee_id' and (n.data->>'player_fee_id')::uuid = pf.id;

update public.notifications n
set team_id = p.team_id
from public.players p
where n.team_id is null and n.data ? 'player_id' and (n.data->>'player_id')::uuid = p.id;

update public.notifications n
set team_id = a.team_id
from public.announcements a
where n.team_id is null and n.data ? 'announcement_id' and (n.data->>'announcement_id')::uuid = a.id;
