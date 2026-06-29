-- Add pricing fields to registration_forms
alter table registration_forms
  add column if not exists price numeric(10,2),
  add column if not exists currency text default 'GBP',
  add column if not exists payment_options text check (payment_options in ('full','plan','both')) default 'both',
  add column if not exists plan_installments int default 3,
  add column if not exists plan_frequency text check (plan_frequency in ('monthly','weekly')) default 'monthly',
  add column if not exists plan_deposit numeric(10,2);

-- Add payment tracking to submissions
alter table registration_submissions
  add column if not exists payment_choice text check (payment_choice in ('full','plan')),
  add column if not exists payment_status text check (payment_status in ('unpaid','paid','partial','refunded')) default 'unpaid',
  add column if not exists amount_due numeric(10,2),
  add column if not exists amount_paid numeric(10,2) default 0;
