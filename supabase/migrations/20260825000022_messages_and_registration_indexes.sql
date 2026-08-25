-- Pre-scale data-model audit: two Critical, unindexed hot paths.
--
-- messages has never had an index in 169 migrations — every conversation
-- open, "load earlier" page, and the chat-list "last message per
-- conversation" query is a full sequential scan across every club's entire
-- message history, and unlike players/teams, chat history is never pruned.
--
-- registration_submissions has no index on form_id, and submit_registration
-- (20260825000014_atomic_registration_capacity.sql) holds a per-form
-- advisory lock while counting submissions for that form — without an
-- index, that count is a sequential scan of the whole table, executed
-- serially (the lock forces one submitter through at a time per form). A
-- popular registration form during signup season would serialize every
-- parent's submit behind a full-table scan.
--
-- Note: this migration runner applies each file inside a transaction, so
-- `CREATE INDEX CONCURRENTLY` (which cannot run inside one) isn't used
-- here, matching every other index added in this project's history. At
-- today's row counts these builds are effectively instant; if row counts
-- grow large enough for the brief write-lock to be felt, run the
-- CONCURRENTLY form by hand outside a transaction instead of via this
-- migration path.
create index if not exists idx_messages_conversation_created
  on messages (conversation_id, created_at desc);

-- The existing unique(conversation_id, profile_id) index can't efficiently
-- serve a lookup keyed on profile_id alone (it's not the leading column).
create index if not exists idx_conv_participants_profile
  on conversation_participants (profile_id);

create index if not exists idx_registration_submissions_form_status
  on registration_submissions (form_id, status);
