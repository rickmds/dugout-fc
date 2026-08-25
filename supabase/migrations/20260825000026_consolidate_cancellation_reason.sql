-- Pre-scale data-model audit finding: two migrations six weeks apart both
-- added an event-cancellation-reason column under different names
-- (`add column if not exists` only skips a genuinely duplicate name, so
-- both now exist side by side). Every real UI/email path reads and writes
-- cancellation_reason — except the field-closure auto-cancel route, which
-- writes cancelled_reason (fixed alongside this migration in
-- web/app/api/fields/close/route.ts). An event auto-cancelled by a field
-- closure got cancelled_at set (so it correctly showed as cancelled) but
-- its reason silently landed in a column nothing displays.
update public.events
set cancellation_reason = cancelled_reason
where cancelled_reason is not null and cancellation_reason is null;

alter table public.events drop column if exists cancelled_reason;
