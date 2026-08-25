-- The "hardship fund available" balance shown on the fees dashboard was
-- purely SUM(hardship_contributions.amount) — nothing ever debited it when
-- a fee was actually waived using it, so the displayed balance only ever
-- grew and never reflected real usage. Add an explicit flag so a waive can
-- be attributed to the hardship fund (vs. any other reason — scholarship,
-- admin error, etc.), and the balance can actually subtract real usage.
alter table public.player_fees add column if not exists hardship_covered boolean not null default false;
