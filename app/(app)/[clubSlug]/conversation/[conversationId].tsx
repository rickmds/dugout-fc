import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import { uniqueChannelName } from '../../../../lib/realtime';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';
import { sendTeamPush, sendProfilesPush } from '../../../../lib/push';

type Message = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  sender_name: string | null;
  edited?: boolean;
};

type ReactionSummary = { emoji: string; count: number; mine: boolean };

const COACH_ROLES = new Set(['coach', 'org_admin', 'app_admin']);
const REACTION_EMOJIS = ['👍', '👎', '❤️', '⚽', '😂', '🔥'];

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

function groupReactions(
  rows: { message_id: string; emoji: string; profile_id: string }[],
  myProfileId: string,
): Record<string, ReactionSummary[]> {
  const byMessage: Record<string, Record<string, ReactionSummary>> = {};
  for (const r of rows) {
    const forMsg = (byMessage[r.message_id] ??= {});
    const entry = (forMsg[r.emoji] ??= { emoji: r.emoji, count: 0, mine: false });
    entry.count += 1;
    if (r.profile_id === myProfileId) entry.mine = true;
  }
  const out: Record<string, ReactionSummary[]> = {};
  for (const [messageId, byEmoji] of Object.entries(byMessage)) {
    out[messageId] = Object.values(byEmoji);
  }
  return out;
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
  const [dmParticipantIds, setDmParticipantIds] = useState<string[]>([]);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [loading, setLoading]         = useState(true);
  const [hasMore, setHasMore]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText]               = useState('');
  const [sending, setSending]         = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editText, setEditText]       = useState('');
  const [reactions, setReactions]     = useState<Record<string, ReactionSummary[]>>({});
  const [reactionSheetMsg, setReactionSheetMsg] = useState<Message | null>(null);
  const listRef    = useRef<FlatList>(null);
  const editRef    = useRef<TextInput>(null);
  // Set right before the initial batch loads, cleared the first time the
  // list actually reports a real layout — scrollToEnd() only works once
  // FlatList knows the content's true height, which a fixed setTimeout can
  // only ever guess at (wrong on a slow device or a long history). Left
  // false afterward so loading earlier messages or a new message arriving
  // doesn't re-trigger this — only the initial open should force-scroll.
  const awaitingInitialLayoutRef = useRef(false);

  const isCoach = COACH_ROLES.has(profile?.role ?? '');

  useEffect(() => {
    if (!conversationId || !profile) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    bootstrap().then((fn) => {
      if (cancelled) { fn?.(); return; }
      cleanup = fn;
    });
    return () => { cancelled = true; cleanup?.(); };
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

      if (ct === 'direct') {
        const { data: parts } = await supabase
          .from('conversation_participants')
          .select('profile_id')
          .eq('conversation_id', conversationId);
        setDmParticipantIds(
          ((parts ?? []) as { profile_id: string }[])
            .map(p => p.profile_id)
            .filter(id => id !== profile?.id)
        );
      }
    }

    const { error: partErr } = await supabase.from('conversation_participants').upsert(
      { conversation_id: conversationId, profile_id: profile.id },
      { onConflict: 'conversation_id,profile_id', ignoreDuplicates: true },
    );
    if (partErr) console.error('[Conversation] participant upsert error:', partErr.message);

    markConversationRead();
    await fetchMessages();
    setLoading(false);
    return subscribe();
  }

  // Opening this screen is the only real signal that a message got read —
  // nothing else ever clears new_message/new_dm notification rows (only
  // the separate Notification Centre screen does, when a specific
  // notification there gets tapped), so the Chat tab's badge count stayed
  // stuck even after someone had actually read the conversation.
  async function markConversationRead() {
    if (!conversationId || !profile) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('profile_id', profile.id)
      .eq('read', false)
      .in('type', ['new_message', 'new_dm'])
      .filter('data->>conversation_id', 'eq', conversationId);
  }

  const PAGE = 80;

  async function fetchMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('id, body, created_at, sender_id, edited, profiles:sender_id(full_name)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE + 1);

    if (error) {
      console.error('[Conversation] fetchMessages error:', error.message);
      Alert.alert('Could not load messages', error.message);
      return;
    }

    const rows = data ?? [];
    setHasMore(rows.length > PAGE);
    const page = rows.slice(0, PAGE).reverse();
    const mapped: Message[] = page.map((m: any) => ({
      id: m.id, body: m.body, created_at: m.created_at,
      sender_id: m.sender_id, sender_name: m.profiles?.full_name ?? null,
      edited: m.edited ?? false,
    }));
    awaitingInitialLayoutRef.current = true;
    setMessages(mapped);
    fetchReactions(mapped.map((m) => m.id));
  }

  async function fetchReactions(messageIds: string[]) {
    if (!messageIds.length) return;
    const { data } = await supabase
      .from('message_reactions')
      .select('message_id, emoji, profile_id')
      .in('message_id', messageIds);
    setReactions((prev) => ({ ...prev, ...groupReactions(data ?? [], profile?.id ?? '') }));
  }

  async function loadEarlier() {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    const oldest = messages[0].created_at;
    const { data, error } = await supabase
      .from('messages')
      .select('id, body, created_at, sender_id, edited, profiles:sender_id(full_name)')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE + 1);
    setLoadingMore(false);
    if (error) return;
    const rows = data ?? [];
    setHasMore(rows.length > PAGE);
    const page = rows.slice(0, PAGE).reverse();
    const older: Message[] = page.map((m: any) => ({
      id: m.id, body: m.body, created_at: m.created_at,
      sender_id: m.sender_id, sender_name: m.profiles?.full_name ?? null,
      edited: m.edited ?? false,
    }));
    setMessages((prev) => [...older, ...prev]);
    fetchReactions(older.map((m) => m.id));
  }

  function subscribe() {
    const channel = supabase
      .channel(uniqueChannelName(`dm:${conversationId}`))
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
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'message_reactions',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const raw = payload.new as any;
        setReactions((prev) => {
          const existing = prev[raw.message_id] ?? [];
          const i = existing.findIndex((r) => r.emoji === raw.emoji);
          const mine = raw.profile_id === profile?.id;
          const next = i === -1
            ? [...existing, { emoji: raw.emoji, count: 1, mine }]
            : existing.map((r, idx) => idx === i ? { ...r, count: r.count + 1, mine: r.mine || mine } : r);
          return { ...prev, [raw.message_id]: next };
        });
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'message_reactions',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const raw = payload.old as any;
        setReactions((prev) => {
          const existing = prev[raw.message_id];
          if (!existing) return prev;
          const i = existing.findIndex((r) => r.emoji === raw.emoji);
          if (i === -1) return prev;
          const wasMine = raw.profile_id === profile?.id;
          const nextCount = existing[i].count - 1;
          const next = nextCount <= 0
            ? existing.filter((_, idx) => idx !== i)
            : existing.map((r, idx) => idx === i ? { ...r, count: nextCount, mine: wasMine ? false : r.mine } : r);
          return { ...prev, [raw.message_id]: next };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!profile) return;
    const existing = reactions[messageId]?.find((r) => r.emoji === emoji);
    if (existing?.mine) {
      await supabase.from('message_reactions').delete()
        .eq('message_id', messageId).eq('profile_id', profile.id).eq('emoji', emoji);
    } else {
      await supabase.from('message_reactions').insert({
        message_id: messageId, conversation_id: conversationId, profile_id: profile.id, emoji,
      });
    }
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
        if (convType === 'team_group' && convTeamId) {
          sendTeamPush({
            teamId: convTeamId,
            title: profile?.full_name ?? 'New message',
            body: body.slice(0, 120),
            excludeProfileId: profile?.id,
            data: { type: 'new_message', conversation_id: conversationId },
          });
        } else if (convType === 'direct' && dmParticipantIds.length > 0) {
          sendProfilesPush({
            profileIds: dmParticipantIds,
            excludeProfileId: profile?.id,
            title: profile?.full_name ?? 'New message',
            body: body.slice(0, 120),
            data: { type: 'new_dm', conversation_id: conversationId },
          });
        }
      }
    } finally {
      setSending(false);
    }
  }

  // Used to just no-op for anyone who couldn't edit/delete (most people, on
  // most messages) — now opens the reaction sheet for everyone, with
  // Edit/Delete added below the emoji row only when applicable.
  function onLongPress(msg: Message) {
    setReactionSheetMsg(msg);
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
      <ClubHeader
        title={convType === 'team_group' ? (team?.name ?? title) : title}
        subtitle={convType === 'team_group' ? 'Team Chat' : 'Direct Message'}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={st.center}><ActivityIndicator color={primaryColor} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={st.list}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={7}
          onContentSizeChange={() => {
            if (!awaitingInitialLayoutRef.current) return;
            awaitingInitialLayoutRef.current = false;
            listRef.current?.scrollToEnd({ animated: false });
            // Android can report content size before the list has fully
            // settled (removeClippedSubviews made this worse, so it's been
            // removed above) — a second pass after layout truly finishes
            // catches the cases where the first scrollToEnd lands short.
            setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
          }}
          ListHeaderComponent={hasMore ? (
            <TouchableOpacity
              onPress={loadEarlier}
              disabled={loadingMore}
              style={st.loadEarlierBtn}
              activeOpacity={0.7}
            >
              {loadingMore
                ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
                : <Text style={st.loadEarlierText}>Load earlier messages</Text>}
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={st.emptyIcon}>
                <Ionicons name="chatbubble-outline" size={28} color={PULSE_COLORS.ui.muted} />
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

                  {!!reactions[item.id]?.length && (
                    <View style={[st.reactionRow, isMe && { justifyContent: 'flex-end' }]}>
                      {reactions[item.id].map((r) => (
                        <TouchableOpacity
                          key={r.emoji}
                          style={[st.reactionPill, r.mine && { borderColor: primaryColor, backgroundColor: rgba(0.12) }]}
                          onPress={() => toggleReaction(item.id, r.emoji)}
                          activeOpacity={0.7}
                        >
                          <Text style={st.reactionPillEmoji}>{r.emoji}</Text>
                          <Text style={[st.reactionPillCount, r.mine && { color: primaryColor }]}>{r.count}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
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
          placeholderTextColor={PULSE_COLORS.ui.muted}
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

      <Modal visible={!!reactionSheetMsg} animationType="slide" transparent onRequestClose={() => setReactionSheetMsg(null)}>
        <TouchableWithoutFeedback onPress={() => setReactionSheetMsg(null)}>
          <View style={st.reactionSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={st.reactionSheet}>
                <View style={st.sheetHandle} />
                <View style={st.reactionEmojiRow}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={st.reactionEmojiBtn}
                      onPress={() => {
                        if (reactionSheetMsg) toggleReaction(reactionSheetMsg.id, emoji);
                        setReactionSheetMsg(null);
                      }}
                    >
                      <Text style={st.reactionEmojiBtnText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {reactionSheetMsg && reactionSheetMsg.sender_id === profile?.id && (
                  <TouchableOpacity
                    style={st.reactionSheetAction}
                    onPress={() => {
                      setEditingId(reactionSheetMsg.id);
                      setEditText(reactionSheetMsg.body);
                      setReactionSheetMsg(null);
                    }}
                  >
                    <Ionicons name="pencil-outline" size={16} color={PULSE_COLORS.ui.text} />
                    <Text style={st.reactionSheetActionText}>Edit</Text>
                  </TouchableOpacity>
                )}
                {reactionSheetMsg && (reactionSheetMsg.sender_id === profile?.id || isCoach) && (
                  <TouchableOpacity
                    style={st.reactionSheetAction}
                    onPress={() => {
                      const msg = reactionSheetMsg;
                      setReactionSheetMsg(null);
                      if (msg) confirmDelete(msg);
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color={PULSE_COLORS.status.error} />
                    <Text style={[st.reactionSheetActionText, { color: PULSE_COLORS.status.error }]}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={st.reactionSheetCancel} onPress={() => setReactionSheetMsg(null)}>
                  <Text style={st.reactionSheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text, flexShrink: 1 },

  list: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  loadEarlierBtn: {
    alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16,
    marginTop: 8, marginBottom: 4,
    borderRadius: 20, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    minWidth: 48, alignItems: 'center',
  },
  loadEarlierText: { fontSize: 13, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text },
  emptySub: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary },

  msgWrap: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end', gap: 8 },
  msgWrapMe: { justifyContent: 'flex-end' },
  msgWrapThem: { justifyContent: 'flex-start' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.brand.green },
  msgCol: { maxWidth: '75%' },
  senderName: { fontSize: 11, color: PULSE_COLORS.ui.muted, marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: PULSE_COLORS.brand.green, borderBottomRightRadius: 4 },
  bubbleThem: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, color: PULSE_COLORS.ui.text, lineHeight: 20 },
  bubbleTextMe: { color: '#000' },
  timestampRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 4 },
  timestamp: { fontSize: 10, color: PULSE_COLORS.ui.muted },
  editedLabel: { fontSize: 10, color: PULSE_COLORS.ui.muted, fontStyle: 'italic' },

  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4, marginHorizontal: 4 },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  reactionPillEmoji: { fontSize: 12 },
  reactionPillCount: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },

  // Inline edit
  editWrap: { borderRadius: 14, borderWidth: 1.5, borderColor: PULSE_COLORS.brand.green, overflow: 'hidden' },
  editInput: {
    paddingHorizontal: 14, paddingVertical: 10,
    color: PULSE_COLORS.ui.text, fontSize: 15, lineHeight: 20,
    backgroundColor: PULSE_COLORS.ui.surface, minHeight: 40,
  },
  editActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  editCancel: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRightWidth: 0.5, borderRightColor: PULSE_COLORS.ui.border },
  editCancelText: { fontSize: 13, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
  editSave: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  editSaveText: { fontSize: 13, color: PULSE_COLORS.brand.green, fontWeight: '700' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.background,
  },
  input: {
    flex: 1, backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    color: PULSE_COLORS.ui.text, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: PULSE_COLORS.brand.green,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.4 },

  // Reaction sheet
  reactionSheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  reactionSheet: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 10, paddingBottom: 32, paddingHorizontal: 16,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: PULSE_COLORS.ui.border,
    alignSelf: 'center', marginBottom: 16,
  },
  reactionEmojiRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderRadius: 16,
    paddingVertical: 10, paddingHorizontal: 6, marginBottom: 8,
  },
  reactionEmojiBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  reactionEmojiBtnText: { fontSize: 26 },
  reactionSheetAction: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 6,
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
  },
  reactionSheetActionText: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  reactionSheetCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  reactionSheetCancelText: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.muted },
});
