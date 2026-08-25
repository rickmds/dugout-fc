import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { useTeam } from '../../../hooks/useTeam';
import { useAuth } from '../../../hooks/useAuth';
import { useClub } from '../../../hooks/useClub';
import { PULSE_COLORS } from '../../../constants/colors';
import ClubHeader from '../../../components/ui/ClubHeader';

const { width: W } = Dimensions.get('window');
const COLS = 3;
const GAP  = 2;
const CELL = Math.floor((W - GAP * (COLS - 1)) / COLS);
const PAGE = 30;

type Photo = {
  id: string;
  team_id: string;
  event_id: string | null;
  uploaded_by: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
  events: { title: string } | null;
  team_photo_likes: { profile_id: string }[];
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function publicUrl(path: string, thumb = false): string {
  const opts = thumb
    ? { transform: { width: CELL * 2, height: CELL * 2, resize: 'cover' as const } }
    : undefined;
  return supabase.storage.from('photos').getPublicUrl(path, opts).data.publicUrl;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function GalleryScreen() {
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const router = useRouter();
  const { team } = useTeam();
  const { profile } = useAuth();
  const { primaryColor } = useClub();
  // team.myRole is scoped to the currently-active team's own club — an
  // org_admin at their home club who's just a guest/parent elsewhere must
  // not get coach-level UI there just because profile.role is org_admin globally.
  const isCoach = team?.myRole === 'org_admin' || team?.myRole === 'coach';

  const [photos, setPhotos]         = useState<Photo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(true);
  const [filter, setFilter]         = useState<'all' | 'month'>('all');
  const offsetRef = useRef(0);

  const [viewerIndex, setViewerIndex]     = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const [uploadVisible, setUploadVisible] = useState(false);
  const [pendingAssets, setPendingAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [caption, setCaption]             = useState('');
  const [uploading, setUploading]         = useState(false);
  const [uploadDone, setUploadDone]       = useState(0);

  const fetchPhotos = useCallback(async (reset = false) => {
    if (!team) return;
    const off = reset ? 0 : offsetRef.current;
    if (!reset) setLoadingMore(true);

    let query = (supabase as any)
      .from('team_photos')
      .select('*, profiles!uploaded_by(full_name), events(title), team_photo_likes(profile_id)')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false });

    if (filter === 'month') {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      query = query.gte('created_at', start.toISOString());
    }

    const { data } = await query.range(off, off + PAGE - 1);
    const rows = (data as Photo[]) ?? [];

    if (reset) {
      setPhotos(rows);
      offsetRef.current = rows.length;
    } else {
      setPhotos(prev => [...prev, ...rows]);
      offsetRef.current += rows.length;
    }
    setHasMore(rows.length === PAGE);
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
  }, [team?.id, filter]);

  useEffect(() => {
    offsetRef.current = 0;
    setHasMore(true);
    setLoading(true);
    fetchPhotos(true);
  }, [fetchPhotos]);

  async function handlePickImages() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.75,
    });
    if (result.canceled || !result.assets.length) return;
    setPendingAssets(result.assets);
    setCaption('');
    setUploadDone(0);
    setUploadVisible(true);
  }

  async function handleUpload() {
    if (!team || !profile || !pendingAssets.length) return;
    setUploading(true);
    const totalCount = pendingAssets.length;
    const newPhotos: Photo[] = [];
    // Track per-photo success/failure instead of silently `continue`-ing
    // past a storage error — a flaky connection mid-batch used to still
    // close the modal and fire a success haptic even when only some
    // photos actually saved. Failed assets are kept in pendingAssets so
    // the user can retry without re-picking from their library.
    const failedAssets: ImagePicker.ImagePickerAsset[] = [];

    for (let i = 0; i < pendingAssets.length; i++) {
      setUploadDone(i);
      const asset = pendingAssets[i];
      try {
        const path = `${team.id}/${uid()}.jpg`;
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const { error: storageErr } = await supabase.storage
          .from('photos')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (storageErr) { failedAssets.push(asset); continue; }

        const { data: row } = await (supabase as any)
          .from('team_photos')
          .insert({
            team_id: team.id,
            uploaded_by: profile.id,
            storage_path: path,
            caption: caption.trim() || null,
          })
          .select('*, profiles!uploaded_by(full_name), events(title), team_photo_likes(profile_id)')
          .single();
        if (row) {
          newPhotos.push(row as Photo);
        } else {
          failedAssets.push(asset);
          // Row insert failed after the storage upload succeeded — clean up the orphaned file.
          supabase.storage.from('photos').remove([path]).catch(() => {});
        }
      } catch {
        failedAssets.push(asset);
      }
    }

    setPhotos(prev => [...newPhotos.reverse(), ...prev]);
    offsetRef.current += newPhotos.length;
    setUploading(false);

    if (failedAssets.length > 0) {
      setPendingAssets(failedAssets);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        newPhotos.length > 0 ? "Some photos didn't upload" : 'Upload failed',
        `${newPhotos.length} of ${totalCount} uploaded. ${failedAssets.length} failed — check your connection and try again.`
      );
    } else {
      setUploadVisible(false);
      setPendingAssets([]);
      setCaption('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  function handleLike(photo: Photo) {
    if (!profile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const liked = photo.team_photo_likes.some(l => l.profile_id === profile.id);
    setPhotos(prev => prev.map(p => {
      if (p.id !== photo.id) return p;
      const likes = liked
        ? p.team_photo_likes.filter(l => l.profile_id !== profile.id)
        : [...p.team_photo_likes, { profile_id: profile.id }];
      return { ...p, team_photo_likes: likes };
    }));
    if (liked) {
      (supabase as any).from('team_photo_likes').delete()
        .eq('photo_id', photo.id).eq('profile_id', profile.id);
    } else {
      (supabase as any).from('team_photo_likes')
        .insert({ photo_id: photo.id, profile_id: profile.id });
    }
  }

  function handleDelete(photo: Photo) {
    Alert.alert('Delete photo?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const snapshot = photos;
          setPhotos(prev => prev.filter(p => p.id !== photo.id));
          if (viewerVisible) setViewerVisible(false);
          const { error } = await (supabase as any).from('team_photos').delete().eq('id', photo.id);
          if (error) {
            setPhotos(snapshot);
            Alert.alert('Error', 'Could not delete photo.');
            return;
          }
          offsetRef.current = Math.max(0, offsetRef.current - 1);
          supabase.storage.from('photos').remove([photo.storage_path]);
        },
      },
    ]);
  }

  function openViewer(index: number) {
    setViewerIndex(index);
    setViewerVisible(true);
  }

  return (
    <View style={st.root}>
      <ClubHeader title="Gallery" onBack={() => router.back()} />

      {/* Filter bar */}
      <View style={st.filterBar}>
        {(['all', 'month'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[st.pill, filter === f && { backgroundColor: primaryColor }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[st.pillText, filter === f && { color: '#000' }]}>
              {f === 'all' ? 'All' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={primaryColor} size="large" />
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={p => p.id}
          numColumns={COLS}
          renderItem={({ item, index }) => (
            <TouchableOpacity onPress={() => openViewer(index)} activeOpacity={0.85}>
              <Image
                source={{ uri: publicUrl(item.storage_path, true) }}
                style={{ width: CELL, height: CELL }}
                contentFit="cover"
                recyclingKey={item.id}
                transition={150}
              />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          columnWrapperStyle={{ gap: GAP }}
          initialNumToRender={18}
          maxToRenderPerBatch={12}
          windowSize={5}
          removeClippedSubviews
          getItemLayout={(_, index) => ({
            length: CELL,
            offset: Math.floor(index / COLS) * (CELL + GAP),
            index,
          })}
          onEndReached={() => { if (hasMore && !loadingMore) fetchPhotos(); }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchPhotos(true); }}
              tintColor={primaryColor}
            />
          }
          ListFooterComponent={
            loadingMore
              ? <View style={st.footerLoader}><ActivityIndicator color={primaryColor} /></View>
              : null
          }
          ListEmptyComponent={
            <View style={st.empty}>
              <Ionicons name="images-outline" size={48} color={PULSE_COLORS.ui.muted} />
              <Text style={st.emptyTitle}>No photos yet</Text>
              <Text style={st.emptySub}>Tap + to share the first photo with your team.</Text>
            </View>
          }
          contentContainerStyle={photos.length === 0 ? { flex: 1 } : undefined}
        />
      )}

      {/* Upload FAB */}
      <TouchableOpacity
        style={[st.fab, { backgroundColor: primaryColor }]}
        onPress={handlePickImages}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#000" />
      </TouchableOpacity>

      {/* ── Photo Viewer ── */}
      <Modal
        visible={viewerVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={st.viewer}>
          <FlatList
            data={photos}
            keyExtractor={p => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={viewerIndex}
            getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
            renderItem={({ item }) => {
              const liked = !!profile && item.team_photo_likes.some(l => l.profile_id === profile.id);
              const likeCount = item.team_photo_likes.length;
              const canDelete = isCoach || item.uploaded_by === profile?.id;
              return (
                <View style={{ width: W, flex: 1 }}>
                  <Image
                    source={{ uri: publicUrl(item.storage_path) }}
                    style={st.viewerImg}
                    contentFit="contain"
                    transition={200}
                  />
                  <View style={st.viewerMeta}>
                    {item.caption ? (
                      <Text style={st.viewerCaption}>{item.caption}</Text>
                    ) : null}
                    <Text style={st.viewerByline}>
                      {item.profiles?.full_name ?? 'Team member'} · {timeAgo(item.created_at)}
                    </Text>
                    {item.events?.title ? (
                      <Text style={[st.viewerEvent, { color: primaryColor }]}>
                        {item.events.title}
                      </Text>
                    ) : null}
                    <View style={st.viewerActions}>
                      <TouchableOpacity style={st.actionBtn} onPress={() => handleLike(item)}>
                        <Ionicons
                          name={liked ? 'heart' : 'heart-outline'}
                          size={22}
                          color={liked ? '#EF4444' : '#fff'}
                        />
                        {likeCount > 0 && (
                          <Text style={st.actionCount}>{likeCount}</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={st.actionBtn}
                        onPress={() => Share.share({ url: publicUrl(item.storage_path) })}
                      >
                        <Ionicons name="share-outline" size={22} color="#fff" />
                      </TouchableOpacity>
                      {canDelete && (
                        <TouchableOpacity style={st.actionBtn} onPress={() => handleDelete(item)}>
                          <Ionicons name="trash-outline" size={20} color={PULSE_COLORS.ui.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />
          <TouchableOpacity style={st.closeBtn} onPress={() => setViewerVisible(false)}>
            <View style={st.closeBtnInner}>
              <Ionicons name="close" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Upload Sheet ── */}
      <Modal
        visible={uploadVisible}
        animationType="slide"
        transparent
        onRequestClose={() => !uploading && setUploadVisible(false)}
      >
        <KeyboardAvoidingView
          style={st.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => !uploading && setUploadVisible(false)}
          />
          <View style={st.sheet}>
            <View style={st.sheetHandle} />
            <Text style={st.sheetTitle}>
              {pendingAssets.length === 1 ? '1 photo' : `${pendingAssets.length} photos`} selected
            </Text>

            <FlatList
              data={pendingAssets}
              keyExtractor={(_, i) => String(i)}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 14 }}
              renderItem={({ item }) => (
                <Image source={{ uri: item.uri }} style={st.previewThumb} contentFit="cover" />
              )}
            />

            <TextInput
              style={st.captionInput}
              placeholder="Add a caption… (optional)"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={caption}
              onChangeText={setCaption}
              maxLength={200}
              editable={!uploading}
            />

            <TouchableOpacity
              style={[st.uploadBtn, { backgroundColor: primaryColor }, uploading && st.uploadBtnDisabled]}
              onPress={handleUpload}
              disabled={uploading}
              activeOpacity={0.85}
            >
              <Text style={st.uploadBtnText}>
                {uploading
                  ? `Uploading ${uploadDone + 1} of ${pendingAssets.length}…`
                  : `Share ${pendingAssets.length > 1 ? `${pendingAssets.length} Photos` : 'Photo'}`}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  filterBar: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  pill:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: PULSE_COLORS.ui.surface },
  pillText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.text },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },
  emptySub:   { fontSize: 14, color: PULSE_COLORS.ui.muted, textAlign: 'center', lineHeight: 20 },

  footerLoader: { height: 48, alignItems: 'center', justifyContent: 'center' },

  fab: {
    position: 'absolute', bottom: 32, right: 20,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
  },

  // Viewer
  viewer:       { flex: 1, backgroundColor: '#000' },
  viewerImg:    { width: W, flex: 1 },
  viewerMeta: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: 44,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  viewerCaption: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 4 },
  viewerByline:  { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  viewerEvent:   { fontSize: 12, fontWeight: '600', marginTop: 4 },
  viewerActions: { flexDirection: 'row', gap: 24, marginTop: 16 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount:   { fontSize: 14, fontWeight: '600', color: '#fff' },
  closeBtn:      { position: 'absolute', top: 52, right: 16 },
  closeBtnInner: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Upload sheet
  sheetOverlay:  { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: 40,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: PULSE_COLORS.ui.border,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text,
    paddingHorizontal: 16, marginBottom: 12,
  },
  previewThumb: { width: 72, height: 72, borderRadius: 8 },
  captionInput: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderRadius: 12, padding: 12,
    fontSize: 15, color: PULSE_COLORS.ui.text,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  uploadBtn:         { marginHorizontal: 16, padding: 15, borderRadius: 14, alignItems: 'center' },
  uploadBtnDisabled: { opacity: 0.65 },
  uploadBtnText:     { fontSize: 15, fontWeight: '800', color: '#000' },
});
