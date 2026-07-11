-- Add structured report data column to player_evaluations
alter table player_evaluations
  add column if not exists report_data jsonb;
