create or replace function public.__debug_triggers()
returns table(trigger_name text, event_manipulation text, action_timing text, action_statement text)
language sql security definer as $$
  select trigger_name, event_manipulation, action_timing, action_statement
  from information_schema.triggers
  where event_object_schema='public' and event_object_table='tryout_players';
$$;
