-- RPC called by the mobile app to hard-delete the calling user's account.
-- SECURITY DEFINER so it can reach auth.users; validates via auth.uid().
create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  -- Unlink player roster entries (keep the roster entry, just remove the link)
  update players set profile_id = null where profile_id = _uid;

  -- Remove participation records
  delete from push_tokens             where profile_id = _uid;
  delete from notifications           where profile_id = _uid;
  delete from conversation_participants where profile_id = _uid;
  delete from messages                where sender_id  = _uid;
  delete from event_rsvps             where responded_by = _uid;
  delete from team_members            where profile_id = _uid;
  delete from invites                 where created_by = _uid;

  -- Remove profile (FK to auth.users)
  delete from profiles where id = _uid;

  -- Remove the auth user — this is the last step
  delete from auth.users where id = _uid;
end;
$$;

-- Only the authenticated user themselves can call this
revoke all on function delete_account() from public;
grant execute on function delete_account() to authenticated;
