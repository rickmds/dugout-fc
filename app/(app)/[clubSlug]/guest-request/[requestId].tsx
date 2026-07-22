'use client';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';
import { PULSE_COLORS } from '../../../../constants/colors';

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
};

function formatDay(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function GuestRequestScreen() {
  const { requestId, clubSlug } = useLocalSearchParams<{ requestId: string; clubSlug: string }>();
  const { profile } = useAuth();
  const { primaryColor, rgba } = useClub();
  const router = useRouter();

  const [request,             setRequest]             = useState<GuestRequest | null>(null);
  const [event,               setEvent]               = useState<EventInfo | null>(null);
  const [requestingTeamName,  setRequestingTeamName]  = useState('');
  const [spotsLeft,           setSpotsLeft]           = useState(0);
  const [myPlayerId,          setMyPlayerId]          = useState<string | null>(null);
  const [myPlayerName,        setMyPlayerName]        = useState('');
  const [alreadyVolunteered,  setAlreadyVolunteered]  = useState(false);
  const [loading,             setLoading]             = useState(true);
  const [volunteering,        setVolunteering]        = useState(false);

  useEffect(() => {
    if (requestId && profile) load();
  }, [requestId, profile?.id]);

  async function load() {
    if (!requestId || !profile) return;

    const { data: req } = await (supabase as any).from('guest_requests').select('*').eq('id', requestId).single();
    if (!req) { setLoading(false); return; }
    setRequest(req as unknown as GuestRequest);

    const r = req as unknown as GuestRequest;
    const [eventRes, teamRes, guestsRes, myPlayerRes] = await Promise.all([
      supabase.from('events').select('title,type,event_date,event_time,location').eq('id', r.event_id).single(),
      supabase.from('teams').select('name').eq('id', r.requesting_team_id).single(),
      supabase.from('event_guests').select('player_id').eq('event_id', r.event_id).eq('role', 'player').neq('status', 'declined'),
      supabase.from('players').select('id,full_name').eq('team_id', r.target_team_id).eq('profile_id', profile.id).maybeSingle(),
    ]);

    if (eventRes.data) setEvent(eventRes.data as EventInfo);
    if (teamRes.data)  setRequestingTeamName(teamRes.data.name);

    const guestPlayerIds = ((guestsRes.data ?? []) as any[]).map(g => g.player_id).filter(Boolean) as string[];

    // Count how many volunteered players are from the target team
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

    const newLeft = spotsLeft - 1;
    if (newLeft <= 0) {
      await (supabase as any).from('guest_requests').update({ status: 'filled' }).eq('id', request.id);
      setRequest(r => r ? { ...r, status: 'filled' } : r);
    }
    setAlreadyVolunteered(true);
    setSpotsLeft(Math.max(0, newLeft));
    setVolunteering(false);
    Alert.alert(
      "You're in! ✓",
      `${myPlayerName} has been added as a guest player for ${requestingTeamName}. Their coach will be in touch.`,
    );
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

  return (
    <View style={st.container}>
      <ClubHeader title="Guest Player Request" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Status banner */}
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

        {/* Event info */}
        <View style={st.eventCard}>
          <Text style={st.sectionLabel}>EVENT</Text>
          <Text style={st.eventTitle}>{event.title}</Text>
          <View style={st.eventMeta}>
            <Ionicons name="calendar-outline" size={14} color={PULSE_COLORS.ui.muted} />
            <Text style={st.eventMetaText}>{formatDay(event.event_date)}</Text>
          </View>
          {event.event_time && (
            <View style={st.eventMeta}>
              <Ionicons name="time-outline" size={14} color={PULSE_COLORS.ui.muted} />
              <Text style={st.eventMetaText}>{formatTime(event.event_time)}</Text>
            </View>
          )}
          {event.location && (
            <View style={st.eventMeta}>
              <Ionicons name="location-outline" size={14} color={PULSE_COLORS.ui.muted} />
              <Text style={st.eventMetaText}>{event.location}</Text>
            </View>
          )}
        </View>

        {/* Volunteer section */}
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
            style={[
              st.volunteerBtn,
              { backgroundColor: canVolunteer ? primaryColor : '#E2E8F0' },
            ]}
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

      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container:  { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:  { color: PULSE_COLORS.ui.textSecondary, fontSize: 15 },
  scroll:     { padding: 16, gap: 12 },

  statusBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  statusBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },

  heroCard:     { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, padding: 24, alignItems: 'center', gap: 8 },
  heroIcon:     { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTeam:     { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroHeadline: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  heroNote:     { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  spotsRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  spotDot:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  spotsLabel:{ fontSize: 13, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600', marginLeft: 4 },

  eventCard:     { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, gap: 8 },
  sectionLabel:  { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  eventTitle:    { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  eventMeta:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventMetaText: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary },

  noPlayerCard: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noPlayerText: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, flex: 1, lineHeight: 19 },

  volunteerConfirmed:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, borderWidth: 1 },
  volunteerConfirmedTitle:{ fontSize: 15, fontWeight: '800' },
  volunteerConfirmedSub:  { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },

  volunteerBtn:     { borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  volunteerBtnText: { fontSize: 16, fontWeight: '800' },

  disclaimer: { fontSize: 11, color: PULSE_COLORS.ui.muted, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8 },
});
