import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { DUGOUT_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubBadge from '../../../../components/ui/ClubBadge';
import type { Database } from '../../../../types/database';
import { sendTeamPush } from '../../../../lib/push';

type Team    = Database['public']['Tables']['teams']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type Tab = 'chats' | 'announcements' | 'email';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { primaryColor, rgba, secondaryColor } = useClub();
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { team, loading: teamLoading } = useTeam();
  const { profile, user } = useAuth();
  const isCoach = profile?.role === 'org_admin' || profile?.role === 'coach';

  const [activeTab, setActiveTab] = useState<Tab>('chats');

  if (teamLoading) {
    return <View style={st.center}><ActivityIndicator color={primaryColor} /></View>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'chats', label: 'Chats' },
    { key: 'announcements', label: 'Announcements' },
    ...(isCoach ? [{ key: 'email' as Tab, label: 'Email' }] : []),
  ];

  return (
    <View style={st.screen}>
      {/* Header */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <ClubBadge size={38} />
          <View>
            <Text style={st.title}>Chat</Text>
            <Text style={st.subtitle}>{team?.name}</Text>
          </View>
        </View>
        <View style={st.headerRight} />
      </View>

      {/* Tab bar */}
      <View style={[st.tabs, tabs.length === 2 && st.tabsTwo]}>
        {tabs.map(({ key, label }) => {
          const active = activeTab === key;
          return (
            <TouchableOpacity key={key} style={[st.tab, active && [st.tabActive, { backgroundColor: primaryColor }]]} onPress={() => setActiveTab(key)}>
              <Text style={[st.tabText, active && st.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flex: 1, display: activeTab === 'chats' ? 'flex' : 'none' }}>
        <ChatsTab team={team} profile={profile} clubSlug={clubSlug} />
      </View>
      <View style={{ flex: 1, display: activeTab === 'announcements' ? 'flex' : 'none' }}>
        <AnnouncementsTab team={team} profile={profile} coachEmail={user?.email ?? null} />
      </View>
      {isCoach && (
        <View style={{ flex: 1, display: activeTab === 'email' ? 'flex' : 'none' }}>
          <EmailTab team={team} profile={profile} coachEmail={user?.email ?? null} />
        </View>
      )}
    </View>
  );
}

// ─── Types for Chats tab ──────────────────────────────────────────────────────

type ConvoItem = {
  id: string;
  title: string;
  type: string;
  last_body: string | null;
  last_at: string | null;
  last_sender_id: string | null;
  isTeam: boolean;
};

type TeamMember = {
  profile_id: string;
  full_name: string | null;
  role: string;
};

// ─── Chats tab ────────────────────────────────────────────────────────────────

function ChatsTab({ team, profile, clubSlug }: { team: Team | null; profile: Profile | null; clubSlug: string }) {
  const { primaryColor, rgba } = useClub();
  const router = useRouter();

  const [convos, setConvos]             = useState<ConvoItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showNewChat, setShowNewChat]   = useState(false);
  const [teamMembers, setTeamMembers]   = useState<TeamMember[]>([]);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [groupName, setGroupName]       = useState('');
  const [creating, setCreating]         = useState(false);
  const [unread, setUnread]             = useState<Record<string, number>>({});
  const [refreshing, setRefreshing]     = useState(false);
  const [search, setSearch]             = useState('');
  const convosRef                       = useRef<ConvoItem[]>([]);

  useEffect(() => {
    if (team && profile) {
      fetchConvos();
      const unsub = subscribeToMessages();
      return unsub;
    }
  }, [team?.id, profile?.id]);

  async function fetchConvos() {
    if (!team || !profile) return;
    setLoading(true);

    // Get/create team group conversation
    const { data: tgRows } = await supabase
      .from('conversations')
      .select('id, title')
      .eq('team_id', team.id)
      .eq('type', 'team_group')
      .limit(1);

    let teamConv = tgRows?.[0] ?? null;

    if (!teamConv) {
      const { data: newTg, error } = await supabase
        .from('conversations')
        .insert({ team_id: team.id, type: 'team_group', title: team.name })
        .select('id, title')
        .single();
      if (error) {
        console.error('[Chat] Could not create team_group conversation:', error.message);
        Alert.alert('Chat setup failed', error.message);
        setLoading(false);
        return;
      }
      teamConv = newTg;
    }

    if (teamConv) {
      await supabase.from('conversation_participants').upsert(
        { conversation_id: teamConv.id, profile_id: profile.id },
        { onConflict: 'conversation_id,profile_id', ignoreDuplicates: true },
      );
    }

    // Get all conversations where I'm a participant
    const { data: myParts } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', profile.id);

    const allIds = (myParts ?? []).map((p: any) => p.conversation_id);

    // Get direct conversations (not team_group — we handle that separately)
    const directIds = allIds.filter((id: string) => id !== teamConv?.id);

    let directConvs: any[] = [];
    if (directIds.length > 0) {
      const { data: dc } = await supabase
        .from('conversations')
        .select('id, title, type, created_at')
        .in('id', directIds)
        .eq('type', 'direct');
      directConvs = dc ?? [];
    }

    // Get last messages for all conversations in one query
    const allConvIds = [teamConv?.id, ...directConvs.map((c: any) => c.id)].filter(Boolean);
    const lastMsgMap: Record<string, { body: string; created_at: string; sender_id: string }> = {};

    if (allConvIds.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, body, created_at, sender_id')
        .in('conversation_id', allConvIds)
        .order('created_at', { ascending: false })
        .limit(allConvIds.length * 20);

      for (const m of msgs ?? []) {
        if (!lastMsgMap[(m as any).conversation_id]) {
          lastMsgMap[(m as any).conversation_id] = { body: (m as any).body, created_at: (m as any).created_at, sender_id: (m as any).sender_id };
        }
      }
    }

    // Build the list: team chat first, then directs sorted by last message
    const items: ConvoItem[] = [];

    if (teamConv) {
      const lm = lastMsgMap[teamConv.id];
      items.push({
        id: teamConv.id,
        title: 'Team Chat',
        type: 'team_group',
        last_body: lm?.body ?? null,
        last_at: lm?.created_at ?? null,
        last_sender_id: lm?.sender_id ?? null,
        isTeam: true,
      });
    }

    const sortedDirect = directConvs
      .map((c: any) => ({
        id: c.id,
        title: c.title ?? 'Conversation',
        type: c.type,
        last_body: lastMsgMap[c.id]?.body ?? null,
        last_at: lastMsgMap[c.id]?.created_at ?? null,
        last_sender_id: lastMsgMap[c.id]?.sender_id ?? null,
        isTeam: false,
      }))
      .sort((a, b) => {
        const ta = a.last_at ?? '0';
        const tb = b.last_at ?? '0';
        return tb.localeCompare(ta);
      });

    const list = [...items, ...sortedDirect];
    convosRef.current = list;
    setConvos(list);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchConvos();
    setRefreshing(false);
  }

  function subscribeToMessages() {
    const channel = supabase
      .channel(`chats-list:${profile?.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any;
        const convId = msg.conversation_id;
        const current = convosRef.current;
        const isParticipant = current.some((c) => c.id === convId);
        if (!isParticipant) return;

        const updated = current
          .map((c) => c.id === convId ? { ...c, last_body: msg.body, last_at: msg.created_at, last_sender_id: msg.sender_id } : c)
          .sort((a, b) => {
            if (a.isTeam) return -1;
            if (b.isTeam) return 1;
            return (b.last_at ?? '0').localeCompare(a.last_at ?? '0');
          });
        convosRef.current = updated;
        setConvos([...updated]);

        if (msg.sender_id !== profile?.id) {
          setUnread((prev) => ({ ...prev, [convId]: (prev[convId] ?? 0) + 1 }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  function onLongPressConvo(item: ConvoItem) {
    if (item.isTeam) return;
    Alert.alert(item.title, undefined, [
      {
        text: 'Delete conversation',
        style: 'destructive',
        onPress: () => Alert.alert('Delete conversation?', 'It will be removed from your list. The other person can still see it.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive', onPress: async () => {
              setConvos((prev) => { const next = prev.filter((c) => c.id !== item.id); convosRef.current = next; return next; });
              await supabase.from('conversation_participants').delete().eq('conversation_id', item.id).eq('profile_id', profile?.id ?? '');
            },
          },
        ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function openNewChat() {
    if (!team || !profile) return;
    const { data } = await supabase
      .from('team_members')
      .select('profile_id, role, profiles:profile_id(full_name)')
      .eq('team_id', team.id)
      .neq('profile_id', profile.id);

    setTeamMembers(
      (data ?? []).map((m: any) => ({
        profile_id: m.profile_id,
        full_name: m.profiles?.full_name ?? null,
        role: m.role,
      })),
    );
    setSelected(new Set());
    setGroupName('');
    setShowNewChat(true);
  }

  function toggleMember(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!profile || !team || selected.size === 0) return;
    setCreating(true);

    const selectedList = teamMembers.filter((m) => selected.has(m.profile_id));
    const isDM = selectedList.length === 1;

    // For DMs: check if conversation already exists using the RPC (avoids
    // querying conversation_participants directly for another user, which RLS
    // would block for non-admins and previously caused infinite recursion)
    if (isDM) {
      const other = selectedList[0];
      const { data: existingId } = await supabase.rpc('find_direct_conversation', {
        p_other_profile_id: other.profile_id,
      });
      if (existingId) {
        setCreating(false);
        setShowNewChat(false);
        router.push(`/(app)/${clubSlug}/conversation/${existingId}` as any);
        return;
      }
    }

    const title = isDM
      ? (selectedList[0].full_name ?? 'Conversation')
      : (groupName.trim() || selectedList.map((m) => m.full_name?.split(' ')[0] ?? '?').join(', '));

    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ team_id: team.id, type: 'direct', title })
      .select('id')
      .single();

    if (error || !conv) {
      Alert.alert('Error', error?.message ?? 'Could not create conversation.');
      setCreating(false);
      return;
    }

    const participants = [
      { conversation_id: (conv as any).id, profile_id: profile.id },
      ...selectedList.map((m) => ({ conversation_id: (conv as any).id, profile_id: m.profile_id })),
    ];
    await supabase.from('conversation_participants').insert(participants);

    setCreating(false);
    setShowNewChat(false);
    router.push(`/(app)/${clubSlug}/conversation/${(conv as any).id}` as any);
  }

  const isGroup = selected.size > 1;

  if (!team) {
    return (
      <View style={st.center}>
        <Text style={{ color: DUGOUT_COLORS.ui.textSecondary, textAlign: 'center', padding: 32, fontSize: 15 }}>
          No team found. Make sure your club and team are set up.
        </Text>
      </View>
    );
  }

  if (loading) {
    return <View style={st.center}><ActivityIndicator color={primaryColor} /></View>;
  }

  const teamConvo    = convos.find((c) => c.isTeam) ?? null;
  const directConvos = convos.filter((c) => !c.isTeam);
  const teamPreview  = teamConvo?.last_body
    ? `${teamConvo.last_sender_id === profile?.id ? 'You: ' : ''}${teamConvo.last_body}`
    : 'No messages yet';

  return (
    <View style={{ flex: 1 }}>

      {/* Team Chat — always pinned at the top */}
      <TouchableOpacity
        style={[st.convoRow, st.convoRowTeam, { backgroundColor: rgba(0.04) }]}
        onPress={() => {
          if (!teamConvo) return;
          setUnread((prev) => { const n = { ...prev }; delete n[teamConvo.id]; return n; });
          router.push(`/(app)/${clubSlug}/conversation/${teamConvo.id}` as any);
        }}
        disabled={!teamConvo}
        activeOpacity={0.75}
      >
        <View style={[st.convoAvatar, st.convoAvatarTeam, { backgroundColor: rgba(0.1), borderColor: rgba(0.25) }]}>
          <Ionicons name="people" size={20} color={primaryColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={[st.convoName, { fontWeight: '800' }]}>Team Chat</Text>
            <View style={[st.pinnedPill, { backgroundColor: rgba(0.1), borderColor: rgba(0.3) }]}>
              <Ionicons name="pin" size={9} color={primaryColor} />
              <Text style={[st.pinnedPillText, { color: primaryColor }]}>Pinned</Text>
            </View>
          </View>
          <Text style={st.convoPreview} numberOfLines={1}>{teamPreview}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {teamConvo?.last_at && <Text style={st.convoTime}>{timeLabel(teamConvo.last_at)}</Text>}
          {teamConvo && !!unread[teamConvo.id] && (
            <View style={[st.unreadBadge, { backgroundColor: primaryColor }]}>
              <Text style={st.unreadBadgeText}>{unread[teamConvo.id] > 99 ? '99+' : unread[teamConvo.id]}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {directConvos.length > 0 && (
        <Text style={st.dmSectionLabel}>DIRECT MESSAGES</Text>
      )}

      <FlatList
        data={directConvos}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
        ListEmptyComponent={null}
        renderItem={({ item }) => {
          const previewPrefix = item.last_sender_id === profile?.id ? 'You: ' : '';
          const preview = item.last_body ? `${previewPrefix}${item.last_body}` : 'No messages yet';
          const hasUnread = !!unread[item.id];
          return (
            <TouchableOpacity
              style={st.convoRow}
              onPress={() => {
                setUnread((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
                router.push(`/(app)/${clubSlug}/conversation/${item.id}` as any);
              }}
              onLongPress={() => onLongPressConvo(item)}
              activeOpacity={0.75}
            >
              <View style={st.convoAvatar}>
                {item.type === 'direct' && !item.title.includes(',')
                  ? <Text style={[st.convoAvatarText, { color: primaryColor }]}>{initials(item.title)}</Text>
                  : <Ionicons name="people-outline" size={18} color={primaryColor} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.convoName, hasUnread && { fontWeight: '800' }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[st.convoPreview, hasUnread && { color: DUGOUT_COLORS.ui.text }]} numberOfLines={1}>{preview}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {item.last_at && <Text style={st.convoTime}>{timeLabel(item.last_at)}</Text>}
                {hasUnread && (
                  <View style={[st.unreadBadge, { backgroundColor: primaryColor }]}>
                    <Text style={st.unreadBadgeText}>{unread[item.id] > 99 ? '99+' : unread[item.id]}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={[st.fab, { backgroundColor: primaryColor, shadowColor: primaryColor }]} onPress={openNewChat}>
        <Ionicons name="create-outline" size={22} color="#000" />
      </TouchableOpacity>

      {/* New chat modal */}
      <Modal visible={showNewChat} animationType="slide" transparent presentationStyle="pageSheet">
        <View style={st.sheet}>
          <View style={st.sheetHandle} />
          <View style={st.sheetHeader}>
            <TouchableOpacity onPress={() => { setShowNewChat(false); setSearch(''); }}>
              <Text style={st.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={st.sheetTitle}>New Message</Text>
            <TouchableOpacity onPress={handleCreate} disabled={selected.size === 0 || creating}>
              {creating
                ? <ActivityIndicator size="small" color={primaryColor} />
                : <Text style={[st.sheetSave, { color: primaryColor }, selected.size === 0 && { opacity: 0.4 }]}>
                    {isGroup ? 'Create Group' : 'Open'}
                  </Text>}
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={st.searchWrap}>
            <Ionicons name="search" size={16} color={DUGOUT_COLORS.ui.muted} />
            <TextInput
              style={st.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search members..."
              placeholderTextColor={DUGOUT_COLORS.ui.muted}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {isGroup && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <TextInput
                  style={st.groupNameInput}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Group name (optional)"
                  placeholderTextColor={DUGOUT_COLORS.ui.muted}
                />
              </View>
            )}
            {selected.size > 0 && (
              <View style={st.selectedChips}>
                {teamMembers
                  .filter((m) => selected.has(m.profile_id))
                  .map((m) => (
                    <TouchableOpacity key={m.profile_id} style={[st.chip, { backgroundColor: primaryColor }]} onPress={() => toggleMember(m.profile_id)}>
                      <Text style={st.chipText}>{m.full_name?.split(' ')[0] ?? '?'}</Text>
                      <Ionicons name="close" size={12} color="#000" />
                    </TouchableOpacity>
                  ))}
              </View>
            )}
            {(() => {
              const filtered = teamMembers.filter((m) =>
                !search.trim() || (m.full_name ?? '').toLowerCase().includes(search.toLowerCase()),
              );
              if (filtered.length === 0)
                return <Text style={{ color: DUGOUT_COLORS.ui.muted, textAlign: 'center', marginTop: 40 }}>No members found.</Text>;
              return filtered.map((m) => (
                <TouchableOpacity key={m.profile_id} style={st.pickerRow} onPress={() => toggleMember(m.profile_id)} activeOpacity={0.75}>
                  <View style={[st.checkBox, selected.has(m.profile_id) && [st.checkBoxOn, { backgroundColor: primaryColor, borderColor: primaryColor }]]}>
                    {selected.has(m.profile_id) && <Ionicons name="checkmark" size={14} color="#000" />}
                  </View>
                  <View style={[st.pickerAvatar, { backgroundColor: primaryColor }]}>
                    <Text style={st.pickerAvatarText}>{initials(m.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.pickerName}>{m.full_name ?? 'Unknown'}</Text>
                    <Text style={st.pickerRole}>
                      {m.role === 'coach' ? 'Coach' : m.role === 'parent' ? 'Parent' : 'Player'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ));
            })()}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Announcements ────────────────────────────────────────────────────────────

type Announcement = {
  id: string; title: string; body: string; pinned: boolean;
  created_at: string; created_by: string | null; creator_name: string | null;
};

function AnnouncementsTab({ team, profile, coachEmail }: { team: Team | null; profile: Profile | null; coachEmail: string | null }) {
  const { primaryColor, rgba, clubName, logoUrl } = useClub();
  const isCoach = profile?.role === 'org_admin' || profile?.role === 'coach';
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showCreate, setShowCreate]       = useState(false);
  const [editingAnn, setEditingAnn]       = useState<Announcement | null>(null);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [emailing, setEmailing]           = useState<string | null>(null);

  useEffect(() => { if (team) fetchAnnouncements(); }, [team?.id]);

  async function fetchAnnouncements() {
    if (!team) return;
    setLoading(true);
    const { data } = await supabase
      .from('announcements')
      .select('id, title, body, pinned, created_at, created_by, profiles:created_by(full_name)')
      .eq('team_id', team.id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    setAnnouncements((data ?? []).map((a: any) => ({
      id: a.id, title: a.title, body: a.body, pinned: a.pinned,
      created_at: a.created_at, created_by: a.created_by,
      creator_name: a.profiles?.full_name ?? null,
    })));
    setLoading(false);
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete announcement', 'Remove this announcement?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('announcements').delete().eq('id', id);
        setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      }},
    ]);
  }

  async function handleEmailTeam(ann: Announcement) {
    if (!team || !coachEmail) return;
    setEmailing(ann.id);

    const { data: players } = await supabase.from('players').select('id, full_name').eq('team_id', team.id);
    const { data: invites } = await supabase.from('invites').select('player_id, email, guardian_name').eq('team_id', team.id).not('player_id', 'is', null);
    const emailsMap: Record<string, { email: string; name: string }[]> = {};
    for (const inv of invites ?? []) {
      const pid = (inv as any).player_id;
      if (!emailsMap[pid]) emailsMap[pid] = [];
      emailsMap[pid].push({ email: (inv as any).email, name: (inv as any).guardian_name ?? '' });
    }

    const playerMap: Record<string, string> = {};
    for (const p of players ?? []) playerMap[(p as any).id] = (p as any).full_name;

    const to = Object.entries(emailsMap).flatMap(([pid, guardians]) =>
      guardians.map(({ email, name }) => ({ email, name: name || playerMap[pid] || '' }))
    );

    if (to.length === 0) { Alert.alert('No parents', 'No parent emails on file.'); setEmailing(null); return; }

    Alert.alert('Email team', `Send "${ann.title}" to ${to.length} guardian${to.length > 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => setEmailing(null) },
      { text: 'Send', onPress: async () => {
        const { error } = await supabase.functions.invoke('send-team-email', {
          body: { to, cc: [], subject: ann.title, body: ann.body, reply_to: coachEmail, from_name: profile?.full_name ?? 'Coach', team_name: team.name, attachments: [], club_logo_url: logoUrl, club_name: clubName, primary_color: primaryColor },
        });
        setEmailing(null);
        if (error) Alert.alert('Failed', 'Email service not yet configured.');
        else Alert.alert('Sent!', `Emailed to ${to.length} guardian${to.length > 1 ? 's' : ''}.`);
      }},
    ]);
  }

  if (loading) return <View style={st.center}><ActivityIndicator color={primaryColor} /></View>;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={announcements}
        keyExtractor={(a) => a.id}
        contentContainerStyle={st.aList}
        ListEmptyComponent={
          <View style={st.empty}>
            <View style={st.emptyIcon}><Ionicons name="megaphone-outline" size={32} color={DUGOUT_COLORS.ui.muted} /></View>
            <Text style={st.emptyTitle}>No announcements yet</Text>
            <Text style={st.emptySub}>{isCoach ? 'Tap + to post your first announcement.' : "Your coach hasn't posted anything yet."}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const open = expanded === item.id;
          return (
            <TouchableOpacity style={st.aCard} onPress={() => setExpanded(open ? null : item.id)} activeOpacity={0.75}>
              <View style={st.aCardTop}>
                <View style={{ flex: 1 }}>
                  {item.pinned && <View style={st.pinnedBadge}><Ionicons name="pin" size={10} color={primaryColor} /><Text style={[st.pinnedText, { color: primaryColor }]}>Pinned</Text></View>}
                  <Text style={st.aTitle}>{item.title}</Text>
                  <Text style={st.aMeta}>{item.creator_name ?? 'Coach'} · {timeLabel(item.created_at)}</Text>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={DUGOUT_COLORS.ui.muted} />
              </View>
              {open && (
                <View style={st.aBody}>
                  <Text style={st.aBodyText}>{item.body}</Text>
                  {isCoach && (
                    <View style={st.aActions}>
                      <TouchableOpacity style={[st.aActionBtn, { borderColor: rgba(0.3), backgroundColor: rgba(0.08) }]} onPress={() => setEditingAnn(item)}>
                        <Ionicons name="pencil-outline" size={14} color={primaryColor} />
                        <Text style={[st.aActionText, { color: primaryColor }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[st.aActionBtn, { borderColor: rgba(0.3), backgroundColor: rgba(0.08) }]} onPress={() => handleEmailTeam(item)} disabled={emailing === item.id}>
                        {emailing === item.id
                          ? <ActivityIndicator size="small" color={primaryColor} />
                          : <><Ionicons name="mail-outline" size={14} color={primaryColor} /><Text style={[st.aActionText, { color: primaryColor }]}>Email team</Text></>}
                      </TouchableOpacity>
                      <TouchableOpacity style={[st.aActionBtn, st.aActionDanger]} onPress={() => handleDelete(item.id)}>
                        <Ionicons name="trash-outline" size={14} color={DUGOUT_COLORS.status.error} />
                        <Text style={[st.aActionText, { color: DUGOUT_COLORS.status.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
      {isCoach && (
        <TouchableOpacity style={[st.fab, { backgroundColor: primaryColor, shadowColor: primaryColor }]} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={24} color="#000" />
        </TouchableOpacity>
      )}
      <CreateAnnouncementModal
        visible={showCreate}
        teamId={team?.id ?? ''}
        profileId={profile?.id ?? ''}
        onClose={() => setShowCreate(false)}
        onCreated={(a) => { setAnnouncements((prev) => [a, ...prev]); setShowCreate(false); }}
      />
      <CreateAnnouncementModal
        visible={!!editingAnn}
        teamId={team?.id ?? ''}
        profileId={profile?.id ?? ''}
        editing={editingAnn ?? undefined}
        onClose={() => setEditingAnn(null)}
        onCreated={() => {}}
        onUpdated={(updated) => {
          setAnnouncements((prev) => prev.map((a) => a.id === updated.id ? updated : a));
          setEditingAnn(null);
        }}
      />
    </View>
  );
}

function CreateAnnouncementModal({ visible, teamId, profileId, editing, onClose, onCreated, onUpdated }: {
  visible: boolean; teamId: string; profileId: string;
  editing?: Announcement;
  onClose: () => void;
  onCreated: (a: Announcement) => void;
  onUpdated?: (a: Announcement) => void;
}) {
  const { primaryColor } = useClub();
  const isEdit = !!editing;
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) { setTitle(editing.title); setBody(editing.body); setPinned(editing.pinned); }
    else { setTitle(''); setBody(''); setPinned(false); }
  }, [editing, visible]);

  async function handleSave() {
    if (!title.trim() || !body.trim()) { Alert.alert('Required', 'Please enter a title and message.'); return; }
    setSaving(true);
    if (isEdit && editing) {
      const { data, error } = await supabase
        .from('announcements')
        .update({ title: title.trim(), body: body.trim(), pinned })
        .eq('id', editing.id)
        .select('id, title, body, pinned, created_at, created_by')
        .single();
      setSaving(false);
      if (error || !data) { Alert.alert('Error', error?.message ?? 'Failed to save.'); return; }
      onUpdated?.({ ...data, creator_name: editing.creator_name } as Announcement);
    } else {
      const { data, error } = await supabase
        .from('announcements')
        .insert({ team_id: teamId, created_by: profileId, title: title.trim(), body: body.trim(), pinned })
        .select('id, title, body, pinned, created_at, created_by')
        .single();
      setSaving(false);
      if (error || !data) { Alert.alert('Error', error?.message ?? 'Failed to save.'); return; }
      sendTeamPush({ teamId, title: title.trim(), body: body.trim().slice(0, 120), excludeProfileId: profileId, data: { type: 'new_announcement', announcement_id: data.id } });
      onCreated({ ...data, creator_name: null } as Announcement);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.sheet}>
          <View style={st.sheetHandle} />
          <View style={st.sheetHeader}>
            <TouchableOpacity onPress={onClose}><Text style={st.sheetCancel}>Cancel</Text></TouchableOpacity>
            <Text style={st.sheetTitle}>{isEdit ? 'Edit Announcement' : 'New Announcement'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={primaryColor} /> : <Text style={[st.sheetSave, { color: primaryColor }]}>{isEdit ? 'Save' : 'Post'}</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView style={st.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={st.fieldLabel}>TITLE</Text>
            <TextInput style={st.fieldInput} value={title} onChangeText={setTitle} placeholder="e.g. Game day reminder" placeholderTextColor={DUGOUT_COLORS.ui.muted} autoFocus />
            <Text style={[st.fieldLabel, { marginTop: 16 }]}>MESSAGE</Text>
            <TextInput style={[st.fieldInput, st.fieldTextarea]} value={body} onChangeText={setBody} placeholder="Write your announcement..." placeholderTextColor={DUGOUT_COLORS.ui.muted} multiline textAlignVertical="top" />
            <TouchableOpacity style={st.pinRow} onPress={() => setPinned(!pinned)}>
              <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={18} color={pinned ? primaryColor : DUGOUT_COLORS.ui.muted} />
              <Text style={[st.pinLabel, pinned && { color: primaryColor }]}>Pin this announcement</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Email tab ────────────────────────────────────────────────────────────────

type Recipient = {
  player_id: string;
  player_name: string;
  parent_email: string | null;
};

type Attachment = {
  uri: string;
  name: string;
  mimeType: string;
  base64: string;
  sizeLabel: string;
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB per file

const AI_TONES = [
  { key: 'professional', label: 'Professional' },
  { key: 'friendly',     label: 'Friendly' },
  { key: 'urgent',       label: 'Urgent' },
  { key: 'encouraging',  label: 'Encouraging' },
] as const;

type AiTone = typeof AI_TONES[number]['key'];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function EmailTab({ team, profile, coachEmail }: { team: Team | null; profile: Profile | null; coachEmail: string | null }) {
  const { primaryColor, rgba, clubName, logoUrl } = useClub();
  const [recipients, setRecipients]     = useState<Recipient[]>([]);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [subject, setSubject]           = useState('');
  const [body, setBody]                 = useState('');
  const [attachments, setAttachments]     = useState<Attachment[]>([]);
  const [ccSelf, setCcSelf]               = useState(false);
  const [loading, setLoading]             = useState(true);
  const [sending, setSending]             = useState(false);
  const [showAiWrite, setShowAiWrite]     = useState(false);
  const [aiBullets, setAiBullets]         = useState('');
  const [aiTone, setAiTone]               = useState<AiTone>('professional');
  const [aiWriting, setAiWriting]         = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState(false);

  useEffect(() => { if (team) fetchRecipients(); }, [team?.id]);

  async function fetchRecipients() {
    if (!team) return;
    setLoading(true);

    const { data: players } = await supabase
      .from('players')
      .select('id, full_name')
      .eq('team_id', team.id)
      .order('full_name');

    const { data: invites } = await supabase
      .from('invites')
      .select('player_id, email, guardian_name')
      .eq('team_id', team.id)
      .not('player_id', 'is', null);

    const emailsMap: Record<string, string[]> = {};
    for (const inv of invites ?? []) {
      const pid = (inv as any).player_id;
      if (pid) {
        if (!emailsMap[pid]) emailsMap[pid] = [];
        emailsMap[pid].push((inv as any).email);
      }
    }

    const list: Recipient[] = (players ?? []).map((p: any) => ({
      player_id: p.id,
      player_name: p.full_name ?? 'Unknown',
      parent_email: emailsMap[p.id]?.[0] ?? null,
    }));

    setRecipients(list);
    setSelected(new Set(list.filter((r) => r.parent_email).map((r) => r.player_id)));
    setLoading(false);
  }

  function toggleRecipient(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const withEmail = recipients.filter((r) => r.parent_email).map((r) => r.player_id);
    if (withEmail.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(withEmail));
    }
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    if ((file.size ?? 0) > MAX_ATTACHMENT_BYTES) {
      Alert.alert('File too large', 'Maximum attachment size is 8 MB.');
      return;
    }
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    setAttachments((prev) => [
      ...prev,
      { uri: file.uri, name: file.name, mimeType: file.mimeType ?? 'application/octet-stream', base64, sizeLabel: fmtBytes(file.size ?? 0) },
    ]);
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const sizeEstimate = Math.round((asset.base64?.length ?? 0) * 0.75);
    if (sizeEstimate > MAX_ATTACHMENT_BYTES) {
      Alert.alert('File too large', 'Maximum attachment size is 8 MB.');
      return;
    }
    const ext  = asset.uri.split('.').pop() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    setAttachments((prev) => [
      ...prev,
      { uri: asset.uri, name: `image-${Date.now()}.${ext}`, mimeType: mime, base64: asset.base64 ?? '', sizeLabel: fmtBytes(sizeEstimate) },
    ]);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function writeWithAI() {
    if (!aiBullets.trim()) {
      Alert.alert('Add some bullet points', 'Tell the AI what you want to communicate.');
      return;
    }
    setAiWriting(true);
    const { data, error } = await supabase.functions.invoke('write-email', {
      body: {
        bullets:    aiBullets.trim(),
        tone:       aiTone,
        team_name:  team?.name ?? '',
        coach_name: profile?.full_name ?? 'Coach',
      },
    });
    setAiWriting(false);
    if (error || !data?.subject) {
      Alert.alert('AI Error', 'Could not generate the email. Please try again.');
      return;
    }
    setSubject(data.subject);
    setBody(data.body);
    setShowAiWrite(false);
    setAiBullets('');
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      Alert.alert('Required', 'Please enter a subject and message.');
      return;
    }
    const toSend = recipients.filter((r) => selected.has(r.player_id) && r.parent_email);
    if (toSend.length === 0) {
      Alert.alert('No recipients', 'Select at least one parent with an email address.');
      return;
    }

    const totalSize = attachments.reduce((s, a) => s + Math.round(a.base64.length * 0.75), 0);
    if (totalSize > 20 * 1024 * 1024) {
      Alert.alert('Attachments too large', 'Total attachments exceed 20 MB. Please remove some files.');
      return;
    }

    const recipientLabel = toSend.length === 1 ? '1 parent' : `${toSend.length} parents`;
    const attachLabel = attachments.length > 0 ? ` with ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}` : '';

    Alert.alert('Send Email', `Send to ${recipientLabel}${attachLabel}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          setSending(true);
          const { error } = await supabase.functions.invoke('send-team-email', {
            body: {
              to: toSend.map((r) => ({ email: r.parent_email, name: r.player_name })),
              cc: ccSelf && coachEmail ? [{ email: coachEmail, name: profile?.full_name ?? 'Coach' }] : [],
              subject: subject.trim(),
              body: body.trim(),
              reply_to: coachEmail,
              from_name: profile?.full_name ?? 'Coach',
              team_name: team?.name ?? '',
              attachments: attachments.map((a) => ({
                filename: a.name,
                content: a.base64,
                type: a.mimeType,
                disposition: 'attachment',
              })),
              club_logo_url: logoUrl,
              club_name: clubName,
              primary_color: primaryColor,
            },
          });
          setSending(false);
          if (error) {
            Alert.alert('Failed to send', 'Email service not yet configured. Set up the send-team-email Edge Function.');
          } else {
            Alert.alert('Sent!', `Email delivered to ${recipientLabel}.`);
            setSubject('');
            setBody('');
            setAttachments([]);
          }
        },
      },
    ]);
  }

  const withEmail     = recipients.filter((r) => r.parent_email);
  const allSelected   = withEmail.length > 0 && withEmail.every((r) => selected.has(r.player_id));
  const selectedCount = recipients.filter((r) => selected.has(r.player_id) && r.parent_email).length;

  if (loading) return <View style={st.center}><ActivityIndicator color={primaryColor} /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.emailScroll} keyboardShouldPersistTaps="handled">

        {/* Recipients — collapsible */}
        <Text style={st.emailSection}>RECIPIENTS</Text>
        <View style={st.emailCard}>
          {/* Summary row — always visible */}
          <TouchableOpacity style={st.recipientsHeader} onPress={() => setRecipientsOpen((o) => !o)} activeOpacity={0.75}>
            <View style={{ flex: 1 }}>
              <Text style={st.recipientsTitle}>
                {selectedCount === 0
                  ? 'No recipients selected'
                  : selectedCount === withEmail.length
                    ? `All ${selectedCount} parent${selectedCount > 1 ? 's' : ''}`
                    : `${selectedCount} of ${withEmail.length} parent${withEmail.length > 1 ? 's' : ''}`}
              </Text>
              {!recipientsOpen && selectedCount > 0 && (
                <Text style={st.recipientsPreview} numberOfLines={1}>
                  {recipients.filter((r) => selected.has(r.player_id) && r.parent_email).map((r) => r.player_name.split(' ')[0]).join(', ')}
                </Text>
              )}
            </View>
            <Ionicons name={recipientsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={DUGOUT_COLORS.ui.muted} />
          </TouchableOpacity>

          {/* Expanded list */}
          {recipientsOpen && (
            <View style={{ borderTopWidth: 1, borderTopColor: DUGOUT_COLORS.ui.border }}>
              <TouchableOpacity style={st.emailRow} onPress={toggleAll}>
                <View style={[st.checkBox, allSelected && [st.checkBoxOn, { backgroundColor: primaryColor, borderColor: primaryColor }]]}>
                  {allSelected && <Ionicons name="checkmark" size={14} color="#000" />}
                </View>
                <Text style={[st.emailLabel, { fontWeight: '700' }]}>Select all</Text>
              </TouchableOpacity>

              {recipients.length === 0 && (
                <Text style={{ color: DUGOUT_COLORS.ui.muted, padding: 16 }}>No players on roster yet.</Text>
              )}

              {recipients.map((r, i) => (
                <View key={r.player_id}>
                  <View style={st.divider} />
                  <TouchableOpacity
                    style={[st.emailRow, !r.parent_email && { opacity: 0.4 }]}
                    onPress={() => r.parent_email && toggleRecipient(r.player_id)}
                    disabled={!r.parent_email}
                  >
                    <View style={[st.checkBox, selected.has(r.player_id) && !!r.parent_email && [st.checkBoxOn, { backgroundColor: primaryColor, borderColor: primaryColor }]]}>
                      {selected.has(r.player_id) && r.parent_email && <Ionicons name="checkmark" size={14} color="#000" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.emailLabel}>{r.player_name}</Text>
                      <Text style={st.emailMeta}>{r.parent_email ?? 'No parent email on file'}</Text>
                    </View>
                    {!r.parent_email && (
                      <Ionicons name="alert-circle-outline" size={16} color={DUGOUT_COLORS.ui.muted} />
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Compose */}
        <View style={st.emailComposeHeader}>
          <Text style={st.emailSection}>COMPOSE</Text>
          <TouchableOpacity style={[st.templateBtn, { borderColor: rgba(0.3), backgroundColor: rgba(0.08) }]} onPress={() => setShowAiWrite(true)}>
            <Ionicons name="sparkles-outline" size={14} color={primaryColor} />
            <Text style={[st.templateBtnText, { color: primaryColor }]}>AI Write</Text>
          </TouchableOpacity>
        </View>

        <View style={st.emailCard}>
          <TextInput
            style={st.emailSubjectInput}
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor={DUGOUT_COLORS.ui.muted}
          />
          <View style={st.divider} />
          <TextInput
            style={st.emailBodyInput}
            value={body}
            onChangeText={setBody}
            placeholder="Write your message..."
            placeholderTextColor={DUGOUT_COLORS.ui.muted}
            multiline
            textAlignVertical="top"
          />
          {body.length > 0 && (
            <Text style={st.charCount}>{body.length} chars</Text>
          )}
        </View>

        {/* Attachments */}
        <Text style={[st.emailSection, { marginTop: 20 }]}>ATTACHMENTS</Text>
        <View style={st.emailCard}>
          {attachments.map((a, i) => (
            <View key={i}>
              {i > 0 && <View style={st.divider} />}
              <View style={st.attachRow}>
                <Ionicons
                  name={a.mimeType.startsWith('image/') ? 'image-outline' : 'document-outline'}
                  size={18}
                  color={primaryColor}
                />
                <View style={{ flex: 1 }}>
                  <Text style={st.attachName} numberOfLines={1}>{a.name}</Text>
                  <Text style={st.attachSize}>{a.sizeLabel}</Text>
                </View>
                <TouchableOpacity onPress={() => removeAttachment(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={20} color={DUGOUT_COLORS.ui.muted} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={attachments.length > 0 ? { borderTopWidth: 1, borderTopColor: DUGOUT_COLORS.ui.border } : {}}>
            <View style={st.attachActions}>
              <TouchableOpacity style={st.attachBtn} onPress={pickDocument}>
                <Ionicons name="document-attach-outline" size={16} color={primaryColor} />
                <Text style={[st.attachBtnText, { color: primaryColor }]}>File</Text>
              </TouchableOpacity>
              <View style={st.attachBtnDivider} />
              <TouchableOpacity style={st.attachBtn} onPress={pickImage}>
                <Ionicons name="image-outline" size={16} color={primaryColor} />
                <Text style={[st.attachBtnText, { color: primaryColor }]}>Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Options */}
        <Text style={[st.emailSection, { marginTop: 20 }]}>OPTIONS</Text>
        <View style={st.emailCard}>
          <View style={st.emailRow}>
            <Ionicons name="copy-outline" size={16} color={DUGOUT_COLORS.ui.muted} style={{ marginRight: 4 }} />
            <Text style={[st.emailLabel, { flex: 1 }]}>CC myself</Text>
            <Switch
              value={ccSelf}
              onValueChange={setCcSelf}
              trackColor={{ false: DUGOUT_COLORS.ui.border, true: primaryColor }}
              thumbColor="#fff"
            />
          </View>
          {coachEmail && (
            <View>
              <View style={st.divider} />
              <View style={[st.emailRow, { paddingVertical: 10 }]}>
                <Ionicons name="arrow-undo-outline" size={16} color={DUGOUT_COLORS.ui.muted} style={{ marginRight: 4 }} />
                <Text style={st.emailMeta}>Replies go to {coachEmail}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Send */}
        <TouchableOpacity
          style={[st.sendEmailBtn, { backgroundColor: primaryColor }, (sending || selectedCount === 0) && st.sendEmailBtnOff]}
          onPress={handleSend}
          disabled={sending || selectedCount === 0}
        >
          {sending
            ? <ActivityIndicator color="#000" />
            : <Text style={st.sendEmailBtnText}>
                {selectedCount > 0
                  ? `Send to ${selectedCount} parent${selectedCount > 1 ? 's' : ''}${attachments.length > 0 ? ` · ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}` : ''}`
                  : 'Select recipients'}
              </Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* AI Write modal */}
      <Modal visible={showAiWrite} animationType="slide" transparent presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.sheet}>
            <View style={st.sheetHandle} />
            <View style={st.sheetHeader}>
              <TouchableOpacity onPress={() => { setShowAiWrite(false); setAiBullets(''); }}>
                <Text style={st.sheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={st.sheetTitle}>AI Write</Text>
              <TouchableOpacity onPress={writeWithAI} disabled={aiWriting || !aiBullets.trim()}>
                {aiWriting
                  ? <ActivityIndicator size="small" color={primaryColor} />
                  : <Text style={[st.sheetSave, { color: primaryColor, opacity: !aiBullets.trim() ? 0.4 : 1 }]}>Write</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView style={st.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={st.fieldLabel}>TONE</Text>
              <View style={st.toneRow}>
                {AI_TONES.map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={[st.toneBtn, aiTone === key && [st.toneBtnActive, { backgroundColor: rgba(0.1), borderColor: rgba(0.4) }]]}
                    onPress={() => setAiTone(key)}
                  >
                    <Text style={[st.toneBtnText, aiTone === key && [st.toneBtnTextActive, { color: primaryColor }]]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[st.fieldLabel, { marginTop: 20 }]}>WHAT TO COMMUNICATE</Text>
              <TextInput
                style={[st.fieldInput, st.fieldTextarea, { height: 180 }]}
                value={aiBullets}
                onChangeText={setAiBullets}
                placeholder={"- Remind parents about Saturday's game\n- Arrive 30 mins early for warm-up\n- Kit colour is red this week"}
                placeholderTextColor={DUGOUT_COLORS.ui.muted}
                multiline
                textAlignVertical="top"
                autoFocus
              />
              <Text style={st.aiHint}>
                One bullet per line. AI will write a professional email covering all your points.
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DUGOUT_COLORS.ui.background },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 64, paddingBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: DUGOUT_COLORS.ui.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: DUGOUT_COLORS.ui.textSecondary, marginTop: 1 },

  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: DUGOUT_COLORS.ui.surface, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border },
  tabsTwo: {},
  tab: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: DUGOUT_COLORS.brand.green },
  tabText: { fontSize: 12, fontWeight: '600', color: DUGOUT_COLORS.ui.muted },
  tabTextActive: { color: '#000' },

  // Conversation list
  convoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border },
  convoRowTeam: { backgroundColor: 'rgba(34,197,94,0.04)' },
  convoAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  convoAvatarTeam: { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.25)' },
  convoAvatarText: { fontSize: 15, fontWeight: '800', color: DUGOUT_COLORS.brand.green },
  convoName: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text, marginBottom: 2 },
  convoPreview: { fontSize: 13, color: DUGOUT_COLORS.ui.textSecondary },
  convoTime: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, flexShrink: 0 },

  fab: { position: 'absolute', bottom: 24, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: DUGOUT_COLORS.brand.green, alignItems: 'center', justifyContent: 'center', shadowColor: DUGOUT_COLORS.brand.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  emptySub: { fontSize: 13, color: DUGOUT_COLORS.ui.textSecondary, textAlign: 'center', paddingHorizontal: 40 },

  // Sheet
  sheet: { flex: 1, marginTop: 60, backgroundColor: DUGOUT_COLORS.ui.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: DUGOUT_COLORS.ui.border, alignSelf: 'center', marginTop: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  sheetCancel: { fontSize: 15, color: DUGOUT_COLORS.ui.muted },
  sheetSave: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.brand.green },
  sheetBody: { padding: 20 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 15, color: DUGOUT_COLORS.ui.text },
  groupNameInput: { backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: DUGOUT_COLORS.ui.text, marginTop: 12 },
  selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: DUGOUT_COLORS.brand.green, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 13, fontWeight: '600', color: '#000' },

  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border },
  checkBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: DUGOUT_COLORS.ui.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: DUGOUT_COLORS.brand.green, borderColor: DUGOUT_COLORS.brand.green },
  pickerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: DUGOUT_COLORS.brand.green, alignItems: 'center', justifyContent: 'center' },
  pickerAvatarText: { fontSize: 14, fontWeight: '800', color: '#000' },
  pickerName: { fontSize: 15, fontWeight: '600', color: DUGOUT_COLORS.ui.text, marginBottom: 2 },
  pickerRole: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary },

  // Announcements
  aList: { padding: 16, paddingBottom: 100, flexGrow: 1 },
  aCard: { backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  aCardTop: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  pinnedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  pinnedText: { fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.brand.green, letterSpacing: 0.3 },
  aTitle: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text, marginBottom: 4 },
  aMeta: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary },
  aBody: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: DUGOUT_COLORS.ui.border, paddingTop: 14 },
  aBodyText: { fontSize: 14, color: DUGOUT_COLORS.ui.text, lineHeight: 22 },
  aActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  aActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.08)' },
  aActionDanger: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' },
  aActionText: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.brand.green },

  // Announcements modal
  fieldLabel: { fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, letterSpacing: 0.8, marginBottom: 8 },
  fieldInput: { backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: DUGOUT_COLORS.ui.text },
  fieldTextarea: { height: 120, textAlignVertical: 'top' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingVertical: 4 },
  pinLabel: { fontSize: 15, fontWeight: '500', color: DUGOUT_COLORS.ui.textSecondary },

  // Email tab
  emailScroll: { padding: 16, paddingBottom: 60 },
  emailSection: { fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, letterSpacing: 0.8, marginBottom: 8 },
  emailCard: { backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, borderRadius: 16, overflow: 'hidden' },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  emailLabel: { fontSize: 15, color: DUGOUT_COLORS.ui.text },
  emailMeta: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary, marginTop: 1 },
  emailSubjectInput: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: DUGOUT_COLORS.ui.text },
  emailBodyInput: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: DUGOUT_COLORS.ui.text, minHeight: 140, textAlignVertical: 'top' },
  divider: { height: 1, backgroundColor: DUGOUT_COLORS.ui.border, marginLeft: 14 },
  sendEmailBtn: { backgroundColor: DUGOUT_COLORS.brand.green, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  sendEmailBtnOff: { opacity: 0.4 },
  unreadBadge: { backgroundColor: DUGOUT_COLORS.brand.green, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { fontSize: 11, fontWeight: '800', color: '#000', textAlign: 'center' },

  sendEmailBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },

  // Recipients collapsible
  recipientsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  recipientsTitle: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  recipientsPreview: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary, marginTop: 2 },

  // Email compose extras
  emailComposeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  templateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.08)' },
  templateBtnText: { fontSize: 12, fontWeight: '600', color: DUGOUT_COLORS.brand.green },
  charCount: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, textAlign: 'right', paddingRight: 14, paddingBottom: 8 },

  // Attachments
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  attachName: { fontSize: 14, fontWeight: '600', color: DUGOUT_COLORS.ui.text },
  attachSize: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary, marginTop: 1 },
  attachActions: { flexDirection: 'row' },
  attachBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  attachBtnText: { fontSize: 14, fontWeight: '600', color: DUGOUT_COLORS.brand.green },
  attachBtnDivider: { width: 1, backgroundColor: DUGOUT_COLORS.ui.border },

  // Pinned team chat pill
  pinnedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  pinnedPillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // DMs section label
  dmSectionLabel: { fontSize: 10, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },

  // AI Write modal
  toneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toneBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, backgroundColor: DUGOUT_COLORS.ui.surface },
  toneBtnActive: {},
  toneBtnText: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.ui.muted },
  toneBtnTextActive: {},
  aiHint: { fontSize: 12, color: DUGOUT_COLORS.ui.muted, marginTop: 10, lineHeight: 17 },
});
