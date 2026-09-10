-- Editing a message replaces its content, but existing reactions were given
-- to the OLD content — leaving them attached after a full rewrite would
-- misrepresent what people actually reacted to. The app clears reactions
-- client-side on every edit; this policy is what makes that DELETE actually
-- succeed for reactions left by OTHER people (the existing
-- "profile_id = auth.uid()" policy only ever covered deleting your own).
create policy "Message sender can clear all reactions on their own message"
  on message_reactions for delete
  using (
    message_id in (select id from messages where sender_id = auth.uid())
  );
