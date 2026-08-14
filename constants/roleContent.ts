import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

export type RoleKey = 'org_admin' | 'coach' | 'player';

// Shared between role-benefits.tsx (shown once, right after picking a role)
// and welcome-tour.tsx (shown once, right after landing in the app) —
// same underlying pitch, reused rather than maintained twice.
export const ROLE_CONTENT: Record<RoleKey, {
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  benefits: string[];
}> = {
  org_admin: {
    title: 'Club Admin',
    icon: 'shield-outline',
    benefits: [
      'Manage every team in your club from one dashboard',
      'Your own branding — logo and colors',
      'Assign coaches and staff roles',
      'Club-wide fee tracking and reporting',
      'Everything a coach gets, for every team',
    ],
  },
  coach: {
    title: 'Coach',
    icon: 'clipboard-outline',
    benefits: [
      'Build a season schedule in minutes — AI can import it from a PDF or spreadsheet',
      'RSVPs and attendance tracked automatically',
      'Build lineups and manage subs on gameday',
      'Message the whole team instantly',
      'Collect fees without spreadsheets',
    ],
  },
  player: {
    title: 'Parent / Player',
    icon: 'person-outline',
    benefits: [
      'RSVP to games and practice in one tap',
      'Real-time team chat with your coach',
      'Reminders before every game',
      'Track attendance and development notes',
      'See fees and pay in one place',
    ],
  },
};
