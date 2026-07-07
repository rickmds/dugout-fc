alter table clubs
  add column if not exists currency text not null default 'USD'
  check (currency in ('USD','GBP','EUR','CAD','AUD'));
