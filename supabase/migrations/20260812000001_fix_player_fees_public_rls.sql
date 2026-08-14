-- The "public read fee by payment token" policy from 20260805000007 was
-- USING (true) — it granted unauthenticated SELECT on every column of
-- every row in player_fees, platform-wide, regardless of what token the
-- caller actually supplied (RLS policies can't see query filters, only
-- row data, so a table-wide policy can never really be "scoped by token").
--
-- The payment page (web/app/pay/[token]/page.tsx) now fetches fee details
-- through a server route (/api/pay/fee) that does the token lookup with
-- the service role key instead, so this public policy is no longer needed
-- and is now a pure liability. Dropping it — the existing coach/org_admin
-- and "players read own fees" policies remain unaffected.

DROP POLICY IF EXISTS "public read fee by payment token" ON player_fees;
