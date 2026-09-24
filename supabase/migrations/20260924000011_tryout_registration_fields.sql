-- Tracks the post-acceptance registration form, distinct from offer_status:
-- offer_status='Accepted' means the family accepted the roster spot;
-- registration_status='Submitted' means they've since completed the actual
-- registration paperwork (emergency contact confirm, medical, agreement).
alter table public.tryout_assignments
  add column if not exists registration_status text not null default 'NotStarted'
    check (registration_status in ('NotStarted','Submitted')),
  add column if not exists registration_submitted_at timestamptz,
  add column if not exists agreement_signed_name text;
