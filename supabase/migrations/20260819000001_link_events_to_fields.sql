-- Links a scheduled event to a club's saved venue (tryout_fields, which
-- doubles as the general field/venue directory despite the name). Until
-- now, an event's location was always free text typed independently of
-- the Fields & Venues directory — same physical field, two disconnected
-- records, no way for a field closure to know which events it affects.
--
-- on delete set null: deleting a field record shouldn't delete or corrupt
-- events that referenced it — they just fall back to being a plain
-- free-text location, same as any event that was never linked.
alter table public.events add column if not exists field_id uuid references public.tryout_fields(id) on delete set null;

create index if not exists idx_events_field_id on public.events (field_id) where field_id is not null;

-- tryout_fields had an address column but no coordinates, so a linked
-- field could carry a name+address into a new event but not a map pin —
-- matching events.lat/lng's type so a linked event gets full location
-- data (map, directions, drive time) exactly like a freehand Places pick.
alter table public.tryout_fields add column if not exists lat numeric;
alter table public.tryout_fields add column if not exists lng numeric;
