-- Pre-scale data-model audit finding: 20260815000001_fix_profile_delete_fk_blocks.sql
-- fixed 27 foreign keys to profiles after a real production report (account
-- deletion failing) and laid out the rule going forward — audit-trail
-- columns get SET NULL, columns where "profile_id IS the substance of the
-- row" get CASCADE. Two tables created since (message_reactions on Aug 22,
-- web_push_subscriptions on Aug 19 — actually created before the fix but
-- never swept into it) both reintroduce the identical bug: profile_id is
-- exactly the "substance of the row" case (a specific person's reaction, a
-- specific device's subscription), left at the implicit NO ACTION default.
-- Right now, any user who has ever reacted to a chat message or has a saved
-- push subscription gets a hard failure trying to delete their account.
alter table public.message_reactions drop constraint message_reactions_profile_id_fkey;
alter table public.message_reactions add constraint message_reactions_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.web_push_subscriptions drop constraint web_push_subscriptions_profile_id_fkey;
alter table public.web_push_subscriptions add constraint web_push_subscriptions_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete cascade;
