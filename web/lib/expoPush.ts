import { supabaseAdmin } from './supabase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type ExpoPushMessage = { to: string; title: string; body: string; sound?: string; data?: Record<string, unknown> };

// Every push-sending route used to fire-and-forget straight to Expo,
// batched or not, with no one ever reading the response. Two things that
// gets you: over 100 messages per call silently fails (Expo's hard limit),
// and a token Expo reports as DeviceNotRegistered (uninstalled, signed out
// on a shared device, replaced phone) never gets pruned — push_tokens only
// ever grows. This is now the one place both are handled.
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (!messages.length) return;
  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      const json = await res.json().catch(() => null) as { data?: Array<{ status: string; details?: { error?: string } }> } | null;
      json?.data?.forEach((ticket, idx) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(batch[idx].to);
        }
      });
    } catch (err) {
      console.warn('[expoPush] batch send failed:', err);
    }
  }

  if (deadTokens.length) {
    await supabaseAdmin().from('push_tokens').delete().in('token', deadTokens);
  }
}
