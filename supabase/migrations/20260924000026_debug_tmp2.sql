create or replace function public.__debug_tryout_players_defaults()
returns table(column_name text, column_default text, is_nullable text)
language sql security definer as $$
  select column_name, column_default, is_nullable
  from information_schema.columns
  where table_schema='public' and table_name='tryout_players'
    and column_name in ('source','is_duplicate_flagged','duplicate_of','maybe_flag','early_decision_request');
$$;
