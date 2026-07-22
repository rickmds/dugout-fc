import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';
import { MapPickerModal } from '../../../../components/ui/MapPickerModal';
import { useMapApp } from '../../../../hooks/useMapApp';
import { PULSE_COLORS } from '../../../../constants/colors';
import { sendProfilesPush } from '../../../../lib/push';
import { fetchDriveTime } from '../../../../lib/drivetime';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

type GuestRequest = {
  id: string;
  event_id: string;
  requesting_team_id: string;
  target_team_id: string;
  note: string | null;
  spots_needed: number;
  status: 'open' | 'filled' | 'cancelled';
};

type EventInfo = {
  title: string;
  type: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  arrival_buffer_minutes: number | null;
  duration_minutes: number | null;
  home_away: 'home' | 'away' | null;
};

function formatDay(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
}

function computeEndTime(timeStr: string, durationMins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + durationMins;
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  const period = endH >= 12 ? 'PM' : 'AM';
  return `${endH % 12 || 12}:${String(endM).padStart(2, '0')} ${period}`;
}

function computeArriveBy(timeStr: string, bufferMins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = h * 60 + m - bufferMins;
  const normalized = ((totalMins % 1440) + 1440) % 1440;
  const arrH = Math.floor(normalized / 60);
  const arrM = normalized % 60;
  const period = arrH >= 12 ? 'PM' : 'AM';
  return `${arrH % 12 || 12}:${String(arrM).padStart(2, '0')} ${period}`;
}

export default function GuestRequestScreen() {
  const { requestId, clubSlug } = useLocalSearchParams<{ requestId: string; clubSlug: string }>();
  const { profile } = useAuth();
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const mapApp = useMapApp();

  const [request,            setRequest]            = useState<GuestRequest | null>(null);
  const [event,              setEvent]              = useState<EventInfo | null>(null);
  const [requestingTeamName, setRequestingTeamName] = useState('');
  const [spotsLeft,          setSpotsLeft]          = useState(0);
  const [myPlayerId,         setMyPlayerId]         = useState<string | null>(null);
  const [myPlayerName,       setMyPlayerName]       = useState('');
  const [alreadyVolunteered, setAlreadyVolunteered] = useState(false);
  const [loading,            setLoading]            = useState(true);
  const [volunteering,       setVolunteering]       = useState(false);
  const [driveTime,          setDriveTime]          = useState<string | null>(null);
  const [mapImgLoaded,       setMapImgLoaded]       = useState(false);
  const [mapImgError,        setMapImgError]        = useState(false);
  const coachProfileIds = useRef<string[]>([]);

  useEffect(() => {
    if (requestId && profile) load();
  }, [requestId, profile?.id]);

  async function load() {
    if (!requestId || !profile) return;

    const { data: req } = await (supabase as any).from('guest_requests').select('*').eq('id', requestId).single();
    if (!req) { setLoading(false); return; }
    setRequest(req as unknown as GuestRequest);

    const r = req as unknown as GuestRequest;
    const [eventRes, teamRes, guestsRes, myPlayerRes, coachesRes] = await Promise.all([
      supabase.from('events')
        .select('title,type,event_date,event_time,location,address,lat,lng,arrival_buffer_minutes,duration_minutes,home_away')
        .eq('id', r.event_id).single(),
      supabase.from('teams').select('name').eq('id', r.requesting_team_id).single(),
      supabase.from('event_guests').select('player_id').eq('event_id', r.event_id).eq('role', 'player').neq('status', 'declined'),
      supabase.from('players').select('id,full_name').eq('team_id', r.target_team_id).eq('profile_id', profile.id).maybeSingle(),
      supabase.from('team_members').select('profile_id').eq('team_id', r.requesting_team_id).eq('role', 'coach'),
    ]);
    coachProfileIds.current = ((coachesRes.data ?? []) as any[]).map(c => c.profile_id).filter(Boolean) as string[];

    if (eventRes.data) {
      const ev = eventRes.data as EventInfo;
      setEvent(ev);
      // Kick off drive time fetch
      const dest = ev.lat != null && ev.lng != null ? `${ev.lat},${ev.lng}` : (ev.address ?? '');
      if (dest && PLACES_KEY) {
        fetchDriveTime(dest).then(t => { if (t) setDriveTime(t); });
      }
    }
    if (teamRes.data) setRequestingTeamName(teamRes.data.name);

    const guestPlayerIds = ((guestsRes.data ?? []) as any[]).map(g => g.player_id).filter(Boolean) as string[];

    let filledFromTargetTeam = 0;
    if (guestPlayerIds.length > 0) {
      const { count } = await supabase.from('players')
        .select('id', { count: 'exact', head: true })
        .in('id', guestPlayerIds).eq('team_id', r.target_team_id);
      filledFromTargetTeam = count ?? 0;
    }
    setSpotsLeft(Math.max(0, r.spots_needed - filledFromTargetTeam));

    const myPlayer = myPlayerRes.data as any;
    if (myPlayer) {
      setMyPlayerId(myPlayer.id);
      setMyPlayerName(myPlayer.full_name);
      setAlreadyVolunteered(guestPlayerIds.includes(myPlayer.id));
    }

    setLoading(false);
  }

  async function handleVolunteer() {
    if (!myPlayerId || !request || !profile) return;
    setVolunteering(true);

    const { error } = await supabase.from('event_guests').insert({
      event_id:  request.event_id,
      player_id: myPlayerId,
      full_name: myPlayerName,
      role:      'player',
      status:    'confirmed',
      added_by:  profile.id,
    });

    if (error) {
      Alert.alert('Error', 'Could not volunteer. Please try again.');
      setVolunteering(false);
      return;
    }

    // Mirror to event_rsvps so the player appears in RSVP-based queries
    await supabase.from('event_rsvps').upsert(
      { event_id: request.event_id, player_id: myPlayerId, responded_by: profile.id, status: 'attending' },
      { onConflict: 'event_id,player_id' }
    );

    const newLeft = spotsLeft - 1;
    if (newLeft <= 0) {
      await (supabase as any).from('guest_requests').update({ status: 'filled' }).eq('id', request.id);
      setRequest(r => r ? { ...r, status: 'filled' } : r);
    }

    if (coachProfileIds.current.length > 0) {
      await sendProfilesPush({
        profileIds: coachProfileIds.current,
        title: 'Guest spot filled',
        body: `${myPlayerName} has volunteered to guest play for ${requestingTeamName}${event?.title ? ` — ${event.title}` : ''}.`,
        data: { type: 'guest_accepted', event_id: request.event_id, club_slug: clubSlug },
      });
    }

    setAlreadyVolunteered(true);
    setSpotsLeft(Math.max(0, newLeft));
    setVolunteering(false);
    Alert.alert(
      "You're in! ✓",
      `${myPlayerName} has been added as a guest player for ${requestingTeamName}. Their coach will be in touch.`,
    );
  }

  function openMaps() {
    if (!event) return;
    mapApp.open({ query: event.address ?? event.location ?? '', lat: event.lat, lng: event.lng });
  }

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  if (!request || !event) {
    return (
      <View style={st.center}>
        <Text style={st.errorText}>Request not found.</Text>
      </View>
    );
  }

  const isFilled    = request.status === 'filled';
  const isCancelled = request.status === 'cancelled';
  const canVolunteer = !isFilled && !isCancelled && !alreadyVolunteered && !!myPlayerId;
  const hasLocation = !!(event.location || event.address);
  const hasMap      = !!(event.lat || event.address);
  const mapDest     = event.lat != null && event.lng != null ? `${event.lat},${event.lng}` : encodeURIComponent(event.address ?? '');
  const mapUrl      = PLACES_KEY && hasMap
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${mapDest}&zoom=15&size=600x300&maptype=satellite${event.lat != null ? `&markers=color:red|${event.lat},${event.lng}` : ''}&key=${PLACES_KEY}`
    : null;

  return (
    <View style={st.container}>
      <ClubHeader title="Guest Player Request" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Status banners */}
        {isCancelled && (
          <View style={[st.statusBanner, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }]}>
            <Ionicons name="close-circle" size={16} color="#ef4444" />
            <Text style={[st.statusBannerText, { color: '#ef4444' }]}>This request has been cancelled.</Text>
          </View>
        )}
        {isFilled && (
          <View style={[st.statusBanner, { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)' }]}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={[st.statusBannerText, { color: '#22c55e' }]}>All spots are now filled. Thanks everyone!</Text>
          </View>
        )}

        {/* Request hero */}
        <View style={[st.heroCard, { borderColor: rgba(0.2) }]}>
          <View style={[st.heroIcon, { backgroundColor: rgba(0.1) }]}>
            <Ionicons name="people-outline" size={28} color={primaryColor} />
          </View>
          <Text style={st.heroTeam}>{requestingTeamName}</Text>
          <Text style={[st.heroHeadline, { color: primaryColor }]}>
            {request.spots_needed === 1 ? 'needs 1 guest player' : `needs ${request.spots_needed} guest players`}
          </Text>
          {request.note ? <Text style={st.heroNote}>"{request.note}"</Text> : null}
        </View>

        {/* Spots remaining */}
        {!isFilled && !isCancelled && (
          <View style={st.spotsRow}>
            {Array.from({ length: request.spots_needed }).map((_, i) => (
              <View
                key={i}
                style={[
                  st.spotDot,
                  i < (request.spots_needed - spotsLeft)
                    ? { backgroundColor: '#22c55e' }
                    : { backgroundColor: rgba(0.15), borderWidth: 1.5, borderColor: rgba(0.3) },
                ]}
              >
                {i < (request.spots_needed - spotsLeft) && (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                )}
              </View>
            ))}
            <Text style={st.spotsLabel}>
              {spotsLeft === 0 ? 'All filled' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} remaining`}
            </Text>
          </View>
        )}

        {/* ── Event details ── */}
        <Text style={st.sectionLabel}>THE GAME</Text>
        <View style={st.metaCard}>

          {/* Type + home/away badge + title */}
          <View style={st.eventTitleRow}>
            <View style={st.gameBadge}>
              <Text style={st.gameBadgeText}>Game</Text>
            </View>
            {event.home_away && (
              <View style={[
                st.homeAwayBadge,
                event.home_away === 'home'
                  ? { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.25)' }
                  : { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.25)' },
              ]}>
                <Text style={[st.homeAwayText, { color: event.home_away === 'home' ? '#22C55E' : '#60A5FA' }]}>
                  {event.home_away === 'home' ? 'Home' : 'Away'}
                </Text>
              </View>
            )}
          </View>
          <Text style={st.eventTitle}>{event.title}</Text>

          {/* Date + time */}
          <View style={st.metaDivider} />
          <View style={st.metaRow}>
            <Ionicons name="calendar-outline" size={17} color={PULSE_COLORS.ui.muted} style={st.metaIcon} />
            <View style={{ gap: 2 }}>
              <Text style={st.metaPrimary}>{formatDay(event.event_date)}</Text>
              {event.event_time && (
                <Text style={st.metaSecondary}>
                  {formatTime(event.event_time)}
                  {event.duration_minutes ? ` – ${computeEndTime(event.event_time, event.duration_minutes)}` : ''}
                </Text>
              )}
            </View>
          </View>

          {/* Arrive by */}
          {event.arrival_buffer_minutes != null && event.event_time && (
            <>
              <View style={st.metaDivider} />
              <View style={st.metaRow}>
                <Ionicons name="walk-outline" size={17} color={PULSE_COLORS.ui.muted} style={st.metaIcon} />
                <View style={{ gap: 2 }}>
                  <Text style={st.metaLabel}>Arrive by</Text>
                  <Text style={st.metaPrimary}>
                    {computeArriveBy(event.event_time, event.arrival_buffer_minutes)}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Location text */}
          {hasLocation && (
            <>
              <View style={st.metaDivider} />
              <TouchableOpacity style={st.metaRow} onPress={openMaps} activeOpacity={0.7}>
                <Ionicons name="location-outline" size={17} color={PULSE_COLORS.ui.muted} style={st.metaIcon} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={st.metaPrimary} numberOfLines={2}>{event.location ?? event.address}</Text>
                  {event.location && event.address && event.address !== event.location && (
                    <Text style={st.metaSecondary} numberOfLines={1}>{event.address}</Text>
                  )}
                  {driveTime && (
                    <View style={st.driveRow}>
                      <Ionicons name="car-outline" size={13} color={primaryColor} />
                      <Text style={[st.driveText, { color: primaryColor }]}>{driveTime} away</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="open-outline" size={15} color={PULSE_COLORS.ui.muted} />
              </TouchableOpacity>
            </>
          )}

          {/* Map */}
          {hasMap && (
            <>
              <View style={st.metaDivider} />
              <TouchableOpacity onPress={openMaps} activeOpacity={0.88} style={st.mapWrapper}>
                {mapUrl ? (
                  <>
                    {!mapImgLoaded && (
                      <View style={st.mapSkeleton}>
                        <ActivityIndicator color={PULSE_COLORS.ui.muted} />
                      </View>
                    )}
                    <Image
                      source={{ uri: mapUrl }}
                      style={[st.mapImg, !mapImgLoaded && { opacity: 0 }]}
                      resizeMode="cover"
                      onLoad={() => setMapImgLoaded(true)}
                      onError={() => setMapImgError(true)}
                    />
                    {mapImgLoaded && (
                      <View style={st.mapHint}>
                        <Ionicons name="navigate-outline" size={12} color="rgba(255,255,255,0.9)" />
                        <Text style={st.mapHintText}>Get directions</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={st.mapFallback}>
                    <Ionicons name="map-outline" size={20} color={PULSE_COLORS.ui.muted} />
                    <Text style={[st.mapFallbackText, { color: primaryColor }]}>
                      {event.address ?? event.location ?? 'Tap to open map'}
                    </Text>
                    <Ionicons name="open-outline" size={15} color={primaryColor} />
                  </View>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Volunteer / status section */}
        {!myPlayerId ? (
          <View style={st.noPlayerCard}>
            <Ionicons name="information-circle-outline" size={20} color={PULSE_COLORS.ui.muted} />
            <Text style={st.noPlayerText}>
              You don't have a player on the team that was asked. If you think this is wrong, contact your coach.
            </Text>
          </View>
        ) : alreadyVolunteered ? (
          <View style={[st.volunteerConfirmed, { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }]}>
            <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
            <View style={{ flex: 1 }}>
              <Text style={[st.volunteerConfirmedTitle, { color: '#22c55e' }]}>You're in!</Text>
              <Text style={st.volunteerConfirmedSub}>{myPlayerName} has been added. The coach will be in touch.</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[st.volunteerBtn, { backgroundColor: canVolunteer ? primaryColor : '#E2E8F0' }]}
            onPress={handleVolunteer}
            disabled={!canVolunteer || volunteering}
            activeOpacity={0.85}
          >
            {volunteering
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <Ionicons name="hand-right-outline" size={18} color={canVolunteer ? '#fff' : '#94A3B8'} />
                  <Text style={[st.volunteerBtnText, { color: canVolunteer ? '#fff' : '#94A3B8' }]}>
                    Volunteer {myPlayerName}
                  </Text>
                </>
              )}
          </TouchableOpacity>
        )}

        <Text style={st.disclaimer}>
          Your child will be added as a confirmed guest player. The coach can remove them if needed.
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>

      <MapPickerModal
        visible={mapApp.showPicker}
        onConfirm={mapApp.confirm}
        onDismiss={mapApp.dismiss}
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: PULSE_COLORS.ui.textSecondary, fontSize: 15 },
  scroll:    { padding: 16, gap: 14 },

  statusBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  statusBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },

  heroCard:     { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 16, borderWidth: 1.5, padding: 24, alignItems: 'center', gap: 8 },
  heroIcon:     { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTeam:     { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroHeadline: { fontSize: 20, fontWeight: '800', textAlign: 'center', color: PULSE_COLORS.ui.text },
  heroNote:     { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  spotsRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  spotDot:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  spotsLabel: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600', marginLeft: 4 },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: -4 },

  // Meta card (mirrors the event detail screen style)
  metaCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, overflow: 'hidden',
  },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingBottom: 4 },
  gameBadge: { backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  gameBadgeText: { fontSize: 12, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.5 },
  homeAwayBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  homeAwayText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  eventTitle: { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text, paddingHorizontal: 16, paddingBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  metaIcon: { marginTop: 1, width: 20 },
  metaDivider: { height: 1, backgroundColor: PULSE_COLORS.ui.border },
  metaPrimary: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  metaSecondary: { fontSize: 13, color: PULSE_COLORS.ui.muted },
  metaLabel: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  driveRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  driveText: { fontSize: 12, fontWeight: '700' },

  // Map
  mapWrapper: { height: 180, overflow: 'hidden' },
  mapSkeleton: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: PULSE_COLORS.ui.surfaceAlt },
  mapImg: { width: '100%', height: '100%' },
  mapHint: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.58)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  mapHintText: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
  mapFallback: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: PULSE_COLORS.ui.surface },
  mapFallbackText: { flex: 1, fontSize: 14, fontWeight: '600' },

  noPlayerCard: { backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noPlayerText: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, flex: 1, lineHeight: 19 },

  volunteerConfirmed:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, borderWidth: 1 },
  volunteerConfirmedTitle: { fontSize: 15, fontWeight: '800' },
  volunteerConfirmedSub:   { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },

  volunteerBtn:     { borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  volunteerBtnText: { fontSize: 17, fontWeight: '800' },

  disclaimer: { fontSize: 11, color: PULSE_COLORS.ui.muted, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8 },
});
