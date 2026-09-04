-- A guardian invite for the same player+email can be created from at least
-- three different client code paths (web roster "add player", web
-- PlayerPanel "add another guardian", mobile "add another guardian") — none
-- of which check for an existing invite first, unlike the coach/org_admin
-- invite path (inviteFirst/inviteClubWide in web/lib/coachInvite.ts), which
-- already dedupes. Real observed case: a coach invited a second guardian
-- directly, and two minutes later — before that invite was accepted — the
-- first guardian used "Add another guardian" to invite the same email
-- again, creating a second invites row. Once the original was accepted,
-- the duplicate was stranded forever as a phantom "Invite pending" row
-- next to the same email's real "Joined the app" row. A DB-level guard
-- covers every current and future call site at once, rather than trying to
-- keep three-plus separate client insert sites in sync by hand.

create or replace function public.prevent_duplicate_player_invite()
returns trigger language plpgsql as $$
begin
  if new.player_id is not null and exists (
    select 1 from public.invites
    where player_id = new.player_id
      and lower(email) = lower(new.email)
      and id is distinct from new.id
  ) then
    raise exception 'An invite for this email already exists for this player'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists invites_prevent_duplicate_player_invite on public.invites;
create trigger invites_prevent_duplicate_player_invite
  before insert on public.invites
  for each row execute function public.prevent_duplicate_player_invite();
