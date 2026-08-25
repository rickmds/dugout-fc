import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTeam } from '../../../hooks/useTeam';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import OfflineBanner from '../../../components/ui/OfflineBanner';

// Individual screens under this route fetch data scoped by the signed-in
// user's own club_id/team membership, not by this URL param, so a mismatched
// clubSlug has never leaked another club's data in practice — but that's
// enforced per-screen by convention, not centrally. One guard here means a
// future screen that queries by clubSlug without also checking membership
// can't accidentally become the exception.
//
// A user's teams (and therefore legitimate club access) can now span more
// than one club, so a clubSlug mismatch isn't automatically an error: if it
// matches some OTHER team the user has, switch to that team — this is what
// makes deep links (push notifications, team-switcher navigation) into a
// second club work correctly. If it doesn't match anything, do nothing and
// let the screen's own per-team/per-club data fetching be the real guard
// (per the note above) rather than force-navigating away — team/club state
// can be transiently unsettled during ordinary in-app navigation, and
// bouncing the user back to the tab bar on a false positive is worse than
// just not helping in the genuinely-unauthorized case.
function ClubSlugGuard({ children }: { children: React.ReactNode }) {
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { club, loading: authLoading } = useAuth();
  const { team, allTeams, loading: teamsLoading, selectTeam } = useTeam();

  useEffect(() => {
    if (authLoading || teamsLoading || !clubSlug) return;

    const activeSlug = team?.club?.slug ?? club?.slug;
    if (activeSlug === clubSlug) return;

    const matchInThisClub = allTeams.find((t) => t.club?.slug === clubSlug);
    if (matchInThisClub) selectTeam(matchInThisClub.id);
  }, [authLoading, teamsLoading, clubSlug, team?.club?.slug, club?.slug, allTeams, selectTeam]);

  return <>{children}</>;
}

export default function ClubLayout() {
  // Rendered here rather than only inside (tabs)/_layout.tsx so non-tab
  // screens under this club (event detail, admin panel, settings, gallery,
  // notifications, etc.) get the same offline signal instead of just the
  // four bottom tabs.
  const { isConnected } = useNetworkStatus();
  return (
    <ClubSlugGuard>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
        <OfflineBanner visible={!isConnected} />
      </View>
    </ClubSlugGuard>
  );
}
