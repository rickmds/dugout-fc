-- Deleting a profile hit invites_accepted_by_fkey (a real report — see
-- Settings > Delete account error). That was one of 27 foreign keys
-- pointing at profiles; 25 of them had the same NO ACTION (blocking)
-- behavior and would have failed identically depending on what the
-- deleting user happened to have done in the app (sent a fee reminder,
-- verified a cert, created a waiver, etc.) — Apple requires working
-- in-app account deletion, so this needs to work unconditionally, not
-- just for users who happen to avoid these code paths.
--
-- Audit-trail-style "who did this" columns get SET NULL (preserve the
-- record, anonymize the actor) — matches the pattern already used
-- correctly elsewhere (players.profile_id, invites.created_by,
-- events.created_by, etc.). The two exceptions are poll votes and
-- callout responses, where profile_id IS the substance of the row (a
-- specific person's vote/acknowledgment, not just metadata) — those
-- get CASCADE instead, since an anonymous vote left behind serves no
-- purpose and would just confuse response tallies.

alter table email_logs drop constraint email_logs_sent_by_fkey;
alter table email_logs add constraint email_logs_sent_by_fkey foreign key (sent_by) references profiles(id) on delete set null;

alter table evaluation_batches drop constraint evaluation_batches_approved_by_fkey;
alter table evaluation_batches add constraint evaluation_batches_approved_by_fkey foreign key (approved_by) references profiles(id) on delete set null;

alter table event_attendance drop constraint event_attendance_marked_by_fkey;
alter table event_attendance add constraint event_attendance_marked_by_fkey foreign key (marked_by) references profiles(id) on delete set null;

alter table event_guests drop constraint event_guests_added_by_fkey;
alter table event_guests add constraint event_guests_added_by_fkey foreign key (added_by) references profiles(id) on delete set null;

alter table event_player_stats drop constraint event_player_stats_created_by_fkey;
alter table event_player_stats add constraint event_player_stats_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table fee_categories drop constraint fee_categories_created_by_fkey;
alter table fee_categories add constraint fee_categories_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table fee_payments drop constraint fee_payments_recorded_by_fkey;
alter table fee_payments add constraint fee_payments_recorded_by_fkey foreign key (recorded_by) references profiles(id) on delete set null;

alter table fee_reminder_log drop constraint fee_reminder_log_sent_by_fkey;
alter table fee_reminder_log add constraint fee_reminder_log_sent_by_fkey foreign key (sent_by) references profiles(id) on delete set null;

alter table field_closure_acknowledgements drop constraint field_closure_acknowledgements_coach_profile_id_fkey;
alter table field_closure_acknowledgements add constraint field_closure_acknowledgements_coach_profile_id_fkey foreign key (coach_profile_id) references profiles(id) on delete set null;

alter table field_closures drop constraint field_closures_created_by_fkey;
alter table field_closures add constraint field_closures_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table game_sessions drop constraint game_sessions_created_by_fkey;
alter table game_sessions add constraint game_sessions_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table guest_requests drop constraint guest_requests_created_by_fkey;
alter table guest_requests add constraint guest_requests_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table invites drop constraint invites_accepted_by_fkey;
alter table invites add constraint invites_accepted_by_fkey foreign key (accepted_by) references profiles(id) on delete set null;

alter table player_evaluations drop constraint player_evaluations_approved_by_fkey;
alter table player_evaluations add constraint player_evaluations_approved_by_fkey foreign key (approved_by) references profiles(id) on delete set null;

alter table player_fees drop constraint player_fees_claimed_by_fkey;
alter table player_fees add constraint player_fees_claimed_by_fkey foreign key (claimed_by) references profiles(id) on delete set null;

alter table player_fees drop constraint player_fees_created_by_fkey;
alter table player_fees add constraint player_fees_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table registration_document_uploads drop constraint registration_document_uploads_verified_by_fkey;
alter table registration_document_uploads add constraint registration_document_uploads_verified_by_fkey foreign key (verified_by) references profiles(id) on delete set null;

alter table registration_forms drop constraint registration_forms_created_by_fkey;
alter table registration_forms add constraint registration_forms_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table registration_promo_codes drop constraint registration_promo_codes_created_by_fkey;
alter table registration_promo_codes add constraint registration_promo_codes_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table registration_submissions drop constraint registration_submissions_reviewer_id_fkey;
alter table registration_submissions add constraint registration_submissions_reviewer_id_fkey foreign key (reviewer_id) references profiles(id) on delete set null;

alter table staff_certifications drop constraint staff_certifications_verified_by_fkey;
alter table staff_certifications add constraint staff_certifications_verified_by_fkey foreign key (verified_by) references profiles(id) on delete set null;

alter table team_callouts drop constraint team_callouts_created_by_fkey;
alter table team_callouts add constraint team_callouts_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table team_polls drop constraint team_polls_created_by_fkey;
alter table team_polls add constraint team_polls_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table waivers drop constraint waivers_created_by_fkey;
alter table waivers add constraint waivers_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table evaluation_batches alter column coach_id drop not null;
alter table evaluation_batches drop constraint evaluation_batches_coach_id_fkey;
alter table evaluation_batches add constraint evaluation_batches_coach_id_fkey foreign key (coach_id) references profiles(id) on delete set null;

alter table player_evaluations alter column coach_id drop not null;
alter table player_evaluations drop constraint player_evaluations_coach_id_fkey;
alter table player_evaluations add constraint player_evaluations_coach_id_fkey foreign key (coach_id) references profiles(id) on delete set null;

alter table team_callout_responses drop constraint team_callout_responses_profile_id_fkey;
alter table team_callout_responses add constraint team_callout_responses_profile_id_fkey foreign key (profile_id) references profiles(id) on delete cascade;

alter table team_poll_votes drop constraint team_poll_votes_profile_id_fkey;
alter table team_poll_votes add constraint team_poll_votes_profile_id_fkey foreign key (profile_id) references profiles(id) on delete cascade;
