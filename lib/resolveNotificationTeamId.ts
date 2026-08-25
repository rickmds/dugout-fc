import { supabase } from './supabase';

// Notification `data` payloads carry whatever entity the notification is
// about (event_id, conversation_id, player_fee_id, ...) but not which team
// it belongs to — every notification-tap handler used to navigate straight
// to the destination screen without ever updating TeamContext's active
// team, so a user on more than one team would land on the right screen
// while everything team-scoped on it (roster, chat, etc.) still reflected
// whichever team happened to be active beforehand. This resolves the
// notification's real team with one lookup so callers can switch first.
//
// guest_request notifications are deliberately not resolved here — that
// type references two teams (requesting_team_id and target_team_id) with
// no single obvious "owner," so guessing wrong would be worse than leaving
// the active team unchanged for that one case.
export async function resolveNotificationTeamId(
  data: Record<string, unknown> | null | undefined
): Promise<string | null> {
  if (!data) return null;
  if (typeof data.team_id === 'string') return data.team_id;

  if (typeof data.event_id === 'string') {
    const { data: row } = await supabase.from('events').select('team_id').eq('id', data.event_id).single();
    return row?.team_id ?? null;
  }
  if (typeof data.conversation_id === 'string') {
    const { data: row } = await supabase.from('conversations').select('team_id').eq('id', data.conversation_id).single();
    return row?.team_id ?? null;
  }
  if (typeof data.player_fee_id === 'string') {
    const { data: row } = await supabase.from('player_fees').select('team_id').eq('id', data.player_fee_id).single();
    return row?.team_id ?? null;
  }
  if (typeof data.player_id === 'string') {
    const { data: row } = await supabase.from('players').select('team_id').eq('id', data.player_id).single();
    return row?.team_id ?? null;
  }
  if (typeof data.announcement_id === 'string') {
    const { data: row } = await supabase.from('announcements').select('team_id').eq('id', data.announcement_id).single();
    return row?.team_id ?? null;
  }

  return null;
}
