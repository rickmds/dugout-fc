-- Two things for the Maroons SC (Evaluations) ad hoc club:
--
-- 1. players.guardian_emails — stores the real parent emails from the
--    original roster CSV directly on each player, so they're visible in
--    the app/DB instead of living only in a local, gitignored file. A
--    brand-new column nothing existing reads: no app code queries it
--    (confirmed — grepped every Resend call site), so adding it changes
--    no existing behavior by construction.
--
-- 2. clubs.outgoing_emails_disabled — an explicit, durable kill switch,
--    set true for this one club. The single real shared choke point for
--    "coach sends something to a team" turns out to be
--    /api/team/parent-emails (used by both mobile's and web's
--    sendTeamEmail — confirmed it resolves recipients only from `invites`
--    rows and team_members parent profiles, never a raw players email
--    column, so it already finds nobody for this club today). The invite
--    routes (/api/send-invite, /api/invites/bulk-resend, /api/invite-coach)
--    are the other two real, UI-reachable send paths. All three now check
--    this flag before doing anything. The other ~30 Resend call sites in
--    the app (fee reminders, tryout offers, payment confirmations, cron
--    jobs) are real production flows for real clubs with real money
--    involved — none of them are reachable for this club (admin-only nav,
--    and this club has no fee/tryout/registration/cert data to trigger a
--    cron reminder in the first place), so guarding them too would mean
--    touching ~30 unrelated, revenue-critical files for no real exposure
--    closed. If a genuinely new coach-reachable send path is added later,
--    it should check this flag too.

alter table public.players add column guardian_emails text[];

alter table public.clubs add column outgoing_emails_disabled boolean not null default false;

update public.clubs set outgoing_emails_disabled = true where slug = 'maroons-sc-evaluations';
