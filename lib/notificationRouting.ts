import type { useRouter } from 'expo-router';
import { resolveNotificationTeamId } from './resolveNotificationTeamId';
import type { Team } from '../hooks/TeamContext';

type Router = ReturnType<typeof useRouter>;

// Single source of truth for "given this notification, switch to the right
// team and go to the right screen" — used by BOTH the OS push-tap listener
// (app/_layout.tsx) and the in-app notification-centre list
// (notifications.tsx). These two used to be independent, hand-maintained
// copies of the same switch statement, which is exactly how they drifted:
// several real, actively-sent types (tournament_*, new_message,
// guest_removed/cancelled, video_added, attendance_absent, payment_received/
// failed) were routed correctly from the in-app list but silently dumped an
// OS push tap onto the generic notification list instead.
//
// The two fee/payment cases that need more than navigation (opening the
// actual pay/claim flow) are left to the caller via onFeePaymentTap/
// onFeeClaimTap, since that flow needs WebBrowser + club branding + local
// state that only makes sense in the calling component.
export async function routeNotificationTap(opts: {
  type: string | undefined;
  data: Record<string, unknown> | null | undefined;
  router: Router;
  team: Team | null;
  allTeams: Team[];
  selectTeam: (teamId: string) => void;
  fallbackSlug: string;
  onFeePaymentTap?: (playerFeeId: string) => void;
  onFeeClaimTap?: (playerFeeId: string) => void;
}): Promise<void> {
  const { type, router, team, allTeams, selectTeam, fallbackSlug, onFeePaymentTap, onFeeClaimTap } = opts;
  const d = opts.data ?? {};

  // Switch the active team to match the notification before navigating —
  // otherwise the destination screen renders with whatever team was active
  // beforehand, which on a multi-team account can silently show the wrong
  // roster/chat/schedule even though the URL is correct.
  const targetTeamId = await resolveNotificationTeamId(d);
  const targetTeam = targetTeamId ? allTeams.find((t) => t.id === targetTeamId) : undefined;
  // Prefer the resolved team's own club slug over the notification payload's
  // club_slug (which some types don't carry) and never fall back to the
  // CURRENT route's clubSlug for those — for a cross-club notification
  // that's guaranteed to point at the wrong club.
  const slug = targetTeam?.club?.slug ?? (d.club_slug as string | undefined) ?? fallbackSlug;
  if (targetTeamId && targetTeamId !== team?.id && allTeams.some((t) => t.id === targetTeamId)) {
    // Not awaited on purpose — yields a tick so a still-mounted screen's
    // route/team guard can settle before we navigate, rather than seeing a
    // stale mismatch and reverting the switch out from under us.
    selectTeam(targetTeamId);
  }

  // event/[eventId].tsx, tournament/[tournamentId].tsx, and poll/[pollId].tsx
  // each carry their own defensive team-realignment as a backup for the
  // `selectTeam` call above (which isn't awaited, so a still-mounting screen
  // can otherwise render one tick with the old team). That backup used to
  // fire unconditionally on ANY team mismatch, including plain in-app
  // navigation to another of your own teams' items (e.g. tapping a card in
  // Schedule's "All Teams" view) — silently reassigning your active team
  // with no confirmation. This flag tells those screens "you really did get
  // here via a notification, the backup realignment is warranted" — omitted
  // (and so ignored) for every other navigation path.
  const notifParams = { fromNotification: '1' };

  switch (type) {
    // ── Event notifications ────────────────────────────────────────────────
    case 'new_event':
    case 'event_updated':
    case 'schedule_change':
    case 'rsvp_reminder':
    case 'event_day_reminder':
    case 'game_day':
    case 'attendance_absent':
    case 'video_added':
    case 'reflection_prompt':
      d.event_id
        ? router.push({ pathname: `/(app)/${slug}/event/${d.event_id}` as any, params: notifParams })
        : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
      break;
    case 'event_cancelled':
    case 'field_closure':
      router.push(`/(app)/${slug}/(tabs)/schedule` as any);
      break;
    case 'player_shoutout':
      d.player_id
        ? router.push({ pathname: `/(app)/${slug}/player/shoutouts` as any, params: { playerId: d.player_id as string } })
        : router.push(`/(app)/${slug}/(tabs)` as any);
      break;
    // ── Tournament notifications ───────────────────────────────────────────
    case 'tournament_created':
    case 'tournament_rsvp_reminder':
    case 'tournament_advance':
    case 'tournament_eliminated':
    case 'tournament_game_day':
    case 'tournament_cancelled':
      d.tournament_id
        ? router.push({ pathname: `/(app)/${slug}/tournament/${d.tournament_id}` as any, params: notifParams })
        : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
      break;
    // ── Chat notifications ─────────────────────────────────────────────────
    case 'new_announcement':
      router.push({ pathname: `/(app)/${slug}/(tabs)/chat` as any, params: { tab: 'announcements' } });
      break;
    case 'new_dm':
    case 'new_message':
      d.conversation_id ? router.push(`/(app)/${slug}/conversation/${d.conversation_id}` as any) : router.push(`/(app)/${slug}/(tabs)/chat` as any);
      break;
    case 'callout':
      // Team callouts render on Home, not a dedicated screen of their own.
      router.push(`/(app)/${slug}/(tabs)` as any);
      break;
    case 'team_poll':
      // Its own dedicated screen — landing on Home (or a whole event page)
      // just to go find the one poll someone was notified about meant
      // scrolling to locate it every time.
      d.poll_id
        ? router.push({ pathname: `/(app)/${slug}/poll/${d.poll_id}` as any, params: notifParams })
        : router.push(`/(app)/${slug}/(tabs)` as any);
      break;
    // ── Guest notifications ────────────────────────────────────────────────
    case 'guest_request':
      d.request_id ? router.push(`/(app)/${slug}/guest-request/${d.request_id}` as any) : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
      break;
    case 'guest_invite':
    case 'guest_coach_invite':
    case 'guest_accepted':
    case 'guest_response':
    case 'guest_removed':
    case 'guest_cancelled':
      d.event_id
        ? router.push({ pathname: `/(app)/${slug}/event/${d.event_id}` as any, params: notifParams })
        : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
      break;
    // ── Admin notifications ────────────────────────────────────────────────
    case 'invite_accepted':
      (team?.myRole === 'org_admin' || team?.myRole === 'coach')
        ? router.push(`/(app)/${slug}/admin` as any)
        : router.push(`/(app)/${slug}/(tabs)/roster` as any);
      break;
    case 'guest_reminder':
    case 'evaluation_published':
    case 'waiver_reminder':
    case 'payment_disputed': // admin-only alert, no dedicated dispute screen yet
      router.push(`/(app)/${slug}/admin` as any);
      break;
    // ── Fee/payment notifications ──────────────────────────────────────────
    case 'fee_assigned':
      break; // intentional no-op — informational only, nothing to jump to
    case 'fee_reminder':
    case 'payment_confirmed':
    case 'payment_failed':
    case 'payment_received':
      if (d.player_fee_id && onFeePaymentTap) onFeePaymentTap(d.player_fee_id as string);
      break;
    case 'fee_payment_claimed':
      if (d.player_fee_id && onFeeClaimTap) onFeeClaimTap(d.player_fee_id as string);
      break;
    // ── Fallback ────────────────────────────────────────────────────────────
    default:
      router.push(`/(app)/${slug}/notifications` as any);
  }
}
