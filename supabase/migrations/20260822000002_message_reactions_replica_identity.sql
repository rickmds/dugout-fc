-- Realtime DELETE payloads only carry the primary key by default — the
-- client needs message_id/emoji/profile_id from a deleted row to correctly
-- decrement the right reaction locally. Same reason messages itself already
-- has this set (see 20260625000001_chat_fixes.sql).
alter table public.message_reactions replica identity full;
