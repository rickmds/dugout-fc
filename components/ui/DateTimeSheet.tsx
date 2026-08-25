import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';

const ITEM_H = 60; // bigger, easier-to-hit touch targets than the old 54
const SIDE   = 2;
const COL_H  = ITEM_H * (SIDE * 2 + 1);

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Math.round(minutes / interval), clamped to the last valid step, silently
// picked the wrong nearest mark whenever minutes rounded up past the final
// step (e.g. 6:58 with a 5-min interval: true nearest snap is 7:00, but
// clamping landed on 6:55 — 3-4 min off and stuck in the same hour). Roll
// the extra step into the next hour instead of clamping it away.
function roundToInterval(hours24: number, minutes: number, interval: number): { hourIdx: number; minIdx: number; periodIdx: number } {
  const stepsPerHour = 60 / interval;
  let minIdx = Math.round(minutes / interval);
  let h = hours24;
  if (minIdx >= stepsPerHour) {
    minIdx = 0;
    h = (h + 1) % 24;
  }
  const hourIdx = h % 12 === 0 ? 11 : (h % 12) - 1;
  const periodIdx = h >= 12 ? 1 : 0;
  return { hourIdx, minIdx, periodIdx };
}

// Month grid — replaces a day-by-day wheel (which meant scrolling through
// every single day to reach anything more than a couple weeks out) with
// the standard calendar pattern: jump by month, tap the day directly.
function MonthCalendar({
  viewYear, viewMonth, selected, minimumDate, today, onPrevMonth, onNextMonth, onSelectDay,
}: {
  viewYear: number; viewMonth: number; selected: Date; minimumDate?: Date; today: Date;
  onPrevMonth: () => void; onNextMonth: () => void; onSelectDay: (day: number) => void;
}) {
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const numDays  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: numDays }, (_, i) => i + 1)];

  const minDateOnly = minimumDate ? new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate()) : null;
  const prevDisabled = minDateOnly ? (viewYear < minDateOnly.getFullYear() || (viewYear === minDateOnly.getFullYear() && viewMonth <= minDateOnly.getMonth())) : false;

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
      <View style={cs.navRow}>
        <TouchableOpacity onPress={onPrevMonth} disabled={prevDisabled} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color={prevDisabled ? '#333' : '#FFF'} />
        </TouchableOpacity>
        <Text style={cs.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={onNextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={cs.weekdayRow}>
        {WEEKDAY_LABELS.map((d, i) => (
          <View key={i} style={cs.cell}><Text style={cs.weekdayText}>{d}</Text></View>
        ))}
      </View>

      <View style={cs.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={i} style={cs.cell} />;
          const cellDate = new Date(viewYear, viewMonth, day);
          const disabled = minDateOnly ? cellDate.getTime() < minDateOnly.getTime() : false;
          const isSelected = sameDay(cellDate, selected);
          const isToday = sameDay(cellDate, today);
          return (
            <View key={i} style={cs.cell}>
              <TouchableOpacity
                disabled={disabled}
                onPress={() => onSelectDay(day)}
                style={[
                  cs.dayBtn,
                  isSelected && { backgroundColor: PULSE_COLORS.brand.green },
                  !isSelected && isToday && cs.dayBtnToday,
                ]}
              >
                <Text style={[
                  cs.dayText,
                  disabled && cs.dayTextDisabled,
                  isSelected && cs.dayTextSelected,
                ]}>{day}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: { fontSize: 12, fontWeight: '600', color: '#666' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayBtnToday: { borderWidth: 1, borderColor: PULSE_COLORS.brand.green },
  dayText: { fontSize: 15, fontWeight: '500', color: '#FFF' },
  dayTextDisabled: { color: '#3A3A3A' },
  dayTextSelected: { fontWeight: '700', color: '#000' },
});

const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];

function WheelCol({
  items, initIndex, onSelect, flex = 1,
}: {
  items: string[]; initIndex: number; onSelect: (i: number) => void; flex?: number;
}) {
  const listRef = useRef<FlatList>(null);
  const [sel, setSel] = useState(initIndex);
  const padded = [...Array(SIDE).fill(''), ...items, ...Array(SIDE).fill('')];

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: Math.max(0, initIndex) * ITEM_H,
        animated: false,
      });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  function settle(e: any) {
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, raw));
    setSel(clamped);
    onSelect(clamped);
  }

  return (
    <View style={{ flex, height: COL_H, overflow: 'hidden' }}>
      <FlatList
        ref={listRef}
        data={padded}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate={0.96}
        bounces={false}
        getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
        onMomentumScrollEnd={settle}
        renderItem={({ item, index: i }) => {
          const dist = Math.abs((i - SIDE) - sel);
          const itemIdx = i - SIDE;
          // Tapping any visible row jumps straight to it, instead of
          // requiring an exactly-tuned flick to land on it.
          return (
            <TouchableOpacity
              activeOpacity={item ? 0.5 : 1}
              disabled={!item}
              onPress={() => {
                listRef.current?.scrollToOffset({ offset: itemIdx * ITEM_H, animated: true });
                setSel(itemIdx);
                onSelect(itemIdx);
              }}
              style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}
            >
              {item ? (
                <Text style={{
                  fontSize: dist === 0 ? 22 : 17,
                  fontWeight: dist === 0 ? '700' : '400',
                  color: dist === 0 ? '#FFF' : dist === 1 ? '#666' : '#2B2B2B',
                }}>{item}</Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
      {/* selection band */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: ITEM_H * SIDE, left: 12, right: 12,
        height: ITEM_H,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.15)',
      }} />
    </View>
  );
}

export function DateTimeSheet({
  visible, mode, value, minimumDate, minuteInterval = 5, title, onConfirm, onClose,
}: {
  visible: boolean;
  mode: 'date' | 'time';
  value: Date;
  minimumDate?: Date;
  minuteInterval?: number;
  title: string;
  onConfirm: (d: Date) => void;
  onClose: () => void;
}) {
  const mins = useMemo(() =>
    Array.from({ length: Math.floor(60 / minuteInterval) }, (_, i) =>
      String(i * minuteInterval).padStart(2, '0')
    ),
    [minuteInterval]
  );

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const [selectedDate, setSelectedDate] = useState(() => new Date(value.getFullYear(), value.getMonth(), value.getDate()));
  const [viewYear,     setViewYear]     = useState(() => value.getFullYear());
  const [viewMonth,    setViewMonth]    = useState(() => value.getMonth());

  // index 0='1', ..., index 10='11', index 11='12'
  const init0 = roundToInterval(value.getHours(), value.getMinutes(), minuteInterval);
  const [hourIdx,   setHourIdx]   = useState(init0.hourIdx);
  const [minIdx,    setMinIdx]    = useState(init0.minIdx);
  const [periodIdx, setPeriodIdx] = useState(init0.periodIdx);
  const [colKey,    setColKey]    = useState(0);

  useEffect(() => {
    if (!visible) return;
    setSelectedDate(new Date(value.getFullYear(), value.getMonth(), value.getDate()));
    setViewYear(value.getFullYear());
    setViewMonth(value.getMonth());
    const init = roundToInterval(value.getHours(), value.getMinutes(), minuteInterval);
    setHourIdx(init.hourIdx);
    setMinIdx(init.minIdx);
    setPeriodIdx(init.periodIdx);
    setColKey(k => k + 1);
  }, [visible]);

  function goPrevMonth() {
    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11; } return m - 1; });
  }
  function goNextMonth() {
    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0; } return m + 1; });
  }

  function buildDate() { return new Date(selectedDate); }

  function buildTime() {
    const out = new Date(value);
    // hourIdx 0='1' ... 10='11' 11='12'; h12%12 handles the noon/midnight wrap
    out.setHours((hourIdx + 1) % 12 + (periodIdx === 1 ? 12 : 0), parseInt(mins[minIdx]), 0, 0);
    return out;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.side}>
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.title}>{title}</Text>
          <TouchableOpacity
            onPress={() => { onConfirm(mode === 'date' ? buildDate() : buildTime()); onClose(); }}
            style={s.side}
          >
            <Text style={s.done}>Done</Text>
          </TouchableOpacity>
        </View>

        {mode === 'date' ? (
          <MonthCalendar
            viewYear={viewYear}
            viewMonth={viewMonth}
            selected={selectedDate}
            minimumDate={minimumDate}
            today={today}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
            onSelectDay={(day) => setSelectedDate(new Date(viewYear, viewMonth, day))}
          />
        ) : (
          <View style={s.wheelRow}>
            <WheelCol key={`h${colKey}`}  items={HOURS}       initIndex={hourIdx}   onSelect={setHourIdx}   flex={2} />
            <WheelCol key={`mn${colKey}`} items={mins}        initIndex={minIdx}    onSelect={setMinIdx}    flex={2} />
            <WheelCol key={`p${colKey}`}  items={['AM','PM']} initIndex={periodIdx} onSelect={setPeriodIdx} flex={2} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:    { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 48 },
  handle:   { width: 40, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  header:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
  },
  side:     { minWidth: 64 },
  title:    { fontSize: 15, fontWeight: '700', color: '#FFF' },
  cancel:   { fontSize: 15, color: '#555' },
  done:     { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.brand.green, textAlign: 'right' },
  wheelRow: { flexDirection: 'row', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
});
