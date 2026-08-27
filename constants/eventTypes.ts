export type EventType = 'game' | 'training' | 'other';

export interface EventTypeConfig {
  label: string;
  icon: string;
  defaultRsvpLockHours: number;
}

export const EVENT_TYPES: Record<EventType, EventTypeConfig> = {
  game: {
    label: 'Game',
    icon: '⚽',
    defaultRsvpLockHours: 24,
  },
  training: {
    label: 'Training',
    icon: '🏃',
    defaultRsvpLockHours: 2,
  },
  other: {
    label: 'Other',
    icon: '📅',
    defaultRsvpLockHours: 12,
  },
};

export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES) as EventType[];

// 5-minute-granularity duration/arrival pickers shared by every screen that
// edits a single event's own fields (create, edit, and per-event overrides
// inside AI schedule import review).
export const DURATION_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const mins = (i + 1) * 5;
  const h = Math.floor(mins / 60), m = mins % 60;
  return {
    label: h > 0 && m > 0 ? `${h}h ${m}min` : h > 0 ? `${h}h` : `${m}min`,
    value: mins,
  };
});

export const ARRIVAL_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  label: `${(i + 1) * 5} min before`,
  value: (i + 1) * 5,
}));
