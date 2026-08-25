-- admin_delete_club (20260824000001) hardcoded the list of tables with no
-- cascade path back to clubs: player_evaluations, evaluation_batches,
-- pending_games. That list has already drifted — invites.club_id,
-- announcements.club_id, and event_player_stats.club_id are ALSO NO ACTION
-- (confirmed live via pg_constraint) and were never added, which is exactly
-- why a real delete-club attempt just failed in production with
-- "invites_club_id_fkey". As the schema keeps growing (tryouts, waivers,
-- registrations, evaluations, fees all added since), a hand-maintained list
-- will keep silently falling out of date.
--
-- Replace the hardcoded deletes with a runtime scan of pg_constraint for
-- every table with a NO ACTION/RESTRICT FK straight to clubs(id), and delete
-- those rows first. Any future table added without ON DELETE CASCADE is
-- handled automatically instead of needing this function edited again.
--
-- The one ordering constraint inside this set (player_evaluations.batch_id
-- -> evaluation_batches is itself NO ACTION) is preserved by forcing
-- player_evaluations first; everything else in the set has no FK relations
-- to each other so order doesn't matter among them.
create or replace function admin_delete_club(p_club_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint con
    join unnest(con.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    where con.confrelid = 'clubs'::regclass
      and con.contype = 'f'
      and con.confdeltype in ('a', 'r')
    order by case conrelid::regclass::text when 'player_evaluations' then 0 else 1 end
  loop
    execute format('delete from %s where %I = $1', r.tbl, r.col) using p_club_id;
  end loop;

  delete from clubs where id = p_club_id;
end;
$$;
