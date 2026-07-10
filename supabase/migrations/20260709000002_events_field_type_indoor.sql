-- Add 'indoor' to the field_type allowed values
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_field_type_check;
ALTER TABLE events ADD CONSTRAINT events_field_type_check
  CHECK (field_type IN ('turf', 'grass', 'indoor'));
