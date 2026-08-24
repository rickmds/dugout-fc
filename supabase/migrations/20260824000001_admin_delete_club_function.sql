-- Deleting a club used to be dozens of sequential app-level deletes
-- (web/app/api/admin/delete-club/route.ts), each committing independently —
-- if any step failed partway through, everything before it had already been
-- deleted, leaving the club in a broken half-deleted state (teams/club still
-- there, but stripped of players/invites/conversations/messages, profiles
-- already detached).
--
-- Almost every table already has ON DELETE CASCADE back to clubs/teams/
-- events/players/conversations (confirmed against pg_constraint directly),
-- and profiles.club_id is ON DELETE SET NULL — so a single
-- `delete from clubs` already resolves nearly the entire graph atomically,
-- including multi-hop chains like registration_forms -> registration_submissions
-- (Postgres checks remaining FK constraints at end-of-statement, after all
-- cascades in the same statement have resolved, so a row removed via one
-- cascade path never trips a NO ACTION constraint from another path to the
-- same row).
--
-- Only three tables have NO cascade path back to clubs at all (every one of
-- their FKs is NO ACTION): player_evaluations, evaluation_batches, and
-- pending_games. Those need explicit deletes; player_evaluations must go
-- before evaluation_batches since player_evaluations.batch_id ->
-- evaluation_batches is also NO ACTION.
--
-- Running all of this inside one plpgsql function makes it genuinely
-- atomic — if anything unexpected still blocks it (e.g. a future table
-- added without a cascade), the whole function call rolls back instead of
-- leaving a partially-deleted club.
create or replace function admin_delete_club(p_club_id uuid)
returns void
language plpgsql
as $$
begin
  delete from player_evaluations where club_id = p_club_id;
  delete from evaluation_batches where club_id = p_club_id;
  delete from pending_games where club_id = p_club_id;

  delete from clubs where id = p_club_id;
end;
$$;
