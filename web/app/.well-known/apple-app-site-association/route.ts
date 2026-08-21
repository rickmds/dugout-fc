// paths: ["*"] originally claimed every URL on the domain as a universal
// link, so the invite email's /join?token=... link opened the native app
// directly instead of Safari — /join is a complete, working web-only
// signup flow with no in-app screen behind it. First attempt fixed this
// with a wildcard + "NOT /path" exclusions, which looked correct
// (matches Apple's own documented legacy syntax) but didn't reliably
// hold on-device even after a clean reinstall — this exact "excluded
// path still opens my app" failure is a known, unresolved report on
// Apple's own developer forums (threads 745929, 8560), not something
// fixable by tweaking the exclusion list further.
//
// Switched to the opposite structure instead: a short explicit allow-list
// rather than "claim everything, carve out exceptions." A previous version
// of this file put /reset-password on that allow-list on the assumption
// it needed universal-link support — but there is no screen or deep-link
// handler anywhere in the mobile app for it, so opening the app with that
// link did nothing useful and dropped the recovery token carried in the
// URL along the way ("Auth session missing!" on the web form afterward).
// /reset-password is a complete, working web-only flow (Supabase's
// password-reset email points there — see redirectTo in
// app/(auth)/login.tsx), same as /join. Nothing in the app intentionally
// deep-links via an https://pulse-fc.app URL, so the allow-list stays
// empty and everything falls through to Safari by construction.
export async function GET() {
  return new Response(
    JSON.stringify({
      applinks: {
        apps: [],
        details: [{
          appID: '5U6J5AR2B4.com.pulsefc.mobile',
          paths: [],
        }],
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
