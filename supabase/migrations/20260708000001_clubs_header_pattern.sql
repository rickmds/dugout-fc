alter table clubs
  add column if not exists header_pattern text
    default 'stripes'
    check (header_pattern in ('solid', 'stripes', 'pinstripes', 'dots', 'grid'));
