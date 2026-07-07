alter table tryout_teams
  add column if not exists season_fee     text,
  add column if not exists deposit_amount text;
