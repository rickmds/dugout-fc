-- The same real-world NCSA game legitimately needs its own events row per
-- TEAM tracking it — e.g. Maroons vs NASA is one game on NCSA's site (one
-- game-id), but if both Maroons' and NASA's Pulse FC teams were ever
-- linked, each needs its own row in its own schedule. The original index
-- made external_id unique across the whole table regardless of team,
-- which silently made every insert for a second team sharing that game-id
-- fail its unique check — caught by testing a merge scenario where two
-- different teams were (deliberately, for the test) linked to the same
-- NCSA source team. Scoping to (team_id, ...) is the correct semantics.
drop index if exists public.events_external_unique;

create unique index events_external_unique
  on public.events(team_id, external_source, external_id)
  where external_source is not null;
