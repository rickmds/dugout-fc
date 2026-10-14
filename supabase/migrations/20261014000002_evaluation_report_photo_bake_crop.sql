-- Superseding the live offset+contentPosition approach from the prior
-- migration: it required every rendering surface (coach preview, player
-- view, PDF, web dashboard) to independently reproduce the exact same
-- crop/offset formula, and the mobile "stretch to match sibling height"
-- layout it depended on turned out to blow up in real use (the photo
-- column expanded to fill the whole scrollable report instead of just
-- the hero). Switching to a baked crop — the coach positions/zooms once
-- in a dedicated editor, and the result is saved pre-cropped to the
-- hero photo box's fixed aspect ratio — means every surface just
-- displays report_photo_url with a plain cover fit; no offset math to
-- keep in sync, no dynamic-height layout trick needed.
alter table player_evaluations
  drop column report_photo_offset_x,
  drop column report_photo_offset_y;
