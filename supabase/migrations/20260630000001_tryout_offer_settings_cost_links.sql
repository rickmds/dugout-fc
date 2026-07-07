-- Add cost/fee and link fields to tryout_offer_settings
alter table tryout_offer_settings
  add column if not exists season_fee          text,
  add column if not exists deposit_amount      text,
  add column if not exists payment_due_date    text,
  add column if not exists payment_link        text,
  add column if not exists club_website_url    text,
  add column if not exists uniform_shop_url    text;
