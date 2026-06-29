import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { DUGOUT_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import { sendTeamPush } from '../../../../lib/push';

type Message = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  sender_name: string | null;
  edited?: boolean;
};

const COACH_ROLES = new Set(['coach', 'org_admin', 'app_admin']);

function buildDemoMessages(myId: string): Message[] {
  if (process.env.EXPO_PUBLIC_APP_ENV !== 'development') return [];
  return [
    { id: 'demo-1', body: "Don't forget shin guards and water tomorrow — it's going to be a warm one ☀️", created_at: new Date(Date.now() - 3_600_000 * 20).toISOString(), sender_id: myId, sender_name: 'Coach Mike' },
    { id: 'demo-2', body: "Will the game be on the main field or the training pitch?", created_at: new Date(Date.now() - 3_600_000 * 19).toISOString(), sender_id: 'parent1', sender_name: 'Sarah M.' },
    { id: 'demo-3', body: "Main field. Gates open at 9:00am, kickoff 10:00am sharp", created_at: new Date(Date.now() - 3_600_000 * 18).toISOString(), sender_id: myId, sender_name: 'Coach Mike' },
    { id: 'demo-4', body: "Jake will be there early to help set up ✅", created_at: new Date(Date.now() - 3_600_000 * 3).toISOString(), sender_id: 'parent2', sender_name: 'David P.' },
    { id: 'demo-5', body: "My son is running a bit late — should be there by 9:45", created_at: new Date(Date.now() - 1_800_000).toISOString(), sender_id: 'parent3', sender_name: 'Lisa T.' },
    { id: 'demo-6', body: "No worries, warm up starts at 9:30. Tell him to join straight in 👍", created_at: new Date(Date.now() - 900_000).toISOString(), sender_id: myId, sender_name: 'Coach Mike' },
  ];
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function ConversationScreen() {
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { profile } = useAuth();
  const { team } = useTeam();

  const [title, setTitle]           = useState<string>('Direct Message');
  const [convType, setConvType]     = useState<string | null>(null);
  const [convTeamId, setConvTeamId] = useState<string | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText]   = useState('');
  const listRef    = useRef<FlatList>(null);
  const editRef    = useRef<TextInput>(null);

  const isCoach = COACH_ROLES.has(profile?.role ?? '');

  useEffect(() => {
    if (!conversationId || !profile) return;
    let cleanup: (() => void) | undefined;
    bootstrap().then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [conversationId, profile?.id]);

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingId) setTimeout(() => editRef.current?.focus(), 50);
  }, [editingId]);

  async function bootstrap() {
    if (!conversationId || !profile) return;

    const { data: conv } = await supabase
      .from('conversations')
      .select('title, team_id, type')
      .eq('id', conversationId)
      .single();
    if (conv) {
      const ct = (conv as any).type as string | undefined;
      setConvType(ct ?? null);
      if (ct !== 'team_group') setTitle((conv as any).title ?? 'Direct Message');
      setConvTeamId((conv as any).team_id ?? null);
    }

    const { error: partErr } = await supabase.from('conversation_participants').upsert(
      { conversation_id: conversationId, profile_id: profile.id },
      { onConflict: 'conversation_id,profile_id', ignoreDuplicates: true },
    );
    if (partErr) console.error('[Conversation] participant upsert error:', partErr.message);

    await fetchMessages();
    setLoading(false);
    return subscribe();
  }

  async function fetchMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('id, body, created_at, sender_id, edited, profiles:sender_id(full_name)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      console.error('[Conversation] fetchMessages error:', error.message);
      Alert.alert('Could not load messages', error.message);
      return;
    }

    const mapped: Message[] = (data ?? []).map((m: any) => ({
      id: m.id, body: m.body, created_at: m.created_at,
      sender_id: m.sender_id, sender_name: m.profiles?.full_name ?? null,
      edited: m.edited ?? false,
    }));
    setMessages(mapped);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
  }

  function subscribe() {
    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        const raw = payload.new as any;
        setMessages((prev) => {
          if (prev.some((m) => m.id === raw.id)) return prev;
          return [...prev, { id: raw.id, body: raw.body, created_at: raw.created_at, sender_id: raw.sender_id, sender_name: null, edited: false }];
        });
        supabase.from('profiles').select('full_name').eq('id', raw.sender_id).single()
          .then(({ data }) => {
            if (!data) return;
            setMessages((prev) => prev.map((m) => m.id === raw.id ? { ...m, sender_name: (data as any).full_name } : m));
          });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const raw = payload.new as any;
        setMessages((prev) => prev.map((m) => m.id === raw.id ? { ...m, body: raw.body, edited: raw.edited ?? true } : m));
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const raw = payload.old as any;
        setMessages((prev) => prev.filter((m) => m.id !== raw.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  async function handleSend() {
    if (!text.trim() || !profile || sending) return;
    setSending(true);
    const body = text.trim();
    setText('');

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = { id: tempId, body, created_at: new Date().toISOString(), sender_id: profile.id, sender_name: profile.full_name ?? null };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const { data: inserted, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: profile.id, body })
        .select('id')
        .single();

      if (error) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setText(body);
        Alert.alert('Could not send', error.message);
      } else if (inserted) {
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: (inserted as any).id } : m));
        if (convTeamId) {
          sendTeamPush({
            teamId: convTeamId,
            title: profile?.full_name ?? 'New message',
            body: body.slice(0, 120),
            excludeProfileId: profile?.id,
            data: { type: 'new_dm', conversation_id: conversationId },
          });
        }
      }
    } finally {
      setSending(false);
    }
  }

  function onLongPress(msg: Message) {
    const isMe = msg.sender_id === profile?.id;
    const canDelete = isMe || isCoach;

    if (!isMe && !canDelete) return;

    const options: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];

    if (isMe) {
      options.push({ text: 'Edit', onPress: () => { setEditingId(msg.id); setEditText(msg.body); } });
    }
    if (canDelete) {
      options.push({ text: 'Delete', style: 'destructive', onPress: () => confirmDelete(msg) });
    }
    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Message', undefined, options);
  }

  function confirmDelete(msg: Message) {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          const { error } = await supabase.from('messages').delete().eq('id', msg.id);
          if (error) {
            setMessages((prev) => [...prev, msg].sort((a, b) => a.created_at.localeCompare(b.created_at)));
            Alert.alert('Could not delete', error.message);
          }
        },
      },
    ]);
  }

  async function saveEdit() {
    if (!editingId || !editText.trim()) { setEditingId(null); return; }
    const newBody = editText.trim();
    setMessages((prev) => prev.map((m) => m.id === editingId ? { ...m, body: newBody, edited: true } : m));
    setEditingId(null);
    const { error } = await supabase.from('messages').update({ body: newBody, edited: true } as any).eq('id', editingId);
    if (error) {
      Alert.alert('Could not edit', error.message);
      fetchMessages();
    }
  }

  return (
    <KeyboardAvoidingView
      style={st.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={DUGOUT_COLORS.ui.text} />
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <View style={[st.headerAvatar, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
            <Ionicons name={convType === 'team_group' ? 'people' : 'person'} size={16} color={primaryColor} />
          </View>
          <Text style={st.headerTitle} numberOfLines={1}>
            {convType === 'team_group' ? (team?.name ?? title) : title}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={primaryColor} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages.length > 0 ? messages : buildDemoMessages(profile?.id ?? '')}
          keyExtractor={(m) => m.id}
          contentContainerStyle={st.list}
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={st.emptyIcon}>
                <Ionicons name="chatbubble-outline" size={28} color={DUGOUT_COLORS.ui.muted} />
              </View>
              <Text style={st.emptyTitle}>Start the conversation</Text>
              <Text style={st.emptySub}>Send your first message below.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isMe = item.sender_id === profile?.id;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showSender = !isMe && item.sender_id !== prevMsg?.sender_id;
            const isEditing = editingId === item.id;

            return (
              <View style={[st.msgWrap, isMe ? st.msgWrapMe : st.msgWrapThem]}>
                {!isMe && (
                  <View style={[st.avatar, { opacity: showSender ? 1 : 0 }]}>
                    <Text style={[st.avatarText, { color: primaryColor }]}>{initials(item.sender_name)}</Text>
                  </View>
                )}
                <View style={st.msgCol}>
                  {showSender && <Text style={st.senderName}>{item.sender_name ?? 'Unknown'}</Text>}

                  {isEditing ? (
                    <View style={[st.editWrap, { borderColor: primaryColor }]}>
                      <TextInput
                        ref={editRef}
                        style={st.editInput}
                        value={editText}
                        onChangeText={setEditText}
                        multiline
                        autoFocus
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={saveEdit}
                      />
                      <View style={st.editActions}>
                        <TouchableOpacity onPress={() => setEditingId(null)} style={st.editCancel}>
                          <Text style={st.editCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={saveEdit} style={st.editSave}>
                          <Text style={[st.editSaveText, { color: primaryColor }]}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableWithoutFeedback onLongPress={() => onLongPress(item)}>
                      <View style={[st.bubble, isMe ? [st.bubbleMe, { backgroundColor: primaryColor }] : st.bubbleThem]}>
                        <Text style={[st.bubbleText, isMe && st.bubbleTextMe]}>{item.body}</Text>
                      </View>
                    </TouchableWithoutFeedback>
                  )}

                  <View style={[st.timestampRow, isMe && { justifyContent: 'flex-end' }]}>
                    <Text style={st.timestamp}>{timeLabel(item.created_at)}</Text>
                    {item.edited && <Text style={st.editedLabel}>edited</Text>}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={st.inputRow}>
        <TextInput
          style={st.input}
          value={text}
          onChangeText={setText}
          placeholder="Message..."
          placeholderTextColor={DUGOUT_COLORS.ui.muted}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[st.sendBtn, { backgroundColor: primaryColor }, (!text.trim() || sending) && st.sendBtnOff]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={sending ? 1 : 0.7}
        >
          {sending
            ? <ActivityIndicator size="small" color="#000" />
            : <Ionicons name="send" size={16} color={sending ? '#4b5563' : '#000'} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text, flexShrink: 1 },

  list: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  emptySub: { fontSize: 13, color: DUGOUT_COLORS.ui.textSecondary },

  msgWrap: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end', gap: 8 },
  msgWrapMe: { justifyContent: 'flex-end' },
  msgWrapThem: { justifyContent: 'flex-start' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 10, fontWeight: '700', color: DUGOUT_COLORS.brand.green },
  msgCol: { maxWidth: '75%' },
  senderName: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: DUGOUT_COLORS.brand.green, borderBottomRightRadius: 4 },
  bubbleThem: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, color: DUGOUT_COLORS.ui.text, lineHeight: 20 },
  bubbleTextMe: { color: '#000' },
  timestampRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 4 },
  timestamp: { fontSize: 10, color: DUGOUT_COLORS.ui.muted },
  editedLabel: { fontSize: 10, color: DUGOUT_COLORS.ui.muted, fontStyle: 'italic' },

  // Inline edit
  editWrap: { borderRadius: 14, borderWidth: 1.5, borderColor: DUGOUT_COLORS.brand.green, overflow: 'hidden' },
  editInput: {
    paddingHorizontal: 14, paddingVertical: 10,
    color: DUGOUT_COLORS.ui.text, fontSize: 15, lineHeight: 20,
    backgroundColor: DUGOUT_COLORS.ui.surface, minHeight: 40,
  },
  editActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: DUGOUT_COLORS.ui.border },
  editCancel: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRightWidth: 0.5, borderRightColor: DUGOUT_COLORS.ui.border },
  editCancelText: { fontSize: 13, color: DUGOUT_COLORS.ui.muted, fontWeight: '600' },
  editSave: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  editSaveText: { fontSize: 13, color: DUGOUT_COLORS.brand.green, fontWeight: '700' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.background,
  },
  input: {
    flex: 1, backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    color: DUGOUT_COLORS.ui.text, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: DUGOUT_COLORS.brand.green,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.4 },
});
