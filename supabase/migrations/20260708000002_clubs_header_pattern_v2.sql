alter table clubs drop constraint if exists clubs_header_pattern_check;
alter table clubs add constraint clubs_header_pattern_check
  check (header_pattern in (
    'solid','stripes','pinstripes','dots','grid',
    'hoops','vstripes','sash','halves','diamond'
  ));
