create or replace function public.__debug_try_update_as_org_admin(p_submission_id uuid, p_profile_id uuid)
returns text
language plpgsql as $$
declare
  rc int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_profile_id::text, 'role', 'authenticated')::text, true);

  update public.registration_submissions
  set payment_status = 'partial'
  where id = p_submission_id;
  get diagnostics rc = row_count;

  reset role;
  return 'rows updated: ' || rc::text || ' auth.uid()=' || coalesce(auth.uid()::text, 'null');
exception when others then
  reset role;
  return 'ERROR: ' || SQLSTATE || ' - ' || SQLERRM;
end;
$$;
