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
