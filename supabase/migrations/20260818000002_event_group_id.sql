-- Links event rows created together for multiple teams in one action
-- (multi-team event creation) so an org_admin's edit can update every
-- linked team's copy at once. A coach's edit is untouched by this — it
-- still only ever targets their own event row by id, so it stays local
-- to their team regardless of whether the row belongs to a group.
--
-- Scoped per occurrence, not per whole recurring series: each date in a
-- recurring multi-team series gets its own group id, shared only by that
-- date's copies across teams. There's no "edit whole series" feature yet,
-- so grouping by series would let an org_admin editing one occurrence
-- silently affect a date they never touched.
alter table public.events add column event_group_id uuid;

create index idx_events_group_id on public.events (event_group_id) where event_group_id is not null;
