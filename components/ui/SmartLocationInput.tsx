import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';
import { useClub } from '../../hooks/useClub';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';
if (!PLACES_KEY && __DEV__) {
  console.warn('[SmartLocationInput] EXPO_PUBLIC_GOOGLE_PLACES_KEY is not set — location autocomplete will not work.');
}

type PlaceSuggestion = { place_id: string; description: string; structured_formatting?: { main_text: string; secondary_text?: string } };

// Google Places autocomplete + details lookup for an address field. Typing
// only searches — onResult only fires from a real tap on a suggestion, never
// from a keystroke, so a parent's location state can't get "poisoned" with
// a partial string.
export default function SmartLocationInput({
  onResult,
  initialValue = '',
}: {
  onResult: (r: { name: string; address?: string; lat?: number; lng?: number }) => void;
  initialValue?: string;
}) {
  const { primaryColor } = useClub();
  const [text, setText] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [fetching, setFetching] = useState(false);
  const [pinned, setPinned] = useState(!!initialValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(val: string) {
    setText(val);
    setPinned(false);
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 3) { setSuggestions([]); return; }
    timer.current = setTimeout(() => search(val), 350);
  }

  async function search(val: string) {
    if (!PLACES_KEY) { setSuggestions([]); return; }
    setFetching(true);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(val)}&key=${PLACES_KEY}&components=country:us`
      );
      const json = await res.json();
      setSuggestions((json.predictions ?? []).slice(0, 5));
    } catch { setSuggestions([]); }
    setFetching(false);
  }

  async function pick(s: PlaceSuggestion) {
    setText(s.description);
    setPinned(true);
    setSuggestions([]);
    const name = s.structured_formatting?.main_text ?? s.description;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${s.place_id}&fields=geometry&key=${PLACES_KEY}`
      );
      const json = await res.json();
      const loc = json.result?.geometry?.location;
      onResult({ name, address: s.description, lat: loc?.lat, lng: loc?.lng });
    } catch {
      onResult({ name, address: s.description });
    }
  }

  function clear() {
    setText(''); setSuggestions([]); setPinned(false);
    onResult({ name: '' });
  }

  return (
    <View style={{ zIndex: 20 }}>
      <View style={styles.inputRow}>
        <Ionicons
          name={pinned ? 'location' : 'location-outline'}
          size={16}
          color={pinned ? primaryColor : PULSE_COLORS.ui.muted}
        />
        <TextInput
          style={styles.inlineInput}
          value={text}
          onChangeText={handleChange}
          placeholder="Location name or address…"
          placeholderTextColor={PULSE_COLORS.ui.muted}
          returnKeyType="search"
        />
        {fetching && <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />}
        {text.length > 0 && !fetching && (
          <TouchableOpacity onPress={clear}>
            <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>
        )}
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={s.place_id}
              style={[styles.suggestionRow, i < suggestions.length - 1 && styles.suggestionBorder]}
              onPress={() => pick(s)}
            >
              <Ionicons name="location-outline" size={14} color={PULSE_COLORS.ui.muted} />
              <Text style={styles.suggestionText} numberOfLines={2}>{s.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  inlineInput: { flex: 1, color: PULSE_COLORS.ui.text, fontSize: 14 },
  suggestionBox: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 10, marginTop: 4, overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12,
  },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  suggestionText: { flex: 1, fontSize: 13, color: PULSE_COLORS.ui.text, lineHeight: 18 },
});
