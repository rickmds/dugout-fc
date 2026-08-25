-- Pre-scale data-model audit: across all three money tables, the only
-- index that has ever existed is a partial one on player_fees.plan_group_id
-- — team_id (every org-admin dashboard load), player_id (parent "my fees"
-- and the payment portal), status+due_date (the late-fee cron), and the
-- fee_payments/fee_refunds foreign keys (every payment-history load) all
-- relied on sequential scans.
create index if not exists idx_player_fees_team on public.player_fees (team_id);
create index if not exists idx_player_fees_player on public.player_fees (player_id);
create index if not exists idx_player_fees_status_due on public.player_fees (status, due_date) where due_date is not null;
create index if not exists idx_fee_payments_fee on public.fee_payments (player_fee_id);
create index if not exists idx_fee_refunds_fee_payment on public.fee_refunds (fee_payment_id);
create index if not exists idx_fee_refunds_player_fee on public.fee_refunds (player_fee_id);

-- get_my_guarded_players()'s `where profile_id = auth.uid()` is the second
-- column of player_guardians' composite primary key (player_id, profile_id)
-- — Postgres can't use it as an efficient lookup. Called on essentially
-- every parent-facing screen (home, schedule, tab-layout gating, event
-- detail, waivers).
create index if not exists idx_player_guardians_profile on public.player_guardians (profile_id);

-- idx_event_rsvps_event_player (20260728000001_performance_indexes.sql)
-- duplicates event_rsvps' own unique(event_id, player_id) constraint
-- column-for-column — every RSVP insert/update maintains two identical
-- btree indexes for no query benefit.
drop index if exists idx_event_rsvps_event_player;
